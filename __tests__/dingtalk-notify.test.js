const skill = require('../skills/dingtalk-notify');

const WEBHOOK = 'https://oapi.dingtalk.com/robot/send?access_token=abc123def456';

describe('dingtalk-notify', () => {
  afterEach(() => {
    skill.__setFetchImpl(null);
  });

  describe('canHandle', () => {
    test('matches dingtalk push intent', () => {
      expect(skill.canHandle('推送钉钉 测试报告')).toBe(true);
      expect(skill.canHandle('把报告发到钉钉群')).toBe(true);
      expect(skill.canHandle('钉钉机器人通知一下')).toBe(true);
    });

    test('matches raw webhook url without dingtalk keyword', () => {
      expect(skill.canHandle(`推送到 ${WEBHOOK} 报告内容`)).toBe(true);
    });

    test('ignores unrelated input', () => {
      expect(skill.canHandle('查询订单 12345 的日志')).toBe(false);
      expect(skill.canHandle('推送报告到飞书群')).toBe(false);
      expect(skill.canHandle('')).toBe(false);
      expect(skill.canHandle(null)).toBe(false);
    });
  });

  describe('extract helpers', () => {
    test('extractWebhookUrl pulls full robot url', () => {
      expect(skill.extractWebhookUrl(`foo ${WEBHOOK} bar`)).toBe(WEBHOOK);
      expect(skill.extractWebhookUrl('no url here')).toBe(null);
    });

    test('extractDemandId supports labeled forms', () => {
      expect(skill.extractDemandId('需求编号: REQ-2026-001 报告')).toBe('REQ-2026-001');
      expect(skill.extractDemandId('需求ID D202600123')).toBe('D202600123');
      expect(skill.extractDemandId('需求号 ABC_1')).toBe('ABC_1');
      expect(skill.extractDemandId('demand id DEM-42')).toBe('DEM-42');
      expect(skill.extractDemandId('需求 REQ-9 已完成')).toBe('REQ-9');
      expect(skill.extractDemandId('需求编号 1234 评估报告')).toBe('1234');
      expect(skill.extractDemandId('随便一句话')).toBe(null);
    });

    test('extractSecret finds SEC tokens only', () => {
      expect(skill.extractSecret('secret SECabcdef123456')).toBe('SECabcdef123456');
      expect(skill.extractSecret('no secret SECONDARY word')).toBe(null);
    });

    test('extractGroupName captures target group name', () => {
      expect(skill.extractGroupName('把测试报告发到测试群')).toBe('测试');
      expect(skill.extractGroupName('推送到线上告警群')).toBe('线上告警');
      expect(skill.extractGroupName('推送报告')).toBe(null);
    });

    test('resolveGroupConfig matches exact, suffixed and case-insensitive keys', () => {
      const groups = {
        '测试群': { webhook: WEBHOOK },
        Release: { webhook: WEBHOOK }
      };
      expect(skill.resolveGroupConfig(groups, '测试')).toEqual({ webhook: WEBHOOK });
      expect(skill.resolveGroupConfig(groups, '测试群')).toEqual({ webhook: WEBHOOK });
      expect(skill.resolveGroupConfig(groups, 'release')).toEqual({ webhook: WEBHOOK });
      expect(skill.resolveGroupConfig(groups, '不存在')).toBe(null);
      expect(skill.resolveGroupConfig(null, '测试')).toBe(null);
    });

    test('maskWebhook hides the access token', () => {
      const masked = skill.maskWebhook(WEBHOOK);
      expect(masked).toBe('https://oapi.dingtalk.com/robot/send?access_token=******');
      expect(masked).not.toContain('abc123def456');
    });
  });

  describe('signWebhookUrl', () => {
    test('appends timestamp and sign when secret provided', () => {
      const signed = skill.signWebhookUrl(WEBHOOK, 'SECsecret', 1700000000000);
      expect(signed).toContain('&timestamp=1700000000000&sign=');
      expect(signed.startsWith(WEBHOOK)).toBe(true);
    });

    test('returns webhook untouched without secret', () => {
      expect(skill.signWebhookUrl(WEBHOOK, null)).toBe(WEBHOOK);
    });
  });

  describe('buildMarkdownMessage', () => {
    test('includes demand id, summary and content', () => {
      const text = skill.buildMarkdownMessage({
        title: skill.buildTitle('REQ-1'),
        demandId: 'REQ-1',
        demandSummary: '订单超时优化',
        content: '全量用例 120，通过 118，失败 2',
        timestamp: new Date('2026-08-19T10:00:00+08:00')
      });
      expect(text).toContain('### 需求 REQ-1 评估报告');
      expect(text).toContain('**需求编号**: REQ-1');
      expect(text).toContain('**需求**: 订单超时优化');
      expect(text).toContain('全量用例 120');
      expect(text).toContain('2026-08-19');
    });

    test('uses the demand number as the evaluation title', () => {
      expect(skill.buildTitle('1234')).toBe('需求 1234 评估报告');
      expect(skill.buildTitle(null)).toBe('评估报告');
    });

    test('truncates oversized content', () => {
      const text = skill.buildMarkdownMessage({
        title: skill.buildTitle(null),
        content: 'x'.repeat(25000)
      });
      expect(text.length).toBeLessThan(19000);
      expect(text).toContain('已截断');
    });
  });

  describe('buildLayeredEvaluationReport', () => {
    test('builds ordered chat-card sections with capped A/B examples', () => {
      const report = skill.buildLayeredEvaluationReport({
        requirement: 'ADD 召回范围符合当前需求。',
        dataLog: '采集 11 组配对，剔除 3 组冷查时序伪差。',
        performance: '整体 RT 未见阻断性退化。',
        anomalies: '蛋糕、奶茶样本存在冷查时序偏差。',
        nextSteps: '灰度 10%，观察 P95 和错误率。',
        conclusion: '可灰度上线，暂缓全量',
        status: '关注',
        metadata: {
          demandId: '1234',
          time: '2026-08-19 10:00:00',
          timeRange: '10:00-10:30',
          sampleSize: '11 组'
        },
        logTable: {
          headers: ['关键词', 'B版本组', 'A用户组', 'A-B', '说明'],
          rows: [
            ['蛋糕', '2726ms（先查·冷）', '1878ms', '-848ms', '冷查'],
            ['奶茶', '1280ms', '1700ms', '+420ms', '需观察'],
            ['汉堡', '900ms', '910ms', '10ms', '轻微'],
            ['咖啡', '740ms', '810ms', '-70ms', '正常'],
            ['披萨', '1200ms', '1200ms', '0ms', '持平'],
            ['炸鸡', '1500ms', '1800ms', '+300ms', '折叠']
          ]
        }
      });

      expect(report.startsWith('**结论**: 可灰度上线，暂缓全量。**状态**: 关注')).toBe(true);
      expect(report).toContain('- **样本**: 11 组 ｜ **采集窗口**: 10:00-10:30');
      expect(report.indexOf('### 1. 需求完整度')).toBeLessThan(report.indexOf('### 2. 采集质量'));
      expect(report.indexOf('### 2. 采集质量')).toBeLessThan(report.indexOf('### 3. 性能结论'));
      expect(report.indexOf('### 3. 性能结论')).toBeLessThan(report.indexOf('### 4. 异常点'));
      expect(report.indexOf('### 4. 异常点')).toBeLessThan(report.indexOf('### 5. 建议/下一步'));
      expect(report).toContain('蛋糕: B 2726 ms（先查·冷） → A 1878 ms，**↓ -848 ms**');
      expect(report).toContain('奶茶: B 1280 ms → A 1700 ms，**↑ +420 ms**');
      expect(report).toContain('**A/B汇总**: 共 6 条，↑ 3，↓ 2，持平 1，未知 0');
      expect(report).toContain('其余 1 条已折叠为汇总');
      expect(report).not.toContain('炸鸡: B 1500 ms');
    });

    test('skips latency A/B for non-performance changes', () => {
      const report = skill.buildLayeredEvaluationReport({
        requirement: '展示文案与字段格式优化，范围仅 demo-order-restful-api。',
        dataLog: '灰度 SLS your-logstore，corrId 关联请求与响应。',
        functionalVerification: 'store_search/get_home_list：4/4 页面输出「目标文案」，通过',
        anomalies: '无范围内阻断项。',
        nextSteps: '可全量上线，观察展示反馈。',
        conclusion: '可全量上线',
        status: '通过',
        performanceApplicable: false,
        sampleSize: '4 门店',
        timeRange: '08-20 20:30 ~ 08-21 11:30'
      });
      expect(report).not.toContain('本次变更不含性能代码');
      expect(report).not.toContain('未做耗时对比');
      expect(report).toContain('store_search/get_home_list：4/4 页面输出「目标文案」，通过');
      expect(report).not.toContain('**A/B汇总**');
      expect(report).toContain('### 3. 性能结论');
    });

    test('strips transport instructions from the first line', () => {
      const parsed = skill.parseInput(
        `需求1234 模板验证报告，推送到钉钉 https://oapi.dingtalk.com/robot/send?access_token=abc123_DEF 关键词:报告\n**结论**: 通过。**状态**: 通过`
      );
      expect(parsed.demandId).toBe('1234');
      expect(parsed.content.startsWith('**结论**')).toBe(true);
      expect(parsed.content).not.toContain('推送');
      expect(parsed.content).not.toContain('关键词');
      expect(parsed.content).not.toContain('模板验证报告');
    });

    test('escapes markdown table cells', () => {
      expect(skill.buildMarkdownTable(['字段'], [['a|b']])).toContain('**字段**');
      expect(skill.buildMarkdownTable(['字段'], [['a|b']])).toContain('a\\|b');
    });
  });

  describe('parseInput', () => {
    test('parses webhook, demand id and cleaned content', () => {
      const parsed = skill.parseInput(
        `推送钉钉 ${WEBHOOK} SECabcdef123456 需求编号 REQ-2026-001 测试报告: 全量通过`
      );
      expect(parsed.webhook).toBe(WEBHOOK);
      expect(parsed.secret).toBe('SECabcdef123456');
      expect(parsed.demandId).toBe('REQ-2026-001');
      expect(parsed.content).toContain('测试报告');
      expect(parsed.content).not.toContain('access_token');
      expect(parsed.content).not.toContain('REQ-2026-001');
    });

    test('resolves group from skillConfig when no url given', () => {
      const context = {
        skillConfig: {
          groups: { '测试群': { webhook: WEBHOOK, secret: 'SECabcdef123456' } }
        }
      };
      const parsed = skill.parseInput('把测试报告发到测试群', context);
      expect(parsed.webhook).toBe(WEBHOOK);
      expect(parsed.secret).toBe('SECabcdef123456');
      expect(parsed.groupName).toBe('测试');
    });

    test('preserves report line breaks during cleanup', () => {
      const parsed = skill.parseInput(`推送到 ${WEBHOOK} ## 1. 需求完整度评估\n内容一\n\n## 最终结论\n可灰度上线`);
      expect(parsed.content).toContain('## 1. 需求完整度评估\n内容一\n\n## 最终结论');
    });
  });

  describe('execute', () => {
    test('returns structured error when no webhook found', async () => {
      const result = await skill.execute('推送测试报告', {});
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
      expect(result.data.kind).toBe('missing-webhook');
    });

    test('returns structured error when content is empty', async () => {
      const result = await skill.execute(`推送到 ${WEBHOOK}`, {});
      expect(result.type).toBe('error');
      expect(result.data.kind).toBe('invalid-input');
    });

    test('sends markdown payload and masks webhook in result', async () => {
      const calls = [];
      skill.__setFetchImpl(async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ errcode: 0, errmsg: 'ok' }) };
      });

      const result = await skill.execute(
        `推送钉钉 ${WEBHOOK} 需求编号 1234 测试报告: 全量通过`,
        {}
      );

      expect(result.type).toBe('result');
      expect(result.success).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].url.startsWith(WEBHOOK)).toBe(true);

      const payload = JSON.parse(calls[0].options.body);
      expect(payload.msgtype).toBe('markdown');
      expect(payload.markdown.title).toBe('需求 1234 评估报告');
      expect(payload.markdown.text).toContain('1234');
      expect(payload).not.toHaveProperty('text');
      expect(payload.markdown.text).toContain('测试报告');

      expect(result.data.webhook).not.toContain('abc123def456');
      expect(result.data.demandId).toBe('1234');
      expect(result.data.response.errcode).toBe(0);
    });

    test('signs request when secret provided', async () => {
      const urls = [];
      skill.__setFetchImpl(async (url) => {
        urls.push(url);
        return { ok: true, json: async () => ({ errcode: 0, errmsg: 'ok' }) };
      });

      await skill.execute(`推送到 ${WEBHOOK} SECabcdef123456 内容`, {});
      expect(urls[0]).toContain('&timestamp=');
      expect(urls[0]).toContain('&sign=');
    });

    test('surfaces dingtalk api error with hint', async () => {
      skill.__setFetchImpl(async () => ({
        ok: true,
        json: async () => ({ errcode: 310000, errmsg: 'sign not match' })
      }));

      const result = await skill.execute(`推送到 ${WEBHOOK} 内容`, {});
      expect(result.type).toBe('error');
      expect(result.data.errcode).toBe(310000);
      expect(result.message).toContain('加签');
    });

    test('demand enrichment failure degrades gracefully', async () => {
      skill.__setFetchImpl(async () => ({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok' })
      }));

      const context = {
        componentRegistry: {
          getAdapter: () => ({
            callTool: async () => {
              throw new Error('workflow mcp down');
            }
          })
        }
      };

      const result = await skill.execute(`推送到 ${WEBHOOK} 需求编号 REQ-1 报告内容`, context);
      expect(result.type).toBe('result');
      expect(result.data.demandSummary).toBe(null);
    });

    test('demand enrichment fills summary when adapter responds', async () => {
      skill.__setFetchImpl(async () => ({
        ok: true,
        json: async () => ({ errcode: 0, errmsg: 'ok' })
      }));

      const context = {
        componentRegistry: {
          getAdapter: () => ({
            callTool: async () => ({ data: { demandName: '订单超时优化' } })
          })
        }
      };

      const result = await skill.execute(`推送到 ${WEBHOOK} 需求编号 REQ-1 报告内容`, context);
      expect(result.type).toBe('result');
      expect(result.data.demandSummary).toBe('订单超时优化');
    });
  });
});
