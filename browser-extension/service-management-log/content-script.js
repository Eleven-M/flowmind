chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'flowmind-service-management-log-bind') {
    runBind(message.task)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type !== 'flowmind-service-management-log-query') return;

  runQuery(message.task)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ records: [], error: error.message }));
  return true;
});

let bindInterceptorInstalled = false;

async function runBind(task) {
  if (location.href.includes('/login') || document.querySelector('input[type="password"]')) {
    throw new Error('need-login: please sign in to the service management console in this browser');
  }

  const timeoutMs = Number(task.payload?.timeoutMs || 120000);
  showBindPrompt();
  installBindInterceptor();
  resetBindCaptureState();
  const capture = await waitForBindCapture(timeoutMs);
  updateBindPrompt('已捕获查询请求，正在生成本地绑定配置...');

  const responseJson = parseJson(capture.responseText) || {};
  const recordPath = findFirstArrayPath(responseJson);
  const records = recordPath ? getPath(responseJson, recordPath) : [];
  const sampleRecord = Array.isArray(records) ? records[0] : null;

  const result = {
    api: {
      url: stripHash(capture.url),
      method: capture.method || 'GET',
      credentials: 'include',
      ...(capture.bodyTemplate ? { bodyTemplate: capture.bodyTemplate } : {}),
      parameterMap: inferParameterMap(capture.params || {}, capture.formFields || []),
      responsePath: {
        ...(recordPath ? { records: recordPath } : {}),
        ...inferTotalPath(responseJson)
      },
      fieldMap: inferFieldMap(sampleRecord, readVisibleTableRows()[0] || {})
    },
    diagnostics: {
      capturedMethod: capture.method,
      capturedParamKeys: Object.keys(capture.params || {}),
      formFieldCount: (capture.formFields || []).length,
      hasJsonResponse: !!parseJson(capture.responseText)
    }
  };
  updateBindPrompt('绑定已完成，配置已发送给 FlowMind 保存。');
  setTimeout(hideBindPrompt, 2500);
  return result;
}

function installBindInterceptor() {
  if (bindInterceptorInstalled) return;
  bindInterceptorInstalled = true;
}

function resetBindCaptureState() {
  window.postMessage({ type: 'flowmind-service-management-log-reset-capture' }, '*');
}

function waitForBindCapture(timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', listener);
      hideBindPrompt();
      reject(new Error('Timed out waiting for a log query request. Please click 查询 once on the logged-in page.'));
    }, timeoutMs);

    function listener(event) {
      if (event.source !== window || event.data?.type !== 'flowmind-service-management-log-captured') return;
      clearTimeout(timeout);
      window.removeEventListener('message', listener);
      updateBindPrompt('已捕获查询请求，正在解析返回数据...');
      resolve(event.data.capture || {});
    }

    window.addEventListener('message', listener);
  });
}

async function runQuery(task) {
  const payload = task.payload || {};
  const plan = payload.plan || {};

  if (location.href.includes('/login') || document.querySelector('input[type="password"]')) {
    throw new Error('need-login: please sign in to the service management console in this browser');
  }

  if (plan.mode === 'api' && plan.api?.url) {
    return queryViaPageApi(plan);
  }

  return queryViaDom(plan);
}

