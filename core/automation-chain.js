function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const EXECUTABLE_FOLLOW_UP_SKILLS = new Set([
  'yapi-sync-interface',
  'yuque-sync-design',
  'archive-change',
  'knowledge-ops'
]);

function normalizeCandidate(candidate, index, source) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const skill = candidate.skill || candidate.name || candidate.type;
  if (!skill) {
    return null;
  }

  return {
    order: index + 1,
    skill,
    source,
    status: 'pending',
    reason: candidate.reason || candidate.description || null,
    suggestedInput: candidate.suggestedInput || null,
    configured: candidate.configured !== undefined ? candidate.configured : null,
    recommended: candidate.recommended !== undefined ? candidate.recommended : true
  };
}

function unwrapPayload(value) {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value.content)) {
    const text = value.content.find((item) => typeof item?.text === 'string')?.text;
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    }
  }
  return value;
}

function buildFollowUpChain(result) {
  const payload = unwrapPayload(result);
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const rawSteps = [
    ...asArray(data.automationCandidates).map((candidate) => ({ candidate, source: 'automationCandidates' })),
    ...asArray(data.nextActions).map((candidate) => ({ candidate, source: 'nextActions' })),
    ...asArray(data.syncRecommendations)
      .filter((candidate) => candidate?.recommended !== false && candidate?.skill)
      .map((candidate) => ({ candidate, source: 'syncRecommendations' }))
  ];

  const seen = new Set();
  const steps = [];
  for (const { candidate, source } of rawSteps) {
    const step = normalizeCandidate(candidate, steps.length, source);
    if (!step) continue;
    const key = `${step.skill}:${step.suggestedInput || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push(step);
  }

  if (steps.length === 0) {
    return null;
  }

  const executable = steps.every(
    (step) =>
      EXECUTABLE_FOLLOW_UP_SKILLS.has(step.skill) &&
      typeof step.suggestedInput === 'string' &&
      step.suggestedInput.trim()
  );

  return {
    mode: 'manual-review',
    executable,
    ready: executable,
    requiresApproval: true,
    reason: executable
      ? 'Follow-up actions are executable after dry-run review and approval-token confirmation.'
      : 'One or more follow-up actions are outside the executable allowlist or have no suggested input.',
    steps
  };
}

function attachFollowUpChain(result) {
  const chain = buildFollowUpChain(result);
  if (!chain || !result || typeof result !== 'object') {
    return result;
  }

  if (result.data && typeof result.data === 'object') {
    return {
      ...result,
      data: {
        ...result.data,
        followUpChain: result.data.followUpChain || chain
      }
    };
  }

  return {
    ...result,
    followUpChain: result.followUpChain || chain
  };
}

module.exports = {
  EXECUTABLE_FOLLOW_UP_SKILLS,
  buildFollowUpChain,
  attachFollowUpChain
};
