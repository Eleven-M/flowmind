const DEFAULTS = {
  bridgeUrl: 'http://127.0.0.1:47631',
  token: '',
  targetOrigins: '',
  enabled: false
};

document.addEventListener('DOMContentLoaded', async () => {
  const config = await chrome.storage.local.get(DEFAULTS);
  document.querySelector('#enabled').checked = Boolean(config.enabled);
  document.querySelector('#bridgeUrl').value = config.bridgeUrl;
  document.querySelector('#token').value = config.token;
  document.querySelector('#targetOrigins').value = config.targetOrigins;
});

document.querySelector('#save').addEventListener('click', async () => {
  const status = document.querySelector('#status');
  const targetOrigins = document.querySelector('#targetOrigins').value.trim();
  const origins = targetOrigins.split(/[\s,]+/).filter(Boolean);

  if (origins.some((origin) => origin.includes('#') || origin.includes('?'))) {
    status.textContent = '权限地址不能包含 # 或 ?，请填写 https://admin.example.com/*';
    return;
  }

  try {
    if (origins.length > 0) {
      const alreadyGranted = await chrome.permissions.contains({ origins });
      const granted = alreadyGranted || await chrome.permissions.request({ origins });
      if (!granted) {
        status.textContent = '未授予页面权限，请在弹窗中点击允许。';
        return;
      }
    }

    await chrome.storage.local.set({
      enabled: document.querySelector('#enabled').checked,
      bridgeUrl: document.querySelector('#bridgeUrl').value.trim() || DEFAULTS.bridgeUrl,
      token: document.querySelector('#token').value.trim(),
      targetOrigins
    });
    chrome.runtime.sendMessage({ type: 'flowmind-options-updated' });
    status.textContent = 'Saved.';
  } catch (error) {
    status.textContent = `保存失败：${error?.message || error}`;
  }
});
