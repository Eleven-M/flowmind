const reportInsights = require('../report-insights');

module.exports = {
  capabilities: ['reporting'],
  inputSchema: reportInsights.inputSchema,
  outputSchema: reportInsights.outputSchema,
  canHandle(input) {
    if (!input) return false;
    return /覆盖率报告|coverage report|jacoco|覆盖率/i.test(input);
  },
  async execute(input, context = {}) {
    return reportInsights.execute(`覆盖率报告 ${input}`.trim(), context);
  }
};
