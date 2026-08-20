const DEFAULTS = {
  bridgeUrl: 'http://127.0.0.1:47631',
  token: '',
  targetOrigins: '',
  enabled: false
};

let polling = false;
// Diagnostics for the last query task: which tab was used and whether a
// query button was found on it. Reset per task, surfaced in diagnostics.
let lastTargetTabUrl = null;
let lastQueryButtonFound = null;
let lastPageProbe = null;

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(DEFAULTS);
  await chrome.storage.local.set({ ...DEFAULTS, ...current });
  schedulePoll();
});

chrome.runtime.onStartup.addListener(schedulePoll);
chrome.storage.onChanged.addListener(schedulePoll);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'flowmind-options-updated') {
    schedulePoll();
    sendResponse({ ok: true });
  }
});

schedulePoll();

async function schedulePoll() {
  if (polling) return;
  polling = true;
  try {
    while (true) {
      const config = await chrome.storage.local.get(DEFAULTS);
      if (!config.enabled || !config.token) {
        await delay(3000);
        continue;
      }

      try {
        const task = await fetchNextTask(config);
        if (task) {
          await handleTask(config, task);
        } else {
          await delay(1000);
        }
      } catch (error) {
        await delay(3000);
      }
    }
  } finally {
    polling = false;
  }
}

async function fetchNextTask(config) {
  const response = await fetch(`${trimSlash(config.bridgeUrl)}/extension/next?token=${encodeURIComponent(config.token)}`);
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || 'Failed to fetch FlowMind task');
  }
  return body.task || null;
}

async function handleTask(config, task) {
  try {
    lastQueryButtonFound = null;
    await ensureTargetPermission(config, task.payload?.target);
    const tab = await resolveTargetTab(task.payload?.target);
    if (task.kind === 'service-management-logs' && task.payload?.plan?.mode === 'api') {
      const result = await queryPageApiInMainWorld(tab.id, task.payload);
      await postResult(config, { id: task.id, ok: true, result });
      return;
    }
    if (task.kind === 'service-management-log-bind') {
      await injectPageInterceptor(tab.id);
    }
    const result = await sendToContentScript(tab.id, buildContentMessage(task));
    if (result?.error) {
      throw new Error(result.error);
    }
    await postResult(config, { id: task.id, ok: true, result });
  } catch (error) {
    await postResult(config, { id: task.id, ok: false, error: error.message });
  }
}

async function queryPageApiInMainWorld(tabId, payload = {}) {
  const plan = payload.plan || {};
  const target = payload.target || {};
  assertSameOriginApi(target.url, plan.api?.url);
  const apiOrigin = new URL(plan.api.url, target.url).origin;
  const request = buildApiRequest(plan);
  lastPageProbe = await probePageState(tabId);

  let authHeaders = await ensureAuthHeaders(tabId, apiOrigin);
  let authHeaderSource = authHeaders ? 'captured' : 'none';
  if (!authHeaders) {
    authHeaders = await refreshAuthHeadersViaReload(tabId, apiOrigin, target.url);
    authHeaderSource = authHeaders ? 'reloaded' : 'none';
  }
  authHeaders = sanitizeLearnedHeaders(authHeaders);

  const fetchArgs = {
    url: request.url,
    method: plan.api.method || 'POST',
    credentials: plan.api.credentials || 'include',
    headers: authHeaders || {},
    body: request.body ? JSON.stringify(request.body) : null
  };

  let fetchContext = 'none';
  let result = null;
  if (authHeaders) {
    fetchContext = 'service-worker';
    result = await fetchViaServiceWorker(fetchArgs);
  }
  if (!result?.ok) {
    fetchContext = authHeaders ? 'page-fallback' : 'page';
    const [{ result: pageResult }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: pageFetchOnce,
      args: [fetchArgs]
    });
    if (pageResult?.ok || result?.error) {
      result = pageResult;
    }
  }
  if (result?.error) {
    throw new Error(result.error);
  }
  if (!result?.ok) {
    throw new Error(`Page API failed: HTTP ${result?.status || 'unknown'}`);
  }
  const responsePayload = parseJson(result.responseText);
  const configuredRecords = getPath(responsePayload, plan.api.responsePath?.records);
  const records = configuredRecords || responsePayload?.records || responsePayload?.data?.records || [];
  const total = getPath(responsePayload, plan.api.responsePath?.total) || responsePayload?.total || responsePayload?.data?.total || records.length;
  const supportedFilters = Object.keys(plan.api.parameterMap || {});
  const normalized = Array.isArray(records) ? records.map((record) => normalizeRecord(record, plan.api.fieldMap || {})) : [];
  const filtered = applySemanticFilters(normalized, plan.filters || {}, supportedFilters);
  return {
    records: filtered,
    pageInfo: { total, rawCount: normalized.length },
    diagnostics: {
      mode: 'main-world-page-api',
      authHeaderSource,
      tabUrl: lastTargetTabUrl,
      queryButtonFound: lastQueryButtonFound,
      pageProbe: lastPageProbe,
      fetchContext,
      replayedHeaderNames: authHeaders ? Object.keys(authHeaders) : [],
      responseStatus: result?.status ?? null,
      responseType: responsePayload && typeof responsePayload === 'object' ? 'json' : 'non-json',
      responseTopLevelKeys: responsePayload && typeof responsePayload === 'object' ? Object.keys(responsePayload) : [],
      responseCode: responsePayload?.code ?? responsePayload?.resultCode ?? responsePayload?.status ?? null,
      responseMessage: responsePayload?.message ?? responsePayload?.msg ?? responsePayload?.businessMsg ?? null,
      detailMsgType: responsePayload?.detailMsg === null ? 'null' : Array.isArray(responsePayload?.detailMsg) ? 'array' : typeof responsePayload?.detailMsg,
      detailMsgKeys: responsePayload?.detailMsg && typeof responsePayload.detailMsg === 'object' && !Array.isArray(responsePayload.detailMsg) ? Object.keys(responsePayload.detailMsg) : [],
      supportedFilters,
      requestParamKeys: Object.keys(request.params || {}),
      responseRecordsPath: plan.api.responsePath?.records || null,
      responseRecordsPathMatched: Array.isArray(configuredRecords),
      semanticFilteredCount: filtered.length,
      rawCount: normalized.length
    }
  };
}

