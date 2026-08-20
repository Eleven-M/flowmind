const React = require('react');
const { Box, Text, useApp, useInput } = require('ink');
const ChatPanel = require('./components/ChatPanel.jsx');
const { formatResultText } = require('./format-result');
const { getTuiLayout, MIN_COLUMNS, MIN_ROWS } = require('./layout');
const { getUpdateStatusAsync } = require('../core/update-notifier');
const eventBus = require('../core/event-bus');

class TuiErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        Box,
        { flexDirection: 'column', borderStyle: 'single', borderColor: 'red', paddingX: 1, paddingY: 1 },
        React.createElement(Text, { color: 'red', bold: true }, 'TUI render error'),
        React.createElement(Text, { color: 'gray' }, this.state.error.message || 'Unknown render failure'),
        React.createElement(Text, { color: 'gray' }, 'Resize the terminal or restart FlowMind.')
      );
    }

    return this.props.children;
  }
}

function App({ flowmind, asciiMode = false }) {
  const MAX_MESSAGES = 60;
  const [messages, setMessages] = React.useState([]);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [updateNotice, setUpdateNotice] = React.useState(null);
  const [focusPanel, setFocusPanel] = React.useState('chat'); // 'chat' | 'sidebar'
  const [pendingBinding, setPendingBinding] = React.useState(null);
  const [lastTaskUpdate, setLastTaskUpdate] = React.useState(null);
  const [skillAvailability, setSkillAvailability] = React.useState(null);
  const [terminalSize, setTerminalSize] = React.useState(() => ({
    columns: Number(process.stdout?.columns) || 0,
    rows: Number(process.stdout?.rows) || 0
  }));
  const mountedRef = React.useRef(true);
  const messageIdRef = React.useRef(0);
  const commandIdRef = React.useRef(0);
  const activeCommandRef = React.useRef(false);
  const lastResultRef = React.useRef(null);
  const lastLogAuditMessageRef = React.useRef(null);
  const { exit } = useApp();

  React.useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  React.useEffect(() => {
    setSkillAvailability(safeCall(() => flowmind.getSkillAvailability()) || null);
  }, [flowmind, pendingBinding]);

  React.useEffect(() => {
    let cancelled = false;

    async function checkForUpdates() {
      try {
        const status = await getUpdateStatusAsync({
          packageName: 'flowmind',
          currentVersion: require('../package.json').version,
          packageJsonPath: require.resolve('../package.json')
        });

        if (cancelled || !mountedRef.current) return;
        if (status.comparison < 0) {
          setUpdateNotice({
            currentVersion: status.currentVersion,
            latestVersion: status.latestVersion,
            installCommand: status.installCommand
          });
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setUpdateNotice(null);
        }
      }
    }

    checkForUpdates();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let rafId = null;

    const updateSize = () => {
      if (!mountedRef.current) return;
      const nextSize = {
        columns: Number(process.stdout?.columns) || 0,
        rows: Number(process.stdout?.rows) || 0
      };

      setTerminalSize((prev) => {
        if (prev.columns === nextSize.columns && prev.rows === nextSize.rows) {
          return prev;
        }
        return nextSize;
      });
    };

    const scheduleUpdate = () => {
      if (rafId) {
        clearTimeout(rafId);
      }
      rafId = setTimeout(updateSize, 120);
    };

    scheduleUpdate();
    process.stdout?.on?.('resize', scheduleUpdate);

    return () => {
      if (rafId) {
        clearTimeout(rafId);
      }
      process.stdout?.removeListener?.('resize', scheduleUpdate);
    };
  }, []);

  React.useEffect(() => {
    const handler = (data) => {
      if (!mountedRef.current) return;
      setLastTaskUpdate(data || null);
    };

    eventBus.on('mcp:task_updated', handler);
    return () => {
      eventBus.removeListener('mcp:task_updated', handler);
    };
  }, []);

  const appendMessage = React.useCallback((role, text, metadata = {}) => {
    const id = ++messageIdRef.current;
    setMessages(prev => [...prev, { id, role, text, metadata }].slice(-MAX_MESSAGES));
    return id;
  }, []);

  const updateMessage = React.useCallback((messageId, patch) => {
    if (!messageId) return;
    setMessages(prev => prev.map((message) => (
      message.id === messageId
        ? { ...message, ...patch, metadata: { ...message.metadata, ...(patch.metadata || {}) } }
        : message
    )));
  }, []);

  const appendBindingPrompt = React.useCallback((bindingState) => {
    const step = bindingState.steps[bindingState.index];
    const details = [
      '当前请求缺少可复用配置，进入绑定流程。',
      `请提供 ${step.label}：${step.defaultValue ? `（默认：${step.defaultValue}）` : ''}`.trim()
    ].join('\n');
    appendMessage('system', details, { label: 'binding' });
  }, [appendMessage]);

  // Ctrl+C always exits; Tab switches focus between panels
  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
    if (key.tab) setFocusPanel('chat');
  });

  const handleCommand = React.useCallback(async (input) => {
    if (!mountedRef.current || activeCommandRef.current) return;

    if (pendingBinding) {
      await handleBindingStep(input);
      return;
    }

    const normalizedInput = String(input || '').trim().toLowerCase();
    if (normalizedInput === 'more') {
      const lastResult = lastResultRef.current;
      const lastSkill = lastResult?.metadata?.skill || lastResult?.skill || lastResult?.data?.skill;
      const logAuditMessageId = lastLogAuditMessageRef.current?.id || null;
      if (lastResult && lastSkill === 'log-audit' && logAuditMessageId) {
        appendMessage('user', input);
        updateMessage(logAuditMessageId, {
          text: formatResultText(lastResult, { colorize: true, logAuditDetailLevel: 'full' }),
          metadata: {
            label: 'more',
            expanded: true
          }
        });
      } else if (lastResult && lastSkill === 'log-audit') {
        appendMessage('user', input);
        const messageId = appendMessage('flowmind', formatResultText(lastResult, { colorize: true, logAuditDetailLevel: 'full' }), {
          type: lastResult.type,
          skill: lastSkill,
          duration: lastResult.metadata?.duration,
          scene: lastResult.metadata?.sceneMatch?.scene?.name,
          aiProvider: lastResult.metadata?.aiProvider,
          aiModel: lastResult.metadata?.aiModel,
          aiEnhanced: lastResult.metadata?.aiEnhanced,
          skillRoute: lastResult.metadata?.skillRoute,
          label: 'more',
          expanded: true
        });
        lastLogAuditMessageRef.current = { id: messageId, result: lastResult };
      } else {
        appendMessage('user', input);
        appendMessage('flowmind', '当前没有可展开的日志结果。', { type: 'info' });
      }
      return;
    }

    activeCommandRef.current = true;
    const commandId = ++commandIdRef.current;
    appendMessage('user', input);
    setIsProcessing(true);

    try {
      const result = await flowmind.process(input);
      if (!mountedRef.current || commandId !== commandIdRef.current) return;
      lastResultRef.current = result;

      const messageId = appendMessage('flowmind', formatResultText(result), {
        type: result.type,
        label: result.metadata?.label,
        skill: result.metadata?.skill || result.skill,
        duration: result.metadata?.duration,
        scene: result.metadata?.sceneMatch?.scene?.name,
        aiProvider: result.metadata?.aiProvider,
        aiModel: result.metadata?.aiModel,
        aiEnhanced: result.metadata?.aiEnhanced,
        skillRoute: result.metadata?.skillRoute
      });
      if ((result.metadata?.skill || result.skill || result.data?.skill) === 'log-audit') {
        lastLogAuditMessageRef.current = { id: messageId, result };
      } else {
        lastLogAuditMessageRef.current = null;
      }

      const bindingHint = extractBindingHint(result);
      if (bindingHint?.kind === 'mcp-binding' && bindingHint.message && shouldStartBindingFlow(bindingHint, result)) {
        const bindingState = createBindingState(input, result, bindingHint);
        setPendingBinding(bindingState);
        appendBindingPrompt(bindingState);
      }
    } catch (e) {
      if (mountedRef.current && commandId === commandIdRef.current) {
        appendMessage('flowmind', 'Error: ' + e.message, { type: 'error' });
      }
    } finally {
      if (mountedRef.current && commandId === commandIdRef.current) {
        setIsProcessing(false);
      }
      activeCommandRef.current = false;
    }
  }, [appendBindingPrompt, appendMessage, flowmind, pendingBinding]);

  const handleBindingStep = React.useCallback(async (rawInput) => {
    if (!pendingBinding || !mountedRef.current) return;

    const input = String(rawInput || '').trim();
    const normalized = input.toLowerCase();
    if (normalized === 'cancel' || normalized === '/cancel') {
      appendMessage('system', 'Binding cancelled.', { label: 'binding' });
      setPendingBinding(null);
      return;
    }

    appendMessage('user', input, { label: 'binding answer' });

    const step = pendingBinding.steps[pendingBinding.index];
    const nextValue = input || step.defaultValue || '';
    const nextAnswers = {
      ...pendingBinding.answers,
      [step.key]: nextValue || null
    };
    const nextIndex = pendingBinding.index + 1;

    if (nextIndex < pendingBinding.steps.length) {
      const nextState = {
        ...pendingBinding,
        index: nextIndex,
        answers: nextAnswers
      };
      setPendingBinding(nextState);
      appendBindingPrompt(nextState);
      return;
    }

    setPendingBinding(null);
    setIsProcessing(true);

    const binding = buildBindingFromState(pendingBinding, nextAnswers);
    try {
      if (!flowmind?.learning?.saveResourceBinding) {
        appendMessage('flowmind', 'Binding failed: learning engine is not available.', { type: 'error' });
        return;
      }
      await flowmind.learning.saveResourceBinding(binding, { currentSkill: 'log-audit' });
      appendMessage('system', `Binding saved: ${binding.business}`, { label: 'binding' });

      const retryResult = await flowmind.process(pendingBinding.originalInput);
      lastResultRef.current = retryResult;
      const messageId = appendMessage('flowmind', formatResultText(retryResult), {
        type: retryResult.type,
        label: retryResult.metadata?.label,
        skill: retryResult.metadata?.skill || retryResult.skill,
        duration: retryResult.metadata?.duration,
        scene: retryResult.metadata?.sceneMatch?.scene?.name,
        aiProvider: retryResult.metadata?.aiProvider,
        aiModel: retryResult.metadata?.aiModel,
        aiEnhanced: retryResult.metadata?.aiEnhanced,
        skillRoute: retryResult.metadata?.skillRoute
      });
      if ((retryResult.metadata?.skill || retryResult.skill || retryResult.data?.skill) === 'log-audit') {
        lastLogAuditMessageRef.current = { id: messageId, result: retryResult };
      } else {
        lastLogAuditMessageRef.current = null;
      }
    } catch (error) {
      appendMessage('flowmind', `Binding failed: ${error.message}`, { type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, [appendBindingPrompt, appendMessage, flowmind, pendingBinding]);

  const layout = getTuiLayout(terminalSize.columns, terminalSize.rows);

  if (layout.tooSmall) {
    return (
      React.createElement(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'red', paddingX: 1, paddingY: 1 },
        React.createElement(Text, { bold: true, color: 'red' }, 'Terminal too small'),
        React.createElement(Text, { color: 'gray' }, `Need at least ${MIN_COLUMNS}x${MIN_ROWS}. Current size: ${layout.columns}x${layout.rows}.`),
        React.createElement(Text, { color: 'gray' }, 'Resize the terminal to keep the TUI stable.')
      )
    );
  }

  return (
    React.createElement(TuiErrorBoundary, null,
      React.createElement(Box, { flexDirection: 'column', width: '100%', height: '100%' },
        updateNotice && React.createElement(Box, {
          borderStyle: 'single',
          borderColor: 'yellow',
          paddingX: 1,
          marginBottom: 1
        },
          React.createElement(Text, { color: 'yellow' }, `Update available: ${updateNotice.currentVersion} → ${updateNotice.latestVersion}`),
          React.createElement(Text, { color: 'gray' }, `  Run ${updateNotice.installCommand}`)
        ),
        React.createElement(Box, { flexDirection: 'column', flexGrow: 1 },
          React.createElement(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'gray', paddingX: 1, marginBottom: 1 },
            React.createElement(Text, { color: 'gray' }, buildHeaderLine(flowmind, focusPanel, layout.columns, layout.rows, pendingBinding)),
            React.createElement(Text, { color: 'gray' }, buildSecondaryLine(flowmind, messages, isProcessing, asciiMode, lastTaskUpdate)),
            React.createElement(Text, { color: 'gray' }, buildSkillStatusLine(skillAvailability, asciiMode)),
            React.createElement(Text, { color: 'yellow' }, buildBindingNeedsLine(skillAvailability, asciiMode)),
            React.createElement(Text, { color: 'gray' }, buildAiStatusLine(flowmind, asciiMode))
          ),
          React.createElement(ChatPanel, {
            messages,
            onSubmit: handleCommand,
            isProcessing: isProcessing,
            onExit: exit,
            focused: focusPanel === 'chat',
            asciiMode: asciiMode,
            width: layout.columns,
            promptText: pendingBinding ? formatPendingBindingPrompt(pendingBinding) : null,
            dense: true
          })
        )
      )
    )
  );
}

function createBindingState(originalInput, result, bindingHint) {
  const resolution = extractBindingResolution(result);
  const missing = Array.isArray(bindingHint?.missing) ? bindingHint.missing : [];
  const steps = buildBindingSteps({
    kind: bindingHint?.kind || 'resource-binding',
    missing,
    resolution,
    originalInput,
    bindingHint
  });

  return {
    originalInput,
    result,
    bindingHint,
    kind: bindingHint?.kind || 'resource-binding',
    resolution,
    steps,
    index: 0,
    answers: {}
  };
}

function buildBindingSteps({ kind = 'resource-binding', missing = [], resolution = {}, originalInput = '', bindingHint = {} }) {
  if (kind === 'mcp-binding') {
    return buildMcpBindingSteps({ missing, resolution, bindingHint });
  }

  const defaults = {
    business: inferBindingBusinessFromInput(originalInput),
    env: resolution.env || inferEnvFromInput(originalInput) || 'test',
    endpoint: resolution.endpoint || inferEndpointFromEnv(resolution.env || inferEnvFromInput(originalInput) || 'test'),
    project: resolution.project || inferProjectFromInput(originalInput),
    logstore: resolution.logstore || inferLogstoreFromInput(originalInput)
  };

  const stepDefs = [
    { key: 'business', label: '绑定名称', defaultValue: defaults.business },
    { key: 'env', label: '环境', defaultValue: defaults.env },
    { key: 'endpoint', label: 'SLS endpoint', defaultValue: defaults.endpoint },
    { key: 'project', label: 'project', defaultValue: defaults.project },
    { key: 'logstore', label: 'logstore', defaultValue: defaults.logstore }
  ];

  if (missing.length > 0) {
    return stepDefs.filter((step) => step.key === 'business' || missing.includes(step.key) || (step.key === 'endpoint' && missing.includes('环境')));
  }

  return stepDefs;
}

function buildBindingFromState(bindingState, answers = {}) {
  const merged = {
    ...bindingState.resolution,
    ...bindingState.answers,
    ...answers
  };

  if (bindingState.kind === 'mcp-binding') {
    return buildMcpBindingFromState(bindingState, merged);
  }

  return {
    business: merged.business || inferBindingBusinessFromInput(bindingState.originalInput),
    componentType: 'logService',
    provider: 'aliyun-sls',
    mcpServer: 'sls-logs',
    source: 'dialog-log-bind',
    aliases: [
      merged.business,
      merged.env,
      merged.project,
      merged.logstore,
      merged.endpoint
    ].filter(Boolean),
    keywords: [
      merged.business,
      merged.env,
      merged.project,
      merged.logstore,
      merged.endpoint
    ].filter(Boolean),
    connection: {
      env: merged.env || null,
      endpoint: merged.endpoint || null,
      project: merged.project || null,
      logstore: merged.logstore || null
    },
    metadata: {
      input: bindingState.originalInput,
      source: 'tui-binding',
      bindingHint: bindingState.bindingHint?.message || null
    }
  };
}

function formatPendingBindingPrompt(bindingState) {
  const step = bindingState.steps[bindingState.index];
  const defaultText = step?.defaultValue ? ` 默认：${step.defaultValue}` : '';
  return `绑定模式：${step?.label || '继续补充配置'}${defaultText}。输入 cancel 可取消。`;
}

function extractDisplayedPayload(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  if (result.type === 'result' && result.data && typeof result.data === 'object' && result.data.type) {
    return result.data;
  }

  return result.data ?? result;
}

function extractBindingHint(result) {
  const payload = extractDisplayedPayload(result);
  return payload?.data?.bindingHint || payload?.bindingHint || null;
}

function extractBindingResolution(result) {
  const payload = extractDisplayedPayload(result);
  return payload?.data?.resolution || payload?.resolution || {};
}

function shouldStartBindingFlow(bindingHint, result) {
  if (!bindingHint?.kind) {
    return false;
  }

  return bindingHint.kind === 'mcp-binding';
}

function inferBindingBusinessFromInput(input) {
  const quotedMatch = String(input || '').match(/["'“”‘’]([^"'“”‘’]{2,})["'“”‘’]/);
  if (quotedMatch && quotedMatch[1]) {
    return `log-${quotedMatch[1].slice(0, 16)}`;
  }

  return 'log-binding';
}

function inferEnvFromInput(input) {
  const text = String(input || '').toLowerCase();
  if (/uat|预发/.test(text)) return 'uat';
  if (/gray|灰度/.test(text)) return 'gray';
  if (/prod|生产/.test(text)) return 'prod';
  if (/test|测试/.test(text)) return 'test';
  return null;
}

function inferEndpointFromEnv(env) {
  const normalized = String(env || '').toLowerCase();
  if (normalized === 'gray' || normalized === 'prod') {
    return 'cn-hongkong.log.aliyuncs.com';
  }
  return 'cn-shenzhen.log.aliyuncs.com';
}

function inferProjectFromInput(input) {
  const match = String(input || '').match(/(?:project|项目)\s*[:=]?\s*(\S+)/i);
  return match ? match[1] : '';
}

function inferLogstoreFromInput(input) {
  const match = String(input || '').match(/(?:logstore|日志库)\s*[:=]?\s*(\S+)/i);
  return match ? match[1] : '';
}

function buildMcpBindingSteps({ missing = [], resolution = {}, bindingHint = {} }) {
  const defaults = {
    business: bindingHint.serverName ? `mcp-${bindingHint.serverName}` : 'mcp-binding',
    endpoint: resolution.endpoint || bindingHint.fields?.endpoint || '',
    headers: ''
  };

  const steps = [
    { key: 'business', label: '绑定名称', defaultValue: defaults.business },
    { key: 'endpoint', label: 'MCP endpoint', defaultValue: defaults.endpoint },
    { key: 'headers', label: 'Headers JSON', defaultValue: defaults.headers }
  ];

  if (missing.length > 0) {
    return steps.filter((step) => step.key === 'business' || missing.includes(step.key) || missing.includes('headers'));
  }

  return steps;
}

function buildMcpBindingFromState(bindingState, merged) {
  let parsedHeaders = {};
  if (merged.headers) {
    try {
      const value = typeof merged.headers === 'string' ? JSON.parse(merged.headers) : merged.headers;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parsedHeaders = value;
      }
    } catch {
      parsedHeaders = {};
    }
  }

  return {
    business: merged.business || bindingState.bindingHint?.serverName || 'mcp-binding',
    componentType: 'mcp',
    provider: bindingState.bindingHint?.serverName || 'mcp',
    mcpServer: bindingState.bindingHint?.serverName || null,
    source: 'dialog-mcp-bind',
    aliases: [
      bindingState.bindingHint?.serverName,
      bindingState.bindingHint?.tool,
      merged.endpoint
    ].filter(Boolean),
    keywords: [
      bindingState.bindingHint?.serverName,
      bindingState.bindingHint?.tool,
      merged.endpoint
    ].filter(Boolean),
    connection: {
      endpoint: merged.endpoint || null,
      headers: parsedHeaders
    },
    metadata: {
      input: bindingState.originalInput,
      source: 'tui-mcp-binding',
      bindingHint: bindingState.bindingHint?.message || null
    }
  };
}

