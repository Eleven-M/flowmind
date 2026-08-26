function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeData(data) {
  if (data === undefined) {
    return {};
  }

  if (isPlainObject(data)) {
    return { ...data };
  }

  return {
    value: data
  };
}

function buildBasePayload(type, skill, message, options = {}) {
  const {
    data,
    input,
    timestamp,
    ...rest
  } = options;

  const payload = {
    type,
    success: type !== 'error',
    skill: skill || undefined,
    message,
    input,
    timestamp: timestamp || new Date().toISOString()
  };

  const normalizedData = normalizeData(data);
  if (Object.keys(normalizedData).length > 0) {
    payload.data = normalizedData;
  }

  return {
    ...payload,
    ...rest
  };
}

function createSkillResult(skill, message, options = {}) {
  return buildBasePayload('result', skill, message, options);
}

function createSkillError(skill, message, options = {}) {
  const {
    data,
    code = null,
    kind = null,
    retryable = null,
    retryHints,
    bindingHint,
    ...rest
  } = options;

  const normalizedData = normalizeData(data);
  if (code && normalizedData.code === undefined) {
    normalizedData.code = code;
  }
  if (kind && normalizedData.kind === undefined) {
    normalizedData.kind = kind;
  }
  if (retryable !== null && normalizedData.retryable === undefined) {
    normalizedData.retryable = retryable;
  }
  if (Array.isArray(retryHints) && normalizedData.retryHints === undefined) {
    normalizedData.retryHints = retryHints;
  }
  if (bindingHint !== undefined && normalizedData.bindingHint === undefined) {
    normalizedData.bindingHint = bindingHint;
  }

  return buildBasePayload('error', skill, message, {
    ...rest,
    data: normalizedData
  });
}

function createLearningResponse(learningType, message, options = {}) {
  const {
    record,
    data,
    input,
    timestamp,
    ...rest
  } = options;

  const normalizedData = normalizeData(data);

  return {
    type: 'learning',
    success: true,
    learningType,
    record: record === undefined ? null : record,
    message,
    input,
    timestamp: timestamp || new Date().toISOString(),
    ...(Object.keys(normalizedData).length > 0 ? { data: normalizedData } : {}),
    ...rest
  };
}

function unwrapFlowmindPayload(payload) {
  let current = payload;

  while (
    isPlainObject(current)
    && current.type === 'result'
    && current.success === true
    && isPlainObject(current.data)
    && current.message === undefined
    && current.skill === undefined
  ) {
    current = current.data;
  }

  return current;
}

function isErrorResultPayload(payload) {
  const unwrapped = unwrapFlowmindPayload(payload);
  return isPlainObject(unwrapped) && unwrapped.type === 'error';
}

/**
 * Normalize optional quality signals used by passive learning. Existing
 * skills remain compatible: successful results without an explicit signal
 * are treated as observations, not confirmed outcomes.
 */
function getLearningOutcome(payload) {
  const unwrapped = unwrapFlowmindPayload(payload);
  if (isErrorResultPayload(unwrapped)) {
    return { quality: 'failed', confidence: 0, eligible: false };
  }

  const data = isPlainObject(unwrapped?.data) ? unwrapped.data : {};
  const quality = String(
    unwrapped?.learningQuality ||
    unwrapped?.quality ||
    data.learningQuality ||
    data.quality ||
    ''
  ).toLowerCase();
  const normalizedQuality = ['confirmed', 'likely', 'partial', 'failed'].includes(quality)
    ? quality
    : 'observation';
  const confidenceValue = Number(
    unwrapped?.learningConfidence ??
    unwrapped?.confidence ??
    data.learningConfidence ??
    data.confidence
  );
  const confidence = Number.isFinite(confidenceValue)
    ? Math.max(0, Math.min(1, confidenceValue))
    : normalizedQuality === 'confirmed' ? 1 : normalizedQuality === 'likely' ? 0.6 : 0.4;

  return {
    quality: normalizedQuality,
    confidence,
    // Observation results may still contribute to a passive streak, but they
    // never count as explicit confirmation. Partial and failed results are
    // excluded from automatic route learning.
    eligible: normalizedQuality !== 'partial' && normalizedQuality !== 'failed'
  };
}

module.exports = {
  createSkillResult,
  createSkillError,
  createLearningResponse,
  unwrapFlowmindPayload,
  isErrorResultPayload,
  getLearningOutcome
};
