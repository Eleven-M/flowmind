const { PassThrough } = require('stream');
const { shouldProxyInkStdin } = require('./utils');

function registerJsxExtension() {
  require('module')._extensions['.jsx'] = require('module')._extensions['.js'];
}

function createInkStdinProxy(realStdin) {
  if (!realStdin) {
    return { stdin: null, wrapper: null, forwarder: null };
  }

  const wrapper = new PassThrough();
  wrapper.isTTY = true;
  wrapper.isRaw = false;
  wrapper.setRawMode = (mode) => {
    try {
      if (realStdin.setRawMode) {
        realStdin.setRawMode(mode);
      }
    } catch (error) {
      // Ignore raw mode failures in wrapped environments.
    }
    return wrapper;
  };

  let forwarder = null;
  if (realStdin.readable) {
    forwarder = (chunk) => {
      if (!wrapper.destroyed) {
        try {
          wrapper.write(chunk);
        } catch (error) {
          // Ignore write-after-destroy errors while shutting down.
        }
      }
    };
    realStdin.on('data', forwarder);
  }

  return { stdin: wrapper, wrapper, forwarder };
}

function cleanupInkStdinProxy(realStdin, proxy) {
  if (!proxy) return;

  if (proxy.forwarder && realStdin?.removeListener) {
    realStdin.removeListener('data', proxy.forwarder);
  }

  if (proxy.wrapper && !proxy.wrapper.destroyed) {
    proxy.wrapper.destroy();
  }
}

async function launchInkApp({ element, stdin = process.stdin }) {
  registerJsxExtension();
  const { render } = require('ink');
  const proxy = shouldProxyInkStdin(stdin) ? createInkStdinProxy(stdin) : { stdin: null, wrapper: null, forwarder: null };
  let unmount = null;

  try {
    const rendered = render(element, { stdin: proxy.stdin || stdin });
    unmount = rendered.unmount;
    await rendered.waitUntilExit();
  } finally {
    if (typeof unmount === 'function') {
      unmount();
    }
    cleanupInkStdinProxy(stdin, proxy);
  }
}

module.exports = {
  cleanupInkStdinProxy,
  createInkStdinProxy,
  launchInkApp,
  registerJsxExtension
};