function buildHeaderLine(flowmind, focusPanel, columns, rows, pendingBinding) {
  const aiStatus = safeCall(() => flowmind.getAIStatus());
  const honor = safeCall(() => flowmind.getHonorData());
  const components = safeCall(() => flowmind.getComponentStatus());
  const aiName = aiStatus?.defaultProvider || 'none';
  const aiModel = aiStatus?.defaultModel || 'auto';
  const aiState = aiStatus?.health || (aiStatus?.initialized ? 'ready' : 'off');
  const activeCount = components ? Object.values(components).filter((c) => c.active).length : 0;
  const componentCount = components ? Object.keys(components).length : 0;
  const level = honor?.level || 0;
  const points = honor?.points || 0;
  const parts = [
    `FlowMind`,
    `${columns}x${rows}`,
    `AI ${aiName}/${aiModel} ${aiState}`,
    'Route AI→Skill→MCP',
    `Comp ${activeCount}/${componentCount}`,
    `Honor Lv${level} ${points}pts`,
    `Focus ${focusPanel || 'chat'}`
  ];

  if (pendingBinding) {
    parts.push('Binding active');
  }

  return parts.join(' | ');
}

function buildSecondaryLine(flowmind, messages, isProcessing, asciiMode, lastTaskUpdate = null) {
  const skillCount = safeCall(() => flowmind.skills.list()?.length) || 0;
  const parts = [`Skills ${skillCount}`, isProcessing ? 'Working' : 'Idle'];
  const taskSummary = summarizeTaskUpdate(lastTaskUpdate);
  if (taskSummary) {
    parts.push(`Task ${taskSummary}`);
  }
  return parts.join(' | ');
}

