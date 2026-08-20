const {
  BrowserAutomationBridge,
  BrowserBridgeClient
} = require('../core/browser-automation-bridge');

describe('browser automation bridge', () => {
  test('queues a service management log task and resolves extension result', async () => {
    const bridge = new BrowserAutomationBridge({
      port: 0,
      token: 'test-token',
      timeoutMs: 5000
    });
    await bridge.start();

    try {
      const client = new BrowserBridgeClient({
        url: `http://127.0.0.1:${bridge.port}`,
        token: 'test-token',
        timeoutMs: 5000
      });

      const pending = client.queryServiceManagementLogs({
        target: { key: 'merchantBackendLog', url: 'https://service.example.com/logs' },
        params: { storeId: '23387', operationContent: 'POI显示' },
        plan: { mode: 'api' }
      });

      const taskResponse = await fetch(`http://127.0.0.1:${bridge.port}/extension/next?token=test-token`);
      const taskBody = await taskResponse.json();
      expect(taskBody.task).toEqual(expect.objectContaining({
        kind: 'service-management-logs',
        payload: expect.objectContaining({
          params: expect.objectContaining({ storeId: '23387' })
        })
      }));

      await fetch(`http://127.0.0.1:${bridge.port}/extension/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FlowMind-Token': 'test-token'
        },
        body: JSON.stringify({
          id: taskBody.task.id,
          ok: true,
          result: {
            records: [{
              resourceName: 'POI管理',
              operationContent: '设置POI显示',
              operationDate: '2026-08-14 15:20:00'
            }]
          }
        })
      });

      await expect(pending).resolves.toEqual(expect.objectContaining({
        records: [expect.objectContaining({ resourceName: 'POI管理' })]
      }));
    } finally {
      await bridge.stop();
    }
  });

  test('rejects requests with invalid token', async () => {
    const bridge = new BrowserAutomationBridge({
      port: 0,
      token: 'test-token',
      timeoutMs: 5000
    });
    await bridge.start();

    try {
      const response = await fetch(`http://127.0.0.1:${bridge.port}/extension/next?token=bad-token`);
      expect(response.status).toBe(401);
    } finally {
      await bridge.stop();
    }
  });

  test('health reports extension polling and task counter fields', async () => {
    const bridge = new BrowserAutomationBridge({
      port: 0,
      token: 'test-token',
      timeoutMs: 5000
    });
    await bridge.start();

    try {
      const initial = await fetch(`http://127.0.0.1:${bridge.port}/health`);
      await expect(initial.json()).resolves.toEqual(expect.objectContaining({
        ok: true,
        queue: 0,
        pending: 0,
        deliveredCount: 0,
        completedCount: 0,
        lastExtensionPollAt: null
      }));

      bridge.lastExtensionPollAt = '2026-08-14T10:00:00.000Z';
      const afterPoll = await fetch(`http://127.0.0.1:${bridge.port}/health`);
      await expect(afterPoll.json()).resolves.toEqual(expect.objectContaining({
        lastExtensionPollAt: '2026-08-14T10:00:00.000Z',
        waitingPolls: 0,
        deliveredCount: 0,
        completedCount: 0
      }));
    } finally {
      await bridge.stop();
    }
  });

  test('queues a service management log binding task and resolves captured config', async () => {
    const bridge = new BrowserAutomationBridge({
      port: 0,
      token: 'test-token',
      timeoutMs: 5000
    });
    await bridge.start();

    try {
      const client = new BrowserBridgeClient({
        url: `http://127.0.0.1:${bridge.port}`,
        token: 'test-token',
        timeoutMs: 5000
      });

      const pending = client.bindServiceManagementLog({
        target: { key: 'merchantBackendLog', url: 'https://service.example.com/logs' },
        targetKey: 'merchantBackendLog'
      });

      const taskResponse = await fetch(`http://127.0.0.1:${bridge.port}/extension/next?token=test-token`);
      const taskBody = await taskResponse.json();
      expect(taskBody.task).toEqual(expect.objectContaining({
        kind: 'service-management-log-bind',
        payload: expect.objectContaining({
          targetKey: 'merchantBackendLog'
        })
      }));

      await fetch(`http://127.0.0.1:${bridge.port}/extension/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FlowMind-Token': 'test-token'
        },
        body: JSON.stringify({
          id: taskBody.task.id,
          ok: true,
          result: {
            api: {
              url: 'https://service.example.com/api/logs',
              method: 'GET',
              parameterMap: { storeId: 'store' },
              responsePath: { records: 'data.records' },
              fieldMap: { resourceName: 'name' }
            }
          }
        })
      });

      await expect(pending).resolves.toEqual(expect.objectContaining({
        api: expect.objectContaining({
          parameterMap: expect.objectContaining({ storeId: 'store' })
        })
      }));
    } finally {
      await bridge.stop();
    }
  });
});
