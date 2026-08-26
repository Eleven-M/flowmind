const os = require('os');

/**
 * Resolve the parent directory shared by FlowMind entry points.
 * FLOWMIND_HOME remains the explicit compatibility override; the shared
 * variable lets multiple AI clients agree on one store without changing
 * their own process HOME.
 */
function getFlowMindHome() {
  return process.env.FLOWMIND_HOME
    || process.env.FLOWMIND_SHARED_HOME
    || process.env.HOME
    || process.env.USERPROFILE
    || os.homedir();
}

module.exports = {
  getFlowMindHome
};