function buildSkillStatusLine(availability, asciiMode = false) {
  if (!availability?.summary) return 'Availability | loading';
  const ok = asciiMode ? 'OK' : '✓';
  const warning = asciiMode ? '!' : '⚠';
  const summary = availability.summary;
  const mcp = availability.mcp || {};
  const git = availability.git || {};
  const config = availability.config || {};
  const attention = (summary.needsBinding || 0) + (summary.needsGit || 0) + (summary.disabled || 0);
  const gitState = git.ready ? ok : (git.installed ? `${warning}repo` : `${warning}missing`);
  const mcpState = (mcp.required || 0) === 0 || (mcp.ready || 0) >= (mcp.required || 0) ? ok : warning;
  const configState = config.loaded ? ok : warning;
  return [
    `Availability Skills ${ok}${summary.ready}/${summary.total}${attention ? ` ${warning}${attention}` : ''}`,
    `MCP ${mcpState}${mcp.ready || 0}/${mcp.required || 0}`,
    `Git ${gitState}`,
    `Config ${configState} s${config.skillEntries || 0}/r${config.resourceEntries || 0}`
  ].join(' | ');
}

function buildBindingNeedsLine(availability, asciiMode = false) {
  if (!availability?.skills) return 'Binding status | loading';
  const bindingSkills = availability.skills
    .filter((skill) => skill.status === 'needs-binding')
    .map((skill) => `${skill.name}->${skill.missingBindings.join('+')}`);
  const gitSkills = availability.skills
    .filter((skill) => skill.status === 'needs-git')
    .map((skill) => skill.name);
  const disabledSkills = availability.skills
    .filter((skill) => skill.status === 'disabled')
    .map((skill) => skill.name);
  const ok = asciiMode ? 'OK' : '✓';
  const parts = [];
  if (bindingSkills.length > 0) parts.push(`Bind: ${bindingSkills.join(', ')}`);
  if (gitSkills.length > 0) parts.push(`Git context: ${gitSkills.join(', ')}`);
  if (disabledSkills.length > 0) parts.push(`Disabled: ${disabledSkills.join(', ')}`);
  return parts.length > 0 ? parts.join(' | ') : `${ok} All loaded skills are usable`;
}

