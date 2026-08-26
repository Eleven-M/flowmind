/**
 * Enrichment for service management operation logs.
 *
 * Operation log records carry opaque entity IDs inside requestParams /
 * responseParams (for example product IDs of takeout menus or retail goods).
 * This module resolves those IDs to human-readable names through configured
 * MCP data sources (DMS by default), then renders a customer-service
 * readable report.
 *
 * All bindings (MCP transport URLs, database IDs, table names, field names)
 * come from user-local skill config; nothing is hard-coded here.
 */

const { McpSseClient, callMcpToolForServer } = require('../../core/mcp-sse-client');

const DEFAULT_ID_PATTERN = '\\d{17,25}';
const DEFAULT_MAX_IDS = 100;
const DEFAULT_BATCH_SIZE = 20;
const STATUS_TOKEN_PATTERN = /[（(]\s*(?:狀態|状态)\s*[）)]\s*[^"'，,、\]})]{1,16}/g;
const SAFE_ID = /^[0-9A-Za-z_-]{1,64}$/;
const SAFE_FIELD = /^[0-9A-Za-z_.]{1,64}$/;
// Payload keys that carry account/business IDs (not product entities).
const DEFAULT_EXCLUDE_KEYS = [
  'businessId', 'businessid', 'business_id',
  'bid',
  'storeId', 'storeid', 'store_id',
  'accountId', 'accountid', 'account_id',
  'userId', 'userid', 'user_id',
  'operatorId', 'operatorid', 'operator_id',
  'merchantId', 'merchantid', 'merchant_id',
  'shopId', 'shopid', 'shop_id',
  'skuId', 'skuid', 'sku_id',
  'optAccount', 'opt_account'
];
// Human-readable labels for common product update payload fields.
const FIELD_LABELS = {
  name: '名称', menuname: '名称', title: '标题', aliasname: '别名',
  price: '价格', newprice: '新价格', oldprice: '原价格', minprice: '最低价', activityprice: '活动价',
  description: '描述', des: '描述', detail: '详情', content: '内容',
  status: '状态', soldout: '售罄', stock: '库存', sequence: '排序', sort: '排序',
  unit: '单位', picurl: '图片', recommend: '推荐', special: '力荐', tag: '标签', tags: '标签',
  minsale: '起售量', maxbuy: '限购',
  autoonsaletype: '自动上下架', autorestsale: '自动补货', saletimes: '可售时间',
  excludehotsales: '热卖分类', excludenewproduct: '新品分类',
  comboflag: '商品类型', salelimitflag: '售卖方式',
  begintime: '开始时间', endtime: '结束时间'
};
// Keys never shown as change content (id references, account/session fields).
const CHANGE_SKIP_KEYS = new Set([
  ...DEFAULT_EXCLUDE_KEYS,
  'ids', 'id', 'menuId', 'menu_id',
  'authType', 'type', 'state', 'userName', 'loginType', 'deviceType'
]);
// Objects carrying any of these keys are account/session context, never products.
const ACCOUNT_OBJECT_MARKERS = [
  'authType', 'loginId', 'orgId', 'businessId', 'userName', 'optName', 'bid', 'loginType', 'deviceType'
];
// Technical payload fields hidden from the customer-service change summary.
const CHANGE_NOISE_KEYS = new Set([
  'foodType', 'menuTypes', 'infoDisplayType', 'isMultiSku', 'enName', 'aliasName',
  'weight', 'typeId', 'categoryId', 'category_id', 'storeId', 'store_id'
]);
// Keys whose values reference entity IDs.
const REFERENCE_KEY = /^(id|ids|menu_?id|menu_?ids|productId|product_?ids)$/i;

async function enrichRecords({ records = [], params = {}, settings = {}, context = {} } = {}) {
  const productConfig = resolveLookupConfig(settings.enrichment || {}, 'productLookup');
  const activityConfig = resolveLookupConfig(settings.enrichment || {}, 'activityLookup');
  const diagnostics = {
    enabled: Boolean(productConfig || activityConfig),
    requestedIds: 0,
    resolvedProducts: 0,
    productSources: [],
    resolvedActivities: 0,
    error: null
  };

  const idPattern = productConfig?.idPattern || activityConfig?.idPattern || DEFAULT_ID_PATTERN;
  const excludeKeys = resolveExcludeKeys(settings.enrichment || {});
  const entries = records.map((record) => {
    const text = recordText(record);
    return {
      record,
      ids: [
        ...extractIdsFromJsonText(stringifyMaybe(record.requestParams), idPattern, excludeKeys),
        ...extractIdsFromJsonText(stringifyMaybe(record.responseParams), idPattern, excludeKeys),
        ...extractEntityIds(`${record.operationContent || ''} ${record.resourceName || ''}`, idPattern)
      ],
      changeSets: extractChangeSets(stringifyMaybe(record.requestParams), idPattern, excludeKeys, settings),
      statusTokens: extractStatusTokens(text)
    };
  });

  if (!diagnostics.enabled) {
    return {
      productMap: {},
      activityMap: {},
      csReport: buildCsReport({ entries, productMap: {}, activityMap: {}, params, diagnostics }),
      diagnostics
    };
  }

  const ids = [...new Set(entries.flatMap((entry) => entry.ids))].slice(0, (productConfig || activityConfig).maxIds || DEFAULT_MAX_IDS);
  diagnostics.requestedIds = ids.length;

  let productMap = {};
  let activityMap = {};
  if (ids.length === 0) {
    return { productMap, activityMap, csReport: buildCsReport({ entries, productMap, activityMap, params, diagnostics }), diagnostics };
  }

  const caller = resolveCaller(productConfig || activityConfig, context);
  try {
    if (productConfig) {
      const outcome = await resolveChain(ids, productConfig, caller);
      productMap = outcome.map;
      diagnostics.productSources = outcome.sources;
      diagnostics.resolvedProducts = Object.keys(productMap).length;
    }
    if (activityConfig) {
      const remaining = ids.filter((id) => Boolean(productMap[id]));
      const activityIds = (productConfig ? remaining : ids).slice(0, activityConfig.maxIds || DEFAULT_MAX_IDS);
      if (activityIds.length > 0) {
        const outcome = await resolveChain(activityIds, activityConfig, caller);
        activityMap = outcome.map;
        diagnostics.resolvedActivities = Object.keys(activityMap).length;
      }
    }
  } catch (error) {
    diagnostics.error = error.message || String(error);
  } finally {
    await caller.close().catch(() => {});
  }

  for (const entry of entries) {
    if (entry.ids.length > 0) {
      entry.record.products = entry.ids.map((id) => ({
        id,
        name: productMap[id]?.name || null,
        source: productMap[id]?.source || null,
        activity: activityMap[id] ? summarizeActivity(activityMap[id]) : null
      }));
    }
  }

  return { productMap, activityMap, csReport: buildCsReport({ entries, productMap, activityMap, params, diagnostics }), diagnostics };
}

function resolveLookupConfig(enrichment, key) {
  const lookup = enrichment[key];
  if (!lookup || lookup.enabled === false) return null;
  const serverName = lookup.mcpServer || 'aliyun-dms-mcp-server';
  const server = (enrichment.mcpServers || {})[serverName];
  if (!server?.url) return null;
  const sources = normalizeSources(lookup);
  if (sources.length === 0) return null;
  return {
    kind: key,
    provider: (lookup.provider || 'dms').toLowerCase(),
    serverName,
    server,
    sources,
    idPattern: lookup.idPattern || DEFAULT_ID_PATTERN,
    maxIds: lookup.maxIds || DEFAULT_MAX_IDS,
    batchSize: lookup.batchSize || DEFAULT_BATCH_SIZE,
    statusMaps: Object.fromEntries(sources.map((source) => [source.name, source.statusMap || {}]))
  };
}

function normalizeSources(lookup) {
  const list = Array.isArray(lookup.sources)
    ? lookup.sources
    : lookup.databaseId || lookup.table
      ? [lookup]
      : [];
  return list
    .filter((source) => source.databaseId && source.table)
    .map((source, index) => ({
      name: source.name || `source-${index}`,
      databaseId: String(source.databaseId),
      table: source.table,
      idField: source.idField || 'ID',
      nameField: source.nameField || null,
      extraFields: Array.isArray(source.extraFields) ? source.extraFields.filter(Boolean) : [],
      statusMap: source.statusMap && typeof source.statusMap === 'object' ? source.statusMap : {},
      labelField: source.labelField || null
    }));
}

function resolveCaller(config, context) {
  if (typeof context.enrichmentClient?.callTool === 'function') {
    return {
      callTool: (tool, args) => context.enrichmentClient.callTool(tool, args),
      close: async () => {}
    };
  }
  const type = String(config.server.type || '').toLowerCase();
  if (config.provider === 'dms' || type === 'sse' || /\/sse\/?(\?.*)?$/.test(config.server.url || '')) {
    const client = new McpSseClient({ url: config.server.url, headers: config.server.headers || {} });
    return {
      callTool: (tool, args) => client.callTool(tool, args),
      close: async () => client.close()
    };
  }
  return {
    callTool: (tool, args) => callMcpToolForServer(config.server, tool, args, { serverName: config.serverName }),
    close: async () => {}
  };
}

async function resolveChain(ids, config, caller) {
  const map = {};
  const sources = [];
  let remaining = [...ids];
  for (const source of config.sources) {
    if (remaining.length === 0) break;
    for (const batch of chunk(remaining, config.batchSize)) {
      const script = buildLookupScript(batch, source);
      const toolName = config.provider === 'dms' ? 'executeScript' : (config.toolName || 'executeScript');
      const result = await caller.callTool(toolName, {
        database_id: source.databaseId,
        script
      });
      const rows = parseToolRows(result);
      for (const row of rows) {
        const id = row[source.idField] ?? row[source.idField.toLowerCase()] ?? row[source.idField.toUpperCase()];
        if (!id || map[id]) continue;
        map[id] = normalizeProductRow(row, source);
      }
    }
    const resolved = remaining.filter((id) => map[id]);
    if (resolved.length > 0) sources.push({ source: source.name, resolved: resolved.length });
    remaining = remaining.filter((id) => !map[id]);
  }
  return { map, sources };
}

function buildLookupScript(ids, source) {
  const safeIds = ids.map((id) => (SAFE_ID.test(id) ? `'${id}'` : null)).filter(Boolean);
  if (safeIds.length === 0) throw new Error('No safe entity IDs to query');
  const fields = [source.idField, source.nameField, ...source.extraFields]
    .filter(Boolean)
    .map((field) => (SAFE_FIELD.test(field) ? field : null))
    .filter(Boolean);
  if (fields.length === 0) throw new Error('No safe lookup fields configured');
  return `SELECT ${fields.join(', ')} FROM ${source.table} WHERE ${source.idField} IN (${safeIds.join(', ')})`;
}

function normalizeProductRow(row, source) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = row[key] ?? row[String(key).toLowerCase()] ?? row[String(key).toUpperCase()];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  };
  const statusMap = source.statusMap || {};
  const rawStatus = pick('STATUS', 'status');
  return {
    id: pick(source.idField),
    name: source.nameField ? pick(source.nameField, 'NAME', 'name') : null,
    storeId: pick('STORE_ID', 'store_id'),
    price: pick('PRICE', 'price', 'min_price', 'MIN_PRICE'),
    status: rawStatus,
    statusText: statusMap[String(rawStatus)] || rawStatus,
    soldout: pick('SOLDOUT', 'soldout'),
    isDeleted: pick('IS_DELETED', 'is_delete', 'IS_DELETE'),
    activityPrice: pick('activity_price', 'ACTIVITY_PRICE'),
    discountRate: pick('discount_rate', 'DISCOUNT_RATE'),
    state: pick('state', 'STATE'),
    beginDate: pick('begin_date', 'BEGIN_DATE'),
    endDate: pick('end_date', 'END_DATE'),
    source: source.name,
    raw: row
  };
}

