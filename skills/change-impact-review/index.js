const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { inferSourceContext } = require('../../core/source-inference');
const { createSkillResult } = require('../../core/result-contract');
const { reportProgress } = require('../../core/skill-progress');

const DOMAIN_RULES = [
  { domain: 'api', pattern: /controller|route|router|endpoint|api|interface/i },
  { domain: 'database', pattern: /mapper|repository|dao|entity|sql|migration|schema|model/i },
  { domain: 'cache', pattern: /redis|cache/i },
  { domain: 'config', pattern: /config|application\.(yml|yaml|properties)|\.env/i },
  { domain: 'workflow', pattern: /workflow|deploy|pipeline|auto-flow|jenkins/i },
  { domain: 'knowledge', pattern: /docs\/|design|yuque|readme|\.md$/i },
  { domain: 'tests', pattern: /__tests__|\.test\.|\.spec\.|test\//i }
];

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    input: {
      type: 'string',
      description: 'Natural-language change impact request, optionally including repo/path or range'
    },
    context: {
      type: 'object',
      description: 'Optional execution context, including cwd or changedFiles'
    }
  },
  required: ['input']
};

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    repoDir: { type: 'string' },
    changedFiles: { type: 'array' },
    impactedDomains: { type: 'array' },
    risk: { type: 'object' },
    recommendations: { type: 'array' },
    regressionChecklist: { type: 'array' },
    automationCandidates: { type: 'array' }
  }
};

module.exports = {
  capabilities: ['review'],
  inputSchema: INPUT_SCHEMA,
  outputSchema: OUTPUT_SCHEMA,
  canHandle(input) {
    if (!input) return false;
    return /变更影响|影响审查|impact review|回归范围|发布风险|change impact/i.test(input);
  },

  async execute(input, context = {}) {
    const repoDir = extractRepoDir(input) || context.cwd || process.cwd();
    reportProgress(context, 'resolve-repo', 10, `Resolving repo for impact review: ${repoDir}`);
    const changedFiles = getChangedFiles(repoDir, input, context);
    reportProgress(context, 'infer-source', 25, 'Inferring source context');
    const inferredSource = context.sourceInference || await safeInferSourceContext(input);
    reportProgress(context, 'classify-files', 55, `Classifying ${changedFiles.length} changed file(s)`);
    const classified = await Promise.all(changedFiles.map((file) => classifyFile(file, repoDir)));
    reportProgress(context, 'assess-risk', 75, 'Assessing impacted domains and risk');
    const domains = summarizeDomains(classified);
    const risk = evaluateRisk(domains, classified);
    const recommendations = buildRecommendations(domains, classified);
    const regressionChecklist = buildRegressionChecklist(domains, classified);
    const syncRecommendations = buildSyncRecommendations(domains, classified, context);
    const relatedSkills = buildRelatedSkills(domains);
    const automationCandidates = buildAutomationCandidates(domains, classified, context, inferredSource, repoDir);
    reportProgress(context, 'finalize', 95, 'Preparing impact review response');

    return createSkillResult('change-impact-review', `Impact review completed for ${changedFiles.length} file(s). Risk: ${risk.level}`, {
      input,
      data: {
        repoDir,
        changedFiles: classified,
        impactedDomains: domains,
        risk,
        recommendations,
        regressionChecklist,
        syncRecommendations,
        relatedSkills,
        automationCandidates,
        inferredSource: summarizeInferredSource(inferredSource)
      }
    });
  }
};

function extractRepoDir(input) {
  const match = String(input || '').match(/(?:项目|目录|repo|path|dir)\s*[:=]?\s*(\S+)/i);
  return match ? match[1] : null;
}

function getChangedFiles(repoDir, input, context = {}) {
  if (Array.isArray(context.changedFiles) && context.changedFiles.length > 0) {
    return [...new Set(context.changedFiles.map((file) => String(file).trim()).filter(Boolean))];
  }

  const explicitRange = extractRange(input);
  if (explicitRange) {
    return splitLines(runGit(`git diff --name-only ${explicitRange}`, repoDir));
  }

  const dirtyFiles = [
    ...splitLines(runGit('git diff --name-only', repoDir)),
    ...splitLines(runGit('git diff --name-only --cached', repoDir)),
    ...splitLines(runGit('git ls-files --others --exclude-standard', repoDir))
  ];

  const uniqueDirty = [...new Set(dirtyFiles.filter(Boolean))];
  if (uniqueDirty.length > 0) {
    return uniqueDirty;
  }

  const lastCommitFiles = splitLines(runGit('git diff --name-only HEAD~1..HEAD', repoDir));
  const files = [...new Set(lastCommitFiles.filter(Boolean))];
  if (files.length > 0) {
    return files;
  }

  return discoverFiles(repoDir);
}

function extractRange(input) {
  const match = String(input || '').match(/(?:range|提交范围)\s*[:=]?\s*([A-Za-z0-9._/-]+\.\.[A-Za-z0-9._/-]+)/i);
  return match ? match[1] : null;
}

