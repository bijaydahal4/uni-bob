// Small DOM helpers: safe HTML templates and event delegation.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Mark a string as already-safe HTML. */
export const raw = (s) => ({ __html: String(s ?? '') });

function flat(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(flat).join('');
  if (typeof v === 'object' && '__html' in v) return v.__html;
  return esc(v);
}

/** Tagged template: html`<p>${text}</p>` escapes everything that isn't raw(). */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += flat(values[i]) + strings[i + 1];
  return raw(out);
}

export const toHTML = (v) => flat(v);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function setHTML(el, content) {
  el.innerHTML = flat(content);
}

/** Delegated events: on(root, 'click', '[data-action="x"]', handler). */
export function on(root, type, selector, handler, opts) {
  const fn = (e) => {
    const t = e.target instanceof Element ? e.target.closest(selector) : null;
    if (t && root.contains(t)) handler(e, t);
  };
  root.addEventListener(type, fn, opts);
  return () => root.removeEventListener(type, fn, opts);
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function attr(name, value) {
  if (value === null || value === undefined || value === false) return '';
  if (value === true) return raw(` ${name}`);
  return raw(` ${name}="${esc(value)}"`);
}
