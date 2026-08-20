function parseLogQueryParams(input, options = {}) {
  const params = {};
  const text = String(input || '');

  const traceMatch = text.match(/(?:trace[_-]?id|调用链)\s*[:=]?\s*(\S+)/i);
  if (traceMatch) params.traceId = traceMatch[1];

  const naturalProjectService = options.allowNaturalService !== false || options.allowNaturalProject !== false
    ? extractNaturalProjectServicePair(text)
    : null;
  if (naturalProjectService) {
    if (naturalProjectService.project && !params.project) {
      params.project = naturalProjectService.project;
    }
    if (naturalProjectService.service && !params.service) {
      params.service = naturalProjectService.service;
    }
  }

  const serviceMatch = text.match(/(?:服务|service)\s*[:=]?\s*(\S+)/i);
  if (serviceMatch) {
    params.service = serviceMatch[1];
  } else if (!params.service && options.allowNaturalService !== false) {
    const naturalService = extractNaturalService(text);
    if (naturalService) {
      params.service = naturalService;
    }
  }

  const levelMatch = text.match(/(?:级别|level)\s*[:=]?\s*(ERROR|WARN|INFO|DEBUG)/i);
  if (levelMatch) {
    params.level = levelMatch[1].toUpperCase();
  } else if (options.allowNaturalLevel !== false) {
    const naturalLevel = extractNaturalLevel(text);
    if (naturalLevel) {
      params.level = naturalLevel;
    }
  }

  const projectMatch = text.match(/(?:项目|project)\s*[:=]?\s*([A-Za-z][A-Za-z0-9._-]{2,})\b/i);
  if (projectMatch) {
    params.project = projectMatch[1];
  } else if (!params.project && options.allowNaturalProject !== false) {
    const naturalProject = extractNaturalProject(text);
    if (naturalProject) {
      params.project = naturalProject;
    }
  }

  const logstoreMatch = text.match(/(?:logstore|日志库)\s*[:=]?\s*(\S+)/i);
  if (logstoreMatch) params.logstore = logstoreMatch[1];

  const env = extractLogEnvironment(text);
  if (env) params.env = env;

  const explicitQuery = extractExplicitSlsQuery(text);
  if (explicitQuery) {
    params.rawQuery = explicitQuery.query;
    if (explicitQuery.service && !params.service) {
      params.service = explicitQuery.service;
    }
  }

  let traceIdFromSuffix = false;
  if (!params.traceId) {
    const bareHexTraceId = extractBareHexTraceId(text);
    if (bareHexTraceId) {
      params.traceId = bareHexTraceId;
      traceIdFromSuffix = true;
    }
  }

  if (!params.traceId) {
    const implicitTraceId = extractImplicitTraceId(text, params.env);
    if (implicitTraceId) {
      params.traceId = implicitTraceId;
      traceIdFromSuffix = true;
    }
  }

  const keywordMatch = text.match(/(?:^|[^A-Za-z0-9._-])(?:关键词|keyword|搜索|search)(?![A-Za-z0-9._-])\s*[:=]?\s*(.+?)(?:\s*$)/i);
  if (keywordMatch) {
    params.keyword = keywordMatch[1].trim();
  } else if (options.allowQuotedKeyword !== false) {
    const quotedKeyword = extractQuotedText(text);
    if (quotedKeyword) {
      params.keyword = quotedKeyword;
    }
  }

  if (!params.keyword && options.allowNaturalKeyword !== false && !traceIdFromSuffix) {
    const naturalKeyword = extractNaturalKeyword(text);
    if (naturalKeyword) {
      params.keyword = naturalKeyword;
    }
  }

  const timeWindow = extractTimeWindow(text);
  if (timeWindow) {
    params.timeRange = timeWindow.label;
    params.from = timeWindow.from;
    params.to = timeWindow.to;
  } else {
    const timeMatch = text.match(/(?:最近|last)\s*(\d+)\s*(分钟|小时|天|min|hour|day)/i);
    if (timeMatch) {
      params.timeRange = `last ${timeMatch[1]} ${timeMatch[2]}`;
    }
  }

  return params;
}