function runGit(command, cwd) {
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

function splitLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function classifyFile(file, repoDir) {
  const normalized = String(file || '');
  const domains = DOMAIN_RULES
    .filter((rule) => rule.pattern.test(normalized))
    .map((rule) => rule.domain);
  const absolutePath = path.resolve(repoDir, normalized);
  const exists = fs.existsSync(absolutePath);
  const contentSignals = exists ? await inspectFileContent(absolutePath) : {
    domains: [],
    markers: [],
    summary: null
  };
  const mergedDomains = [...new Set([...domains, ...contentSignals.domains])];

  return {
    path: normalized,
    exists,
    domains: mergedDomains.length > 0 ? mergedDomains : ['application'],
    markers: contentSignals.markers,
    summary: contentSignals.summary
  };
}

async function inspectFileContent(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!['.js', '.ts', '.jsx', '.tsx', '.java', '.go', '.py', '.md', '.yml', '.yaml', '.json', '.xml', '.properties'].includes(extension)) {
    return { domains: [], markers: [], summary: null };
  }

  const content = await fs.readFile(filePath, 'utf-8');
  const normalized = content.toLowerCase();
  const domains = [];
  const markers = [];

  if (/@requestmapping|@getmapping|@postmapping|router\.|app\.(get|post|put|delete)\(/i.test(content)) {
    domains.push('api');
    markers.push('http-endpoint');
  }
  if (/\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|@table|create table/i.test(normalized)) {
    domains.push('database');
    markers.push('sql-touchpoint');
  }
  if (/\bredis\b|\bcache\b|redisTemplate|jedis|ttl/i.test(content)) {
    domains.push('cache');
    markers.push('cache-touchpoint');
  }
  if (/yapi|swagger|openapi/i.test(content)) {
    domains.push('api');
    markers.push('api-doc-reference');
  }
  if (/yuque|runbook|设计文档|knowledge base/i.test(content)) {
    domains.push('knowledge');
    markers.push('knowledge-reference');
  }

  const summaryParts = [];
  if (markers.includes('http-endpoint')) summaryParts.push('endpoint change');
  if (markers.includes('sql-touchpoint')) summaryParts.push('data access change');
  if (markers.includes('cache-touchpoint')) summaryParts.push('cache behavior change');
  if (markers.includes('knowledge-reference')) summaryParts.push('documentation touchpoint');

  return {
    domains: [...new Set(domains)],
    markers,
    summary: summaryParts.length > 0 ? summaryParts.join(', ') : null
  };
}

function discoverFiles(repoDir) {
  if (!fs.existsSync(repoDir)) {
    return [];
  }

  const results = [];
  walkFiles(repoDir, repoDir, results);
  return results.slice(0, 200);
}

function walkFiles(rootDir, currentDir, results) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(rootDir, fullPath, results);
      continue;
    }

    results.push(path.relative(rootDir, fullPath));
  }
}

