const http = require('http');
const crypto = require('crypto');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 47631;
const DEFAULT_TIMEOUT_MS = 120000;

class BrowserAutomationBridge {
  constructor(options = {}) {
    this.host = options.host || DEFAULT_HOST;
    this.port = Number(options.port ?? DEFAULT_PORT);
    this.token = options.token || process.env.FLOWMIND_BROWSER_BRIDGE_TOKEN || createToken();
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    this.tasks = new Map();
    this.queue = [];
    this.waitingPolls = [];
    this.server = null;
    this.lastExtensionPollAt = null;
    this.lastTaskDeliveredAt = null;
    this.lastTaskResultAt = null;
    this.deliveredCount = 0;
    this.completedCount = 0;
  }

  async start() {
    if (this.server) return this;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        writeJson(res, 500, { ok: false, error: error.message });
      });
    });

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        this.port = this.server.address().port;
        resolve();
      });
    });

    return this;
  }

  async stop() {
    for (const poll of this.waitingPolls.splice(0)) {
      writeJson(poll.res, 200, { ok: true, task: null });
    }
    for (const task of this.tasks.values()) {
      task.reject(new Error('Browser automation bridge stopped'));
    }
    this.tasks.clear();
    this.queue = [];

    if (!this.server) return;
    await new Promise((resolve) => this.server.close(resolve));
    this.server = null;
  }

  async handleRequest(req, res) {
    if (!isLoopback(req.socket.remoteAddress)) {
      writeJson(res, 403, { ok: false, error: 'Only loopback clients are allowed' });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || `${this.host}:${this.port}`}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      writeJson(res, 200, {
        ok: true,
        service: 'flowmind-browser-automation-bridge',
        queue: this.queue.length,
        pending: this.tasks.size,
        waitingPolls: this.waitingPolls.length,
        lastExtensionPollAt: this.lastExtensionPollAt,
        lastTaskDeliveredAt: this.lastTaskDeliveredAt,
        lastTaskResultAt: this.lastTaskResultAt,
        deliveredCount: this.deliveredCount,
        completedCount: this.completedCount
      });
      return;
    }

    if (!this.checkToken(req, url)) {
      writeJson(res, 401, { ok: false, error: 'Invalid browser bridge token' });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/query/service-management-logs') {
      const body = await readJson(req);
      const result = await this.enqueueTask('service-management-logs', body);
      writeJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/bind/service-management-log') {
      const body = await readJson(req);
      const result = await this.enqueueTask('service-management-log-bind', body);
      writeJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/extension/next') {
      this.handleNextTask(res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/extension/result') {
      const body = await readJson(req);
      this.resolveTask(body);
      writeJson(res, 200, { ok: true });
      return;
    }

    writeJson(res, 404, { ok: false, error: 'Unknown browser bridge endpoint' });
  }

  checkToken(req, url) {
    const token = req.headers['x-flowmind-token'] || url.searchParams.get('token');
    return token && safeEqual(String(token), String(this.token));
  }

  enqueueTask(kind, payload = {}) {
    const id = `browser-task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const task = {
      id,
      kind,
      payload,
      createdAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.tasks.delete(id);
        reject(new Error(`Browser task timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.tasks.set(id, { resolve, reject, timeout });
      this.queue.push(task);
      this.flushPolls();
    });
  }

  handleNextTask(res) {
    this.lastExtensionPollAt = new Date().toISOString();
    const task = this.queue.shift();
    if (task) {
      this.lastTaskDeliveredAt = new Date().toISOString();
      this.deliveredCount += 1;
      writeJson(res, 200, { ok: true, task });
      return;
    }

    const timer = setTimeout(() => {
      const index = this.waitingPolls.findIndex((entry) => entry.res === res);
      if (index >= 0) this.waitingPolls.splice(index, 1);
      writeJson(res, 200, { ok: true, task: null });
    }, 25000);
    this.waitingPolls.push({ res, timer });
  }

  flushPolls() {
    while (this.queue.length > 0 && this.waitingPolls.length > 0) {
      const poll = this.waitingPolls.shift();
      clearTimeout(poll.timer);
      this.lastTaskDeliveredAt = new Date().toISOString();
      this.deliveredCount += 1;
      writeJson(poll.res, 200, { ok: true, task: this.queue.shift() });
    }
  }

  resolveTask(result = {}) {
    const task = this.tasks.get(result.id);
    if (!task) return;

    clearTimeout(task.timeout);
    this.tasks.delete(result.id);
    this.lastTaskResultAt = new Date().toISOString();
    this.completedCount += 1;

    if (result.ok === false) {
      task.reject(new Error(result.error || 'Browser task failed'));
      return;
    }

    task.resolve(result.result || {});
  }
}

class BrowserBridgeClient {
  constructor(options = {}) {
    this.url = (options.url || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`).replace(/\/$/, '');
    this.token = options.token || process.env.FLOWMIND_BROWSER_BRIDGE_TOKEN || null;
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  }

  async queryServiceManagementLogs(payload) {
    return this.post('/query/service-management-logs', payload);
  }

  async bindServiceManagementLog(payload) {
    return this.post('/bind/service-management-log', payload);
  }

  async post(path, payload) {
    if (!this.token) {
      throw new Error('Browser bridge token is not configured');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.url}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FlowMind-Token': this.token
        },
        body: JSON.stringify(payload || {}),
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok === false) {
        throw new Error(body.error || `Browser bridge request failed: HTTP ${response.status}`);
      }
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`Browser bridge request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

function isLoopback(address = '') {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy(new Error('Request body is too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON request body'));
      }
    });
    req.on('error', reject);
  });
}

function writeJson(res, status, body) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(body));
}

module.exports = {
  BrowserAutomationBridge,
  BrowserBridgeClient,
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_TIMEOUT_MS
};
