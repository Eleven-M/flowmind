/**
 * FlowMind - The AI Agent That Learns How You Work
 * Core Engine Entry Point
 */

const SkillLoader = require('./skill-loader');
const LearningEngine = require('./learning-engine');
const HonorEngine = require('./honor-engine');
const SceneMatcher = require('./scene-matcher');
const ConfigManager = require('./config-manager');
const ComponentRegistry = require('./component-registry');
const ModelManager = require('./ai/model-manager');
const eventBus = require('./event-bus');
const { autoSyncSddAgentToFlowMind } = require('./sdd-agent-sync');
const { inferSourceContext } = require('./source-inference');
const {
  createLearningResponse,
  createSkillError,
  createSkillResult,
  isErrorResultPayload
} = require('./result-contract');
const { attachKnowledgeDepositionCandidates } = require('./knowledge-deposition');
const { attachFollowUpChain } = require('./automation-chain');

class FlowMind {
  constructor(options = {}) {
    this.config = new ConfigManager(options.configPath);
    this.honor = new HonorEngine(this.config);
    this.learning = new LearningEngine(this.config, this.honor);
    this.matcher = new SceneMatcher(this.config, this.learning);
    this.components = new ComponentRegistry(this.config);
    this.skills = new SkillLoader(this.config, this.learning, this.components, this.honor);
    this.aiOptions = { silenceWarnings: true, ...(options.ai || {}) };
    this.ai = new ModelManager(this.aiOptions);
    this.initialized = false;
    this.conversationHistory = [];
    this.maxHistoryLength = options.maxHistoryLength || 50;
    this.lastSkillRoute = null;
  }

  /**
   * Initialize FlowMind
   */
  async init() {
    if (this.initialized) return this;

    await autoSyncSddAgentToFlowMind();
    await this.config.load();

    // Validate configuration
    const validation = this.config.validate();
    if (!validation.valid) {
      console.warn('Configuration warnings:', validation.errors.join(', '));
    }

    await this.components.init();
    await this.components.initAll();
    await this.honor.init();
    await this.learning.init();
    await this.skills.loadAll();
    await this.matcher.loadScenes();

    // Initialize AI model manager
    try {
      const aiConfig = this.config.deepMerge(this.config.get('ai', {}), this.aiOptions || {});
      this.ai = new ModelManager(aiConfig);
      await this.ai.init();
    } catch (error) {
      console.warn(`AI model initialization failed: ${error.message}. Falling back to rule-based engine.`);
    }

    this.initialized = true;
    return this;
  }

  /**
   * Process a user request with streaming support
   * Yields progress updates as an async generator
   */
  async *processStream(input, context = {}) {
    yield { type: 'start', input, timestamp: new Date().toISOString() };

    const result = await this.process(input, context);

    yield {
      type: 'progress',
      message: `Skill: ${result.metadata?.skill || 'unknown'}`,
      timestamp: new Date().toISOString()
    };
    yield { type: 'result', data: result, timestamp: new Date().toISOString() };
  }