function parseToolRows(result) {
  const text = extractResultText(result);
  if (!text) return [];
  const parsed = safeJsonParse(text);
  const table = parsed && typeof parsed.result === 'string'
    ? parsed.result
    : typeof parsed === 'string'
      ? parsed
      : text;
  return parseMarkdownTable(table);
}

function extractResultText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  const content = result.content || result.result?.content;
  if (Array.isArray(content)) {
    return content.map((item) => (typeof item === 'string' ? item : item?.text || '')).join('\n');
  }
  if (typeof result.text === 'string') return result.text;
  return '';
}

function parseMarkdownTable(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let headerIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (isSeparatorRow(lines[index + 1]) && lines[index].includes('|')) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) return [];
  const headers = splitTableRow(lines[headerIndex]);
  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    if (!lines[index].includes('|')) break;
    const cells = splitTableRow(lines[index]);
    if (cells.length === 0) continue;
    const row = {};
    headers.forEach((header, position) => {
      row[header] = cells[position] !== undefined ? cells[position] : '';
    });
    rows.push(row);
  }
  return rows;
}

function isSeparatorRow(line) {
  return Boolean(line && /^\|?[\s:-]+\|[\s|:-]*$/.test(line));
}

function splitTableRow(line) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function recordText(record = {}) {
  const parts = [record.requestParams, record.responseParams, record.operationContent, record.resourceName];
  return parts.map(stringifyMaybe).filter(Boolean).join(' ');
}