async function ensureAuthHeaders(tabId, apiOrigin) {
  // Prefer already-captured headers: the in-page passive hook (V1) or the
  // document_start hook (V2) that saw the page's boot-time requests.
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: readCapturedAuthHeaders,
    args: [{ apiOrigin, maxAgeMs: 10 * 60 * 1000 }]
  });
  if (result?.headers && Object.keys(result.headers).length > 0) {
    return result.headers;
  }
  // Install the passive in-page hook so later requests (user clicks, SPA
  // refreshes) are captured too, then report what is available right now.
  const [{ result: installed }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: installAuthHeaderHook,
    args: [{ apiOrigin, maxAgeMs: 10 * 60 * 1000 }]
  });
  return installed?.headers && Object.keys(installed.headers).length > 0 ? installed.headers : null;
}

function readCapturedAuthHeaders(config) {
  const fresh = (entry) => entry && entry.headers && Date.now() - entry.at < config.maxAgeMs;
  const v1 = window.__flowmindAuthHook;
  if (fresh(v1) && (!config.apiOrigin || v1.origin === config.apiOrigin)) {
    return { headers: v1.headers };
  }
  const v2 = window.__flowmindAuthHookV2?.byOrigin?.[config.apiOrigin];
  if (fresh(v2)) {
    return { headers: v2.headers };
  }
  return { headers: null };
}

async function registerBootAuthHook(originPattern) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['flowmind-auth-hook'] });
  } catch (_error) {
    // Not registered yet.
  }
  await chrome.scripting.registerContentScripts([{
    id: 'flowmind-auth-hook',
    matches: [originPattern],
    js: ['auth-hook.js'],
    world: 'MAIN',
    runAt: 'document_start',
    persistAcrossSessions: false
  }]);
}

async function unregisterBootAuthHook() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['flowmind-auth-hook'] });
  } catch (_error) {
    // Best-effort cleanup.
  }
}

async function refreshAuthHeadersViaReload(tabId, apiOrigin, targetUrl) {
  const originPattern = safeOriginPattern(targetUrl);
  // Register a document_start MAIN-world hook so the page's boot-time
  // authenticated requests are captured even though they fire before any
  // executeScript-based hook can install.
  if (originPattern) {
    try {
      await registerBootAuthHook(originPattern);
    } catch (_error) {
      // Fall back to the executeScript-based passive hook below.
    }
  }
  try {
    return await refreshViaReload(tabId, apiOrigin, targetUrl);
  } finally {
    await unregisterBootAuthHook();
  }
}

