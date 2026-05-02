const CHANNEL_THROTTLE_MS = {
  'player:update': 4000,
  'playback:auto-pause': 1000,
  'playback:auto-resume': 1000,
};

const lastLogAt = new Map();

function truncate(text, max = 220) {
  const value = String(text);
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function summarizeValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const type = typeof value;
  if (type === 'string') return truncate(JSON.stringify(value), 120);
  if (type === 'number' || type === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return `Array(len=${value.length})`;
  }

  if (type === 'object') {
    const keys = Object.keys(value);
    return `Object(keys=${keys.slice(0, 8).join(',')}${keys.length > 8 ? ',...' : ''})`;
  }

  return type;
}

function summarizeArgs(args) {
  if (!args || !args.length) return '[]';
  return `[${args.map((arg) => summarizeValue(arg)).join(', ')}]`;
}

function traceEnabled(ctx) {
  try {
    return Boolean(ctx.store.get('debugMode', false) || process.env.NETFLIX_TRACE_IPC === '1');
  } catch {
    return process.env.NETFLIX_TRACE_IPC === '1';
  }
}

function canLog(channel) {
  const throttleMs = CHANNEL_THROTTLE_MS[channel];
  if (!throttleMs) return true;

  const now = Date.now();
  const last = lastLogAt.get(channel) || 0;
  if (now - last < throttleMs) return false;
  lastLogAt.set(channel, now);
  return true;
}

function trace(ctx, direction, channel, payload, level = 'debug') {
  if (!traceEnabled(ctx)) return;
  if (!canLog(channel)) return;
  const logger = ctx.logger[level] || ctx.logger.debug;
  logger.call(ctx.logger, `[IPC ${direction}] ${channel} ${payload}`);
}

function registerHandle(ctx, ipcMain, channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    trace(ctx, 'IN', channel, summarizeArgs(args));
    try {
      const result = await handler(event, ...args);
      trace(ctx, 'OUT', channel, summarizeValue(result));
      return result;
    } catch (error) {
      trace(ctx, 'ERR', channel, truncate(error?.message || error), 'warn');
      throw error;
    }
  });
}

function registerOn(ctx, ipcMain, channel, handler) {
  ipcMain.on(channel, async (event, ...args) => {
    trace(ctx, 'IN', channel, summarizeArgs(args));
    try {
      await handler(event, ...args);
      trace(ctx, 'OUT', channel, 'ok');
    } catch (error) {
      trace(ctx, 'ERR', channel, truncate(error?.message || error), 'warn');
    }
  });
}

module.exports = {
  registerHandle,
  registerOn,
};
