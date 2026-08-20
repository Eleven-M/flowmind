const fs = require('fs-extra');
const path = require('path');
const { getSourceDir, loadSourceContext } = require('./source-inference');

const DOCUMENT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.html', '.htm', '.lake', '.lakebook']);
const CODE_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.go', '.java', '.js', '.jsx', '.kt', '.php', '.py', '.rb', '.rs', '.sql',
  '.ts', '.tsx', '.vue', '.xml', '.yml', '.yaml', '.properties', '.md'
]);
const IGNORED_DIRECTORIES = new Set([
  '.git', '.idea', '.next', '.nuxt', '.turbo', '.vscode', 'build', 'coverage', 'dist', 'node_modules',
  'target', 'vendor'
]);
const SENSITIVE_FILE_PATTERN = /(?:^|[._-])(\.env|credentials?|id_rsa|private[-_]?key|secrets?)(?:[._-]|$)|\.(?:key|p12|pem)$/i;
const GENERIC_QUERY_WORDS = new Set([
  '分析', '总结', '汇总', '梳理', '设计', '流程', '文档', '代码', '历史', '资料', '学习', '本地', '离线',
  '进行', '优化', '处理', '逻辑', '模型', '无模型', '帮我', '请', '一下', '当前', '项目', '模块', 'analyze', 'analysis', 'summarize',
  'summary', 'design', 'flow', 'code', 'document', 'docs', 'local', 'project'
]);
const MAX_TEXT_LENGTH = 160000;
const MAX_EXCERPT_LENGTH = 240;
const DATA_IDENTIFIER_STOP_WORDS = new Set(['a', 'an', 'command', 'flowmind', 'of', 'set', 'the', 'where', 'with']);

async function analyzeOffline(input, options = {}) {
  const query = String(input || '').trim();
  if (!query) {
    throw new Error('Offline analysis requires a non-empty natural-language request.');
  }

  const limits = normalizeLimits(options);
  const terms = buildQueryTerms(query);
  const sourceRoot = await resolveReadableRoot(options.sourceDir || getSourceDir(options));
  const repoRoot = await resolveReadableRoot(options.repoDir || options.cwd || process.cwd());
  const indexContext = await loadIndexContext(sourceRoot);
  const indexBoosts = buildIndexBoosts(indexContext.resourceIndex || [], terms);
  const limitations = [];

  const [materialSources, codeSources] = await Promise.all([
    collectMaterialSources(sourceRoot, indexBoosts, limits, limitations),
    options.includeCode === false
      ? Promise.resolve([])
      : collectCodeSources(repoRoot, sourceRoot, indexBoosts, limits, limitations)
  ]);
  const learningSources = buildLearningSources(options.learningAssets || {});
  const candidates = [...materialSources, ...learningSources, ...codeSources];
  const ranked = selectDiversifiedCandidates(rankCandidates(candidates, terms), limits.maxResults);
  const selected = ranked.length > 0 ? ranked : rankDefaultCandidates(candidates, limits.maxResults);
  const evidence = selected.map((candidate) => buildEvidence(candidate, terms));
  const designFlow = buildDesignFlow(evidence, limits.maxFlowSteps);
  const architecture = buildArchitectureSignals(evidence);
  const confidence = calculateConfidence(evidence, terms, designFlow);

  if (selected.length === 0) {
    limitations.push('No readable local material or source-code file matched the configured roots.');
  }
  if (confidence.level === 'low') {
    limitations.push('Evidence coverage is low; treat the generated flow as a discovery aid and confirm it manually.');
  }
  if (designFlow.length === 0) {
    limitations.push('No explicit ordered flow was found; the report contains only structural and topical signals.');
  }

  return {
    mode: 'offline-deterministic',
    query,
    generatedAt: new Date().toISOString(),
    scope: {
      sourceRoot,
      repoRoot,
      scanned: {
        materials: materialSources.length,
        learning: learningSources.length,
        code: codeSources.filter((source) => source.kind === 'code').length,
        repositoryDocuments: codeSources.filter((source) => source.kind === 'document').length
      },
      selected: evidence.length
    },
    summary: buildSummary(evidence, designFlow, architecture),
    designFlow,
    architecture,
    documentSummary: summarizeByKind(evidence, ['document', 'learning']),
    codeSummary: summarizeByKind(evidence, ['code']),
    testFocus: buildTestFocus(designFlow, architecture),
    citations: evidence.map(toCitation),
    confidence,
    limitations: [...new Set(limitations)],
    guarantees: ['No AI provider used', 'No network access', 'Analyzed code was not executed']
  };
}