function extractExplicitSlsQuery(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const tokenPattern = String.raw`(?:"[^"\n]+"|'[^'\n]+'|[A-Za-z_][A-Za-z0-9_.-]*\s*:\s*(?:"[^"\n]+"|'[^'\n]+'|[^\s，,。；;]+))`;
  const chainPattern = new RegExp(`${tokenPattern}(?:\\s+(?:and|or)\\s+${tokenPattern})+`, 'i');
  const singleFieldPattern = new RegExp(`[A-Za-z_][A-Za-z0-9_.-]*\\s*:\\s*(?:"[^"\\n]+"|'[^'\\n]+'|[^\\s，,。；;]+)`, 'i');
  const match = text.match(chainPattern) || text.match(singleFieldPattern);

  if (!match || !match[0]) {
    return null;
  }

  const query = match[0]
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, '\'')
    .replace(/\s+/g, ' ')
    .trim();

  if (!looksLikeExplicitSlsQuery(query)) {
    return null;
  }

  const serviceMatch = query.match(/(?:app_name|appName|service|service_name)\s*:\s*['"]?([A-Za-z0-9._-]+)['"]?/i);
  return {
    query,
    service: serviceMatch && serviceMatch[1] ? serviceMatch[1] : null
  };
}

function looksLikeExplicitSlsQuery(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/\b(?:and|or)\b/i.test(text)) {
    return true;
  }
  return /[A-Za-z_][A-Za-z0-9_.-]*\s*:\s*/.test(text);
}

function extractNaturalLevel(text) {
  const normalized = String(text || '').toLowerCase();
  if (/(错误|异常|报错|失败|宕机|超时|timeout|error|fail)/i.test(normalized)) {
    return 'ERROR';
  }
  if (/(告警|警告|warning|warn)/i.test(normalized)) {
    return 'WARN';
  }
  if (/(信息|info)/i.test(normalized)) {
    return 'INFO';
  }
  if (/(调试|debug)/i.test(normalized)) {
    return 'DEBUG';
  }
  return null;
}

function extractQuotedText(input) {
  const quotedMatches = [...String(input || '').matchAll(/["'“”‘’]([^"'“”‘’]{2,})["'“”‘’]/g)];
  if (quotedMatches.length === 0) {
    return null;
  }

  let best = '';
  for (const match of quotedMatches) {
    const candidate = (match[1] || '').trim();
    if (candidate.length > best.length) {
      best = candidate;
    }
  }

  return normalizeNaturalKeyword(best);
}

function extractLogEnvironment(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const explicitPatterns = [
    /(?:环境|env)\s*[:=]?\s*(test|uat|gray|prod)\b/i,
    /(?:在|到|切到|切换到|切换|进入|使用|查询)?\s*(test|uat|gray|prod)\s*(?:环境|env|日志库|容器|日志|链路|trace|调用链)/i,
    /(?:在|到|切到|切换到|切换|进入|使用|查询)?\s*(test|uat|gray|prod)(?=(?:环境|env|日志库|容器|日志|链路|trace|调用链|中|的|里|内|上|下|$))/i,
    /(?:测试|预发|灰度|生产|线上|正式)\s*(?:环境|env|日志库|容器|日志|链路|trace|调用链)?/i
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  }

  const chineseMatch = text.match(/(?:测试|预发|灰度|生产|线上|正式)(?=\s*(?:环境|env|日志库|容器|日志|链路|trace|调用链)|$)/i);
  if (chineseMatch) {
    const value = chineseMatch[0];
    if (/测试/i.test(value)) return 'test';
    if (/预发/i.test(value)) return 'uat';
    if (/灰度/i.test(value)) return 'gray';
    if (/生产|线上|正式/i.test(value)) return 'prod';
  }

  return null;
}

