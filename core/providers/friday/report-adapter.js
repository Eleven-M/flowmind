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
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('listBuilds'),
      params: params || {}
    };
  }

  async getBuildInfo(buildId) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('getBuildInfo'),
      params: { id: buildId }
    };
  }

  async listJacocoReports(params) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('listJacoco'),
      params: params || {}
    };
  }

  async listUnitReports(params) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('listJacocoUnit'),
      params: params || {}
    };
  }

  async getJobDetails(jobName) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('getJobDetails'),
      params: { jobName }
    };
  }
}

module.exports = FridayReportAdapter;
