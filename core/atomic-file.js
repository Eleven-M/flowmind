const fs = require('fs-extra');
const path = require('path');
const { randomUUID } = require('crypto');

/** Write JSON beside the target and publish it with an atomic rename. */
async function writeJsonAtomic(filePath, value, options = {}) {
  const target = path.resolve(filePath);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await fs.ensureDir(path.dirname(target));
  try {
    await fs.writeJson(temporary, value, { spaces: 2, ...options });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.remove(temporary).catch(() => {});
    throw error;
  }
}

module.exports = { writeJsonAtomic };
