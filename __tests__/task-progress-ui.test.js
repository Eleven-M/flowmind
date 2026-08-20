const { formatEvent } = require('../dashboard/components/ActivityFeed.jsx');
const { formatTaskProgressSummary } = require('../dashboard/components/McpStatusBar.jsx');
const {
  buildBindingNeedsLine,
  buildSecondaryLine,
  buildSkillStatusLine,
  summarizeTaskUpdate
} = require('../tui/app.jsx');

describe('task progress ui helpers', () => {
  test('formats dashboard activity entries for task updates', () => {
    const text = formatEvent({
      type: 'mcp:task_updated',
      data: {
        taskId: 'task-7',
        status: 'running',
        progress: {
          stage: 'classify-files',
          percent: 55
        }
      }
    }, false);

    expect(text).toContain('task:task-7');
    expect(text).toContain('running');
    expect(text).toContain('classify-files');
    expect(text).toContain('55%');
  });

  test('formats MCP status-bar task progress summary', () => {
    expect(formatTaskProgressSummary({
      taskId: 'task-9',
      status: 'running',
      progress: {
        stage: 'preview-metadata',
        percent: 75
      }
    })).toBe('task-9 running preview-metadata 75%');
  });

  test('summarizes the latest task update in the TUI header line', () => {
    const flowmind = {
      skills: {
        list: () => [{ name: 'log-audit' }, { name: 'change-impact-review' }]
      }
    };

    const line = buildSecondaryLine(flowmind, [], false, false, {
      taskId: 'task-3',
      status: 'running',
      progress: {
        stage: 'finalize',
        percent: 95
      }
    });

    expect(summarizeTaskUpdate({
      taskId: 'task-3',
      status: 'running',
      progress: {
        stage: 'finalize',
        percent: 95
      }
    })).toBe('task-3 finalize 95%');
    expect(line).toContain('Skills 2');
    expect(line).toContain('Idle');
    expect(line).toContain('Task task-3 finalize 95%');
  });

  test('shows usable skills and the exact MCP or Git bindings still needed', () => {
    const availability = {
      summary: { total: 4, ready: 2, needsBinding: 1, needsGit: 1, disabled: 0 },
      mcp: { ready: 1, required: 2 },
      git: { installed: true, repository: false, ready: false },
      config: { loaded: true, skillEntries: 2, resourceEntries: 1 },
      skills: [
        { name: 'offline-design-analysis', status: 'ready', missingBindings: [] },
        { name: 'log-audit', status: 'needs-binding', missingBindings: ['logService'] },
        { name: 'git-review', status: 'needs-git', missingBindings: [] },
        { name: 'learning-feedback', status: 'ready', missingBindings: [] }
      ]
    };

    expect(buildSkillStatusLine(availability, false)).toContain('Skills ✓2/4 ⚠2');
    expect(buildSkillStatusLine(availability, false)).toContain('Git ⚠repo');
    expect(buildSkillStatusLine(availability, false)).toContain('Config ✓ s2/r1');
    expect(buildBindingNeedsLine(availability, false)).toContain('Bind: log-audit->logService');
    expect(buildBindingNeedsLine(availability, false)).toContain('Git context: git-review');
  });
});