function buildAiStatusLine(flowmind, asciiMode) {
  const aiStatus = safeCall(() => flowmind.getAIStatus()) || {};
  const providers = aiStatus.providers || {};
  const providerEntries = Object.entries(providers);
  const defaultProvider = aiStatus.defaultProvider || 'none';
  const defaultModel = aiStatus.defaultModel || 'auto';
  const activeEntry = providerEntries.find(([, info]) => info?.health === 'ready' || info?.health === 'error' || info?.initialized) || null;
  const activeProvider = activeEntry?.[0] || defaultProvider;
  const activeModel = activeEntry?.[1]?.info?.model || defaultModel;
  const providerState = activeEntry?.[1]?.health || aiStatus?.health || (aiStatus.initialized ? 'ready' : 'off');
  const providerList = providerEntries.length > 0
    ? providerEntries.map(([name, info]) => `${name}:${info?.health || (info?.initialized ? 'on' : 'off')}`).join(', ')
    : 'no providers';

  const line = `AI ${activeProvider}/${activeModel} | ${providerState} | providers ${providerList} | test: flowmind ai --status`;
  return asciiMode ? line : line;
}

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function truncateSummaryLine(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 90) {
    return clean;
  }
  return clean.slice(0, 89) + '…';
}

function summarizeTaskUpdate(update) {
  if (!update || typeof update !== 'object') {
    return null;
  }

  const pieces = [];
  if (update.taskId) {
    pieces.push(update.taskId);
  }
  if (update.progress?.stage) {
    pieces.push(update.progress.stage);
  } else if (update.status) {
    pieces.push(update.status);
  }
  if (Number.isFinite(update.progress?.percent)) {
    pieces.push(`${update.progress.percent}%`);
  }

  return pieces.length > 0 ? pieces.join(' ') : null;
}

module.exports = App;
module.exports.buildSecondaryLine = buildSecondaryLine;
module.exports.buildSkillStatusLine = buildSkillStatusLine;
module.exports.buildBindingNeedsLine = buildBindingNeedsLine;
module.exports.summarizeTaskUpdate = summarizeTaskUpdate;