function normalizeLimits(options) {
  return {
    maxMaterialFiles: clampNumber(options.maxMaterialFiles, 200, 1, 1000),
    maxCodeFiles: clampNumber(options.maxCodeFiles, 500, 1, 3000),
    maxResults: clampNumber(options.maxResults, 12, 1, 50),
    maxFlowSteps: clampNumber(options.maxFlowSteps, 12, 1, 30),
    maxFileBytes: clampNumber(options.maxFileBytes, 2 * 1024 * 1024, 1024, 10 * 1024 * 1024),
    maxArchiveBytes: clampNumber(options.maxArchiveBytes, 24 * 1024 * 1024, 1024, 100 * 1024 * 1024),
    maxArchiveEntries: clampNumber(options.maxArchiveEntries, 200, 1, 2000)
  };
}

function clampNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

async function resolveReadableRoot(rootPath) {
  if (!rootPath || !(await fs.pathExists(rootPath))) return null;
  try {
    const resolved = await fs.realpath(path.resolve(rootPath));
    const stat = await fs.stat(resolved);
    return stat.isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

async function loadIndexContext(sourceRoot) {
  if (!sourceRoot) return { resourceIndex: [] };
  try {
    return await loadSourceContext({ sourceDir: sourceRoot });
  } catch {
    return { resourceIndex: [] };
  }
}

function buildQueryTerms(input) {
  const normalized = String(input || '').toLowerCase();
  const terms = [];
  const latinTerms = normalized.match(/[a-z0-9][a-z0-9._:/-]{1,}/g) || [];
  for (const term of latinTerms) addQueryTerm(terms, term);
  addSynonymTerms(terms, normalized);

  const chineseSegments = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  for (const segment of chineseSegments) {
    const cleaned = removeGenericChineseWords(segment);
    if (cleaned.length >= 2 && cleaned.length <= 16) addQueryTerm(terms, cleaned);
    for (let size = 2; size <= Math.min(4, cleaned.length); size += 1) {
      for (let index = 0; index <= cleaned.length - size; index += 1) {
        addQueryTerm(terms, cleaned.slice(index, index + size));
        if (terms.length >= 48) return terms;
      }
    }
  }

  if (terms.length === 0) {
    for (const token of normalized.split(/\s+/)) addQueryTerm(terms, token);
  }
  return terms.slice(0, 48);
}

function removeGenericChineseWords(value) {
  let cleaned = String(value || '');
  for (const word of GENERIC_QUERY_WORDS) {
    if (/^[\u3400-\u9fff]+$/.test(word)) cleaned = cleaned.split(word).join('');
  }
  return cleaned.replace(/[和与及的把将对]/g, '');
}

function addSynonymTerms(terms, input) {
  const groups = [
    { pattern: /离线|无模型|没有\s*ai|不用\s*ai|without ai/, terms: ['offline', 'fallback', 'model'] },
    { pattern: /学习资料|历史资料|学习记录|learning/, terms: ['learning', 'source'] },
    { pattern: /设计流程|业务流程|design flow/, terms: ['design', 'workflow'] },
    { pattern: /代码|code/, terms: ['core', 'skill'] }
  ];
  for (const group of groups) {
    if (group.pattern.test(input)) group.terms.forEach((term) => addQueryTerm(terms, term));
  }
}

function addQueryTerm(terms, value) {
  const term = String(value || '').trim().toLowerCase();
  if (term.length < 2 || GENERIC_QUERY_WORDS.has(term) || terms.includes(term)) return;
  terms.push(term);
}

function buildIndexBoosts(entries, terms) {
  const boosts = new Map();
  for (const entry of entries || []) {
    if (!entry.path) continue;
    const fields = [entry.title, ...(entry.aliases || []), ...(entry.modules || []), ...(entry.domains || []), ...(entry.tags || [])];
    const score = fields.reduce((total, field) => total + scoreText(String(field || ''), terms, 5), 0);
    if (score > 0) boosts.set(normalizeRelativePath(entry.path), { score: Math.min(score, 60), entry });
  }
  return boosts;
}

async function collectMaterialSources(root, indexBoosts, limits, limitations) {
  if (!root) return [];
  const files = await discoverFiles(root, DOCUMENT_EXTENSIONS, limits.maxMaterialFiles);
  const sources = [];
  for (const file of files) {
    const relativePath = normalizeRelativePath(path.relative(root, file));
    const extension = path.extname(file).toLowerCase();
    try {
      const parsed = extension === '.lakebook'
        ? await readLakebook(file, relativePath, limits, limitations)
        : [await readTextDocument(file, relativePath, extension, limits)];
      for (const source of parsed.filter(Boolean)) {
        const boost = findIndexBoost(indexBoosts, relativePath);
        sources.push({ ...source, indexScore: boost?.score || 0, indexEntry: boost?.entry || null });
      }
    } catch (error) {
      limitations.push(`Skipped ${relativePath}: ${error.message}`);
    }
  }
  return sources;
}

async function collectCodeSources(repoRoot, sourceRoot, indexBoosts, limits, limitations) {
  if (!repoRoot || repoRoot === sourceRoot) return [];
  const files = await discoverFiles(repoRoot, CODE_EXTENSIONS, limits.maxCodeFiles);
  const sources = [];
  for (const file of files) {
    const relativePath = normalizeRelativePath(path.relative(repoRoot, file));
    try {
      const stat = await fs.stat(file);
      if (stat.size > limits.maxFileBytes) {
        limitations.push(`Skipped oversized code file: ${relativePath}`);
        continue;
      }
      const buffer = await fs.readFile(file);
      if (looksBinary(buffer)) continue;
      const text = redactSensitiveText(buffer.toString('utf8')).slice(0, MAX_TEXT_LENGTH);
      const kind = path.extname(relativePath).toLowerCase() === '.md' ? 'document' : 'code';
      const title = kind === 'code' ? path.basename(relativePath) : inferTitle(text, relativePath);
      const candidate = createCandidate(kind, relativePath, title, text);
      candidate.indexScore = getRepositoryIndexScore(indexBoosts, repoRoot, relativePath);
      sources.push(candidate);
    } catch (error) {
      limitations.push(`Skipped ${relativePath}: ${error.message}`);
    }
  }
  return sources;
}

function getRepositoryIndexScore(indexBoosts, repoRoot, relativePath) {
  const repositoryName = path.basename(repoRoot).toLowerCase();
  const normalizedPath = String(relativePath || '').toLowerCase();
  let score = 0;
  for (const boost of indexBoosts.values()) {
    const modules = boost.entry?.modules || [];
    if (modules.some((moduleName) => repositoryName.includes(String(moduleName).toLowerCase()) || normalizedPath.includes(String(moduleName).toLowerCase()))) {
      score = Math.max(score, boost.score);
    }
  }
  return score;
}

async function discoverFiles(root, extensions, limit) {
  const files = [];
  const queue = [root];
  while (queue.length > 0 && files.length < limit) {
    const directory = queue.shift();
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= limit || shouldSkipEntry(entry)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (!isPathInside(root, absolutePath)) continue;
      if (entry.isDirectory()) queue.push(absolutePath);
      if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) files.push(absolutePath);
    }
  }
  return files;
}

