const fs = require('fs-extra');
const path = require('path');
const { writePrivateJson } = require('./secure-files');
const { getFlowMindHome } = require('./runtime-home');

function getFlowMindHomeDir() {
  return getFlowMindHome();
}

function redactWorkflowSecrets(value) {
  if (Array.isArray(value)) return value.map(redactWorkflowSecrets);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'approvalToken')
      .map(([key, item]) => [key, redactWorkflowSecrets(item)])
  );
}

class WorkflowHistoryStore {
  constructor(options = {}) {
    this.filePath = options.filePath || path.join(getFlowMindHomeDir(), '.flowmind', 'workflows.json');
    this.maxRecords = options.maxRecords || 100;
  }

  async load() {
    if (!(await fs.pathExists(this.filePath))) {
      return [];
    }

    try {
      const data = await fs.readJson(this.filePath);
      return Array.isArray(data.workflows) ? data.workflows : [];
    } catch {
      return [];
    }
  }

  async save(records) {
    const serializable = Array.from(records || [])
      .map((record) => {
        const { timer: _timer, timeoutTimer: _timeoutTimer, ...rest } = record;
        return rest;
      })
      .sort((left, right) =>
        String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || ''))
      )
      .slice(0, this.maxRecords);

    await writePrivateJson(
      this.filePath,
      {
        updatedAt: new Date().toISOString(),
        workflows: serializable
      }
    );
  }

  async list(options = 20) {
    const normalized = typeof options === 'object' && options !== null ? options : { limit: options };
    const limit = Number(normalized.limit || 20);
    const status = normalized.status ? String(normalized.status) : null;
    const resumable = normalized.resumable === true;
    const records = await this.load();
    return records
      .filter((record) => !status || record.status === status)
      .filter((record) => !resumable || record.resumable === true)
      .slice(0, Math.max(1, limit))
      .map(redactWorkflowSecrets);
  }

  async get(executionId) {
    if (!executionId) return null;
    const records = await this.load();
    return records.find((record) => record.executionId === executionId || record.id === executionId) || null;
  }

  async append(record) {
    const records = await this.load();
    const existingIndex = records.findIndex((item) => item.executionId === record.executionId);
    const nextRecord = {
      ...record,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      records[existingIndex] = { ...records[existingIndex], ...nextRecord };
    } else {
      records.unshift(nextRecord);
    }

    await this.save(records);
    return nextRecord;
  }

  async update(executionId, patch = {}) {
    const records = await this.load();
    const index = records.findIndex((record) => record.executionId === executionId);
    if (index < 0) {
      return null;
    }

    records[index] = {
      ...records[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };
    await this.save(records);
    return records[index];
  }
}

module.exports = {
  WorkflowHistoryStore,
  redactWorkflowSecrets
};