  /**
   * Process a user request
   */
  async process(input, context = {}) {
    if (!this.initialized) {
      await this.init();
    }

    if (!input || typeof input !== 'string') {
      return this.formatError('Invalid input: expected a non-empty string', input);
    }

    const startTime = Date.now();

    // Build context with conversation history
    const enhancedContext = {
      ...context,
      conversationHistory: this.conversationHistory.slice(-10),
      sessionId: context.sessionId || 'default'
    };

    eventBus.emit('process:start', { input, timestamp: new Date().toISOString() });

    try {
      // 1. AI Intent Understanding (if available)
      const intent = await this.safeUnderstandIntent(input, enhancedContext);

      if (this.isAIStatusQuery(input)) {
        const statusResult = await this.formatAIStatusResponse(input, enhancedContext, intent, Date.now() - startTime);
        this.conversationHistory.push({
          input,
          output: statusResult,
          skill: statusResult.metadata?.skill || 'ai-status',
          timestamp: new Date().toISOString()
        });
        if (this.conversationHistory.length > this.maxHistoryLength) {
          this.conversationHistory.shift();
        }

        eventBus.emit('process:complete', {
          input,
          skill: statusResult.metadata?.skill || 'ai-status',
          duration: statusResult.metadata?.duration || 0,
          success: true,
          timestamp: statusResult.timestamp
        });

        return statusResult;
      }

      // 2. Select skill (AI-assisted if available)
      const skill = await this.selectSkill(input, {
        ...enhancedContext,
        intent
      });

      if (!skill) {
        return await this.answerWithAI(input, enhancedContext, intent, startTime);
      }

      // 3. Capture explicit learning feedback after skill resolution so bindings are accurate.
      if (this.shouldCaptureLearningInput(input, skill, enhancedContext)) {
        const learningContext = {
          ...enhancedContext,
          flowmind: this,
          currentSkill: this.resolveLearningTargetSkill(skill, enhancedContext)
        };
        const aiLearningResult = await this.safeAnalyzeLearningFeedback(input, learningContext);
        const learningResult = aiLearningResult?.isLearning
          ? aiLearningResult
          : await this.learning.detectLearning(input, learningContext);
        if (learningResult) {
          return this.formatLearningResponse(learningResult, input);
        }
      }

      // 4. Check scene mappings (with AI intent if available)
      const sceneMatch = await this.matcher.match(input, intent);
      if (sceneMatch && sceneMatch.confidence >= 0.7 && !context.skill) {
        return this.executeSceneWorkflow(sceneMatch, input, enhancedContext);
      }

      // 5. Extract parameters using AI (if available)
      const extractedParams = await this.safeExtractParameters(input, skill.name);

      // 6. Execute with learning applied
      const executeContext = {
        ...enhancedContext,
        ...extractedParams,
        intent: intent,
        flowmind: this,
        currentSkill: skill.name
      };
      const result = await this.executeWithLearning(skill, input, executeContext);

      // 7. Generate AI summary (if available)
      const summary = await this.safeSummarizeResult(result, {
        skill: skill.name,
        intent: intent
      });

      const aiStatus = typeof this.ai?.getStatus === 'function' ? this.ai.getStatus() : {};

      // 8. Format and return
      const formatted = this.formatResult(summary || result, {
        skill: skill.name,
        duration: Date.now() - startTime,
        sceneMatch: sceneMatch,
        intent: intent,
        aiEnhanced: !!summary,
        aiProvider: aiStatus.defaultProvider || null,
        aiModel: aiStatus.defaultModel || null,
        skillRoute: this.lastSkillRoute || 'rules'
      });
      const processSucceeded = !isErrorResultPayload(formatted);

      // Save to conversation history
      this.conversationHistory.push({
        input,
        output: formatted,
        skill: skill.name,
        timestamp: new Date().toISOString()
      });
      if (this.conversationHistory.length > this.maxHistoryLength) {
        this.conversationHistory.shift();
      }

      eventBus.emit('process:complete', {
        input,
        skill: skill.name,
        duration: formatted.metadata.duration,
        success: processSucceeded,
        timestamp: formatted.timestamp
      });

      return formatted;
    } catch (error) {
      eventBus.emit('process:error', { input, error: error.message, timestamp: new Date().toISOString() });
      return this.formatError(error.message, input, {
        errorCode: error.code || null,
        bindingHint: error.bindingHint || null
      });
    }
  }

  /**
   * Execute skill with learning applied
   */
  async executeWithLearning(skill, input, context) {
    const skillStartTime = Date.now();

    // Get learning rules for this skill
    const learnings = await this.learning.getSkillLearnings(skill.name);
    const resourceBinding = await this.learning.matchResourceBinding(input, skill.name);
    let sourceInference = context.sourceInference || null;
    if (!sourceInference) {
      try {
        sourceInference = await inferSourceContext(input);
      } catch (error) {
        sourceInference = null;
      }
    }

    // Apply learning rules to context
    const enhancedContext = {
      ...context,
      flowmind: context.flowmind || this,
      componentRegistry: context.componentRegistry || this.components,
      currentSkill: context.currentSkill || skill.name,
      learnings: learnings,
      skillConfig: this.config?.get?.(`skillConfig.skills.${skill.name}`, {}) || {},
      preferences: {
        ...(this.config?.get?.(`skillConfig.skills.${skill.name}`, {}) || {}),
        ...(await this.learning.getPreferences(skill.name))
      },
      resourceBinding,
      sourceInference
    };

    // Execute skill
    const result = await skill.execute(input, enhancedContext);
    const resolvedResult = await this.resolveDeferredMcpResult(result, skill, enhancedContext);
    const chainedResult = attachFollowUpChain(resolvedResult);
    const finalResult = attachKnowledgeDepositionCandidates(chainedResult, {
      repo: enhancedContext.preferences?.defaultNamespace
    });

    if (resourceBinding?.id) {
      await this.learning.markResourceBindingUsed(resourceBinding.id, {
        input,
        skillName: skill.name,
        currentSkill: enhancedContext.currentSkill
      });
    }

    const duration = Date.now() - skillStartTime;

    // Emit skill execution event
    eventBus.emit('skill:executed', {
      name: skill.name,
      duration,
      success: !isErrorResultPayload(finalResult),
      timestamp: new Date().toISOString()
    });

    // Award honor point for skill use
    await this.honor.award('skill_use', `Used skill: ${skill.name}`);

    return finalResult;
  }

