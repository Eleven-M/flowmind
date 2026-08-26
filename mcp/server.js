#!/usr/bin/env node

/**
 * FlowMind MCP Server
 * 让 Claude/Codex 可以直接调用 FlowMind 内部流程
 */

const FlowMind = require('../core');
const eventBus = require('../core/event-bus');
const { isErrorResultPayload } = require('../core/result-contract');
const { TaskStore } = require('../core/task-store');
const { WorkflowService } = require('../core/workflow-service');
const { attachKnowledgeDepositionCandidates } = require('../core/knowledge-deposition');
const { version } = require('../package.json');

const CAPABILITY_GROUPS = Object.freeze({
  analysis: ['offline-design-analysis', 'requirement-analyst'],
  review: ['code-review', 'code-review-audit', 'git-review', 'project-review', 'change-impact-review'],
  data: ['data-validation', 'data-logic-validation', 'data-risk-audit'],
  reporting: ['report-insights', 'build-report', 'test-report', 'coverage-report', 'archive-change'],
  notification: ['dingtalk-notify'],
  knowledge: ['knowledge-ops', 'yuque-sync-design'],
  workflow: ['auto-flow'],
  docs: ['yapi-sync-interface', 'yuque-sync-design'],
  logs: ['log-audit', 'sls-log-audit'],
  governance: ['service-governance-audit', 'service-governance-diagnosis', 'service-governance-change'],
  resources: ['resource-bind']
});

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function attachOutputSchema(tool, outputSchema) {
  if (isPlainObject(outputSchema)) {
    return { ...tool, outputSchema };
  }
  return tool;
}

// MCP Server 实现
class FlowMindMCPServer {
  constructor(options = {}) {
    this.flowmind = null;
    this.initialized = false;
    this.tasks = new Map();
    this.taskCounter = 0;
    this.taskStore = options.taskStore || new TaskStore(options.taskStoreOptions || {});
    this.workflowService = options.workflowService || new WorkflowService({
      workflowHistoryOptions: options.workflowHistoryOptions,
      historyStore: options.workflowHistory
    });
    this.workflowHistory = this.workflowService.historyStore;
  }

  async init() {
    if (this.initialized) return;

    this.flowmind = new FlowMind();
    await this.flowmind.init();
    this.workflowService.setFlowMind(this.flowmind);
    await this.loadPersistedTasks();
    this.initialized = true;
  }

