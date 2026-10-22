// A tiny test runner that works in any browser. tools/run_tests.py runs it in WebKit.

const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

export class AssertionError extends Error {}

function show(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

export const assert = {
  equal(actual, expected, msg = '') {
    if (actual !== expected) throw new AssertionError(`${msg} expected ${show(expected)}, got ${show(actual)}`);
  },
  deepEqual(actual, expected, msg = '') {
    if (show(actual) !== show(expected)) throw new AssertionError(`${msg} expected ${show(expected)}, got ${show(actual)}`);
  },
  ok(v, msg = '') {
    if (!v) throw new AssertionError(`${msg} expected truthy, got ${show(v)}`);
  },
  match(str, re, msg = '') {
    if (!re.test(String(str))) throw new AssertionError(`${msg} expected ${show(str)} to match ${re}`);
  },
};

export async function run() {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (e) {
      results.push({ name: t.name, ok: false, error: e.message });
    }
  }
  const failed = results.filter((r) => !r.ok);
  const out = document.getElementById('out');
  if (out) {
    out.textContent = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n      ${r.error}`}`).join('\n')
      + `\n\n${results.length - failed.length}/${results.length} passed`;
  }
  window.__results = results;
  window.__done = true;
  return results;
}