function resolveExcludeKeys(enrichment = {}) {
  const extra = Array.isArray(enrichment.idExcludeKeys) ? enrichment.idExcludeKeys : [];
  return new Set([...DEFAULT_EXCLUDE_KEYS, ...extra.map((key) => String(key))]);
}

function extractIdsFromJsonText(text, pattern, excludeKeys) {
  const raw = String(text || '');
  if (!raw) return [];
  const parsed = safeJsonParse(raw);
  if (parsed !== null && typeof parsed === 'object') {
    const found = [];
    collectReferencedIdsDeep(parsed, pattern, found);
    return [...new Set(found)].filter((id) => !excludeKeys.has(id));
  }
  // Non-JSON fallback: blank out key/value pairs whose key is excluded, then
  // regex the remaining text for entity IDs.
  const cleaned = raw.replace(
    /("(?:[^"\\]|\\.)*")\s*:\s*(?:"(?:[^"\\]|\\.)*"|[^,}\]]+)/g,
    (match, keyToken) => (excludeKeys.has(keyToken.slice(1, -1)) ? '' : match)
  );
  return extractEntityIds(cleaned, pattern);
}

/**
 * Walk a parsed payload and collect entity IDs only from reference keys
 * (id/ids/menuId/productId) inside non-account objects. Classification IDs
 * (typeId, categoryId) and SKU IDs nested in skus[] are therefore ignored.
 */
