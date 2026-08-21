const { formatLogLine, stringifyExtra } = require('../../../src/main/utils/logFormat');

function makeInfo({
  timestamp = '2026-01-01 00:00:00',
  level = 'warn',
  message = '',
  splat = [],
  stack,
} = {}) {
  const info = { timestamp, level, message };
  if (stack) info.stack = stack;
  if (splat.length) info[Symbol.for('splat')] = splat;
  return info;
}

describe('formatLogLine', () => {
  it('renders the base line with just a label and no extra args', () => {
    const line = formatLogLine(makeInfo({ message: 'MPRIS started' }));
    expect(line).toBe('[2026-01-01 00:00:00] WARN: MPRIS started');
  });

  it('includes a string extra argument, not just the label', () => {
    const line = formatLogLine(makeInfo({ message: 'MPRIS error:', splat: ['stream is closed'] }));
    expect(line).toBe('[2026-01-01 00:00:00] WARN: MPRIS error: stream is closed');
  });

  it("includes an Error extra argument's message", () => {
    const line = formatLogLine(makeInfo({ message: 'Fatal error:', splat: [new Error('boom')] }));
    expect(line).toContain('boom');
  });

  it('includes a plain object extra argument via JSON', () => {
    const line = formatLogLine(
      makeInfo({ message: 'D-Bus reply:', splat: [{ type: 'Failed', text: 'name taken' }] })
    );
    expect(line).toContain('"text":"name taken"');
  });

  it('joins multiple extra arguments with spaces', () => {
    const line = formatLogLine(makeInfo({ message: 'multi:', splat: ['a', 'b', 'c'] }));
    expect(line).toBe('[2026-01-01 00:00:00] WARN: multi: a b c');
  });

  it('appends the stack on its own line after everything else', () => {
    const line = formatLogLine(
      makeInfo({ message: 'Fatal error:', splat: ['extra'], stack: 'Error: boom\n    at x' })
    );
    expect(line).toBe('[2026-01-01 00:00:00] WARN: Fatal error: extra\nError: boom\n    at x');
  });

  it('does not throw and still logs the label when an extra arg has circular references', () => {
    const circular = {};
    circular.self = circular;
    const line = formatLogLine(makeInfo({ message: 'label:', splat: [circular] }));
    expect(line).toContain('label:');
    expect(line).not.toContain('undefined');
  });
});

describe('stringifyExtra', () => {
  it('prefers stack, then message, then toString for Error instances', () => {
    const withStack = new Error('a');
    expect(stringifyExtra(withStack)).toBe(withStack.stack);

    const noStack = new Error('b');
    delete noStack.stack;
    expect(stringifyExtra(noStack)).toBe('b');
  });

  it('JSON-stringifies plain objects', () => {
    expect(stringifyExtra({ a: 1 })).toBe('{"a":1}');
  });

  it('stringifies primitives directly', () => {
    expect(stringifyExtra('hello')).toBe('hello');
    expect(stringifyExtra(42)).toBe('42');
    expect(stringifyExtra(undefined)).toBe('undefined');
    expect(stringifyExtra(null)).toBe('null');
  });
});