function extractNaturalKeyword(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const patterns = [
    /(?:日志|log(?:s| audit| analysis)?)[，,、:：\s]+([^。！？\n]{2,120}?)(?=(?:是\s*什么异常|是什么异常|怎么回事|为什么|什么原因|原因|报错|错误|异常|问题|$))/i,
    /(?:日志|log(?:s| audit| analysis)?)[，,、:：\s]+([^。！？\n]{2,120}?)(?=$|\n|[。！？])/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;
    const candidate = normalizeNaturalKeyword(match[1]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractNaturalService(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const patterns = [
    /([A-Za-z][A-Za-z0-9._-]{2,})\s*项目(?:的)?\s*([A-Za-z][A-Za-z0-9._-]{2,})\s*(?:错误|异常|告警|故障|问题|调试|排查)?(?:日志|log|链路|trace|调用链)(?![A-Za-z0-9._-])/i,
    /([A-Za-z][A-Za-z0-9._-]{2,})\s*(?:的)?\s*(?:错误|异常|告警|故障|问题|调试|排查)?(?:日志|log|链路|trace|调用链)(?![A-Za-z0-9._-])/i,
    /(?:查|查询|查看|排查|分析|定位)?(?:下)?(?:服务|service|应用|app|系统|模块)?\s*([A-Za-z][A-Za-z0-9._-]{2,})\s*(?:的)?(?:错误|异常|告警|故障|问题|调试|排查)?(?:日志|log|链路|trace|调用链)(?![A-Za-z0-9._-])/i,
    /(?:项目|project)\s*(?:的)?\s*([A-Za-z][A-Za-z0-9._-]{2,})\s*(?:错误|异常|告警|故障|问题|调试|排查)?(?:日志|log|链路|trace|调用链)(?![A-Za-z0-9._-])/i,
    /(?:错误|异常|告警|故障|问题|调试|排查)?(?:日志|log|链路|trace)\s*[:：\s]*([A-Za-z][A-Za-z0-9._-]{2,})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;
    const candidate = normalizeEntityCandidate(match[1]);
    if (candidate && !isEnvironmentToken(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractNaturalProject(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const patterns = [
    /([A-Za-z][A-Za-z0-9._-]{2,})\s*项目(?:的)?\s*[A-Za-z][A-Za-z0-9._-]{2,}\s*(?:错误|异常|告警|故障|问题|调试|排查)?(?:日志|log|链路|trace|调用链)(?![A-Za-z0-9._-])/i,
    /(?:项目|project)\s*[:=]?\s*([A-Za-z][A-Za-z0-9._-]{2,})/i,
    /([A-Za-z][A-Za-z0-9._-]{2,})\s*(?:项目|project)(?:的)?/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;
    const candidate = normalizeEntityCandidate(match[1]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function normalizeNaturalKeyword(value) {
  const candidate = String(value || '')
    .replace(/^[，,、:：\s]+/, '')
    .replace(/[，,、:：\s]+$/, '')
    .replace(/^(查询|查|查看|分析|定位|排查)\s*(?:下)?\s*/i, '')
    .replace(/^(最近|近|过去|前)\s*\d+\s*(分钟|小时|天|min|hour|day)\s*的?/i, '')
    .replace(/^(今天|今日|昨天|昨日|本周|这周|近7天|近24小时|近1小时|最近1小时|最近1天)\s*的?/i, '')
    .replace(/^(下|下个|一下|一下子)/, '')
    .trim();

  if (!candidate) return null;
  if (/^(日志|log|logs|错误|异常|报错|失败|问题|警告|告警|error|warn|info|debug)$/i.test(candidate)) {
    return null;
  }
  if (/(?:项目|服务|日志|log|trace|调用链)/i.test(candidate) && /[A-Za-z][A-Za-z0-9._-]{2,}/.test(candidate)) {
    return null;
  }

  return candidate;
}

function normalizeEntityCandidate(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  if (/^(日志|log|logs|错误|异常|报错|失败|问题|警告|告警|error|warn|info|debug)$/i.test(candidate)) {
    return null;
  }
  return candidate;
}

function isEnvironmentToken(value) {
  return /^(test|uat|gray|prod|测试|预发|灰度|生产)$/i.test(String(value || '').trim());
}

function extractImplicitTraceId(text, env) {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  const patterns = [
    /(?:trace[_-]?id|调用链|链路|trace)\s*[:=：]\s*([A-Za-z0-9_-]{6,})/i,
    /(?:日志|log|链路|trace|调用链)\s*[:=：]\s*([A-Za-z0-9_-]{8,})\b/i
  ];

  if (env) {
    patterns.unshift(new RegExp(`(?:${escapeRegExp(env)}|${buildEnvPattern()})\\s*(?:日志|log|链路|trace|调用链)\\s*[:=：]\\s*([A-Za-z0-9_-]{8,})\\b`, 'i'));
  }

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match || !match[1]) continue;
    if (looksLikeTraceId(match[1])) {
      return match[1];
    }
  }

  return null;
}

function extractBareHexTraceId(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  const matches = [...normalized.matchAll(/(?:^|[^A-Za-z0-9])([a-f0-9]{12,32})(?:$|[^A-Za-z0-9])/gi)];
  if (matches.length === 0) return null;

  for (let i = matches.length - 1; i >= 0; i--) {
    const candidate = String(matches[i][1] || '').trim().toLowerCase();
    if (!candidate) continue;
    if (/^\d+$/.test(candidate)) continue;
    if (looksLikeTraceId(candidate)) {
      return candidate;
    }
  }

  return null;
}

function looksLikeTraceId(value) {
  const candidate = String(value || '').trim();
  if (candidate.length < 8) return false;
  if (!/[0-9]/.test(candidate)) return false;
  return /^[A-Za-z0-9_-]+$/.test(candidate);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildEnvPattern() {
  return '(?:test|uat|gray|prod|测试|预发|灰度|生产)';
}

function extractNaturalProjectServicePair(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const patterns = [
    /([A-Za-z][A-Za-z0-9._-]{2,})\s*项目(?:的)?\s*([A-Za-z][A-Za-z0-9._-]{2,})\b/i,
    /(?:项目|project)\s*(?:的)?\s*([A-Za-z][A-Za-z0-9._-]{2,})\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    if (match.length >= 3) {
      const project = normalizeEntityCandidate(match[1]);
      const service = normalizeEntityCandidate(match[2]);
      if (project || service) {
        return { project, service };
      }
    }

    const service = normalizeEntityCandidate(match[1]);
    if (service) {
      return { service };
    }
  }

  return null;
}

function extractTimeWindow(input) {
  const text = String(input || '');
  const now = new Date();

  const recentMatch = text.match(/(?:最近|近|过去|前)\s*(\d+)\s*(分钟|小时|天|min|hour|day)/i);
  if (recentMatch) {
    const amount = Number(recentMatch[1]);
    const unit = normalizeTimeUnit(recentMatch[2]);
    if (Number.isFinite(amount) && amount > 0 && unit) {
      const from = new Date(now.getTime() - amount * unitToMs(unit));
      return {
        label: `last ${amount} ${recentMatch[2]}`,
        from: from.toISOString(),
        to: now.toISOString()
      };
    }
  }

  if (/今天|今日/i.test(text)) {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return {
      label: 'today',
      from: from.toISOString(),
      to: now.toISOString()
    };
  }

  if (/昨天|昨日/i.test(text)) {
    const to = new Date(now);
    to.setHours(0, 0, 0, 0);
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    return {
      label: 'yesterday',
      from: from.toISOString(),
      to: to.toISOString()
    };
  }

  if (/本周|这周|近7天/i.test(text)) {
    const to = new Date(now);
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      label: 'last 7 days',
      from: from.toISOString(),
      to: to.toISOString()
    };
  }

  return null;
}

function normalizeTimeUnit(unit) {
  const text = String(unit || '').toLowerCase();
  if (text === 'min' || text === 'minute' || text === 'minutes' || text === '分钟') return 'minute';
  if (text === 'hour' || text === 'hours' || text === '小时') return 'hour';
  if (text === 'day' || text === 'days' || text === '天') return 'day';
  return null;
}

function unitToMs(unit) {
  if (unit === 'minute') return 60 * 1000;
  if (unit === 'hour') return 60 * 60 * 1000;
  if (unit === 'day') return 24 * 60 * 60 * 1000;
  return 0;
}

module.exports = {
  detectNaturalLevel: extractNaturalLevel,
  extractNaturalProject,
  extractNaturalService,
  extractNaturalKeyword,
  extractExplicitSlsQuery,
  extractQuotedText,
  extractLogEnvironment,
  extractBareHexTraceId,
  extractTimeWindow,
  parseLogQueryParams
};