function collectReferencedIdsDeep(node, pattern, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectReferencedIdsDeep(item, pattern, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (isAccountObject(node)) return;
  const isSkuObject = Object.prototype.hasOwnProperty.call(node, 'menuId');
  for (const [key, value] of Object.entries(node)) {
    // Inside SKU objects the plain `id` is the SKU id; only menuId refers to
    // the product itself.
    if (isSkuObject && /^id$/i.test(key)) continue;
    if (!REFERENCE_KEY.test(key)) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const matches = extractEntityIds(String(item ?? ''), pattern);
      out.push(...matches);
    }
  }
}

function isAccountObject(object) {
  return ACCOUNT_OBJECT_MARKERS.some((marker) => Object.prototype.hasOwnProperty.call(object, marker));
}

function extractEntityIds(text, pattern) {
  try {
    const regex = new RegExp(pattern, 'g');
    const matches = String(text || '').match(regex);
    return matches ? [...new Set(matches)] : [];
  } catch (_error) {
    return [];
  }
}

/**
 * Parse the update payload of an operation into per-product change sets.
 * Payloads may nest arrays (e.g. [[{...}]]) and mix account objects with
 * product objects; account objects are skipped and arrays flattened, so the
 * output is what actually changed on the product (name, price, status, ...).
 */
function extractChangeSets(text, pattern, excludeKeys, settings = {}) {
  const parsed = safeJsonParse(String(text || ''));
  if (parsed === null || typeof parsed !== 'object') return [];
  const objects = [];
  flattenPayloadObjects(parsed, objects);
  const sets = [];
  for (const item of objects) {
    const ids = [];
    collectReferencedIdsDeep(item, pattern, ids);
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) continue;
    const fields = renderChangeFields(item, excludeKeys, settings);
    if (Object.keys(fields).length === 0) continue;
    for (const id of uniqueIds) sets.push({ id, fields });
  }
  return sets;
}

function flattenPayloadObjects(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) flattenPayloadObjects(item, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (isAccountObject(node)) return;
  out.push(node);
}

