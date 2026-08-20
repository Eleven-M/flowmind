const fs = require('fs-extra');
const path = require('path');

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIR_MODE = 0o700;

async function ensurePrivateDir(dirPath) {
  await fs.ensureDir(dirPath);
  try {
    await fs.chmod(dirPath, PRIVATE_DIR_MODE);
  } catch {
    // Best effort on filesystems that do not support POSIX modes.
  }
}

async function writePrivateJson(filePath, data, options = {}) {
  await ensurePrivateDir(path.dirname(filePath));
  await fs.writeJson(filePath, data, { spaces: 2, ...options });
  try {
    await fs.chmod(filePath, PRIVATE_FILE_MODE);
  } catch {
    // Best effort on filesystems that do not support POSIX modes.
  }
  return filePath;
}

module.exports = {
  PRIVATE_FILE_MODE,
  PRIVATE_DIR_MODE,
  ensurePrivateDir,
  writePrivateJson
};