function shouldSkipEntry(entry) {
  if (entry.isSymbolicLink()) return true;
  if (entry.isDirectory()) return IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.flowmind-cache');
  return entry.name.startsWith('.') || SENSITIVE_FILE_PATTERN.test(entry.name);
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function readTextDocument(file, relativePath, extension, limits) {
  const stat = await fs.stat(file);
  if (stat.size > limits.maxFileBytes) throw new Error(`file exceeds ${limits.maxFileBytes} bytes`);
  const buffer = await fs.readFile(file);
  if (looksBinary(buffer) && extension !== '.lake') throw new Error('binary content is not supported');
  let text = buffer.toString('utf8');
  if (extension === '.json') text = extractJsonText(text);
  if (['.html', '.htm', '.lake'].includes(extension)) text = htmlToText(text);
  text = redactSensitiveText(text).slice(0, MAX_TEXT_LENGTH);
  return createCandidate('document', relativePath, inferTitle(text, relativePath), text);
}

async function readLakebook(file, relativePath, limits, limitations = []) {
  const stat = await fs.stat(file);
  if (stat.size > limits.maxArchiveBytes) throw new Error(`archive exceeds ${limits.maxArchiveBytes} bytes`);
  const archive = await fs.readFile(file);
  const issues = [];
  const entries = readTarJsonEntries(archive, limits, issues);
  limitations.push(...issues.map((issue) => `Skipped ${relativePath} entry: ${issue}`));
  return entries.map((entry) => {
    const text = redactSensitiveText(extractLakebookText(entry.value)).slice(0, MAX_TEXT_LENGTH);
    const title = inferJsonTitle(entry.value) || inferTitle(text, entry.name);
    return createCandidate('document', `${relativePath}#${entry.name}`, title, text);
  }).filter((candidate) => candidate.text.trim());
}

function extractLakebookText(value) {
  if (typeof value?.doc?.body === 'string') {
    return [value.doc.title, htmlToText(value.doc.body)].filter(Boolean).join('\n');
  }
  return extractJsonValue(value);
}

function readTarJsonEntries(buffer, limits, issues = []) {
  const entries = [];
  let offset = 0;
  while (offset + 512 <= buffer.length && entries.length < limits.maxArchiveEntries) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = parseInt(readTarString(header, 124, 12).trim() || '0', 8);
    if (!Number.isFinite(size) || size < 0) throw new Error('invalid tar entry size');
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) throw new Error('truncated tar entry');
    collectTarJsonEntry(fullName, size, buffer.subarray(dataStart, dataEnd), limits, entries, issues);
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function collectTarJsonEntry(fullName, size, data, limits, entries, issues) {
  if (!isSafeArchivePath(fullName)) {
    issues.push(`unsafe archive path ${fullName}`);
    return;
  }
  if (!fullName.toLowerCase().endsWith('.json')) return;
  if (size > limits.maxFileBytes) {
    issues.push(`oversized JSON ${fullName}`);
    return;
  }
  try {
    entries.push({ name: normalizeRelativePath(fullName), value: JSON.parse(data.toString('utf8')) });
  } catch {
    issues.push(`malformed JSON ${fullName}`);
  }
}

function readTarString(buffer, start, length) {
  return buffer.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
}

function isSafeArchivePath(value) {
  if (!value || value.includes('\\') || path.posix.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value);
  return normalized !== '..' && !normalized.startsWith('../');
}

function extractJsonText(text) {
  try {
    return extractJsonValue(JSON.parse(text));
  } catch {
    return text;
  }
}

function extractJsonValue(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return '';
  if (typeof value === 'string') return /<[^>]+>/.test(value) ? htmlToText(value) : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => extractJsonValue(item, depth + 1)).join('\n');
  if (typeof value === 'object') {
    return Object.entries(value).slice(0, 300).map(([key, item]) => `${key}: ${extractJsonValue(item, depth + 1)}`).join('\n');
  }
  return '';
}