  async resolveDeferredMcpResult(result, skill, context = {}) {
    const invocation = this.extractMcpInvocation(result);
    if (!invocation) {
      return result;
    }

    const adapter = this.resolveDeferredAdapter(invocation, skill, context);
    if (!adapter) {
      return result;
    }

    const executor =
      typeof adapter.callTool === 'function'
        ? adapter.callTool.bind(adapter)
        : typeof adapter.callMcpTool === 'function'
          ? adapter.callMcpTool.bind(adapter)
          : null;

    if (!executor) {
      return result;
    }

    try {
      const execution = await executor(invocation.tool, invocation.args || {});
      const resultData =
        result && typeof result === 'object' && !Array.isArray(result) && result.data && typeof result.data === 'object'
          ? result.data
          : {};

      return {
        ...result,
        data: {
          ...resultData,
          execution,
          mcpTool: invocation.tool,
          mcpExecuted: true,
          mcpServer: invocation.mcpServer || adapter.mcpServer || adapter.providerName
        }
      };
    } catch (error) {
      const existingData =
        result && typeof result === 'object' && result.data && typeof result.data === 'object' ? result.data : {};
      return createSkillError(
        result?.skill || skill?.name || context.currentSkill || null,
        result?.message || error.message,
        {
          input: result?.input,
          kind: existingData.kind || 'execution-failed',
          retryable: existingData.retryable !== undefined ? existingData.retryable : true,
          data: {
            ...existingData,
            mcpTool: invocation.tool,
            mcpExecuted: false,
            mcpError: error.message,
            mcpErrorCode: error.code || null
          },
          bindingHint: error.bindingHint || result?.data?.bindingHint || null
        }
      );
    }
  }

  extractMcpInvocation(result) {
    if (!result || typeof result !== 'object') {
      return null;
    }

    const candidates = [result.data, result];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        continue;
      }

      const tool = candidate.mcpTool || candidate.tool;
      if (!tool || typeof tool !== 'string') {
        continue;
      }

      const args = candidate.args || candidate.params || {};
      if (args && typeof args !== 'object') {
        continue;
      }