  /**
   * 获取所有可用工具
   */
  getTools() {
    const skills = this.flowmind.skills.list();
    const tools = [];

    // 添加核心工具
    tools.push({
      name: 'flowmind_process',
      description: 'Process a request using FlowMind AI agent. This is the main entry point for using FlowMind.',
      inputSchema: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'The request to process'
          },
          context: {
            type: 'object',
            description: 'Optional context for the request'
          }
        },
        required: ['input']
      }
    });

    tools.push({
      name: 'flowmind_start_task',
      description: 'Start an asynchronous FlowMind tool execution and return a pollable task id',
      inputSchema: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description: 'The FlowMind tool name to execute asynchronously'
          },
          arguments: {
            type: 'object',
            description: 'Arguments passed to the target tool'
          },
          timeoutMs: {
            type: 'number',
            description: 'Optional timeout in milliseconds before the task is marked failed'
          },
          retries: {
            type: 'number',
            description: 'Optional retry count for failed or timed-out executions'
          }
        },
        required: ['tool']
      }
    });

    tools.push({
      name: 'flowmind_task_status',
      description: 'Get task status, progress, and result for an asynchronous FlowMind execution',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Task id returned from flowmind_start_task'
          }
        },
        required: ['taskId']
      }
    });

    tools.push({
      name: 'flowmind_list_tasks',
      description: 'List recent asynchronous FlowMind tasks',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of tasks to return'
          }
        }
      }
    });

    tools.push({
      name: 'flowmind_cancel_task',
      description: 'Cancel a queued asynchronous FlowMind task',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'Task id returned from flowmind_start_task'
          }
        },
        required: ['taskId']
      }
    });

    tools.push({
      name: 'flowmind_capability_catalog',
      description: 'List FlowMind capability groups, mapped skills, and discovery metadata',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    tools.push({
      name: 'flowmind_preview_workflow',
      description: 'Dry-run a guarded follow-up workflow and return its approval token',
      inputSchema: {
        type: 'object',
        properties: {
          chain: { type: 'object', description: 'A followUpChain object' },
          result: { type: 'object', description: 'A FlowMind result containing automation candidates' }
        }
      }
    });

    tools.push({
      name: 'flowmind_execute_workflow',
      description: 'Execute an allowlisted workflow after approval-token confirmation',
      inputSchema: {
        type: 'object',
        properties: {
          chain: { type: 'object', description: 'The exact followUpChain reviewed in dry-run' },
          approvalToken: { type: 'string', description: 'Token returned by flowmind_preview_workflow' },
          continueOnError: { type: 'boolean' },
          context: { type: 'object' }
        },
        required: ['chain', 'approvalToken']
      }
    });

    tools.push({
      name: 'flowmind_resume_workflow',
      description: 'Resume a previously recorded workflow execution from the first unfinished step',
      inputSchema: {
        type: 'object',
        properties: {
          executionId: { type: 'string', description: 'Workflow execution id returned by flowmind_execute_workflow' },
          approvalToken: { type: 'string', description: 'Token returned by the original workflow preview' },
          continueOnError: { type: 'boolean' },
          context: { type: 'object' }
        },
        required: ['executionId', 'approvalToken']
      }
    });

    tools.push({
      name: 'flowmind_workflow_history',
      description: 'List recent recorded workflow executions and their resume state',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of workflow records to return' },
          status: { type: 'string', description: 'Filter workflow records by status' },
          resumable: { type: 'boolean', description: 'Only return workflow records that can be resumed' }
        }
      }
    });

    tools.push({
      name: 'flowmind_list_skills',
      description: 'List all available FlowMind skills',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    tools.push({
      name: 'flowmind_get_skill',
      description: 'Get detailed information about a specific skill',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Skill name'
          }
        },
        required: ['name']
      }
    });

    tools.push({
      name: 'flowmind_ai_status',
      description: 'Get AI model status and configuration',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    tools.push({
      name: 'flowmind_learning_stats',
      description: 'Get learning statistics',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    tools.push({
      name: 'flowmind_learning_assets',
      description: 'View sanitized learned skill feedback, scenes, bindings, and local material package metadata',
      inputSchema: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: 'Optional skill-name filter' },
          limit: { type: 'number', description: 'Maximum feedback records to return' }
        }
      }
    });

    tools.push({
      name: 'flowmind_offline_analyze',
      description: 'Analyze local learning material, documents, and repository code without using an AI model or network service',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Natural-language analysis request' },
          sourceDir: { type: 'string', description: 'Optional local material directory' },
          repoDir: { type: 'string', description: 'Optional local repository directory' },
          includeCode: { type: 'boolean', description: 'Whether repository code should be inspected' },
          maxResults: { type: 'number', description: 'Maximum evidence sources to return' }
        },
        required: ['input']
      }
    });

    // 添加每个技能作为独立工具
    for (const skill of skills) {
      const fullSkill = this.flowmind.skills.get(skill.name) || skill;
      const capabilityTags = this.getCapabilityTagsForSkill(skill.name);
      const directExecutionHint = ['log-audit', 'sls-log-audit'].includes(skill.name)
        ? 'Direct execution tool: use this for log queries instead of flowmind_process to avoid duplicate planning.'
        : null;
      tools.push(attachOutputSchema({
        name: `flowmind_skill_${skill.name}`,
        description: [
          skill.description || `Execute ${skill.name} skill`,
          directExecutionHint,
          capabilityTags.length > 0 ? `Capabilities: ${capabilityTags.join(', ')}` : null
        ]
          .filter(Boolean)
          .join(' | '),
        inputSchema: fullSkill.inputSchema || skill.inputSchema || {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Input for the skill'
            },
            context: {
              type: 'object',
              description: 'Optional context'
            }
          },
          required: ['input']
        }
      }, fullSkill.outputSchema || skill.outputSchema));
    }

    return tools;
  }

  getCapabilityTagsForSkill(skillName) {
    return Object.entries(CAPABILITY_GROUPS)
      .filter(([, skills]) => skills.includes(skillName))
      .map(([capability]) => capability);
  }

  getCapabilityCatalog() {
    const skills = this.flowmind.skills.list();
    const loadedNames = new Set(skills.map((skill) => skill.name));
    return Object.entries(CAPABILITY_GROUPS)
      .map(([capability, mappedSkills]) => ({
        capability,
        skills: mappedSkills
          .filter((name) => loadedNames.has(name))
          .map((name) => {
            const skill = skills.find((item) => item.name === name);
            return {
              name,
              description: skill?.description || '',
              category: skill?.category || '',
              inputSchema: this.flowmind.skills.get(name)?.inputSchema || null,
              outputSchema: this.flowmind.skills.get(name)?.outputSchema || null
            };
          })
      }))
      .filter((entry) => entry.skills.length > 0);
  }

  isTaskManagementTool(name) {
    return ['flowmind_start_task', 'flowmind_task_status', 'flowmind_list_tasks', 'flowmind_cancel_task'].includes(
      name
    );
  }

  buildTaskId() {
    this.taskCounter += 1;
    return `task-${this.taskCounter}`;
  }

  async loadPersistedTasks() {
    const persisted = await this.taskStore.load();
    let maxId = 0;
    for (const task of persisted) {
      const normalizedTask = {
        ...task,
        timer: null,
        timeoutTimer: null
      };
      if (['queued', 'running'].includes(normalizedTask.status)) {
        normalizedTask.status = 'failed';
        normalizedTask.completedAt = normalizedTask.completedAt || new Date().toISOString();
        normalizedTask.error = normalizedTask.error || {
          error: 'Task was interrupted before FlowMind restarted'
        };
        normalizedTask.progress = this.normalizeTaskProgress('failed', {
          stage: 'interrupted',
          percent: 100,
          message: 'Task was interrupted before FlowMind restarted'
        });
        this.appendProgressHistory(normalizedTask, normalizedTask.progress);
      }
      this.tasks.set(normalizedTask.id, normalizedTask);
      const idNumber = Number(String(normalizedTask.id || '').replace(/^task-/, ''));
      if (Number.isFinite(idNumber)) {
        maxId = Math.max(maxId, idNumber);
      }
    }
    this.taskCounter = Math.max(this.taskCounter, maxId);
    if (persisted.length > 0) {
      await this.persistTasks();
    }
  }

  persistTasks() {
    return this.taskStore.save(this.tasks.values()).catch(() => {
      // Task persistence must not break MCP tool execution.
    });
  }

  getTaskProgress(status, message) {
    const percentByStatus = {
      queued: 0,
      running: 50,
      succeeded: 100,
      failed: 100,
      cancelled: 100
    };

    return {
      stage: status,
      percent: percentByStatus[status] ?? 0,
      message: message || `Task ${status}`
    };
  }

  normalizeTaskProgress(status, progress = {}) {
    const payload = typeof progress === 'string' ? { message: progress } : progress || {};
    const defaultProgress = this.getTaskProgress(status);
    const rawPercent = Number(payload.percent);
    const percent = Number.isFinite(rawPercent) ? Math.max(0, Math.min(100, rawPercent)) : defaultProgress.percent;

    return {
      stage: payload.stage || defaultProgress.stage,
      percent,
      message: payload.message || defaultProgress.message
    };
  }

  appendProgressHistory(task, progress) {
    const previous =
      Array.isArray(task.progressHistory) && task.progressHistory.length > 0
        ? task.progressHistory[task.progressHistory.length - 1]
        : null;
    if (
      previous &&
      previous.stage === progress.stage &&
      previous.percent === progress.percent &&
      previous.message === progress.message
    ) {
      return;
    }

    task.progressHistory = Array.isArray(task.progressHistory) ? task.progressHistory : [];
    task.progressHistory.push({
      ...progress,
      timestamp: new Date().toISOString()
    });
    if (task.progressHistory.length > 20) {
      task.progressHistory = task.progressHistory.slice(-20);
    }
  }

  updateTask(task, patch = {}) {
    const { progress, progressMessage, progressPercent, progressStage, ...statePatch } = patch;

    Object.assign(task, statePatch);

    if (
      progress !== undefined ||
      statePatch.status ||
      progressMessage ||
      Number.isFinite(progressPercent) ||
      progressStage
    ) {
      task.progress =
        progress !== undefined
          ? this.normalizeTaskProgress(statePatch.status || task.status, progress)
          : this.normalizeTaskProgress(statePatch.status || task.status, {
              stage: progressStage,
              percent: progressPercent,
              message: progressMessage || task.progress?.message
            });
      this.appendProgressHistory(task, task.progress);
    }

    eventBus.emit('mcp:task_updated', {
      taskId: task.id,
      tool: task.tool,
      status: task.status,
      progress: task.progress,
      timestamp: new Date().toISOString()
    });
    this.persistTasks();
  }

  serializeTask(task) {
    return {
      id: task.id,
      tool: task.tool,
      arguments: task.arguments,
      status: task.status,
      progress: task.progress,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      cancellation: task.cancellation || null,
      attempts: task.attempts || 0,
      maxRetries: task.maxRetries || 0,
      timeoutMs: task.timeoutMs || null,
      error: task.error || null,
      result: task.result || null,
      progressHistory: task.progressHistory || []
    };
  }

  createTask(tool, toolArgs = {}, options = {}) {
    const id = this.buildTaskId();
    const initialProgress = this.getTaskProgress('queued', 'Task queued');
    const task = {
      id,
      tool,
      arguments: toolArgs,
      attempts: 0,
      maxRetries: Math.max(0, Number(options.retries) || 0),
      timeoutMs: Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : null,
      status: 'queued',
      progress: initialProgress,
      progressHistory: [
        {
          ...initialProgress,
          timestamp: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      cancellation: null,
      error: null,
      result: null,
      timer: null,
      timeoutTimer: null
    };

    this.tasks.set(id, task);
    this.persistTasks();
    task.timer = setTimeout(() => {
      this.runTask(id).catch(() => {
        // Error state is persisted by runTask.
      });
    }, 0);
    return task;
  }

  async runTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'queued') {
      return task || null;
    }

    while (task.attempts <= task.maxRetries && !task.cancellation?.requested) {
      task.attempts += 1;
      this.updateTask(task, {
        status: 'running',
        startedAt: task.startedAt || new Date().toISOString(),
        progress: {
          stage: task.attempts > 1 ? 'retry' : 'dispatch',
          percent: 5,
          message:
            task.attempts > 1
              ? `Retrying ${task.tool} (${task.attempts}/${task.maxRetries + 1})`
              : `Running ${task.tool}`
        }
      });

      try {
        const result = await this.runTaskAttempt(task);
        if (task.cancellation?.requested || task.status === 'cancelled') {
          return task;
        }
        if (!result.isError || task.attempts > task.maxRetries) {
          const enrichedResult = this.enrichTaskResultWithDeposition(result);
          this.updateTask(task, {
            status: enrichedResult.isError ? 'failed' : 'succeeded',
            completedAt: new Date().toISOString(),
            result: enrichedResult,
            error: enrichedResult.isError ? JSON.parse(enrichedResult.content[0].text) : null,
            progress: {
              stage: enrichedResult.isError ? 'failed' : 'completed',
              percent: 100,
              message: enrichedResult.isError ? `Task failed: ${task.tool}` : `Task completed: ${task.tool}`
            }
          });
          return task;
        }
      } catch (error) {
        if (task.cancellation?.requested || task.status === 'cancelled') {
          return task;
        }
        if (task.attempts > task.maxRetries) {
          this.updateTask(task, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: { error: error.message },
            progress: {
              stage: 'failed',
              percent: 100,
              message: `Task failed: ${task.tool}`
            }
          });
          return task;
        }
      } finally {
        if (task.timeoutTimer) {
          clearTimeout(task.timeoutTimer);
          task.timeoutTimer = null;
        }
        task.timer = null;
      }
    }

    return task;
  }

  async runTaskAttempt(task) {
    const execution = this.callToolInternal(task.tool, task.arguments, {
      task,
      progressReporter: this.createTaskProgressReporter(task),
      cancellationToken: task.cancellationToken
    });

    if (!task.timeoutMs) {
      return execution;
    }

    const timeout = new Promise((resolve) => {
      task.timeoutTimer = setTimeout(() => {
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Task timed out after ${task.timeoutMs}ms`,
                kind: 'execution-timeout',
                retryable: task.attempts <= task.maxRetries
              })
            }
          ],
          isError: true
        });
      }, task.timeoutMs);
    });

    return Promise.race([execution, timeout]);
  }

  enrichTaskResultWithDeposition(result) {
    if (!result?.content?.[0]?.text) {
      return result;
    }
    try {
      const payload = JSON.parse(result.content[0].text);
      const enriched = attachKnowledgeDepositionCandidates(payload);
      return {
        ...result,
        content: [
          {
            ...result.content[0],
            text: JSON.stringify(enriched, null, 2)
          }
        ],
        isError: result.isError
      };
    } catch {
      return result;
    }
  }

  createTaskProgressReporter(task) {
    return (progress) => {
      if (!task || ['succeeded', 'failed', 'cancelled'].includes(task.status) || task.cancellation?.requested) {
        return;
      }

      this.updateTask(task, {
        status: 'running',
        progress
      });
    };
  }

  async startAsyncTask(args = {}) {
    const toolName = args.tool;
    if (!toolName) {
      throw new Error('tool is required');
    }

    if (this.isTaskManagementTool(toolName)) {
      throw new Error(`Nested task management is not supported: ${toolName}`);
    }

    const availableTools = new Set(this.getTools().map((tool) => tool.name));
    if (!availableTools.has(toolName)) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const task = this.createTask(toolName, args.arguments || {}, {
      timeoutMs: args.timeoutMs,
      retries: args.retries
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              task: this.serializeTask(task)
            },
            null,
            2
          )
        }
      ]
    };
  }

  async getTaskStatus(args = {}) {
    const task = this.tasks.get(args.taskId);
    if (!task) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Task not found: ${args.taskId}` })
          }
        ],
        isError: true
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              task: this.serializeTask(task)
            },
            null,
            2
          )
        }
      ]
    };
  }

  async listTasks(args = {}) {
    const limit = Number.isFinite(args.limit) ? Math.max(1, args.limit) : 20;
    const tasks = Array.from(this.tasks.values())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((task) => this.serializeTask(task));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ tasks }, null, 2)
        }
      ]
    };
  }

  async cancelTask(args = {}) {
    const task = this.tasks.get(args.taskId);
    if (!task) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Task not found: ${args.taskId}` })
          }
        ],
        isError: true
      };
    }

    if (task.status === 'queued') {
      if (task.timer) {
        clearTimeout(task.timer);
      }
      task.timer = null;
      this.updateTask(task, {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
        cancellation: {
          supported: true,
          cancelledAt: new Date().toISOString()
        },
        progress: {
          stage: 'cancelled',
          percent: 100,
          message: `Task cancelled: ${task.tool}`
        }
      });
    } else if (task.status === 'running') {
      this.updateTask(task, {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
        cancellation: {
          supported: true,
          requested: true,
          cancelledAt: new Date().toISOString(),
          reason: 'Best-effort running cancellation requested; late tool results will be ignored'
        },
        progress: {
          stage: 'cancelled',
          percent: 100,
          message: `Task cancellation requested: ${task.tool}`
        }
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              task: this.serializeTask(task)
            },
            null,
            2
          )
        }
      ]
    };
  }

  async callToolInternal(name, args, executionContext = {}) {
    let result;

    if (name === 'flowmind_process') {
      const processContext = executionContext.progressReporter
        ? {
            ...(args.context || {}),
            onProgress: executionContext.progressReporter,
            taskProgress: executionContext.progressReporter
          }
        : args.context || {};
      const data = await this.flowmind.process(args.input, processContext);
      result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }
        ],
        isError: isErrorResultPayload(data)
      };
    } else if (name === 'flowmind_list_skills') {
      const skills = this.flowmind.skills.list();
      result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ skills }, null, 2)
          }
        ]
      };
    } else if (name === 'flowmind_capability_catalog') {
      result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ capabilities: this.getCapabilityCatalog() }, null, 2)
          }
        ]
      };
    } else if (name === 'flowmind_preview_workflow') {
      result = {
        content: [{ type: 'text', text: JSON.stringify(this.workflowService.preview(args.chain || args.result || {}), null, 2) }]
      };
    } else if (name === 'flowmind_execute_workflow') {
      const execution = await this.workflowService.execute(args.chain, {
        approvalToken: args.approvalToken,
        continueOnError: args.continueOnError === true,
        context: args.context || {}
      });
      result = {
        content: [{ type: 'text', text: JSON.stringify(execution, null, 2) }],
        isError: execution.status === 'failed'
      };
    } else if (name === 'flowmind_resume_workflow') {
      const execution = await this.workflowService.resume(args.executionId, {
        approvalToken: args.approvalToken,
        continueOnError: args.continueOnError === true,
        context: args.context || {}
      });
      if (execution.status === 'not_found') {
        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: execution.error })
            }
          ],
          isError: true
        };
      } else {
        result = {
          content: [{ type: 'text', text: JSON.stringify(execution, null, 2) }],
          isError: execution.status === 'failed'
        };
      }
    } else if (name === 'flowmind_workflow_history') {
      const workflows = await this.workflowService.history({
        limit: args.limit,
        status: args.status,
        resumable: args.resumable === true
      });
      result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ workflows }, null, 2)
          }
        ]
      };
    } else if (name === 'flowmind_get_skill') {
      const skill = this.flowmind.skills.get(args.name);
      if (!skill) {
        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Skill not found: ${args.name}` })
            }
          ],
          isError: true
        };
      } else {
        const skillName = skill.name || args.name;
        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  name: skillName,
                  description: skill.definition?.description,
                  category: skill.definition?.category,
                  triggers: skill.definition?.triggers,
                  componentDependencies: skill.definition?.componentDependencies,
                  capabilities: this.getCapabilityTagsForSkill(skillName),
                  inputSchema: skill.inputSchema || null,
                  outputSchema: skill.outputSchema || null
                },
                null,
                2
              )
            }
          ]
        };
      }
    } else if (name === 'flowmind_ai_status') {
      const status = this.flowmind.getAIStatus();
      result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2)
          }
        ]
      };
    } else if (name === 'flowmind_learning_stats') {
      const stats = await this.flowmind.getStats();
      result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stats, null, 2)
          }
        ]
      };
    } else if (name === 'flowmind_learning_assets') {
      const assets = await this.flowmind.getLearningAssets({ skill: args.skill, limit: args.limit });
      result = {
        content: [{ type: 'text', text: JSON.stringify(assets, null, 2) }]
      };
    } else if (name === 'flowmind_offline_analyze') {
      const analysis = await this.flowmind.analyzeOffline(args.input, {
        sourceDir: args.sourceDir,
        repoDir: args.repoDir,
        includeCode: args.includeCode !== false,
        maxResults: args.maxResults
      });
      result = {
        content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }]
      };
    } else if (name.startsWith('flowmind_skill_')) {
      const skillName = name.replace('flowmind_skill_', '');
      const skill = this.flowmind.skills.get(skillName);

      if (!skill) {
        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Skill not found: ${skillName}` })
            }
          ],
          isError: true
        };
      } else {
        const skillContext = executionContext.progressReporter
          ? {
              ...(args.context || {}),
              onProgress: executionContext.progressReporter,
              taskProgress: executionContext.progressReporter
            }
          : args.context || {};
        const data = await this.flowmind.executeWithLearning(skill, args.input, skillContext);
        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2)
            }
          ],
          isError: isErrorResultPayload(data)
        };
      }
    } else {
      result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Unknown tool: ${name}` })
          }
        ],
        isError: true
      };
    }

    return result;
  }

  /**
   * 调用工具
   */
  async callTool(name, args) {
    await this.init();

    const callStart = Date.now();

    try {
      let result;

      if (name === 'flowmind_start_task') {
        result = await this.startAsyncTask(args);
      } else if (name === 'flowmind_task_status') {
        result = await this.getTaskStatus(args);
      } else if (name === 'flowmind_list_tasks') {
        result = await this.listTasks(args);
      } else if (name === 'flowmind_cancel_task') {
        result = await this.cancelTask(args);
      } else {
        result = await this.callToolInternal(name, args);
      }

      // Emit success event
      eventBus.emit('mcp:tool_called', {
        tool: name,
        args,
        duration: Date.now() - callStart,
        success: !result.isError,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      eventBus.emit('mcp:tool_called', {
        tool: name,
        args,
        duration: Date.now() - callStart,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: error.message })
          }
        ],
        isError: true
      };
    }
  }
}

// 启动 MCP Server
async function main() {
  const server = new FlowMindMCPServer();

  // 读取 stdin，写入 stdout
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    try {
      const request = JSON.parse(line);
      let response;

      if (request.method === 'initialize') {
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'flowmind',
              version: version
            }
          }
        };
      } else if (request.method === 'tools/list') {
        await server.init();
        const tools = server.getTools();
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: { tools }
        };
      } else if (request.method === 'tools/call') {
        const result = await server.callTool(request.params.name, request.params.arguments || {});
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
      } else {
        response = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`
          }
        };
      }

      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (error) {
      const response = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error'
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  });

  // 初始化
  await server.init();
  console.error('FlowMind MCP Server started');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  FlowMindMCPServer,
  CAPABILITY_GROUPS
};