async function refreshViaReload(tabId, apiOrigin, targetUrl) {
  try {
    await chrome.tabs.reload(tabId);
    await waitForTabComplete(tabId);
  } catch (_error) {
    return null;
  }
  try {
    // Some SPAs only render/fire queries in visible tabs; bring this tab forward
    // so the reload-triggered default query and our synthetic click both work.
    await chrome.tabs.update(tabId, { active: true });
  } catch (_error) {
    // Activation is best-effort; keep going even when the tab cannot be focused.
  }
  lastQueryButtonFound = null;
  let clicked = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await delay(1500);
    const headers = await ensureAuthHeaders(tabId, apiOrigin);
    if (headers) return headers;
    if (attempt >= 1) {
      clicked = (await clickPageQueryButton(tabId)) || clicked;
    }
  }
  const fallback = clicked ? await ensureAuthHeaders(tabId, apiOrigin) : null;
  if (fallback || !targetUrl) return fallback;
  // Final phase: explicit navigation to the target route (useful when the tab
  // idled on a different page of the same admin). With the boot hook still
  // registered, the route's default query fires through the hook.
  try {
    await chrome.tabs.update(tabId, { url: targetUrl, active: true });
    await waitForTabComplete(tabId);
  } catch (_error) {
    return fallback;
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await delay(1500);
    const headers = await ensureAuthHeaders(tabId, apiOrigin);
    if (headers) return headers;
  }
  return null;
}

function safeOriginPattern(value) {
  try {
    return `${new URL(value).origin}/*`;
  } catch (_error) {
    return null;
  }
}

async function probePageState(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        return {
          title: document.title,
          readyState: document.readyState,
          buttonCount: document.querySelectorAll('button').length,
          inputCount: document.querySelectorAll('input').length,
          hasPasswordInput: Boolean(document.querySelector('input[type=password]')),
          iframeCount: document.querySelectorAll('iframe').length,
          bodySnippet: String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160)
        };
      }
    });
    return result || null;
  } catch (_error) {
    return null;
  }
}

async function clickPageQueryButton(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const patterns = [/查\s*询/, /搜\s*索/, /^search$/i];
        const target = Array.from(document.querySelectorAll('button')).find((button) => {
          const text = (button.textContent || '').trim();
          return text && !button.disabled && patterns.some((pattern) => pattern.test(text));
        });
        if (!target) return false;
        target.click();
        return true;
      }
    });
    lastQueryButtonFound = lastQueryButtonFound === null ? Boolean(result) : lastQueryButtonFound || Boolean(result);
    return Boolean(result);
  } catch (_error) {
    return false;
  }
}

