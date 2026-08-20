/**
 * Auth header hook, injected at document_start in the MAIN world via
 * chrome.scripting.registerContentScripts. Because it runs before the page's
 * own JavaScript boots, it captures the SPA's initial authenticated requests
 * (which fire before any executeScript-based hook could install).
 *
 * Stores captured headers per request origin on the window object only:
 *   window.__flowmindAuthHookV2.byOrigin[origin] = { headers, at }
 */
(function () {
  if (window.__flowmindAuthHookV2) return;
  var store = { byOrigin: {} };
  window.__flowmindAuthHookV2 = store;

  var skipHeaders = {
    'content-type': 1, 'content-length': 1, 'host': 1, 'origin': 1, 'referer': 1,
    'user-agent': 1, 'accept': 1, 'accept-language': 1, 'accept-encoding': 1,
    'connection': 1, 'cookie': 1, 'sec-ch-ua': 1, 'sec-ch-ua-mobile': 1,
    'sec-ch-ua-platform': 1, 'sec-fetch-dest': 1, 'sec-fetch-mode': 1, 'sec-fetch-site': 1
  };

  function originOf(url) {
    try {
      return new URL(url, location.href).origin;
    } catch (_error) {
      return null;
    }
  }

  function record(origin, headers) {
    if (!origin) return;
    var clean = {};
    var keys = Object.keys(headers || {});
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var lower = String(key).toLowerCase();
      if (skipHeaders[lower]) continue;
      var value = headers[key];
      clean[lower] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    if (Object.keys(clean).length > 0) {
      store.byOrigin[origin] = { headers: clean, at: Date.now() };
    }
  }

  var originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function flowmindAuthFetchV2(input, init) {
      try {
        var url = input instanceof Request ? input.url : String(input);
        var origin = originOf(url);
        if (origin) {
          var headers = {};
          if (input instanceof Request) {
            input.headers.forEach(function (value, key) {
              headers[key] = value;
            });
          }
          var initHeaders = init && init.headers;
          if (initHeaders) {
            if (typeof initHeaders.forEach === 'function') {
              initHeaders.forEach(function (value, key) {
                headers[key] = value;
              });
            } else if (typeof initHeaders === 'object') {
              Object.assign(headers, initHeaders);
            }
          }
          record(origin, headers);
        }
      } catch (_error) {
        // Header learning must never break the page's own requests.
      }
      return originalFetch.apply(this, arguments);
    };
  }

  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function flowmindAuthOpenV2(method, url) {
    this.__flowmindHookOrigin = originOf(url);
    this.__flowmindHookHeaders = {};
    return originalOpen.apply(this, arguments);
  };

  var originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function flowmindAuthSetHeaderV2(key, value) {
    try {
      if (!this.__flowmindHookHeaders) this.__flowmindHookHeaders = {};
      this.__flowmindHookHeaders[key] = value;
      if (this.__flowmindHookOrigin) {
        record(this.__flowmindHookOrigin, this.__flowmindHookHeaders);
      }
    } catch (_error) {
      // Ignore malformed header usage.
    }
    return originalSetRequestHeader.apply(this, arguments);
  };
})();