function inferJsonTitle(value) {
  const candidates = [value?.title, value?.name, value?.doc?.title, value?.data?.title];
  return candidates.find((item) => typeof item === 'string' && item.trim()) || null;
}

function htmlToText(value) {
  return decodeEntities(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|pre|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\0/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const hexadecimal = entity[1]?.toLowerCase() === 'x';
      const code = parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function redactSensitiveText(value) {
  return String(value || '')
    .replace(/-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/\b(password|passwd|token|secret|api[_-]?key|authorization)\b\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]');
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length > 0.1;
}

function createCandidate(kind, relativePath, title, text) {
  const normalizedText = String(text || '').replace(/\r/g, '').trim();
  return {
    kind,
    path: normalizeRelativePath(relativePath),
    title: String(title || path.basename(relativePath)).trim(),
    text: normalizedText,
    headings: extractHeadings(normalizedText),
    symbols: kind === 'code' ? extractCodeSignals(normalizedText) : null,
    indexScore: 0,
    indexEntry: null
  };
}

function inferTitle(text, relativePath) {
  const heading = String(text || '').match(/^\s*#{1,6}\s+(.+)$/m);
  if (heading) return heading[1].trim();
  const title = String(text || '').split('\n').map((line) => line.trim()).find((line) => line.length >= 3 && line.length <= 100);
  return title || path.basename(relativePath);
}

function extractHeadings(text) {
  const headings = [];
  for (const line of String(text || '').split('\n')) {
    const match = line.trim().match(/^(?:#{1,6}\s+|第?[一二三四五六七八九十\d]+[、.）)]\s*)(.{2,100})$/);
    if (match) headings.push(cleanEvidenceLine(match[1]));
    if (headings.length >= 30) break;
  }
  return headings;
}

function extractCodeSignals(text) {
  return {
    symbols: uniqueMatches(text, [
      /\b(?:class|interface|enum|function)\s+([A-Za-z_$][\w$]*)/g,
      /\b(?:async\s+)?(?:def|func|fn)\s+([A-Za-z_$][\w$]*)/g,
      /\b(?:public|private|protected|static|async)\s+(?:[\w<>,.?\[\]]+\s+)?([A-Za-z_$][\w$]*)\s*\(/g
    ], 30),
    endpoints: uniqueMatches(text, [/['"`]((?:GET |POST |PUT |PATCH |DELETE )?\/[A-Za-z0-9_{}:./-]{3,})['"`]/g], 20),
    data: extractDataSignals(text),
    messages: uniqueMatches(text, [/\b([A-Z][A-Z0-9_]{4,}(?:TOPIC|GROUP)[A-Z0-9_]*)\b/g], 20)
  };
}

function extractDataSignals(text) {
  const values = [];
  const sqlPattern = /\b(?:from|join|update|insert\s+into|create\s+table)\s+[`"]?([A-Za-z_][\w.]*)/gi;
  const keyPattern = /\b([A-Z][A-Z0-9_]{4,}(?:CACHE|REDIS|TABLE|KEY)[A-Z0-9_]*)\b/g;
  for (const line of String(text || '').split('\n')) {
    if (/\b(?:select\b.+\bfrom|insert\s+into|update\s+[`"]?[A-Za-z_]\w*[`"]?\s+set|delete\b.+\bfrom|create\s+table)\b/i.test(line)) {
      addUniqueMatches(values, line, sqlPattern, 20);
    }
    if (/\b(?:redis|cache)\b/i.test(line)) {
      addUniqueMatches(values, line, keyPattern, 20);
    }
    if (values.length >= 20) break;
  }
  return values;
}

function addUniqueMatches(values, text, pattern, limit) {
  pattern.lastIndex = 0;
  for (const match of String(text || '').matchAll(pattern)) {
    const value = cleanEvidenceLine(match[1] || match[0]);
    if (value && !DATA_IDENTIFIER_STOP_WORDS.has(value.toLowerCase()) && !values.includes(value)) values.push(value);
    if (values.length >= limit) return;
  }
}

function uniqueMatches(text, patterns, limit) {
  const values = [];
  for (const pattern of patterns) {
    for (const match of String(text || '').matchAll(pattern)) {
      const value = cleanEvidenceLine(match[1] || match[0]);
      if (value && !values.includes(value)) values.push(value);
      if (values.length >= limit) return values;
    }
  }
  return values;
}

function buildLearningSources(assets) {
  const sources = [];
  for (const record of assets.feedback || []) {
    const text = redactSensitiveText(extractJsonValue({ input: record.input, application: record.application, type: record.type }));
    sources.push(createCandidate('learning', `learning/feedback/${record.id || sources.length + 1}`, record.skill || 'learning feedback', text));
  }
  for (const skill of assets.skills || []) {
    if (!Array.isArray(skill.rules) || skill.rules.length === 0) continue;
    const text = redactSensitiveText(extractJsonValue({ rules: skill.rules, preferredResourceBindings: skill.preferredResourceBindings }));
    sources.push(createCandidate('learning', `learning/skills/${skill.name}`, `${skill.name} learned rules`, text));
  }
  for (const scene of assets.scenes || []) {
    const text = redactSensitiveText(extractJsonValue({ keywords: scene.keywords, workflow: scene.workflow, preferences: scene.preferences }));
    sources.push(createCandidate('learning', `learning/scenes/${scene.id}`, scene.name || scene.id, text));
  }
  return sources;
}

function findIndexBoost(boosts, relativePath) {
  const normalized = normalizeRelativePath(relativePath).split('#')[0];
  for (const [indexedPath, boost] of boosts) {
    if (normalized === indexedPath || normalized.endsWith(`/${indexedPath}`) || path.basename(normalized) === path.basename(indexedPath)) return boost;
  }
  return null;
}

function rankCandidates(candidates, terms) {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, terms) }))
    .filter((candidate) => candidate.score > 0)
    .sort(compareCandidates);
}

function selectDiversifiedCandidates(ranked, limit) {
  if (ranked.length <= limit) return ranked;
  const selected = [];
  const minimumPerKind = Math.max(1, Math.floor(limit / 4));
  for (const kind of ['document', 'code', 'learning']) {
    if (selected.length >= limit) break;
    const remaining = limit - selected.length;
    selected.push(...ranked.filter((candidate) => candidate.kind === kind).slice(0, Math.min(minimumPerKind, remaining)));
  }
  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.path === candidate.path && item.kind === candidate.kind)) selected.push(candidate);
  }
  return selected.sort(compareCandidates).slice(0, limit);
}