async function fetchViaServiceWorker(request) {
  try {
    const headers = { ...(request.headers || {}) };
    if (request.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(request.url, {
      method: request.method || 'GET',
      credentials: request.credentials || 'include',
      headers,
      ...(request.body ? { body: request.body } : {})
    });
    return {
      ok: response.ok,
      status: response.status,
      responseText: await response.text()
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function sanitizeLearnedHeaders(headers) {
  const clean = {};
  for (const [key, value] of Object.entries(headers || {})) {
    try {
      new Headers({ [key]: value });
      clean[key] = value;
    } catch (_error) {
      // Drop headers whose learned name/value cannot be replayed.
    }
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

async function installAuthHeaderHook(config) {
  const w = window;
  const skipHeaders = [
    'content-type', 'content-length', 'host', 'origin', 'referer',
    'user-agent', 'accept', 'accept-language', 'accept-encoding',
    'connection', 'cookie', 'sec-ch-ua', 'sec-ch-ua-mobile',
    'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site'
  ];
  if (!w.__flowmindAuthHook) {
    w.__flowmindAuthHook = { origin: config.apiOrigin, headers: null, at: 0 };
    const matches = (url) => {
      try {
        return new URL(url, location.href).origin === config.apiOrigin;
      } catch (_error) {
        return false;
      }
    };
    const record = (headers) => {
      const clean = {};
      for (const [key, value] of Object.entries(headers || {})) {
        const lower = String(key).toLowerCase();
        if (skipHeaders.includes(lower)) continue;
        clean[lower] = Array.isArray(value) ? value.join(', ') : String(value);
      }
      if (Object.keys(clean).length > 0) {
        w.__flowmindAuthHook.headers = clean;
        w.__flowmindAuthHook.at = Date.now();
      }
    };
    const originalFetch = w.fetch;
    w.fetch = function flowmindAuthFetch(input, init = {}) {
      try {
        const url = input instanceof Request ? input.url : String(input);
        if (matches(url)) {
          const headers = {};
          if (input instanceof Request) {
            input.headers.forEach((value, key) => {
              headers[key] = value;
            });
          }
          const initHeaders = init.headers;
          if (initHeaders) {
            if (typeof initHeaders.forEach === 'function') {
              initHeaders.forEach((value, key) => {
                headers[key] = value;
              });
            } else if (typeof initHeaders === 'object') {
              Object.assign(headers, initHeaders);
            }
          }
          record(headers);
        }
      } catch (_error) {
        // Header learning must never break the page's own requests.
      }
      return originalFetch.apply(this, arguments);
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function flowmindAuthOpen(method, url) {
      this.__flowmindUrl = String(url);
      this.__flowmindHeaders = {};
      return originalOpen.apply(this, arguments);
    };
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function flowmindAuthSetHeader(key, value) {
      try {
        if (!this.__flowmindHeaders) this.__flowmindHeaders = {};
        this.__flowmindHeaders[key] = value;
        if (matches(this.__flowmindUrl)) {
          record(this.__flowmindHeaders);
        }
      } catch (_error) {
        // Ignore malformed header usage.
      }
      return originalSetRequestHeader.apply(this, arguments);
    };
  }
  const hook = w.__flowmindAuthHook;
  const fresh = hook.headers && Date.now() - hook.at < config.maxAgeMs;
  return { headers: fresh ? hook.headers : null };
}

async function pageFetchOnce(request) {
  try {
    const headers = { ...(request.headers || {}) };
    if (request.body) headers['Content-Type'] = 'application/json';
    const response = await window.fetch(request.url, {
      method: request.method || 'GET',
      credentials: request.credentials || 'include',
      headers,
      ...(request.body ? { body: request.body } : {})
    });
    return {
      ok: response.ok,
      status: response.status,
      responseText: await response.text()
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error)
    };
  }
}

async function injectPageInterceptor(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['page-interceptor.js'],
    world: 'MAIN'
  });
}

function buildContentMessage(task) {
  if (task.kind === 'service-management-log-bind') {
    return {
      type: 'flowmind-service-management-log-bind',
      task
    };
  }
  return {
    type: 'flowmind-service-management-log-query',
    task
  };
}

async function ensureTargetPermission(config, target = {}) {
  const targetUrl = target.url;
  if (!targetUrl) {
    throw new Error('Target page URL is not configured');
  }
  const originPattern = toOriginPattern(targetUrl);
  const configured = String(config.targetOrigins || '')
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const origins = [...new Set([originPattern, ...configured])];
  const granted = await chrome.permissions.contains({ origins });
  if (granted) return;

  throw new Error(`Browser permission is required for ${originPattern}. Open the extension options and grant this origin.`);
}

async function resolveTargetTab(target = {}) {
  const targetUrl = target.url;
  if (!targetUrl) {
    throw new Error('Target page URL is not configured');
  }

  const tabs = await chrome.tabs.query({});
  const matching = tabs.filter((tab) => tab.url && sameOriginPath(tab.url, targetUrl));
  // Prefer the tab the user is actually looking at (most likely the freshly
  // logged-in one), then the most recently opened match, so a stale login
  // page sitting on the same URL does not shadow the usable tab.
  const sameUrlTab = matching.find((tab) => tab.active) || matching[matching.length - 1];
  const tab = sameUrlTab || await chrome.tabs.create({ url: targetUrl, active: false });
  lastTargetTabUrl = tab.url || targetUrl;

  if (!sameUrlTab || tab.status !== 'complete') {
    await waitForTabComplete(tab.id);
  }

  return chrome.tabs.get(tab.id);
}

async function sendToContentScript(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js']
    });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

async function postResult(config, result) {
  await fetch(`${trimSlash(config.bridgeUrl)}/extension/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-FlowMind-Token': config.token
    },
    body: JSON.stringify(result)
  });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Timed out waiting for target page to load'));
    }, 30000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sameOriginPath(current, target) {
  try {
    const a = new URL(current);
    const b = new URL(target);
    if (a.origin !== b.origin || a.pathname !== b.pathname) return false;
    if (b.hash && a.hash !== b.hash) return false;
    return true;
  } catch (_error) {
    return false;
  }
}

function trimSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

function toOriginPattern(value) {
  const url = new URL(value);
  return `${url.origin}/*`;
}

function assertSameOriginApi(targetUrl, apiUrl) {
  if (!targetUrl || !apiUrl) throw new Error('Target URL and API URL are required');
  const target = new URL(targetUrl);
  const api = new URL(apiUrl, targetUrl);
  if (!['https:', 'http:'].includes(target.protocol) || !['https:', 'http:'].includes(api.protocol)) {
    throw new Error('Configured target and API URLs must use HTTP or HTTPS');
  }
}

function buildApiRequest(plan) {
  const map = plan.api.parameterMap || {};
  const filters = plan.filters || {};
  const params = {};
  for (const [source, target] of Object.entries(map)) {
    if (filters[source] !== undefined && filters[source] !== null && filters[source] !== '') {
      setPath(params, target, filters[source]);
    }
  }
  if (map.page && getPath(params, map.page) === undefined) setPath(params, map.page, 1);
  if (map.pageSize && getPath(params, map.pageSize) === undefined) setPath(params, map.pageSize, plan.pagination?.pageSize || 50);

  const method = String(plan.api.method || 'POST').toUpperCase();
  if (method === 'GET') {
    const url = new URL(plan.api.url);
    const mappedTargets = new Set(
      Object.values(map)
        .filter(Boolean)
        .map((target) => String(target).split('.')[0])
    );
    for (const key of new Set(url.searchParams.keys())) {
      if (mappedTargets.has(key)) {
        url.searchParams.delete(key);
      }
    }
    for (const [key, value] of Object.entries(flattenObject(params))) {
      url.searchParams.set(key, value === undefined || value === null ? '' : String(value));
    }
    return {
      url: url.toString(),
      body: null,
      params
    };
  }

  return {
    url: plan.api.url,
    body: mergeTemplate(plan.api.bodyTemplate, params),
    params
  };
}

function setPath(object, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  if (keys.length === 0) return;
  let current = object;
  for (const key of keys.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function mergeTemplate(template, params) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return params;
  return deepMerge(JSON.parse(JSON.stringify(template)), params);
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = deepMerge(
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key]) ? target[key] : {},
        value
      );
    } else {
      target[key] = value;
    }
  }
  return target;
}

function flattenObject(value, prefix = '', output = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenObject(child, path, output);
    } else {
      output[path] = child;
    }
  }
  return output;
}

function applySemanticFilters(records, filters, supportedFilters = []) {
  const unsupported = [];
  if (filters.operationContent && !supportedFilters.includes('operationContent')) unsupported.push(filters.operationContent);
  if (filters.productName && !supportedFilters.includes('productName')) unsupported.push(filters.productName);
  if (filters.productId && !supportedFilters.includes('keyword')) unsupported.push(filters.productId);
  if (filters.keyword && !supportedFilters.includes('keyword')) unsupported.push(filters.keyword);
  if (filters.resourceName && !supportedFilters.includes('resourceName')) unsupported.push(filters.resourceName);

  const serverFilteredValues = new Set(
    ['storeId', 'resourceName', 'operator', 'accountId', 'ip', 'requestPath']
      .filter((key) => supportedFilters.includes(key) && filters[key] !== undefined && filters[key] !== null)
      .map((key) => String(filters[key]).toLowerCase())
  );
  const terms = unsupported
    .filter(Boolean)
    .map((term) => String(term).toLowerCase())
    .filter((term) => !serverFilteredValues.has(term));
  if (terms.length === 0) return records;
  return records.filter((record) => {
    const text = JSON.stringify(record).toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

function normalizeRecord(record, fieldMap = {}) {
  // Keep the raw API fields underneath the normalized ones so unknown
  // date/detail columns are not lost before the skill can map them.
  return {
    ...record,
    systemName: first(mapped(record, fieldMap.systemName), record.systemName, record['系统名称']),
    resourceName: first(mapped(record, fieldMap.resourceName), record.resourceName, record['资源名称']),
    operationContent: first(mapped(record, fieldMap.operationContent), record.operationContent, record['操作内容']),
    accountId: first(mapped(record, fieldMap.accountId), record.accountId, record['操作账号ID']),
    operator: first(mapped(record, fieldMap.operator), record.operator, record['操作人']),
    operationDate: first(mapped(record, fieldMap.operationDate), record.operationDate, record['操作日期']),
    requestPath: first(mapped(record, fieldMap.requestPath), record.requestPath, record['请求路径']),
    requestParams: first(mapped(record, fieldMap.requestParams), record.requestParams, record['请求参数']),
    responseParams: first(mapped(record, fieldMap.responseParams), record.responseParams, record['返回参数']),
    ip: first(mapped(record, fieldMap.ip), record.ip, record.IP, record['IP']),
    linkIp: first(mapped(record, fieldMap.linkIp), record.linkIp, record.linkIP, record['linkIP'])
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function mapped(record, path) {
  return path ? getPath(record, path) : undefined;
}

function getPath(object, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((current, key) => current?.[key], object);
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