      return {
        tool,
        args,
        mcpServer: candidate.mcpServer || null
      };
    }

    return null;
  }

  resolveDeferredAdapter(invocation, skill, context = {}) {
    const registry = context.componentRegistry || this.components;
    if (!registry) {
      return null;
    }

    const bindingComponentType =
      context.resourceBinding?.componentType || context.resolvedBinding?.componentType || null;
    const skillComponentType = this.inferSkillComponentType(skill, context);
    const componentTypes = [bindingComponentType, skillComponentType, invocation.componentType].filter(Boolean);

    for (const componentType of componentTypes) {
      const adapter = registry.getAdapter(componentType);
      if (adapter) {
        return adapter;
      }
    }

    if (typeof registry.getAll === 'function') {
      const allAdapters = registry.getAll();
      for (const entry of allAdapters) {
        const adapter = registry.getAdapterByProvider?.(entry.type, entry.provider) || null;
        if (adapter && (adapter.mcpServer === invocation.mcpServer || adapter.providerName === invocation.provider)) {
          return adapter;
        }
      }
    }

    return null;
  }

  inferSkillComponentType(skill, context = {}) {
    const name = skill?.name || context.currentSkill || '';
    const mapping = {
      'log-audit': 'logService',
      'sls-log-audit': 'logService',
      'yapi-sync-interface': 'apiDoc',
      'yuque-sync-design': 'knowledgeBase',
      'data-logic-validation': 'databaseQuery',
      'resource-bind': null,
      'auto-flow': 'workflow'
    };

    return mapping[name] || null;
  }

  /**
   * Execute scene workflow
   */
  async executeSceneWorkflow(sceneMatch, input, context) {
    const { scene, params } = sceneMatch;
    const results = [];

    try {
      for (const step of scene.workflow.skills) {
        const skill = this.skills.get(step.skill);
        if (!skill) continue;

        const stepContext = {
          ...context,
          params: { ...step.params, ...params },
          previousResults: results,
          flowmind: this,
          currentSkill: step.skill
        };

        const result = await this.executeWithLearning(skill, input, stepContext);
        results.push({
          skill: step.skill,
          result: result
        });
      }
      await this.matcher.updateSceneStats(scene.id, true, { input });
    } catch (error) {
      await this.matcher.updateSceneStats(scene.id, false, { input });
      throw error;
    }

    return {
      type: 'scene_workflow',
      scene: scene.name,
      results: results,
      preferences: scene.preferences
    };
  }

  /**
   * Format learning response
   */
  formatLearningResponse(learningResult, input = undefined) {
    const { type, record, confirmation } = learningResult;

    return createLearningResponse(type, confirmation, {
      input,
      record,
      data: learningResult
    });
  }

  isAIStatusQuery(input) {
    const normalized = String(input || '')
      .trim()
      .toLowerCase();
    if (!normalized) return false;

    const patterns = [
      /你.*是什么模型/,
      /你.*用的.*模型/,
      /当前.*模型/,
      /ai.*(模型|状态|连接|正常|可用|配置)/,
      /模型.*(状态|连接|正常|可用)/,
      /mimo.*(状态|连接|正常|可用)/,
      /openai.*(状态|连接|正常|可用)/,
      /what model are you/,
      /which model/,
      /are you connected/,
      /ai status/,
      /model status/
    ];

    return patterns.some((pattern) => pattern.test(normalized));
  }

  async formatAIStatusResponse(input, context = {}, intent = null, duration = 0) {
    const status = this.getAIStatus();
    const providers = status.providers || {};
    const providerEntries = Object.entries(providers);
    const defaultProvider = status.defaultProvider || null;
    const defaultProviderInfo = defaultProvider ? providers[defaultProvider] : null;
    const activeEntry = defaultProviderInfo?.initialized
      ? [defaultProvider, defaultProviderInfo]
      : providerEntries.find(([, info]) => info?.initialized) || null;
    const activeProvider = activeEntry?.[0] || null;
    const activeProviderInfo = activeEntry?.[1] || null;
    const activeModel = activeProviderInfo?.info?.model || status.defaultModel || null;
    const ready = status.health ? status.health === 'ready' : !!activeEntry;

    const providerSummary = {};
    for (const [name, info] of providerEntries) {
      providerSummary[name] = {
        initialized: !!info?.initialized,
        health: info?.health || (info?.initialized ? 'ready' : 'off'),
        error: info?.error || null,
        model: info?.info?.model || null,
        baseUrl: info?.info?.baseUrl || null,
        provider: info?.info?.provider || name
      };
    }

    let aiReply = null;
    let replyError = null;
    try {
      aiReply = await this.ai.answerQuery(input, {
        ...context,
        intent,
        aiStatus: {
          ...status,
          ready,
          activeProvider,
          activeModel,
          providers: providerSummary
        },
        skillCandidates: []
      });
    } catch (error) {
      replyError = error?.message || String(error);
    }

    const message =
      aiReply ||
      (replyError
        ? `AI 状态查询失败：${replyError}`
        : ready
          ? `当前 AI 已连接，默认提供商是 ${defaultProvider || activeProvider}，模型是 ${activeModel || '未配置'}。`
          : `当前 AI 还没有可用连接。请先配置 provider 和 apiKey，再运行 flowmind ai -s 检查状态。`);

    const health = replyError || status.health === 'error' ? 'error' : ready ? 'ready' : 'not_ready';

    const details = {
      query: input,
      health,
      ready,
      initialized: !!status.initialized,
      defaultProvider,
      defaultModel: status.defaultModel || null,
      activeProvider,
      activeModel,
      providers: providerSummary,
      features: status.features || {},
      replyError,
      recommendedChecks: ready
        ? ['flowmind ai --status', `flowmind ai --test ${activeProvider || defaultProvider || ''}`.trim()]
        : ['flowmind ai --status', 'flowmind init --ai <provider>']
    };

    return this.formatResult(
      {
        message,
        ...details,
        data: details
      },
      {
        skill: 'ai-status',
        label: 'AI 状态',
        duration,
        sceneMatch: null,
        intent: {
          intent: 'query',
          action: 'ai_status',
          confidence: 1
        },
        aiEnhanced: false,
        aiProvider: defaultProvider || activeProvider || null,
        aiModel: activeModel,
        skillRoute: 'ai-status'
      }
    );
  }

  async answerWithAI(input, context = {}, intent = null, startTime = Date.now()) {
    const status = this.getAIStatus();
    const skillCandidates = this.skills?.list?.() || [];
    let aiReply = null;
    let replyError = null;
    try {
      aiReply = await this.ai.answerQuery(input, {
        ...context,
        intent,
        aiStatus: status,
        skillCandidates
      });
    } catch (error) {
      replyError = error?.message || String(error);
    }

    const fallbackMessage =
      aiReply ||
      (replyError
        ? `AI 回答失败：${replyError}`
        : '当前没有匹配到可执行的技能。我可以先用 AI 回答，如果你要实时数据或系统操作，请补充对应的 MCP 或 skill。');

    const result = this.formatResult(
      {
        message: fallbackMessage,
        query: input,
        replyMode: 'ai-fallback',
        replyError,
        aiStatus: {
          defaultProvider: status.defaultProvider || null,
          defaultModel: status.defaultModel || null,
          ready: this.hasAI(),
          providers: Object.fromEntries(
            Object.entries(status.providers || {}).map(([name, info]) => [
              name,
              {
                initialized: !!info?.initialized,
                model: info?.info?.model || null,
                provider: info?.info?.provider || name
              }
            ])
          )
        }
      },
      {
        skill: 'ai-fallback',
        label: 'AI 回复',
        duration: Date.now() - startTime,
        sceneMatch: null,
        intent,
        aiEnhanced: true,
        aiProvider: status.defaultProvider || null,
        aiModel: status.defaultModel || null,
        skillRoute: 'ai-only'
      }
    );

    this.conversationHistory.push({
      input,
      output: result,
      skill: 'ai-fallback',
      timestamp: new Date().toISOString()
    });
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory.shift();
    }

    eventBus.emit('process:complete', {
      input,
      skill: 'ai-fallback',
      duration: result.metadata.duration,
      success: true,
      timestamp: result.timestamp
    });

    return result;
  }

  async selectSkill(input, context = {}) {
    this.lastSkillRoute = 'rules';

    if (context.skill) {
      const explicitSkill = this.skills.get(context.skill);
      if (!explicitSkill) {
        return null;
      }
      this.lastSkillRoute = 'explicit';
      return explicitSkill;
    }

    const ruleCandidates = await this.skills.getCandidates(input, context);
    const aiContext = {
      ...context,
      currentSkill: context.currentSkill || null
    };

    const aiCandidateList = ruleCandidates.length > 0 ? ruleCandidates : this.buildAiSkillCandidates();

    const canUseAiSelection = this.ai && typeof this.ai.selectSkill === 'function';
    let aiAttempted = false;

    if (canUseAiSelection && aiCandidateList.length > 0) {
      aiAttempted = true;
      try {
        const aiSelection = await this.ai.selectSkill(input, aiCandidateList, aiContext);
        if (aiSelection && aiSelection.selectedSkill) {
          const selected = this.skills.get(aiSelection.selectedSkill);
          if (selected) {
            this.lastSkillRoute = 'ai';
            return selected;
          }
        }
      } catch (error) {
        aiAttempted = true;
      }
    }

    if (ruleCandidates.length > 0) {
      const selected = await this.skills.select(input, context);
      this.lastSkillRoute = aiAttempted ? 'ai+rules' : 'rules';
      return selected;
    }

    this.lastSkillRoute = aiAttempted ? 'ai' : 'rules';
    return null;
  }

  async safeUnderstandIntent(input, context = {}) {
    if (!this.ai || typeof this.ai.understandIntent !== 'function') {
      return { intent: 'unknown', confidence: 0, source: 'rules' };
    }

    try {
      return await this.ai.understandIntent(input, context);
    } catch (error) {
      return { intent: 'unknown', confidence: 0, source: 'rules' };
    }
  }

  async safeAnalyzeLearningFeedback(input, context = {}) {
    if (!this.ai || typeof this.ai.analyzeLearningFeedback !== 'function') {
      return null;
    }

    try {
      return await this.ai.analyzeLearningFeedback(input, context);
    } catch (error) {
      return null;
    }
  }

  async safeExtractParameters(input, skillName) {
    if (!this.ai || typeof this.ai.extractParameters !== 'function') {
      return {};
    }

    try {
      const params = await this.ai.extractParameters(input, skillName);
      return params && typeof params === 'object' ? params : {};
    } catch (error) {
      return {};
    }
  }

  async safeSummarizeResult(result, context = {}) {
    if (!this.ai || typeof this.ai.summarizeResult !== 'function') {
      return null;
    }

    try {
      return await this.ai.summarizeResult(result, context);
    } catch (error) {
      return null;
    }
  }

  buildAiSkillCandidates() {
    if (typeof this.skills.getAll === 'function') {
      return this.skills.getAll().map((skill) => ({
        name: skill.name,
        skill,
        description: skill.definition?.description || '',
        triggers: skill.definition?.triggers || [],
        category: skill.definition?.category || skill.definition?.metadata?.category || '',
        score: 0
      }));
    }

    return this.skills
      .list()
      .map((info) => ({
        name: info.name,
        skill: this.skills.get(info.name),
        description: info.description || '',
        triggers: [],
        category: info.category || '',
        score: 0
      }))
      .filter((candidate) => candidate.skill);
  }

  shouldCaptureLearningInput(input, skill, context = {}) {
    if (skill?.name === 'learning-feedback') {
      return true;
    }

    const normalized = input.trim();
    const explicitFeedbackPatterns = [
      /^(不对|错了|应该是|正确的是|改成|改为|重新处理|重来|下次|以后|记住|别再|不要|别这样)/i,
      /^(wrong|should be|change to|next time|remember|don't|do not)/i
    ];

    return (
      explicitFeedbackPatterns.some((pattern) => pattern.test(normalized)) && context.conversationHistory?.length > 0
    );
  }

  resolveLearningTargetSkill(skill, context = {}) {
    if (context.currentSkill) {
      return context.currentSkill;
    }

    if (skill && skill.name !== 'learning-feedback') {
      return skill.name;
    }

    const previousSkill = [...this.conversationHistory]
      .reverse()
      .find((entry) => entry.skill && entry.skill !== 'learning-feedback');

    return previousSkill?.skill || 'global';
  }

  /**
   * Format result
   */
  formatResult(result, metadata) {
    if (isErrorResultPayload(result)) {
      const payload = result?.type === 'error' ? result : result?.data;
      return createSkillError(null, payload?.message, {
        input: payload?.input,
        data: payload?.data,
        metadata
      });
    }

    return createSkillResult(null, undefined, {
      data: result,
      metadata
    });
  }

  /**
   * Format error
   */
  formatError(message, input, details = {}) {
    return createSkillError(null, message, {
      input,
      data: details
    });
  }

  /**
   * Get learning statistics
   */
  async getStats() {
    return this.learning.getStats();
  }

  async getLearningAssets(options = {}) {
    return this.learning.getLearningAssets(options);
  }

  /**
   * Get honor data
   */
  getHonorData() {
    return this.honor.getData();
  }

  /**
   * Get the component registry
   * @returns {ComponentRegistry}
   */
  getComponentRegistry() {
    return this.components;
  }

  /**
   * Get the active adapter for a component type
   * @param {string} componentType
   * @returns {BaseAdapter|null}
   */
  getAdapter(componentType) {
    return this.components.getAdapter(componentType);
  }

  /**
   * Get component status summary
   * @returns {object}
   */
  getComponentStatus() {
    return this.components.getStatus();
  }

  /**
   * Get AI model status
   * @returns {object}
   */
  getAIStatus() {
    if (typeof this.ai?.getStatus === 'function') {
      return this.ai.getStatus();
    }
    return {
      initialized: false,
      defaultProvider: null,
      defaultModel: null,
      features: {},
      providers: {}
    };
  }

  /**
   * Check if AI is available
   * @returns {boolean}
   */
  hasAI() {
    return typeof this.ai?.hasAvailableProvider === 'function' ? this.ai.hasAvailableProvider() : false;
  }

  /**
   * Export learnings
   */
  async exportLearnings(options) {
    return this.learning.export(options);
  }

  /**
   * Import learnings
   */
  async importLearnings(data) {
    return this.learning.import(data);
  }

  /**
   * Get conversation history
   */
  getConversationHistory(sessionId) {
    if (sessionId) {
      return this.conversationHistory.filter((h) => h.sessionId === sessionId);
    }
    return this.conversationHistory;
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Graceful shutdown - flush pending data and clean up
   */
  async shutdown() {
    eventBus.emit('shutdown:start', { timestamp: new Date().toISOString() });

    // Save learning data
    try {
      if (this.learning?.skillBindings) {
        await this.learning.saveSkillBindings();
      }
      if (this.learning?.stats) {
        await this.learning.saveStats();
      }
    } catch (e) {
      console.warn('Failed to save learning data during shutdown:', e.message);
    }

    // Save honor data
    try {
      if (this.honor?.save) {
        await this.honor.save();
      }
    } catch (e) {
      console.warn('Failed to save honor data during shutdown:', e.message);
    }

    // Clear conversation history
    this.conversationHistory = [];

    this.initialized = false;
    eventBus.emit('shutdown:complete', { timestamp: new Date().toISOString() });
  }

  /**
   * Run system health checks (doctor)
   */
  async doctor() {
    const checks = [];

    // 1. Config check
    try {
      await this.config.load();
      checks.push({ name: 'Configuration', status: 'ok', message: 'Config loaded successfully' });
    } catch (e) {
      checks.push({ name: 'Configuration', status: 'error', message: e.message });
    }

    // 2. Skills check
    try {
      const skills = this.skills.list();
      checks.push({ name: 'Skills', status: 'ok', message: `${skills.length} skill(s) loaded` });
    } catch (e) {
      checks.push({ name: 'Skills', status: 'error', message: e.message });
    }

    // 3. Learning engine check
    try {
      const stats = await this.learning.getStats();
      checks.push({ name: 'Learning Engine', status: 'ok', message: `${stats.totalRecords || 0} records` });
    } catch (e) {
      checks.push({ name: 'Learning Engine', status: 'error', message: e.message });
    }

    // 4. Honor engine check
    try {
      const honor = this.honor.getData();
      checks.push({ name: 'Honor Engine', status: 'ok', message: `Level ${honor.level}, ${honor.points} pts` });
    } catch (e) {
      checks.push({ name: 'Honor Engine', status: 'error', message: e.message });
    }

    // 5. AI providers check
    try {
      const aiStatus = this.ai.getStatus();
      const providerCount = Object.keys(aiStatus.providers || {}).length;
      const activeCount = Object.values(aiStatus.providers || {}).filter((p) => p.initialized).length;
      checks.push({
        name: 'AI Providers',
        status: activeCount > 0 ? 'ok' : 'warning',
        message: `${activeCount}/${providerCount} active`
      });
    } catch (e) {
      checks.push({ name: 'AI Providers', status: 'warning', message: e.message });
    }

    // 6. Components check
    try {
      const compStatus = this.components.getStatus();
      const compCount = Object.keys(compStatus).length;
      checks.push({ name: 'Components', status: 'ok', message: `${compCount} registered` });
    } catch (e) {
      checks.push({ name: 'Components', status: 'warning', message: e.message });
    }

    // 7. Node.js version check
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1));
    checks.push({
      name: 'Node.js',
      status: major >= 18 ? 'ok' : 'warning',
      message: `${nodeVersion} ${major < 18 ? '(recommend >= 18)' : ''}`
    });

    // 8. Disk space for learning data
    try {
      const fs = require('fs-extra');
      const learningPath = this.learning.expandPath(this.learning.learningPath);
      if (await fs.pathExists(learningPath)) {
        checks.push({ name: 'Learning Storage', status: 'ok', message: learningPath });
      } else {
        checks.push({ name: 'Learning Storage', status: 'warning', message: 'Directory not yet created' });
      }
    } catch (e) {
      checks.push({ name: 'Learning Storage', status: 'warning', message: e.message });
    }

    const errors = checks.filter((c) => c.status === 'error').length;
    const warnings = checks.filter((c) => c.status === 'warning').length;

    return {
      healthy: errors === 0,
      checks,
      summary: { total: checks.length, ok: checks.filter((c) => c.status === 'ok').length, warnings, errors }
    };
  }
}

module.exports = FlowMind;
