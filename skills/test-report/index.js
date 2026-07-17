const reportInsights = require('../report-insights');

module.exports = {
  capabilities: ['reporting'],
  inputSchema: reportInsights.inputSchema,
  outputSchema: reportInsights.outputSchema,
  canHandle(input) {
    if (!input) return false;
    return /测试报告|test report|单测报告|unit report/i.test(input);
  },
  async execute(input, context = {}) {
    return reportInsights.execute(`测试报告 ${input}`.trim(), context);
  }
};
