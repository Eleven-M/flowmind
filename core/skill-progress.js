function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function reportProgress(context, progress, percent, message) {
  const reporter = context?.onProgress || context?.taskProgress;
  if (typeof reporter !== 'function') {
    return;
  }

  let payload;
  if (isPlainObject(progress)) {
    payload = progress;
  } else if (typeof progress === 'string') {
    payload = {
      stage: progress,
      percent,
      message: message || progress
    };
  } else {
    payload = {
      percent,
      message
    };
  }

  try {
    reporter(payload);
  } catch {
    // Progress reporting must never break skill execution.
  }
}

module.exports = {
  reportProgress
};
