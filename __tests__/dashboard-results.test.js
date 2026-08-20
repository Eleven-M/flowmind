const { getLatestConversationSummary, summarizeConversationEntry } = require('../dashboard/components/ResultHighlights.jsx');
const { buildRecentTasksFromUpdates, formatTaskHeadline, formatTaskDetails } = require('../dashboard/components/RecentTasks.jsx');

describe('dashboard result highlights', () => {
  test('summarizes structured follow-up actions from the latest conversation result', () => {
    const summary = summarizeConversationEntry({
      skill: 'change-impact-review',
      timestamp: '2026-07-07T01:02:03.000Z',
      output: {
        type: 'result',
        skill: 'change-impact-review',
        message: 'Impact review completed for 2 file(s). Risk: medium',
        data: {
          action: 'review',
          risk: { level: 'medium' },
          automationCandidates: [
            {
              skill: 'data-risk-audit',
              reason: 'Database or cache related files changed',
              configured: true
            }
          ],
          nextActions: [
            {
              skill: 'knowledge-ops',
              suggestedInput: '保存知识 path=docs/runbook.md repo=team/ops'
            }
          ],
          retryHints: [
            'Run targeted regression before release.'
          ]
        }
      }
    });

    expect(summary).toEqual(expect.objectContaining({
      skill: 'change-impact-review',
      time: '09:02:03',
      message: 'Impact review completed for 2 file(s). Risk: medium',
      statusLine: expect.stringContaining('risk=medium'),
      retryHints: expect.arrayContaining([
        'Run targeted regression before release.'
      ]),
      automationCandidates: expect.arrayContaining([
        expect.objectContaining({ skill: 'data-risk-audit' })
      ]),
      nextActions: expect.arrayContaining([
        expect.objectContaining({ skill: 'knowledge-ops' })
      ])
    }));
  });

  test('reads the latest conversation entry from flowmind history', () => {
    const flowmind = {
      getConversationHistory: () => ([
        {
          skill: 'report-insights',
          output: {
            type: 'result',
            skill: 'report-insights',
            message: 'Build report summary generated',
            data: {
              action: 'build',
              summary: {
                failed: 1,
                succeeded: 2
              },
              automationCandidates: [
                { skill: 'archive-change', reason: 'Capture report evidence' }
              ]
            }
          },
          timestamp: '2026-07-07T03:04:05.000Z'
        }
      ])
    };

    const summary = getLatestConversationSummary(flowmind);
    expect(summary).toEqual(expect.objectContaining({
      skill: 'report-insights',
      statusLine: expect.stringContaining('failed=1'),
      automationCandidates: expect.arrayContaining([
        expect.objectContaining({ skill: 'archive-change' })
      ])
    }));
  });

  test('builds a recent-task list from incremental task updates', () => {
    const taskMap = new Map();
    buildRecentTasksFromUpdates(taskMap, {
      taskId: 'task-1',
      tool: 'flowmind_skill_change-impact-review',
      status: 'running',
      progress: {
        stage: 'classify-files',
        percent: 55,
        message: 'Classifying changed files'
      },
      timestamp: '2026-07-07T01:00:00.000Z'
    }, 5);

    const tasks = buildRecentTasksFromUpdates(taskMap, {
      taskId: 'task-2',
      tool: 'flowmind_skill_data-risk-audit',
      status: 'succeeded',
      progress: {
        stage: 'completed',
        percent: 100,
        message: 'Task completed'
      },
      timestamp: '2026-07-07T01:01:00.000Z'
    }, 5);

    expect(tasks[0]).toEqual(expect.objectContaining({
      taskId: 'task-2',
      status: 'succeeded',
      stage: 'completed',
      percent: 100
    }));
    expect(tasks[1]).toEqual(expect.objectContaining({
      taskId: 'task-1',
      stage: 'classify-files'
    }));
    expect(formatTaskHeadline(tasks[0])).toContain('task-2 | succeeded | completed | 100%');
    expect(formatTaskDetails(tasks[0])).toContain('tool=flowmind_skill_data-risk-audit');
  });
});
