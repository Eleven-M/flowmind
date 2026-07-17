const reportInsights = require('../report-insights');

module.exports = {
  capabilities: ['reporting'],
  inputSchema: reportInsights.inputSchema,
  outputSchema: reportInsights.outputSchema,
  canHandle(input) {
    if (!input) return false;
    return /构建报告|build report|最近构建|构建结果/i.test(input);
  },
  async execute(input, context = {}) {
    return reportInsights.execute(`构建报告 ${input}`.trim(), context);
  }
};
