const { truncatePanelText, getMessageLineLimit, buildMessageMetaParts } = require('../tui/components/ChatPanel.jsx');

describe('chat panel rendering helpers', () => {
  test('uses a higher line limit for log audit results', () => {
    expect(getMessageLineLimit({ metadata: { skill: 'log-audit' } })).toBe(20);
    expect(getMessageLineLimit({ metadata: { skill: 'log-audit', expanded: true } })).toBe(1000);
    expect(getMessageLineLimit({ metadata: { skill: 'change-impact-review' } })).toBe(20);
    expect(getMessageLineLimit({ metadata: { skill: 'knowledge-ops', expanded: true } })).toBe(1000);
    expect(getMessageLineLimit({ metadata: { skill: 'auto-flow' } })).toBe(6);
  });

  test('keeps log audit output visible longer before truncating', () => {
    const text = Array.from({ length: 18 }, (_, index) => `line-${index}`).join('\n');
    const rendered = truncatePanelText(text, 20);

    expect(rendered).toContain('line-17');
    expect(rendered).not.toContain('truncated');
  });

  test('still truncates when structured output exceeds the higher limit', () => {
    const text = Array.from({ length: 25 }, (_, index) => `line-${index}`).join('\n');
    const rendered = truncatePanelText(text, 20);

    expect(rendered).toContain('line-19');
    expect(rendered).toContain('… truncated 5 line(s)');
  });

  test('renders concise AI status meta for chat messages', () => {
    const meta = buildMessageMetaParts({
      metadata: {
        skill: 'ai-status',
        duration: 242,
        skillRoute: 'ai-status',
        aiProvider: 'qwen',
        aiModel: 'qwen-plus'
      }
    });

    expect(meta).toEqual(['AI 状态', '242ms', '模型: qwen / qwen-plus']);
  });
});