function renderChangeFields(item, excludeKeys, settings = {}) {
  const fields = {};
  // SKU price field names are project-level API facts: resolve them from the
  // local skillConfig (`enrichment.skuPriceFields`) with generic defaults.
  const skuPriceFields = Array.isArray(settings.enrichment?.skuPriceFields)
    ? settings.enrichment.skuPriceFields.map(String)
    : ['price', 'salePrice'];
  for (const [key, value] of Object.entries(item)) {
    if (CHANGE_SKIP_KEYS.has(key) || excludeKeys.has(key) || CHANGE_NOISE_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    const lower = String(key).toLowerCase();
    if (lower === 'skus' && Array.isArray(value)) {
      const prices = value
        .map((sku) => {
          const field = skuPriceFields.find((name) => sku?.[name] !== undefined && sku?.[name] !== null);
          return field ? sku[field] : null;
        })
        .filter(Boolean)
        .slice(0, 3)
        .map(cleanDisplayValue);
      fields['价格'] = `${value.length} 个规格${prices.length ? `（${prices.join('/')}）` : ''}`;
      continue;
    }
    if (lower === 'propertyvos' && Array.isArray(value)) {
      fields['属性'] = `${value.length} 组`;
      continue;
    }
    if (lower === 'tags' && value && typeof value === 'object' && !Array.isArray(value)) {
      const name = value.categoryName || (Array.isArray(value.categoryNames) ? value.categoryNames.join('/') : null);
      if (name) fields['分类'] = cleanDisplayValue(name);
      continue;
    }
    const label = FIELD_LABELS[lower] || key;
    if (fields[label] !== undefined) continue;
    fields[label] = formatFieldValue(value);
  }
  return fields;
}

/**
 * Payload values often carry enum labels such as "(商品) 飯糰套餐" or
 * "（狀態）售罄"; prices carry "(價格（分）) 7000". Strip the label, convert
 * fen to yuan, and collapse URLs so the report stays customer-service
 * friendly.
 */
function cleanDisplayValue(value) {
  let text = String(value ?? '').trim();
  // Enum labels may nest parentheses, e.g. "(價格（分）) 7000" or "（狀態）售罄".
  const prefixMatch = text.match(/^[（(]([^（()）]*(?:[（(][^（()）]*[）)][^（()）]*)*)[）)]\s*/);
  const prefix = prefixMatch ? prefixMatch[1] : '';
  if (prefixMatch) text = text.slice(prefixMatch[0].length).trim();
  if (prefix.includes('分') && /^\d+(\.\d+)?$/.test(text)) {
    const yuan = Number(text) / 100;
    return `${yuan.toFixed(2)} 元`;
  }
  if (/^https?:\/\//i.test(text)) return '已设置';
  return text;
}

function formatFieldValue(value) {
  let text;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch (_error) {
      text = String(value);
    }
  }
  return cleanDisplayValue(text);
}

function extractStatusTokens(text) {
  const raw = String(text || '');
  let decoded = raw;
  if (/%[0-9A-Fa-f]{2}/.test(raw)) {
    try {
      decoded = decodeURIComponent(raw);
    } catch (_error) {
      decoded = raw;
    }
  }
  const tokens = decoded.match(STATUS_TOKEN_PATTERN) || [];
  return [...new Set(tokens.map((token) => token.trim()))];
}

function summarizeActivity(activity) {
  const parts = [];
  if (activity.activityPrice) parts.push(`活动价 ${activity.activityPrice}`);
  if (activity.discountRate) parts.push(`折扣 ${activity.discountRate}`);
  if (activity.beginDate || activity.endDate) parts.push(`${activity.beginDate || '?'} ~ ${activity.endDate || '?'}`);
  if (activity.state !== null && activity.state !== undefined) parts.push(`状态 ${activity.state}`);
  return parts.join('，');
}

// Display order for change fields in the customer-service report.
const FIELD_DISPLAY_ORDER = ['名称', '价格', '状态', '描述', '单位', '分类', '属性', '起售量', '限购', '排序', '力荐', '图片'];

function buildCsReport({ entries, productMap, activityMap, params, diagnostics }) {
  const focusProducts = params.entityType === 'product';
  const included = focusProducts ? entries.filter((entry) => entry.ids.length > 0) : entries;
  const excluded = entries.length - included.length;

  const productUsage = new Map();
  const timeline = included.map((entry) => {
    const record = entry.record;
    const products = entry.ids.map((id) => {
      const info = productMap[id];
      const label = info?.name ? info.name : `未知商品（ID ${id}）`;
      productUsage.set(label, (productUsage.get(label) || 0) + 1);
      const activity = activityMap[id];
      const activityText = activity ? `（${summarizeActivity(activity)}）` : '';
      return `${label}${activityText}`;
    });
    // Prefer concrete per-product change sets (name/price/... from the update
    // payload); fall back to the plain status tokens.
    const changeParts = entry.changeSets.map((changeSet) => {
      const label = productMap[changeSet.id]?.name || `ID ${changeSet.id}`;
      const fields = Object.entries(changeSet.fields)
        .sort((a, b) => fieldOrder(a[0]) - fieldOrder(b[0]))
        .map(([key, value]) => `${key}：${value}`);
      return `${label} → ${fields.join('｜')}`;
    });
    return {
      time: formatTime(record.operationDate),
      operator: record.operator || record.accountId || '未知操作人',
      accountId: record.accountId || null,
      ip: record.ip || null,
      operation: record.operationContent || '操作',
      resourceName: record.resourceName || null,
      products,
      changes: changeParts.length > 0 ? changeParts : entry.statusTokens.map(cleanDisplayValue)
    };
  });

  const lines = [];
  for (const item of timeline) {
    const who = item.operator + (item.accountId && item.accountId !== item.operator ? `（账号 ${item.accountId}）` : '');
    const productText = item.products.length > 0 ? `「${item.products.join('」、「')}」` : '';
    const suffix = item.ip ? `（IP ${item.ip}）` : '';
    const head = `[${shortTime(item.time)}] ${who} ${item.operation}${productText}${suffix}`;
    // Short changes (e.g. a single status flip) render inline; long ones
    // move to an indented second line so each operation stays readable.
    if (item.changes.length === 0) {
      lines.push(head);
    } else if (item.changes.join('').length <= 24) {
      lines.push(`${head}：${item.changes.join('；')}`);
    } else {
      lines.push(head);
      lines.push(`    └─ ${item.changes.join('\n       ')}`);
    }
  }

  const unresolved = [...new Set(entries.flatMap((entry) => entry.ids))].filter((id) => !productMap[id]);

  const markdown = [
    `## ${reportTitle(params, entries)}`,
    '',
    `共 ${timeline.length} 条操作${excluded > 0 ? `（另有 ${excluded} 条与商品无关的操作未列出）` : ''}，涉及 ${productUsage.size} 个商品。`,
    '',
    '| 时间 | 操作人 | 操作 | 商品 | 变更内容 | IP |',
    '| --- | --- | --- | --- | --- | --- |',
    ...timeline.map((item) => `| ${item.time} | ${item.operator} | ${item.operation} | ${item.products.join('、') || '-'} | ${item.changes.join('；').replace(/\n\s*/g, ' ') || '-'} | ${item.ip || '-'} |`),
    '',
    ...(unresolved.length > 0 ? ['**未识别的商品 ID**（未在配置的数据源中找到，可人工核对）：', ...unresolved.map((id) => `- ${id}`), ''] : []),
    ...(diagnostics.error ? [`**数据源查询异常**：${diagnostics.error}`] : [])
  ].join('\n');

  return {
    title: reportTitle(params, entries),
    includedCount: timeline.length,
    excludedCount: excluded,
    productCount: productUsage.size,
    topProducts: [...productUsage.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count })),
    unresolvedIds: unresolved,
    lines,
    markdown
  };
}

