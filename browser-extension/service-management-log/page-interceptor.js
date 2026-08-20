(function installFlowmindServiceLogBindInterceptor() {
  if (window.__flowmindServiceLogBindInstalled) return;
  window.__flowmindServiceLogBindInstalled = true;
  window.__flowmindServiceLogBindCaptured = false;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'flowmind-service-management-log-reset-capture') return;
    window.__flowmindServiceLogBindCaptured = false;
  });

  const originalFetch = window.fetch;
  window.fetch = async function flowmindFetch(input, init = {}) {
    const request = buildRequestSnapshot(input, init);
    const response = await originalFetch.apply(this, arguments);
    captureResponse(request, response.clone());
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function flowmindOpen(method, url) {
    this.__flowmindRequest = { method, url };
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function flowmindSend(body) {
    const request = {
      method: this.__flowmindRequest?.method || 'GET',
      url: this.__flowmindRequest?.url || '',
      body
    };
    this.addEventListener('load', function flowmindLoad() {
      const contentType = this.getResponseHeader('content-type') || '';
      const responseText = typeof this.responseText === 'string' ? this.responseText : '';
      if (!isJsonLike(contentType, responseText)) return;
      postCapture({
        ...request,
        status: this.status,
        responseText
      });
    }, { once: true });
    return originalSend.apply(this, arguments);
  };

  function captureResponse(request, response) {
    const contentType = response.headers.get('content-type') || '';
    response.text().then((responseText) => {
      if (!isJsonLike(contentType, responseText)) return;
      postCapture({
        ...request,
        status: response.status,
        responseText
      });
    }).catch(() => {});
  }

  function postCapture(capture) {
    if (window.__flowmindServiceLogBindCaptured) return;
    if (!capture.url || isStaticLike(capture.url)) return;
    window.__flowmindServiceLogBindCaptured = true;
    window.postMessage({
      type: 'flowmind-service-management-log-captured',
      capture: {
        ...capture,
        url: new URL(capture.url, location.href).toString(),
        params: collectParams(capture.url, capture.body),
        bodyTemplate: parseBodyTemplate(capture.body),
        formFields: collectFormFields()
      }
    }, '*');
  }

  function buildRequestSnapshot(input, init) {
    if (input instanceof Request) {
      return {
        method: init.method || input.method || 'GET',
        url: input.url,
        body: init.body || null
      };
    }
    return {
      method: init.method || 'GET',
      url: String(input),
      body: init.body || null
    };
  }

  function collectParams(urlValue, body) {
    const params = {};
    try {
      const url = new URL(urlValue, location.href);
      for (const [key, value] of url.searchParams.entries()) {
        params[key] = value;
      }
    } catch (_error) {}

    if (typeof body === 'string' && body.trim()) {
      try {
        Object.assign(params, flattenJson(JSON.parse(body)));
      } catch (_error) {
        for (const [key, value] of new URLSearchParams(body).entries()) {
          params[key] = value;
        }
      }
    }
    return params;
  }

  function parseBodyTemplate(body) {
    if (typeof body !== 'string' || !body.trim()) return null;
    try {
      return JSON.parse(body);
    } catch (_error) {
      return null;
    }
  }

  function collectFormFields() {
    return Array.from(document.querySelectorAll('input, textarea, select')).map((field) => ({
      label: [
        field.name,
        field.id,
        field.getAttribute('placeholder'),
        field.getAttribute('aria-label'),
        nearestTextForBind(field)
      ].filter(Boolean).join(' '),
      value: field.value
    })).filter((item) => item.value !== undefined && item.value !== null && String(item.value).trim() !== '');
  }

  function nearestTextForBind(element) {
    const formItem = element.closest('.el-form-item, .ant-form-item, .form-item, label, [class*="form"]');
    return formItem ? formItem.textContent.trim() : '';
  }

  function flattenJson(value, prefix = '', output = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        flattenJson(child, path, output);
      } else {
        output[path] = child;
      }
    }
    return output;
  }

  function isStaticLike(value) {
    return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)(\?|$)/i.test(String(value));
  }

  function isJsonLike(contentType, responseText) {
    if (String(contentType || '').includes('json')) return true;
    const trimmed = String(responseText || '').trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }
})();
