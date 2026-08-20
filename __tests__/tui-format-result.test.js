const { formatResultText, unwrapResultPayload } = require('../tui/format-result');
const { sanitizeTerminalText } = require('../tui/ui');

describe('tui result formatting', () => {
  test('unwraps nested result envelopes', () => {
    const payload = unwrapResultPayload({
      type: 'result',
      data: {
        type: 'result',
        message: 'inner'
      }
    });

    expect(payload).toEqual({
      type: 'result',
      message: 'inner'
    });
  });

  test('formats auto-flow configuration hints as readable lines', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'auto-flow',
        message: 'Workflow status: deployment submitted',
        data: {
          status: 'submitted',
          mcpServer: 'auto-flow'
        },
        input: '部署xxx-',
        timestamp: '2026-07-01T02:42:01.370Z'
      },
      metadata: {
        skill: 'auto-flow'
      }
    });

    expect(text).toContain('Workflow status: deployment submitted');
    expect(text).toContain('状态：submitted');
    expect(text).not.toContain('params:');
    expect(text).not.toContain('serviceNames:');
    expect(text).not.toContain('mcpServer:');
  });

  test('formats auto-flow list summaries with concise pipeline items', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'auto-flow',
        message: 'Workflow status: pipeline lookup completed',
        data: {
          action: 'list',
          status: 'completed',
          mcpServer: 'auto-flow',
          execution: {
            action: 'list',
            summary: 'Listed workflows for uat-retail-manager, 2 pipeline(s) found',
            total: 2,
            status: 'completed',
            target: 'uat-retail-manager',
            environment: 'uat',
            items: [
              {
                pipelineName: 'uat-retail-manager',
                pipelineId: '2436072',
                service: 'retail-manager',
                env: 'uat'
              }
            ]
          }
        },
        timestamp: '2026-07-01T02:42:01.370Z'
      },
      metadata: {
        skill: 'auto-flow'
      }
    });

    expect(text).toContain('Workflow status: pipeline lookup completed');
    expect(text).toContain('结果：Listed workflows for uat-retail-manager, 2 pipeline(s) found');
    expect(text).toContain('目标：uat-retail-manager');
    expect(text).toContain('环境：uat');
    expect(text).toContain('匹配结果');
    expect(text).toContain('1. uat-retail-manager (流水线：2436072 | 服务：retail-manager | 环境：uat)');
    expect(text).not.toContain('mcpServer:');
  });

  test('formats auto-flow deployment summaries with concise target details', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'auto-flow',
        message: 'Workflow status: deployment submitted',
        data: {
          action: 'deploy',
          status: 'submitted',
          mcpServer: 'auto-flow',
          execution: {
            action: 'deploy',
            summary: 'Deployment submitted for pipeline 2436072 via direct-input, run 270',
            status: 'submitted',
            target: 'pipeline 2436072',
            pipelineId: '2436072',
            runId: '270',
            details: {
              submitted: true,
              pipelineRunId: '270'
            }
          },
          resolution: {
            source: 'direct-input',
            pipelineId: '2436072'
          }
        },
        timestamp: '2026-07-01T02:42:01.370Z'
      },
      metadata: {
        skill: 'auto-flow'
      }
    });

    expect(text).toContain('Workflow status: deployment submitted');
    expect(text).toContain('结果：Deployment submitted for pipeline 2436072 via direct-input, run 270');
    expect(text).toContain('目标：pipeline 2436072');
    expect(text).toContain('流水线：2436072');
    expect(text).toContain('运行ID：270');
    expect(text).not.toContain('mcpServer:');
  });

  test('formats auto-flow built-in workflow summaries as concise steps', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'auto-flow',
        message: 'Workflow ready: Development Workflow',
        data: {
          workflow: 'dev-workflow',
          execution: {
            action: 'workflow',
            summary: 'Workflow ready: Development Workflow',
            workflow: 'dev-workflow',
            name: 'Development Workflow',
            stepCount: 4,
            steps: [{ id: 'review', skill: 'code-review', name: 'Code Review' }]
          }
        },
        timestamp: '2026-07-01T02:42:01.370Z'
      },
      metadata: {
        skill: 'auto-flow'
      }
    });

    expect(text).toContain('Workflow ready: Development Workflow');
    expect(text).toContain('结果：Workflow ready: Development Workflow');
    expect(text).toContain('流程：dev-workflow');
    expect(text).toContain('步骤数：4');
    expect(text).toContain('流程步骤');
    expect(text).toContain('1. Code Review (动作：code-review | ID：review)');
  });

  test('formats auto-flow no-config hints with concise execution summary', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'auto-flow',
        message: 'Workflow service not configured. Connect auto-flow first.',
        data: {
          status: 'not_configured',
          hint: 'Run `flowmind resource` to review current bindings, then save one like: `flowmind "绑定发布业务 mcp=auto-flow token=xxx env=uat"`',
          execution: {
            action: 'hint',
            summary: 'Workflow service not configured',
            provider: null,
            binding: null,
            configured: false
          }
        },
        timestamp: '2026-07-01T02:42:01.370Z'
      },
      metadata: {
        skill: 'auto-flow'
      }
    });

    expect(text).toContain('Workflow service not configured. Connect auto-flow first.');
    expect(text).toContain('结果：Workflow service not configured');
    expect(text).toContain('状态：not_configured');
    expect(text).toContain('建议：Run `flowmind resource` to review current bindings');
    expect(text).not.toContain('configured: false');
    expect(text).not.toContain('steps:');
  });

  test('formats log-audit results with query conditions, execution summary, and raw response details', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'log-audit',
        message: '未找到符合關鍵字：商家基本盤檢測整改校驗任務失敗的日誌。請嘗試服務或放寬關鍵字。',
        data: {
          action: 'query',
          provider: 'aliyun-sls',
          noRecords: true,
          queryParams: {
            query: '"商家基本盤檢測整改校驗任務失敗"',
            env: 'uat'
          },
          execution: {
            status: 'ok',
            total: 0,
            records: [],
            requestId: null,
            empty: true,
            rawSummary: {
              topLevelKeys: ['status', 'total', 'logs'],
              hasContent: true,
              contentPreview: '{"status":"ok","total":0}'
            }
          }
        }
      }
    });

    expect(text).toContain('未找到符合關鍵字：商家基本盤檢測整改校驗任務失敗的日誌。');
    expect(text).toContain('請嘗試服務或放寬關鍵字。');
    expect(text).toContain('结果：未命中日志');
    expect(text).toContain('检查范围');
    expect(text).toContain('query: "商家基本盤檢測整改校驗任務失敗"');
    expect(text).toContain('返回：0 条日志');
    expect(text).toContain('状态：ok');
    expect(text).not.toContain('原始返回');
    expect(text).not.toContain('topLevelKeys: status, total, logs');
    expect(text).not.toContain('contentPreview: {"status":"ok","total":0}');
  });

  test('formats log-audit records as per-service request params response blocks', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'log-audit',
        message: '已執行 trace 查詢：6727e6af908337f2',
        data: {
          action: 'trace',
          provider: 'aliyun-sls',
          resolution: {
            env: 'uat'
          },
          execution: {
            status: 'ok',
            total: 2,
            records: [
              {
                time: '2026-07-03 16:33:48.696',
                service: 'user-service',
                api: '/api/users/1',
                result: 'GET /api/users/1 status=500 duration=532ms requestId=req-new user fail',
                fields: {
                  parameters: 'userId=1',
                  requestMethod: 'GET',
                  requestUrl: '/api/users/1',
                  entryType: 'response',
                  responseSummary: 'user fail',
                  durationMs: 532
                },
                readable: {
                  summary: 'user-service | /api/users/1 | 服务端错误(500) | 532ms',
                  items: [
                    { label: '时间', value: '2026-07-03 16:33:48.696' },
                    { label: '服务', value: 'user-service' },
                    { label: '接口', value: 'GET /api/users/1' },
                    { label: '入口URL', value: 'GET /api/users/1' },
                    { label: '参数', value: 'userId=1' },
                    { label: '响应', value: 'user fail' },
                    { label: '耗时', value: '532ms' }
                  ]
                }
              }
            ]
          }
        }
      }
    });

    expect(text).toContain('最终返回');
    expect(text).toContain('服务: user-service');
    expect(text).not.toContain('关键链路');
    expect(text).toContain('时间: 2026-07-03 16:33:48.696');
    expect(text).toContain('参数');
    expect(text).toContain('响应');
    expect(text).toContain('/api/users/1');
    expect(text).toContain('userId=1');
    expect(text).toContain('user fail');
    expect(text).toContain('532ms');
    expect(text).toContain('原因: statusCode=500');
  });

  test('keeps log-audit response text intact for longer payloads', () => {
    const responseText = `Outgoing Response: ${'x'.repeat(180)} HTTP/1.1 200 OK`;
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'log-audit',
        message: '已執行 trace 查詢：036b299bf54abb8b',
        data: {
          action: 'trace',
          execution: {
            status: 'ok',
            total: 1,
            records: [
              {
                time: '2026-07-02 14:42:11.043',
                service: 'demo-base-info',
                result: responseText,
                fields: {
                  requestMethod: 'GET',
                  requestUrl: '/api/base-info',
                  entryType: 'response',
                  responseSummary: responseText,
                  durationMs: 3,
                  statusCode: 200
                }
              }
            ]
          }
        }
      }
    });

    expect(text).toContain(responseText);
    expect(text).not.toContain(
      'Outgoing Response: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx…'
    );
  });

  test('summarizes structured log errors instead of printing raw json blobs', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'log-audit',
        message: '已執行 trace 查詢：036b299bf54abb8b',
        data: {
          action: 'trace',
          execution: {
            status: 'ok',
            total: 1,
            records: [
              {
                time: '2026-07-02 14:42:11.043',
                service: 'demo-store-activity-merchant',
                result:
                  '{"resultCode":"500","code":9001,"note":"服务器异常","origin":"demo-store-activity-merchant","errorStacks":["[demo-store-activity-merchant]: java.sql.SQLSyntaxErrorException: You have an error in your SQL syntax; check the manual for the right syntax to use near \')\\n        ORDER BY\\n        status_value,\\n        start_time,\\n        id) tmp_cou\' at line 48"]}',
                fields: {
                  requestMethod: 'POST',
                  requestUrl: '/api/store/activity',
                  entryType: 'error',
                  error:
                    '{"resultCode":"500","code":9001,"note":"服务器异常","origin":"demo-store-activity-merchant","errorStacks":["[demo-store-activity-merchant]: java.sql.SQLSyntaxErrorException: You have an error in your SQL syntax; check the manual for the right syntax to use near \')\\n        ORDER BY\\n        status_value,\\n        start_time,\\n        id) tmp_cou\' at line 48"]}',
                  durationMs: 9,
                  statusCode: 500
                }
              }
            ]
          }
        }
      }
    });

    expect(text).toContain('服务器异常');
    expect(text).toContain('java.sql.SQLSyntaxErrorException');
    expect(text).not.toContain('"errorStacks"');
    expect(text).not.toContain('"resultCode"');
  });

  test('prefers structured error origin as the displayed service name', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'log-audit',
        message: '已執行 trace 查詢：036b299bf54abb8b',
        data: {
          action: 'trace',
          execution: {
            status: 'ok',
            total: 1,
            records: [
              {
                time: '2026-07-02 14:42:11.040',
                service: 'demo-base-info',
                result: 'HTTP 500',
                fields: {
                  requestMethod: 'GET',
                  requestUrl:
                    'http://demo-base-info/feign/store/store-info/getTakeoutStoreList4ComboBox?bid=00469087324',
                  entryType: 'error',
                  error:
                    '{"resultCode":"500","code":9001,"note":"服务器异常","origin":"demo-store-activity-merchant","errorStacks":["[demo-store-activity-merchant]: java.sql.SQLSyntaxErrorException: You have an error in your SQL syntax"]}',
                  durationMs: 9,
                  statusCode: 500
                }
              }
            ]
          }
        }
      }
    });

    expect(text).toContain('最终返回');
    expect(text).toContain('服务: demo-store-activity-merchant');
    expect(text).toContain('状态: 500');
    expect(text).not.toContain('1. demo-base-info [异常]');
  });

  test('summarizes log-audit records by default with final response only', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'log-audit',
        message: '已執行 trace 查詢：036b299bf54abb8b',
        data: {
          action: 'trace',
          execution: {
            status: 'ok',
            total: 3,
            records: [
              {
                time: '2026-07-02 13:42:11.043',
                service: 'demo-base-info',
                result: 'HTTP 200 OK',
                fields: {
                  requestMethod: 'GET',
                  requestUrl: '/api/base-info',
                  entryType: 'response',
                  responseSummary: 'OK',
                  durationMs: 3,
                  statusCode: 200
                }
              },
              {
                time: '2026-07-02 14:42:11.043',
                service: 'demo-store-activity-merchant',
                result: 'SQL syntax error',
                fields: {
                  requestMethod: 'POST',
                  requestUrl: '/api/store/activity',
                  entryType: 'error',
                  error: 'SQL syntax error',
                  durationMs: 9,
                  statusCode: 500
                }
              },
              {
                time: '2026-07-02 15:42:11.043',
                service: 'demo-order-service',
                result: 'HTTP 200 OK',
                fields: {
                  requestMethod: 'GET',
                  requestUrl: '/api/orders',
                  entryType: 'response',
                  responseSummary: 'OK',
                  durationMs: 6,
                  statusCode: 200
                }
              }
            ]
          }
        }
      }
    });

    expect(text).toContain('最终返回');
    expect(text).toContain('链路：demo-base-info, demo-store-activity-merchant, demo-order-service');
    expect(text).toContain('日志：3 条');
    expect(text).toContain('服务: demo-order-service');
    expect(text).toContain('请求: GET /api/orders');
    expect(text).toContain('响应: OK');
    expect(text).toContain('更多：默认只显示最终返回');
    expect(text).not.toContain('1. demo-base-info');
    expect(text).toContain('异常摘要');
    expect(text).toContain('1. demo-store-activity-merchant: SQL syntax error');
  });

  test('shows top anomaly lines before final log-audit response by default', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'log-audit',
        message: '已执行 trace 查询：1a3ff66f4f063de4',
        data: {
          action: 'trace',
          execution: {
            status: 'ok',
            total: 2,
            records: [
              {
                time: '2026-07-13 09:42:42.659',
                service: 'demo-base-geo-position-api',
                result: '向百度地图请求路线时超出了限制的最大直线距离，使用评估速度计算出结果',
                fields: {
                  entryType: 'response',
                  responseSummary: '向百度地图请求路线时超出了限制的最大直线距离，使用评估速度计算出结果',
                  statusCode: 200
                }
              },
              {
                time: '2026-07-13 09:42:42.777',
                service: 'demo-store-activity-merchant',
                result:
                  '{"resultCode":"500","note":"服务器异常","errorStacks":["java.sql.SQLSyntaxErrorException: bad sql\\n at Mapper.select(Mapper.java:48)\\n at Service.run(Service.java:20)\\n at Controller.handle(Controller.java:9)"]}',
                fields: {
                  entryType: 'error',
                  error:
                    '{"resultCode":"500","note":"服务器异常","errorStacks":["java.sql.SQLSyntaxErrorException: bad sql\\n at Mapper.select(Mapper.java:48)\\n at Service.run(Service.java:20)\\n at Controller.handle(Controller.java:9)"]}',
                  statusCode: 500
                }
              }
            ]
          }
        }
      }
    });

    expect(text).toContain('异常摘要');
    expect(text).toContain('demo-store-activity-merchant: 服务器异常');
    expect(text).toContain('java.sql.SQLSyntaxErrorException: bad sql');
    expect(text).toContain('at Mapper.select(Mapper.java:48)');
    expect(text).toContain('最终返回');
  });

  test('does not treat structured success payloads with failed=0 as anomalies', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'log-audit',
        message: '已执行 trace 查询：trace-ok',
        data: {
          action: 'trace',
          execution: {
            status: 'ok',
            total: 2,
            records: [
              {
                time: '2026-07-13 09:42:42.700',
                service: 'demo-base-content-search',
                result: '{"took":2,"timed_out":false,"_shards":{"total":1,"successful":1,"failed":0},"hits":{"total":1}}',
                fields: {
                  entryType: 'response',
                  responseSummary: '{"took":2,"timed_out":false,"_shards":{"total":1,"successful":1,"failed":0},"hits":{"total":1}}',
                  statusCode: 200
                }
              },
              {
                time: '2026-07-13 09:42:42.701',
                service: 'demo-order-service',
                result: '{"code":0,"message":"ok"}',
                fields: {
                  entryType: 'response',
                  responseSummary: '{"code":0,"message":"ok"}',
                  statusCode: 200
                }
              }
            ]
          }
        }
      }
    });

    expect(text).not.toContain('异常摘要');
    expect(text).toContain('最终返回');
  });

  test('shows concise business anomaly reason instead of repeating full response body', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'log-audit',
        message: '已执行 trace 查询：trace-delivery',
        data: {
          action: 'trace',
          execution: {
            status: 'ok',
            total: 1,
            records: [
              {
                time: '2026-07-13 09:42:42.866',
                service: 'demo-takeout-restful-api',
                result: '{"deliveryStatus":"OUTSIDE_VALID_AREA_SCOPE","storeId":"21527"}',
                fields: {
                  entryType: 'response',
                  responseSummary: '{"deliveryStatus":"OUTSIDE_VALID_AREA_SCOPE","storeId":"21527"}',
                  statusCode: 200,
                  durationMs: 352
                }
              }
            ]
          }
        }
      }
    });

    expect(text).toContain('原因: deliveryStatus=OUTSIDE_VALID_AREA_SCOPE');
    expect(text).not.toContain('原因: {"deliveryStatus":"OUTSIDE_VALID_AREA_SCOPE","storeId":"21527"}');
  });

  test('renders all log-audit records when full detail is requested', () => {
    const text = formatResultText(
      {
        type: 'result',
        success: true,
        data: {
          type: 'result',
          skill: 'log-audit',
          message: '已執行 trace 查詢：036b299bf54abb8b',
          data: {
            action: 'trace',
            execution: {
              status: 'ok',
              total: 2,
              records: [
                {
                  time: '2026-07-02 14:42:11.043',
                  service: 'demo-base-info',
                  result: 'HTTP 200 OK',
                  fields: {
                    requestMethod: 'GET',
                    requestUrl: '/api/base-info',
                    entryType: 'response',
                    responseSummary: 'OK',
                    durationMs: 3,
                    statusCode: 200
                  }
                },
                {
                  time: '2026-07-02 15:42:11.043',
                  service: 'demo-order-service',
                  result: 'HTTP 500 fail',
                  fields: {
                    requestMethod: 'POST',
                    requestUrl: '/api/orders',
                    entryType: 'error',
                    error: 'timeout',
                    durationMs: 6,
                    statusCode: 500
                  }
                }
              ]
            }
          }
        }
      },
      { logAuditDetailLevel: 'full' }
    );

    expect(text).toContain('1. demo-base-info');
    expect(text).toContain('2. demo-order-service [异常]');
    expect(text).not.toContain('更多：默认只显示异常和最后一条服务记录');
  });

  test('shows final response by default and ordered service details in full log-audit view', () => {
    const result = {
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'log-audit',
        message: '已执行 trace 查询：2893b6ae660ec037',
        data: {
          action: 'trace',
          queryParams: {
            env: 'uat',
            query: '* and "2893b6ae660ec037"'
          },
          execution: {
            status: 'ok',
            total: 4,
            records: [
              {
                time: '2026-07-10 16:25:35.980',
                service: 'demo-retail-api',
                result: 'Outgoing Response: {"code":0,"data":{"total":1}}',
                fields: {
                  entryType: 'response',
                  responseSummary: 'Outgoing Response: {"code":0,"data":{"total":1}}',
                  durationMs: 4,
                  statusCode: 200
                }
              },
              {
                time: '2026-07-10 16:25:35.976',
                service: 'demo-takeout-manager',
                result: 'Request POST /takeout/order',
                fields: {
                  requestMethod: 'POST',
                  requestUrl: '/takeout/order',
                  parameters: 'shopId=100'
                }
              },
              {
                time: '2026-07-10 16:25:35.983',
                service: 'demo-takeout-manager',
                result: '{"result":"ok","orderId":1}',
                fields: {
                  entryType: 'response',
                  responseSummary: '{"result":"ok","orderId":1}',
                  statusCode: 200
                }
              },
              {
                time: '2026-07-10 16:25:35.979',
                service: 'demo-retail-api',
                result: 'Total: 1',
                fields: {
                  entryType: 'response',
                  responseSummary: 'Total: 1'
                }
              }
            ]
          }
        }
      }
    };

    const normal = formatResultText(result);
    expect(normal).toContain('最终返回');
    expect(normal).toContain('服务: demo-takeout-manager');
    expect(normal).toContain('响应: {"result":"ok","orderId":1}');
    expect(normal).not.toContain('\n服务明细\n');

    const full = formatResultText(result, { logAuditDetailLevel: 'full' });
    expect(full).toContain('服务返回');
    expect(full).toContain('服务明细');
    expect(full).toContain('1. demo-retail-api');
    expect(full).toContain('响应: Total: 1');
    expect(full).toContain('3. demo-takeout-manager');
    expect(full).toContain('响应: {"result":"ok","orderId":1}');
    expect(full.indexOf('服务明细')).toBeGreaterThan(full.indexOf('服务返回'));
    expect(full).toContain('参数: shopId=100');
    expect(full).toContain('响应: {"result":"ok","orderId":1}');
  });

  test('full log-audit view shows parsed service returns before raw service details', () => {
    const text = formatResultText(
      {
        type: 'result',
        success: true,
        data: {
          type: 'result',
          skill: 'log-audit',
          message: '已执行 trace 查询：0d02c7dcffa04217',
          data: {
            action: 'trace',
            execution: {
              status: 'ok',
              total: 3,
              records: [
                {
                  time: '2026-07-13 09:41:24.744',
                  service: 'demo-takeout-restful-api',
                  result: 'Sending a request via tracing feign client',
                  fields: {
                    requestMethod: 'GET',
                    requestUrl: '/config/get',
                    parameters: 'storeId=20627'
                  }
                },
                {
                  time: '2026-07-13 09:41:24.749',
                  service: 'demo-takeout-restful-api',
                  result: '[BaseCommonConfigFeign#getConfig] {"storeIds":["20627"]}',
                  fields: {
                    responseSummary: '{"storeIds":["20627"]}'
                  }
                },
                {
                  time: '2026-07-13 09:41:24.749',
                  service: 'demo-takeout-restful-api',
                  result: '[BaseCommonConfigFeign#getConfig] <--- HTTP/1.1 200 OK (4ms)',
                  fields: {
                    statusCode: 200,
                    durationMs: 4
                  }
                }
              ]
            }
          }
        }
      },
      { logAuditDetailLevel: 'full' }
    );

    expect(text).toContain('服务返回');
    expect(text).toContain('请求: GET /config/get');
    expect(text).toContain('参数: storeId=20627');
    expect(text).toContain('响应: {"storeIds":["20627"]}');
    expect(text).toContain('服务明细');
  });

  test('colorizes anomalous log-audit blocks when requested for cli output', () => {
    const text = formatResultText(
      {
        type: 'result',
        success: true,
        data: {
          type: 'result',
          skill: 'log-audit',
          message: '已執行 trace 查詢：036b299bf54abb8b',
          data: {
            action: 'trace',
            execution: {
              status: 'ok',
              total: 1,
              records: [
                {
                  time: '2026-07-03 16:33:48.696',
                  service: 'order-service',
                  api: 'POST /api/orders',
                  result: 'HTTP 500 timeout',
                  fields: {
                    parameters: 'orderId=123',
                    requestMethod: 'POST',
                    requestUrl: '/api/orders',
                    statusCode: 500,
                    responseSummary: 'timeout',
                    durationMs: 812
                  }
                }
              ]
            }
          }
        }
      },
      { colorize: true }
    );

    expect(text).toContain('服务: order-service');
    expect(text).toContain('原因: statusCode=500');
    expect(text).toContain('\u001b[31m');
  });

  test('formats log-audit binding hints when configuration is missing', () => {
    const text = formatResultText({
      type: 'result',
      success: false,
      data: {
        type: 'error',
        skill: 'log-audit',
        message: 'Log service not configured. Connect an SLS/ELK log service first.',
        data: {
          bindingHint: {
            missing: ['project', 'logstore'],
            message: '缺少project或logstore',
            suggestedCommand: 'flowmind "绑定日志 mcp=sls-logs env=test project=foo logstore=bar"'
          }
        }
      }
    });

    expect(text).toContain('需要先绑定配置');
    expect(text).toContain('缺少project或logstore');
    expect(text).toContain('执行：flowmind "绑定日志 mcp=sls-logs');
    expect(text).toContain('flowmind "绑定日志 mcp=sls-logs');
  });

  test('formats sls-log-audit results with the same log-audit summary view', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'sls-log-audit',
        message: '已执行 trace 查询：1a3ff66f4f063de4',
        data: {
          action: 'trace',
          execution: {
            status: 'ok',
            total: 1,
            records: [
              {
                time: '2026-07-13 09:42:42.866',
                service: 'demo-takeout-restful-api',
                result: '{"deliveryStatus":"OUTSIDE_VALID_AREA_SCOPE","storeId":"21527"}',
                fields: {
                  entryType: 'response',
                  responseSummary: '{"deliveryStatus":"OUTSIDE_VALID_AREA_SCOPE","storeId":"21527"}',
                  statusCode: 200,
                  durationMs: 352
                }
              }
            ]
          }
        }
      }
    });

    expect(text).toContain('最终返回');
    expect(text).toContain('服务: demo-takeout-restful-api');
    expect(text).toContain('原因: deliveryStatus=OUTSIDE_VALID_AREA_SCOPE');
  });

  test('truncates overly long terminal output', () => {
    const text = formatResultText({
      type: 'result',
      message: 'big payload',
      data: {
        lines: Array.from({ length: 250 }, (_, index) => `line-${index}-${'x'.repeat(80)}`)
      }
    });

    expect(text).toContain('big payload');
    expect(text.length).toBeLessThan(9000);
    expect(text).toMatch(/\.\.\. \+\d+ more|truncated|…/);
  });

  test('sanitizes non-ascii text for ascii-safe terminal rendering', () => {
    const text = sanitizeTerminalText('FlowMind Guide / 商家基本盘检测整改校验任务失败');
    expect(text).toContain('商家基本盘检测整改校验任务失败');
    expect(text).toContain('FlowMind Guide /');
  });

  test('does not render undefined fields in object output', () => {
    const text = formatResultText({
      type: 'result',
      skill: 'log-audit',
      message: 'ok',
      data: {
        queryParams: {
          endpoint: 'cn-shenzhen.log.aliyuncs.com',
          project: 'k8s-log',
          logstore: 'test_reg_log',
          from: undefined,
          to: undefined,
          line: 100
        }
      }
    });

    expect(text).not.toContain('from: undefined');
    expect(text).not.toContain('to: undefined');
  });

  test('formats AI status responses as a concise health summary', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'ai-status',
        message: '当前 AI 已连接，默认提供商是 mimo，模型是 mimo-7b。',
        query: '你是什么模型',
        health: 'ready',
        ready: true,
        initialized: true,
        defaultProvider: 'mimo',
        defaultModel: 'mimo-7b',
        activeProvider: 'mimo',
        activeModel: 'mimo-7b',
        providers: {
          mimo: {
            initialized: true,
            model: 'mimo-7b',
            baseUrl: 'https://api.mimo.ai/v1',
            provider: 'MiMo'
          }
        },
        features: {
          intentUnderstanding: true
        },
        recommendedChecks: ['flowmind ai --status', 'flowmind ai --test mimo'],
        timestamp: '2026-07-03T01:23:45.000Z'
      },
      metadata: {
        skill: 'ai-status',
        skillRoute: 'ai-status',
        aiProvider: 'mimo',
        aiModel: 'mimo-7b'
      }
    });

    expect(text).toContain('AI 当前可用');
    expect(text).toContain('当前模型：mimo / mimo-7b');
    expect(text).not.toContain('query:');
    expect(text).not.toContain('health:');
    expect(text).not.toContain('recommendedChecks:');
    expect(text).not.toContain('providers:');
  });

  test('formats AI status errors without exposing raw provider diagnostics', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'ai-status',
        message: 'AI 状态查询失败：Qwen API error: 401 - {"error":{"message":"Incorrect API key provided."}}',
        health: 'error',
        ready: true,
        defaultProvider: 'qwen',
        defaultModel: 'qwen-plus',
        activeProvider: 'qwen',
        activeModel: 'qwen-plus',
        replyError:
          'Qwen API error: 401 - {"error":{"message":"Incorrect API key provided. For details, see https://help.aliyun.com"}}'
      },
      metadata: {
        skill: 'ai-status',
        skillRoute: 'ai-status',
        aiProvider: 'qwen',
        aiModel: 'qwen-plus'
      }
    });

    expect(text).toContain('AI 当前不可用');
    expect(text).toContain('当前模型：qwen / qwen-plus');
    expect(text).toContain('原因：API Key 无效或已过期');
    expect(text).toContain('建议：检查 qwen 的 API Key 配置是否正确');
    expect(text).not.toContain('Incorrect API key provided');
    expect(text).not.toContain('https://help.aliyun.com');
  });

  test('formats ai fallback responses without debug payload fields', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'ai-fallback',
        message: '珠海天气需要实时天气技能支持。',
        query: '测试下当前的珠海天气返回',
        replyMode: 'ai-fallback',
        replyError: null,
        aiStatus: {
          defaultProvider: 'mimo',
          defaultModel: 'mimo-1.0',
          ready: true
        }
      },
      metadata: {
        skill: 'ai-fallback',
        skillRoute: 'ai-only',
        aiProvider: 'mimo',
        aiModel: 'mimo-1.0'
      }
    });

    expect(text).toContain('珠海天气需要实时天气技能支持');
    expect(text).not.toContain('query:');
    expect(text).not.toContain('replyMode:');
    expect(text).not.toContain('aiStatus:');
  });

  test('formats ai fallback failures as concise user-facing guidance', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'ai-fallback',
        message: 'AI 回答失败：Qwen API error: 401 - {"error":{"message":"Incorrect API key provided."}}',
        replyMode: 'ai-fallback',
        replyError: 'Qwen API error: 401 - {"error":{"message":"Incorrect API key provided."}}'
      },
      metadata: {
        skill: 'ai-fallback',
        skillRoute: 'ai-only',
        aiProvider: 'qwen',
        aiModel: 'qwen-plus'
      }
    });

    expect(text).toContain('AI 暂时不可用');
    expect(text).toContain('原因：API Key 无效或已过期');
    expect(text).not.toContain('Incorrect API key provided');
  });

  test('formats generic error payloads without exposing raw prefixes', () => {
    const text = formatResultText({
      type: 'error',
      message: 'fetch failed: getaddrinfo ENOTFOUND api.example.com'
    });

    expect(text).toContain('当前操作未完成');
    expect(text).toContain('原因：服务地址无法访问');
    expect(text).not.toContain('Error:');
  });

  test('formats upgraded skill follow-up actions as dedicated sections', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'change-impact-review',
        message: 'Impact review completed for 2 file(s). Risk: medium',
        data: {
          risk: {
            level: 'medium',
            score: 4
          },
          regressionChecklist: ['Smoke test the main affected user flow.'],
          automationCandidates: [
            {
              skill: 'data-risk-audit',
              reason: 'Database or cache related files changed',
              suggestedInput: '数据风险 项目=demo-service',
              configured: true
            }
          ],
          nextActions: [
            {
              skill: 'knowledge-ops',
              reason: 'Persist the result as reusable runbook context',
              suggestedInput: '保存知识 path=docs/runbook.md repo=team/ops'
            }
          ]
        }
      }
    });

    expect(text).toContain('Impact review completed for 2 file(s). Risk: medium');
    expect(text).toContain('可继续执行');
    expect(text).toContain('1. Database or cache related files changed');
    expect(text).toContain('动作：data-risk-audit');
    expect(text).toContain('执行：数据风险 项目=demo-service');
    expect(text).toContain('状态：已配置');
    expect(text).toContain('建议下一步');
    expect(text).toContain('1. Persist the result as reusable runbook context');
    expect(text).toContain('动作：knowledge-ops');
    expect(text).toContain('regressionChecklist: Smoke test the main affected user flow.');
  });

  test('formats retry and binding hints for upgraded structured skill results', () => {
    const text = formatResultText({
      type: 'result',
      success: true,
      data: {
        type: 'result',
        skill: 'knowledge-ops',
        message: 'Knowledge namespace is required. Provide repo=<namespace> or configure defaultNamespace.',
        data: {
          action: 'save',
          retryHints: [
            'Add repo=<namespace> to the request.',
            'Or configure skillConfig.defaultNamespace for knowledge-ops.'
          ],
          bindingHint: {
            kind: 'mcp-binding',
            suggestedCommand: 'flowmind "绑定知识库 mcp=yuque-mcp repo=team/ops path=docs/runbook.md"'
          }
        }
      }
    });

    expect(text).toContain('Knowledge namespace is required.');
    expect(text).toContain('需要先绑定配置');
    expect(text).toContain('执行：flowmind "绑定知识库 mcp=yuque-mcp repo=team/ops path=docs/runbook.md"');
    expect(text).toContain('可这样重试');
    expect(text).toContain('1. Add repo=<namespace> to the request.');
    expect(text).toContain('2. Or configure skillConfig.defaultNamespace for knowledge-ops.');
  });
});