function fieldOrder(label) {
  const index = FIELD_DISPLAY_ORDER.indexOf(label);
  return index >= 0 ? index : FIELD_DISPLAY_ORDER.length;
}

function shortTime(formatted) {
  const match = String(formatted || '').match(/\d{2}:\d{2}:\d{2}/);
  return match ? match[0] : formatted;
}

function reportTitle(params = {}, entries = []) {
  const storeName = entries.map((entry) => entry.record?.storeName).find(Boolean) || null;
  const scope = params.storeId
    ? `门店 ${params.storeId}${storeName ? `（${storeName}）` : ''}`
    : '操作日志';
  const timeScope = params.timeRange === 'today' || (params.from && params.to && params.from.slice(0, 10) === params.to.slice(0, 10))
    ? `${params.from ? params.from.slice(0, 10) : '今天'}`
    : (params.from || params.to ? `${params.from || '…'} ~ ${params.to || '…'}` : '');
  return `${scope}${timeScope ? ` ${timeScope} ` : ''}操作日志（客服可读版）`;
}

function formatTime(value) {
  if (value === undefined || value === null || value === '') return '时间未知';
  const text = String(value).trim();
  if (/^\d{13}$/.test(text)) return formatLocalDateTime(new Date(Number(text)));
  if (/^\d{10}$/.test(text)) return formatLocalDateTime(new Date(Number(text) * 1000));
  // ISO strings (e.g. 2026-08-19T05:56:39.000+00:00) carry a timezone; render local time.
  if (/T|Z|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return formatLocalDateTime(parsed);
  }
  return text;
}

function formatLocalDateTime(date) {
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function chunk(list, size) {
  const batches = [];
  for (let index = 0; index < list.length; index += size) {
    batches.push(list.slice(index, index + size));
  }
  return batches;
}

function stringifyMaybe(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

module.exports = {
  enrichRecords,
  extractEntityIds,
  extractIdsFromJsonText,
  extractChangeSets,
  extractStatusTokens,
  parseMarkdownTable,
  buildCsReport,
  buildLookupScript
};