async function queryViaPageApi(plan) {
  const request = buildApiRequest(plan);
  const response = await fetch(request.url, {
    method: plan.api.method || 'POST',
    credentials: plan.api.credentials || 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    ...(request.body ? { body: JSON.stringify(request.body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Page API failed: HTTP ${response.status}`);
  }
  const configuredRecords = getPath(payload, plan.api.responsePath?.records);
  const records = configuredRecords || payload.records || payload.data?.records || [];
  const total = getPath(payload, plan.api.responsePath?.total) || payload.total || payload.data?.total || records.length;
  const supportedFilters = Object.keys(plan.api.parameterMap || {});
  const normalized = Array.isArray(records) ? records.map((record) => normalizeRecord(record, plan.api.fieldMap || {})) : [];
  const filtered = applySemanticFilters(normalized, plan.filters || {}, supportedFilters);
  return {
    records: filtered,
    pageInfo: { total, rawCount: normalized.length },
    diagnostics: {
      mode: 'configured-page-api',
      supportedFilters,
      requestParamKeys: Object.keys(request.params || {}),
      responseRecordsPath: plan.api.responsePath?.records || null,
      responseRecordsPathMatched: Array.isArray(configuredRecords),
      semanticFilteredCount: filtered.length,
      rawCount: normalized.length
    }
  };
}

async function queryViaDom(plan) {
  const selectors = plan.selectors || {};
  const diagnostics = {
    pageUrl: location.href,
    filled: {},
    queryButtonClicked: false
  };

  diagnostics.filled.resourceName = fillField(selectors.resourceNameInput, ['资源名称', '资源', 'resourceName'], plan.filters?.resourceName);
  diagnostics.filled.operationContent = fillField(selectors.operationContentInput, ['操作内容', '操作', 'operationContent'], plan.filters?.operationContent);
  diagnostics.filled.from = fillField(selectors.fromInput, ['开始时间', '起始时间', '操作日期', '开始日期', 'startTime'], plan.filters?.from);
  diagnostics.filled.to = fillField(selectors.toInput, ['结束时间', '结束日期', 'endTime'], plan.filters?.to);
  diagnostics.filled.operator = fillField(selectors.operatorInput, ['操作人', 'operator'], plan.filters?.operator);
  diagnostics.filled.accountId = fillField(selectors.accountIdInput, ['操作账号ID', '账号ID', 'accountId'], plan.filters?.accountId);
  diagnostics.filled.requestPath = fillField(selectors.requestPathInput, ['请求路径', 'requestPath'], plan.filters?.requestPath);

  const keywordSelector = selectors.keywordInput || selectors.requestParamsInput;
  diagnostics.filled.keyword = fillField(keywordSelector, ['请求参数', '参数', '门店', '店铺', 'storeId', 'keyword'], plan.filters?.keyword || plan.filters?.storeId);

  const button = selectors.queryButton ? queryElement(selectors.queryButton) : findButtonByText(['查询', '搜索', 'Search']);
  if (button) {
    button.click();
    diagnostics.queryButtonClicked = true;
    await delay(2000);
  }

  return {
    records: readTableRecords(selectors, plan.columns || {}),
    pageInfo: {},
    diagnostics
  };
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
    const url = new URL(plan.api.url, location.href);
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

function applySemanticFilters(records, filters, supportedFilters = []) {
  const unsupported = [];
  if (filters.operationContent && !supportedFilters.includes('operationContent')) {
    unsupported.push(filters.operationContent);
  }
  if (filters.productName && !supportedFilters.includes('productName')) {
    unsupported.push(filters.productName);
  }
  if (filters.productId && !supportedFilters.includes('keyword')) {
    unsupported.push(filters.productId);
  }
  if (filters.keyword && !supportedFilters.includes('keyword')) {
    unsupported.push(filters.keyword);
  }
  if (filters.resourceName && !supportedFilters.includes('resourceName')) {
    unsupported.push(filters.resourceName);
  }

  const terms = unsupported.filter(Boolean).map((term) => String(term).toLowerCase());
  if (terms.length === 0) return records;
  return records.filter((record) => {
    const text = JSON.stringify(record).toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

function fillIfPresent(selector, value) {
  if (!selector || value === undefined || value === null) return false;
  const element = queryElement(selector);
  if (!element) return false;
  element.focus();
  setNativeValue(element, String(value));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.blur();
  return true;
}

function queryElement(selector) {
  if (!selector) return null;
  const textSelector = parseHasTextSelector(selector);
  if (textSelector) {
    const candidates = Array.from(document.querySelectorAll(textSelector.baseSelector || '*'));
    return candidates.find((element) => element.textContent.trim().includes(textSelector.text)) || null;
  }
  try {
    return document.querySelector(selector);
  } catch (_error) {
    return null;
  }
}

function parseHasTextSelector(selector) {
  const match = String(selector).match(/^(.*?)\s*:has-text\((['"])(.*?)\2\)\s*$/);
  if (!match) return null;
  return {
    baseSelector: match[1].trim() || '*',
    text: match[3]
  };
}

function fillField(selector, labels, value) {
  if (value === undefined || value === null || value === '') return false;
  if (selector && fillIfPresent(selector, value) !== false) return true;
  const element = findInputByLabels(labels);
  if (!element) return false;
  element.focus();
  setNativeValue(element, String(value));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
  element.blur();
  return true;
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

function findInputByLabels(labels) {
  const fields = Array.from(document.querySelectorAll('input, textarea'));
  for (const field of fields) {
    const text = [
      field.name,
      field.id,
      field.getAttribute('placeholder'),
      field.getAttribute('aria-label'),
      nearestText(field)
    ].filter(Boolean).join(' ');
    if (labels.some((label) => text.includes(label))) {
      return field;
    }
  }
  return null;
}

function nearestText(element) {
  const formItem = element.closest('.el-form-item, .ant-form-item, .form-item, label, [class*="form"]');
  return formItem ? formItem.textContent.trim() : '';
}

function findButtonByText(labels) {
  return Array.from(document.querySelectorAll('button, [role="button"], .el-button, .ant-btn')).find((button) => {
    const text = button.textContent.trim();
    return labels.some((label) => text.includes(label));
  }) || null;
}

function readTableRecords(selectors, columns) {
  const rows = Array.from(document.querySelectorAll(selectors.tableRows || 'table tbody tr'));
  const headers = Array.from(document.querySelectorAll('table thead th')).map((item) => item.textContent.trim());
  const reverseColumns = Object.fromEntries(Object.entries(columns).map(([key, label]) => [label, key]));

  return rows.map((row) => {
    const cells = Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent.trim());
    const record = {};
    cells.forEach((value, index) => {
      const label = headers[index];
      const key = reverseColumns[label] || label || `col${index}`;
      record[key] = value;
    });
    return normalizeRecord(record);
  });
}

function readVisibleTableRows() {
  const rows = Array.from(document.querySelectorAll('table tbody tr'));
  const headers = Array.from(document.querySelectorAll('table thead th')).map((item) => item.textContent.trim());
  return rows.map((row) => {
    const cells = Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent.trim());
    const record = {};
    cells.forEach((value, index) => {
      const key = normalizeColumnName(headers[index]);
      if (key) record[key] = value;
    });
    return record;
  });
}

function inferParameterMap(params, formFields) {
  const map = {};
  const paramEntries = Object.entries(params || {});
  for (const field of formFields || []) {
    const sourceKey = normalizeFilterName(field.label);
    if (!sourceKey) continue;
    const match = paramEntries.find(([_key, value]) => sameValue(value, field.value));
    if (match) map[sourceKey] = match[0];
  }
  for (const key of Object.keys(params || {})) {
    if (!map.page && sameValue(params[key], '1') && /page/i.test(key)) map.page = key;
    if (!map.pageSize && /size|limit/i.test(key)) map.pageSize = key;
  }
  return map;
}

function inferFieldMap(sampleRecord, visibleRow) {
  if (!sampleRecord || typeof sampleRecord !== 'object') return {};
  const flattened = flattenObject(sampleRecord);
  const map = {};
  for (const [normalizedKey, visibleValue] of Object.entries(visibleRow || {})) {
    if (!visibleValue) continue;
    const match = Object.entries(flattened).find(([_path, value]) => sameValue(value, visibleValue));
    if (match) map[normalizedKey] = match[0];
  }
  return map;
}

function inferTotalPath(payload) {
  const flattened = flattenObject(payload);
  const match = Object.entries(flattened).find(([path, value]) => {
    return /total|count/i.test(path) && Number.isFinite(Number(value));
  });
  return match ? { total: match[0] } : {};
}

function findFirstArrayPath(value, prefix = '') {
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
    return prefix;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    const found = findFirstArrayPath(child, prefix ? `${prefix}.${key}` : key);
    if (found) return found;
  }
  return null;
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

function normalizeFilterName(label) {
  const text = String(label || '');
  if (/资源名称|resource/i.test(text)) return 'resourceName';
  if (/操作内容|operation.*content/i.test(text)) return 'operationContent';
  if (/开始|起始|from|start/i.test(text)) return 'from';
  if (/结束|to|end/i.test(text)) return 'to';
  if (/操作人|operator/i.test(text)) return 'operator';
  if (/账号|account/i.test(text)) return 'accountId';
  if (/请求参数|参数|keyword/i.test(text)) return 'keyword';
  if (/门店|店铺|store/i.test(text)) return 'storeId';
  if (/请求路径|path/i.test(text)) return 'requestPath';
  if (/ip/i.test(text)) return 'ip';
  return null;
}

function normalizeColumnName(label) {
  const text = String(label || '');
  if (/系统名称/.test(text)) return 'systemName';
  if (/资源名称/.test(text)) return 'resourceName';
  if (/操作内容/.test(text)) return 'operationContent';
  if (/操作账号ID|账号ID/.test(text)) return 'accountId';
  if (/操作人/.test(text)) return 'operator';
  if (/操作日期|操作时间/.test(text)) return 'operationDate';
  if (/请求路径/.test(text)) return 'requestPath';
  if (/请求参数/.test(text)) return 'requestParams';
  if (/返回参数/.test(text)) return 'responseParams';
  if (/^IP$/i.test(text)) return 'ip';
  if (/linkIP/i.test(text)) return 'linkIp';
  return null;
}

function sameValue(left, right) {
  return String(left ?? '').trim() === String(right ?? '').trim();
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function stripHash(value) {
  const url = new URL(value, location.href);
  url.hash = '';
  return url.toString();
}

function showBindPrompt() {
  let prompt = document.querySelector('#flowmind-bind-prompt');
  if (!prompt) {
    prompt = document.createElement('div');
    prompt.id = 'flowmind-bind-prompt';
    prompt.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'top:16px',
      'left:50%',
      'transform:translateX(-50%)',
      'max-width:720px',
      'padding:12px 16px',
      'background:#111827',
      'color:#fff',
      'border-radius:6px',
      'box-shadow:0 8px 24px rgba(0,0,0,.24)',
      'font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,sans-serif'
    ].join(';');
    document.documentElement.appendChild(prompt);
  }
  prompt.textContent = 'FlowMind 正在绑定日志查询：请设置筛选条件并点击一次“查询”。捕获完成后会自动保存到本地配置。';
}

function updateBindPrompt(text) {
  const prompt = document.querySelector('#flowmind-bind-prompt');
  if (prompt) prompt.textContent = text;
}

function hideBindPrompt() {
  document.querySelector('#flowmind-bind-prompt')?.remove();
}

function normalizeRecord(record, fieldMap = {}) {
  return {
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

function mapped(record, path) {
  return path ? getPath(record, path) : undefined;
}

function getPath(object, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((current, key) => current?.[key], object);
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

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
