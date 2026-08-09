const { isBenignDbusStreamError } = require('../../../src/main/utils/errorFilters');

describe('isBenignDbusStreamError', () => {
  it('matches the known dbus-next stream-closed race', () => {
    const error = new Error('Cannot send message, stream is closed');
    error.stack =
      'Error: Cannot send message, stream is closed\n' +
      '    at EventEmitter.self.message (/app.asar/node_modules/dbus-next/lib/connection.js:139:15)\n' +
      '    at MessageBus.send (/app.asar/node_modules/dbus-next/lib/bus.js:371:22)';

    expect(isBenignDbusStreamError(error)).toBe(true);
  });

  it('does not match the same message from an unrelated stack', () => {
    const error = new Error('Cannot send message, stream is closed');
    error.stack =
      'Error: Cannot send message, stream is closed\n    at SomeOtherLib.write (index.js:1:1)';

    expect(isBenignDbusStreamError(error)).toBe(false);
  });

  it('does not match a dbus-next stack with a different message', () => {
    const error = new Error('Some other dbus-next failure');
    error.stack =
      'Error: Some other dbus-next failure\n    at node_modules/dbus-next/lib/bus.js:1:1';

    expect(isBenignDbusStreamError(error)).toBe(false);
  });

  it('does not match a completely unrelated error', () => {
    const error = new Error('ENOENT: no such file or directory');
    expect(isBenignDbusStreamError(error)).toBe(false);
  });

  it('handles a rejection reason with no message/stack without throwing', () => {
    expect(isBenignDbusStreamError(undefined)).toBe(false);
    expect(isBenignDbusStreamError(null)).toBe(false);
    expect(isBenignDbusStreamError('a plain string rejection')).toBe(false);
    expect(isBenignDbusStreamError({})).toBe(false);
  });
});