function scoreCandidate(candidate, terms) {
  const testPenalty = /(?:^|\/)(?:__tests__|test|tests)(?:\/|$)|\.(?:spec|test)\./i.test(candidate.path)
    && !terms.includes('test') ? 15 : 0;
  return (candidate.indexScore || 0)
    + scoreText(candidate.path, terms, 40)
    + scoreText(candidate.title, terms, 30)
    + scoreText(candidate.headings.join(' '), terms, 6)
    + scoreText(candidate.text.slice(0, MAX_TEXT_LENGTH), terms, 1)
    - testPenalty;
}

function scoreText(value, terms, weight) {
  const normalized = String(value || '').toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!normalized.includes(term)) continue;
    const occurrences = normalized.split(term).length - 1;
    score += Math.min(occurrences, 5) * weight * Math.min(2, Math.max(1, term.length / 4));
  }
  return score;
}

function compareCandidates(left, right) {
  if (right.score !== left.score) return right.score - left.score;
  if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
  return left.path.localeCompare(right.path);
}

function rankDefaultCandidates(candidates, limit) {
  const defaults = /(^|\/)(readme[^/]*|package\.json|resource_index\.md|core\/index\.js)$/i;
  return candidates.filter((candidate) => defaults.test(candidate.path)).slice(0, limit).map((candidate) => ({ ...candidate, score: 1 }));
}

