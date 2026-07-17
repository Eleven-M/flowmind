const { EventEmitter } = require('events');
const { cleanupInkStdinProxy, createInkStdinProxy } = require('../core/cli-ink');

describe('cli ink helper', () => {
  test('proxies stdin data and cleans up listeners', () => {
    const stdin = new EventEmitter();
    stdin.readable = true;
    stdin.setRawMode = jest.fn();

    const proxy = createInkStdinProxy(stdin);
    const chunks = [];

    proxy.stdin.on('data', (chunk) => {
      chunks.push(chunk.toString());
    });

    stdin.emit('data', Buffer.from('hello'));
    expect(chunks).toEqual(['hello']);
    expect(stdin.listenerCount('data')).toBe(1);

    cleanupInkStdinProxy(stdin, proxy);

    expect(stdin.listenerCount('data')).toBe(0);
    expect(proxy.wrapper.destroyed).toBe(true);
  });
});