function summarizeDomains(classified) {
  const counts = {};
  for (const item of classified) {
    for (const domain of item.domains) {
      counts[domain] = (counts[domain] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .map(([domain, count]) => ({ domain, files: count }));
}

function evaluateRisk(domains, classified) {
  const domainSet = new Set(domains.map((item) => item.domain));
  const changedFileCount = classified.length;
  const onlyKnowledge = domainSet.size === 1 && domainSet.has('knowledge');
  const hasTests = domainSet.has('tests');

  const reasons = [];
  let score = 0;

  if (domainSet.has('api')) {
    score += 2;
    reasons.push('API surface changed');
  }
  if (domainSet.has('database')) {
    score += 3;
    reasons.push('Database-facing files changed');
  }
  if (domainSet.has('cache')) {
    score += 2;
    reasons.push('Cache logic changed');
  }
  if (domainSet.has('config')) {
    score += 2;
    reasons.push('Configuration changed');
  }
  if (domainSet.has('workflow')) {
    score += 2;
    reasons.push('Workflow or deployment logic changed');
  }
  if (changedFileCount > 20) {
    score += 2;
    reasons.push('Large change set');
  }
  if ((domainSet.has('api') || domainSet.has('database') || domainSet.has('cache')) && !hasTests) {
    score += 2;
    reasons.push('No test changes detected for behavior-sensitive areas');
  }
  if (onlyKnowledge) {
    score = 0;
    reasons.push('Only documentation or knowledge files changed');
  }

  return {
    level: score >= 7 ? 'high' : score >= 3 ? 'medium' : 'low',
    score,
    reasons
  };
}

function buildRecommendations(domains) {
  const domainSet = new Set(domains.map((item) => item.domain));
  const recommendations = [];

  if (domainSet.has('api')) {
    recommendations.push('Review request/response compatibility and sync API docs if controller or contract files changed.');
  }
  if (domainSet.has('database')) {
    recommendations.push('Validate SQL behavior, indexes, and backward compatibility for schema or repository changes.');
  }
  if (domainSet.has('cache')) {
    recommendations.push('Verify cache keys, TTL, and cache/database consistency for cache-related changes.');
  }
  if (domainSet.has('config')) {
    recommendations.push('Check environment-specific config differences before release.');
  }
  if (domainSet.has('knowledge')) {
    recommendations.push('Update design or runbook documents if this change alters documented behavior.');
  }

  if (recommendations.length === 0) {
    recommendations.push('No specialized follow-up action detected. Review changed files manually.');
  }

  return recommendations;
}

function buildRegressionChecklist(domains) {
  const domainSet = new Set(domains.map((item) => item.domain));
  const checklist = ['Smoke test the main affected user flow.'];

  if (domainSet.has('api')) checklist.push('Run API contract and controller-level regression checks.');
  if (domainSet.has('database')) checklist.push('Run data validation and migration compatibility checks.');
  if (domainSet.has('cache')) checklist.push('Run Redis/cache behavior checks and stale-data scenarios.');
  if (domainSet.has('config')) checklist.push('Verify non-prod and prod configuration alignment.');
  if (domainSet.has('workflow')) checklist.push('Validate deployment/pipeline execution path before release.');

  return checklist;
}

function buildSyncRecommendations(domains, classified, context = {}) {
  const domainSet = new Set(domains.map((item) => item.domain));
  const syncs = [];
  const apiDocReady = !!context.componentRegistry?.getAdapter?.('apiDoc');
  const knowledgeReady = !!context.componentRegistry?.getAdapter?.('knowledgeBase');
  const endpointTouched = classified.some((item) => item.markers?.includes('http-endpoint'));
  const knowledgeTouched = domainSet.has('knowledge') || classified.some((item) => item.markers?.includes('knowledge-reference'));

  if (domainSet.has('api') || endpointTouched) {
    syncs.push({
      type: 'api-doc',
      skill: 'yapi-sync-interface',
      recommended: true,
      configured: apiDocReady,
      reason: 'API-related files or endpoint markers changed'
    });
  }

  if (knowledgeTouched) {
    syncs.push({
      type: 'design-doc',
      skill: 'yuque-sync-design',
      recommended: true,
      configured: knowledgeReady,
      reason: 'Knowledge or documentation touchpoints changed'
    });
  }

  return syncs;
}

function buildRelatedSkills(domains) {
  const domainSet = new Set(domains.map((item) => item.domain));
  const related = [];

  if (domainSet.has('database') || domainSet.has('cache')) {
    related.push('data-logic-validation', 'data-risk-audit');
  }
  if (domainSet.has('api')) {
    related.push('yapi-sync-interface');
  }
  if (domainSet.has('knowledge')) {
    related.push('yuque-sync-design', 'knowledge-ops');
  }
  if (domainSet.has('workflow')) {
    related.push('auto-flow', 'report-insights');
  }

  return [...new Set(related)];
}

function buildAutomationCandidates(domains, classified, context = {}, inferredSource = null, repoDir = '.') {
  const domainSet = new Set(domains.map((item) => item.domain));
  const sourceProject = inferredSource?.project || path.basename(repoDir);
  const candidates = [];
  const syncRecommendations = buildSyncRecommendations(domains, classified, context);

  for (const recommendation of syncRecommendations) {
    candidates.push({
      skill: recommendation.skill,
      configured: recommendation.configured,
      reason: recommendation.reason,
      suggestedInput: recommendation.skill === 'yapi-sync-interface'
        ? `同步 YApi path=${repoDir}`
        : `同步语雀 path=${repoDir}`
    });
  }

  if (domainSet.has('database') || domainSet.has('cache')) {
    candidates.push({
      skill: 'data-risk-audit',
      configured: !!context.componentRegistry?.getAdapter?.('databaseQuery'),
      reason: 'Database or cache related files changed',
      suggestedInput: `数据风险 项目=${sourceProject}`
    });
  }

  if (domainSet.has('workflow')) {
    candidates.push({
      skill: 'report-insights',
      configured: !!context.componentRegistry?.getAdapter?.('report'),
      reason: 'Workflow changes benefit from validating recent build/test/coverage signals',
      suggestedInput: `构建报告 job=${sourceProject}`
    });
  }

  if (domainSet.has('knowledge')) {
    candidates.push({
      skill: 'knowledge-ops',
      configured: !!context.componentRegistry?.getAdapter?.('knowledgeBase'),
      reason: 'Documentation changes can be persisted as reusable knowledge updates',
      suggestedInput: `保存知识 path=${path.join(repoDir, 'README.md')}`
    });
  }

  return candidates;
}

async function safeInferSourceContext(input) {
  try {
    return await inferSourceContext(input);
  } catch {
    return null;
  }
}

function summarizeInferredSource(inferredSource) {
  if (!inferredSource?.matched) {
    return inferredSource?.environment
      ? { matched: false, environment: inferredSource.environment }
      : null;
  }

  return {
    matched: true,
    project: inferredSource.project,
    environment: inferredSource.environment,
    database: inferredSource.database?.database || null,
    redisDatabase: inferredSource.redis?.database ?? null,
    matchedEntries: inferredSource.matchedEntries?.map((entry) => entry.title) || []
  };
}