function buildEvidence(candidate, terms) {
  const excerpts = extractRelevantLines(candidate.text, terms, 5);
  return {
    kind: candidate.kind,
    path: candidate.path,
    title: candidate.title,
    score: Math.round(candidate.score * 10) / 10,
    headings: candidate.headings.slice(0, 12),
    excerpts,
    flowLines: candidate.kind === 'code'
      ? extractCodeFlowLines(candidate.text, terms, 10)
      : extractFlowLines(candidate.text, terms, 10),
    symbols: candidate.symbols,
    historicalBasis: candidate.indexEntry ? {
      title: candidate.indexEntry.title,
      modules: candidate.indexEntry.modules || [],
      tags: candidate.indexEntry.tags || []
    } : null
  };
}

function extractRelevantLines(text, terms, limit) {
  const lines = String(text || '').split('\n').map(cleanEvidenceLine).filter((line) => line.length >= 3);
  const scored = lines.map((line, index) => ({ line, index, score: scoreText(line, terms, 2) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = scored.length > 0 ? scored : lines.slice(0, limit).map((line, index) => ({ line, index }));
  return selected.slice(0, limit).map((entry) => ({ line: entry.index + 1, text: entry.line.slice(0, MAX_EXCERPT_LENGTH) }));
}

function extractFlowLines(text, terms, limit) {
  return String(text || '').split('\n').map(cleanEvidenceLine)
    .filter((line) => line.length >= 4 && line.length <= 300 && isFlowLine(line))
    .map((line, index) => ({ text: line.slice(0, MAX_EXCERPT_LENGTH), relevance: scoreText(line, terms, 2), index }))
    .sort((left, right) => right.relevance - left.relevance || left.index - right.index)
    .slice(0, limit);
}

function isFlowLine(line) {
  if (/^[-*]?\s*(?:path|aliases|domains|modules|tags|note):/i.test(line)) return false;
  if (/^\d{1,2}[、.)）]/.test(line)) return true;
  if (/^(?:首先|然后|接着|随后|最后|如果|若|当|校验|查询|读取|调用|写入|保存|更新|删除|返回|输出|接收|触发)/.test(line)) return true;
  if (!/^[-*]\s+/.test(line)) return false;
  return /校验|查询|读取|获取|调用|写入|保存|更新|删除|返回|输出|接收|触发|处理|匹配|排序|过滤|validate|query|read|load|call|save|update|delete|return|emit/i.test(line);
}

function extractCodeFlowLines(text, terms, limit) {
  const lines = String(text || '').split('\n');
  const candidates = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = cleanEvidenceLine(lines[index]);
    if (!isCodeActionLine(line)) continue;
    const context = lines.slice(Math.max(0, index - 2), index + 3).join(' ');
    const relevance = scoreText(context, terms, 2);
    if (relevance > 0) candidates.push({ text: line.slice(0, MAX_EXCERPT_LENGTH), relevance, index });
  }
  return candidates
    .sort((left, right) => right.relevance - left.relevance || left.index - right.index)
    .filter((candidate, index, all) => all.findIndex((item) => item.text === candidate.text) === index)
    .slice(0, limit);
}

function isCodeActionLine(line) {
  if (!line || /^(?:\/\/|\/\*|\*|#)/.test(line)) return false;
  return /^(?:async\s+function|function|class|(?:async\s+)?[A-Za-z_$][\w$]*\s*\(|\.(?:command|action)\s*\(|if\s*\(|for\s*\(|while\s*\(|return\b|throw\b|await\b|const\b.+\bawait\b|let\b.+\bawait\b|[\w$.]+\s*=\s*await\b|[\w$.]+\.(?:command|execute|process|analyze|save|update|query|load|read|write|emit)\s*\()/i.test(line);
}

function cleanEvidenceLine(value) {
  return redactSensitiveText(String(value || '')).replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
}

function buildDesignFlow(evidence, limit) {
  const steps = [];
  const maxRounds = Math.max(0, ...evidence.map((source) => source.flowLines?.length || 0));
  for (let round = 0; round < maxRounds; round += 1) {
    for (const source of evidence) {
      const flow = source.flowLines?.[round];
      if (!flow) continue;
      const description = flow.text.replace(/^[-*]\s+/, '').trim();
      if (!description || steps.some((step) => step.description === description)) continue;
      steps.push({
        order: steps.length + 1,
        stage: inferFlowStage(description),
        description,
        evidence: { path: source.path, title: source.title }
      });
      if (steps.length >= limit) return steps;
    }
  }
  return steps;
}

function inferFlowStage(value) {
  const text = String(value || '').toLowerCase();
  if (/入口|接收|请求|触发|用户|参数|input|request/.test(text)) return 'input';
  if (/校验|判断|检查|验证|if|validate/.test(text)) return 'validation';
  if (/查询|读取|获取|加载|search|query|load|read/.test(text)) return 'read';
  if (/计算|转换|组装|匹配|排序|过滤|处理|build|map|filter|sort/.test(text)) return 'processing';
  if (/写入|保存|更新|删除|同步|persist|save|update|delete/.test(text)) return 'persistence';
  if (/返回|输出|展示|通知|响应|return|response|emit/.test(text)) return 'output';
  return 'business';
}

function buildArchitectureSignals(evidence) {
  const signals = { modules: [], symbols: [], endpoints: [], data: [], messages: [] };
  for (const item of evidence) {
    if (item.historicalBasis) signals.modules.push(...item.historicalBasis.modules);
    if (!item.symbols) continue;
    signals.symbols.push(...item.symbols.symbols);
    signals.endpoints.push(...item.symbols.endpoints);
    signals.data.push(...item.symbols.data);
    signals.messages.push(...item.symbols.messages);
  }
  for (const key of Object.keys(signals)) signals[key] = [...new Set(signals[key])].slice(0, 30);
  return signals;
}

function calculateConfidence(evidence, terms, designFlow) {
  const matchedTermCount = new Set(evidence.flatMap((item) => terms.filter((term) => item.excerpts.some((excerpt) => excerpt.text.toLowerCase().includes(term))))).size;
  const coverage = terms.length === 0 ? 0 : matchedTermCount / terms.length;
  const sourceKinds = new Set(evidence.map((item) => item.kind)).size;
  const score = Math.min(1, coverage * 0.5 + Math.min(evidence.length / 6, 1) * 0.25 + Math.min(sourceKinds / 2, 1) * 0.15 + Math.min(designFlow.length / 5, 1) * 0.1);
  return {
    level: score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low',
    score: Math.round(score * 100) / 100,
    matchedTerms: matchedTermCount,
    totalTerms: terms.length,
    sourceKinds
  };
}

function buildSummary(evidence, designFlow, architecture) {
  if (evidence.length === 0) return 'No matching local evidence was found.';
  const documents = evidence.filter((item) => item.kind !== 'code').length;
  const code = evidence.filter((item) => item.kind === 'code').length;
  const signals = architecture.symbols.length + architecture.endpoints.length + architecture.data.length + architecture.messages.length;
  return `Matched ${evidence.length} local sources (${documents} document/learning, ${code} code), extracted ${designFlow.length} flow steps and ${signals} architecture signals.`;
}

function summarizeByKind(evidence, kinds) {
  return evidence.filter((item) => kinds.includes(item.kind)).map((item) => ({
    path: item.path,
    title: item.title,
    score: item.score,
    summary: item.excerpts.map((excerpt) => excerpt.text).slice(0, 3),
    headings: item.headings.slice(0, 8),
    symbols: item.symbols || undefined
  }));
}

function buildTestFocus(designFlow, architecture) {
  const focus = ['No-model execution with every AI provider disabled', 'Deterministic output for the same local inputs'];
  if (designFlow.some((step) => step.stage === 'validation')) focus.push('Validation branches and rejected/empty inputs');
  if (designFlow.some((step) => step.stage === 'persistence')) focus.push('Persistence failure, idempotency, and partial-write behavior');
  if (architecture.endpoints.length > 0) focus.push('API contract compatibility and error responses');
  if (architecture.data.length > 0) focus.push('Database/cache boundary and missing-data behavior');
  if (architecture.messages.length > 0) focus.push('Message duplication, ordering, retry, and consumer compatibility');
  focus.push('Archive traversal, oversized input, binary files, and secret redaction');
  return [...new Set(focus)];
}

function toCitation(item) {
  return {
    path: item.path,
    kind: item.kind,
    title: item.title,
    score: item.score,
    excerpts: item.excerpts,
    historicalBasis: item.historicalBasis
  };
}

function normalizeRelativePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

module.exports = {
  analyzeOffline,
  buildQueryTerms,
  htmlToText,
  isSafeArchivePath,
  readTarJsonEntries,
  redactSensitiveText
};
