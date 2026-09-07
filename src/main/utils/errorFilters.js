// dbus-next (used by MPRIS) has a known class of failure where the
// underlying socket/stream is already closed when something tries to use
// it — an incoming message needing a reply, or an outgoing property-change
// write. Different call sites inside dbus-next report it with slightly
// different wording ("Cannot send message, stream is closed" vs "Tried to
// write a message to a closed stream"), so match on the shared substance
// rather than one exact phrase. It's benign — confined to the D-Bus
// subsystem, doesn't touch app state or Netflix playback.
function isBenignDbusStreamError(error) {
  const message = error?.message || '';
  const stack = error?.stack || '';
  const mentionsClosedStream = /stream/i.test(message) && /closed/i.test(message);
  return mentionsClosedStream && stack.includes('dbus-next');
}

module.exports = { isBenignDbusStreamError };
