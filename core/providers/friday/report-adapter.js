/**
 * Friday Report Adapter
 * Wraps the friday-auto-report MCP server for Jenkins builds and test reports
 */

const ReportAdapter = require('../../adapters/report-adapter');

class FridayReportAdapter extends ReportAdapter {
  constructor(config = {}) {
    super('friday-report', config);

    // Register MCP tool mappings
    this.registerTool('listBuilds', 'listJenkinsBuilds');
    this.registerTool('getBuildInfo', 'getJenkinsBuild');
    this.registerTool('getBuildText', 'getJenkinsBuildText');
    this.registerTool('replayBuild', 'replayJenkinsBuild');
    this.registerTool('stopBuild', 'stopJenkinsBuild');
    this.registerTool('listJobs', 'listJenkinsJobs');
    this.registerTool('getJobDetails', 'getJenkinsJobDetails');
    this.registerTool('getJobNames', 'getJenkinsJobNames');
    this.registerTool('getViews', 'getJenkinsView');
    this.registerTool('buildCounts', 'getJenkinsBuildCounts');
    this.registerTool('getLastJobBuild', 'getLastJobBuild');
    this.registerTool('buildJenkinsJob', 'buildJenkinsJob');

    // Jacoco coverage tools
    this.registerTool('listJacoco', 'listJacoco');
    this.registerTool('listJacocoUnit', 'listJacocoUnit');
    this.registerTool('createJacocoReport', 'creatJacocoReport');
    this.registerTool('createUnitReport', 'creatUnitReport');

    // Git tools
    this.registerTool('getBranches', 'getBranches');
    this.registerTool('getCommits', 'getCommits');
    this.registerTool('getSingleCommits', 'getSingleCommits');
  }

  get mcpServer() {
    return 'friday-auto-report';
  }

  async listBuilds(params) {
    return this.callMcpTool('listBuilds', params || {});
  }

  async getBuildInfo(buildId) {
    return this.callMcpTool('getBuildInfo', { id: buildId });
  }

  async listJacocoReports(params) {
    return this.callMcpTool('listJacoco', params || {});
  }

  async listUnitReports(params) {
    return this.callMcpTool('listJacocoUnit', params || {});
  }

  async getJobDetails(jobName) {
    return this.callMcpTool('getJobDetails', { jobName });
  }
}

module.exports = FridayReportAdapter;
