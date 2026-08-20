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

module.exports = {
  createSkillResult,
  createSkillError,
  createLearningResponse,
  unwrapFlowmindPayload,
  isErrorResultPayload
};
