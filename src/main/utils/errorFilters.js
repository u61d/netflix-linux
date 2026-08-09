// dbus-next (used by MPRIS) has a known race: an incoming D-Bus message can
// arrive needing a reply after the underlying socket has already closed,
// which throws synchronously from deep inside its own internals. It's
// benign — doesn't touch app state, Netflix playback, or anything outside
// the D-Bus subsystem — so it shouldn't be treated as a fatal error.
function isBenignDbusStreamError(error) {
  const message = error?.message || '';
  const stack = error?.stack || '';
  return message.includes('Cannot send message, stream is closed') && stack.includes('dbus-next');
}

module.exports = { isBenignDbusStreamError };
