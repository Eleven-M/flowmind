/**
 * Shared utility functions
 */

const path = require('path');
const os = require('os');

/**
 * Expand ~ in file paths to home directory
 */
function expandPath(filePath) {
  if (filePath.startsWith('~')) {
    return path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), filePath.slice(1));
  }
  return filePath;
}

module.exports = { expandPath };
