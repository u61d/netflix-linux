// Winston's printf formatter only sees timestamp/level/message/stack by
// default. Extra arguments passed to logger.warn(label, detail) land under
// Symbol.for('splat') instead of getting merged into message — miss that,
// and every logger.warn('label:', someNonErrorValue) call silently drops
// the detail from the log file, showing only the label.
function stringifyExtra(item) {
  if (item instanceof Error) return item.stack || item.message || item.toString();
  if (item && typeof item === 'object') {
    try {
      return JSON.stringify(item);
    } catch {
      return String(item);
    }
  }
  return String(item);
}

function formatLogLine(info) {
  const { timestamp, level, message, stack } = info;
  const splat = info[Symbol.for('splat')] || [];
  const extra = splat.map(stringifyExtra).join(' ');

  return `[${timestamp}] ${level.toUpperCase()}: ${message}${extra ? ` ${extra}` : ''}${
    stack ? '\n' + stack : ''
  }`;
}

module.exports = { formatLogLine, stringifyExtra };
