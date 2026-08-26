const fs = require('fs-extra');
const path = require('path');
const { writePrivateJson } = require('./secure-files');
const { getFlowMindHome } = require('./runtime-home');

function getFlowMindHomeDir() {
  return getFlowMindHome();
}

class TaskStore {
  constructor(options = {}) {
    this.filePath = options.filePath || path.join(getFlowMindHomeDir(), '.flowmind', 'tasks.json');
    this.maxTasks = options.maxTasks || 100;
  }

  async load() {
    if (!(await fs.pathExists(this.filePath))) {
      return [];
    }
    try {
      const data = await fs.readJson(this.filePath);
      return Array.isArray(data.tasks) ? data.tasks : [];
    } catch {
      return [];
    }
  }

  async save(tasks) {
    const serializable = Array.from(tasks || [])
      .map((task) => {
        const { timer: _timer, timeoutTimer: _timeoutTimer, ...rest } = task;
        return rest;
      })
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
      .slice(0, this.maxTasks);

    await writePrivateJson(this.filePath, {
      updatedAt: new Date().toISOString(),
      tasks: serializable
    });
  }
}

module.exports = {
  TaskStore
};
