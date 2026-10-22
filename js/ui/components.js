// Reusable pieces: chance slider, chips, info buttons, grade pickers, sheets and toasts.

import { html, raw, esc, attr, toHTML, $, on } from './dom.js';
import { icon } from './icons.js';
import { GRADES, CHANCE_LABELS, markerPosition } from '../logic/grades.js';
import { db } from '../data.js';

// ---- Chips -------------------------------------------------------------------

export function chip(text, kind = '', ic = null) {
  return html`<span class="chip ${kind}">${ic ? icon(ic, { size: 14 }) : ''}${text}</span>`;
}

// ---- Info (ⓘ) ------------------------------------------------------------------

export function info(key, label) {
  const g = db.glossary[key];
  const name = label || g?.term || key;
  return html`<button type="button" class="info-btn" data-action="info" data-key="${key}" aria-label="What does ${name} mean?">${icon('info', { size: 18 })}</button>`;
}

/** A word with its ⓘ next to it, e.g. term('ucas', 'UCAS'). */
export function term(key, text) {
  return html`<span class="term">${text}${info(key, text)}</span>`;
}

// ---- Grade picker ------------------------------------------------------------

export function gradeSelect({ value, label, data = {}, grades = GRADES, cls = '' }) {
  const attrs = Object.entries(data).map(([k, v]) => attr(`data-${k}`, v));
  return html`<span class="grade-pick ${cls}"><select class="grade-select" aria-label="${label}"${attrs}>
    ${grades.map((g) => html`<option value="${g}"${value === g ? raw(' selected') : ''}>${g}</option>`)}
  </select>${icon('chevronDown', { size: 14, cls: 'grade-pick__chev' })}</span>`;
}

// ---- Heart ---------------------------------------------------------------------

export function heart(kind, id, saved, name) {
  return html`<button type="button" class="heart ${saved ? 'is-on' : ''}" data-action="fav" data-kind="${kind}" data-id="${id}"
    aria-pressed="${saved ? 'true' : 'false'}" aria-label="${saved ? 'Remove' : 'Save'} ${name}">${icon(saved ? 'heartFill' : 'heart', { size: 22 })}</button>`;
}

// ---- Chance slider ------------------------------------------------------------------

export function chanceLabel(r) {
  if (!r) return html`<span class="chance-tag is-none">Not confirmed</span>`;
  return html`<span class="chance-tag is-${r.chance}"><i aria-hidden="true"></i>${r.label}</span>`;
}

/**
 * The Safe → Reach bar. r = computeChance() result.
 * compact: small version for cards. full: with legend, sentence and notes.
 */
export function chanceSlider(r, { compact = false, showSentence = !compact } = {}) {
  if (!r) {
    return html`<div class="chance chance--none ${compact ? 'chance--compact' : ''}">
      <p class="chance__sentence muted">We couldn't confirm the entry requirements, so there's no slider. Check the uni's page.</p></div>`;
  }
  const ref = r.reference;
  const markers = r.markers.map((m) => ({ ...m, pos: markerPosition(m.value, ref) }));
  let band = '';
  if (r.range) {
    const a = markerPosition(r.range.top, ref);
    const b = markerPosition(r.range.low, ref);
    band = html`<span class="chance__band" style="left:${Math.min(a, b)}%;width:${Math.abs(b - a)}%"></span>`;
  }
  const alt = markers.find((m) => m.kind === 'alt');
  const usual = markers.find((m) => m.kind === 'usual');
  const aria = `Your chances: ${r.label}. ${compact ? r.sentence : ''}`.trim();
  return html`<div class="chance ${compact ? 'chance--compact' : 'chance--full'}">
    ${compact ? '' : html`<div class="chance__head">${chanceLabel(r)}${info('chances', 'how chances work')}</div>`}
    <div class="chance__track" role="img" aria-label="${aria}">
      <span class="chance__zones" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      ${band}
      ${markers.map((m) => html`<span class="chance__marker ${m.kind === 'alt' ? 'is-alt' : ''}" style="left:${m.pos}%" aria-hidden="true"></span>`)}
      <span class="chance__dot" style="left:${r.position}%" aria-hidden="true"></span>
    </div>
    ${compact ? '' : html`<div class="chance__ends" aria-hidden="true"><span>Safe</span><span>Reach</span></div>
      <ul class="chance__legend">
        <li><i class="lg-dot" aria-hidden="true"></i>You: ${r.her || '—'}</li>
        <li><i class="lg-line" aria-hidden="true"></i>Usual offer: ${usual.text}</li>
        ${alt ? html`<li><i class="lg-line is-alt" aria-hidden="true"></i>${alt.label}: ${alt.text}</li>` : ''}
        ${r.range ? html`<li><i class="lg-band" aria-hidden="true"></i>Their offer range</li>` : ''}
      </ul>`}
    ${showSentence ? html`<p class="chance__sentence">${r.sentence}</p>` : ''}
    ${!compact && r.notes.length ? html`<ul class="chance__notes">${r.notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}
  </div>`;
}

// ---- Sheets (dialogs) ----------------------------------------------------------------

let sheetEl = null;
let sheetCleanup = [];
let returnFocus = null;

function ensureSheet() {
  if (sheetEl) return sheetEl;
  sheetEl = document.createElement('dialog');
  sheetEl.className = 'sheet';
  sheetEl.setAttribute('aria-modal', 'true');
  document.body.appendChild(sheetEl);
  sheetEl.addEventListener('click', (e) => {
    if (e.target === sheetEl) closeSheet(); // tapped the dimmed backdrop
  });
  sheetEl.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
  on(sheetEl, 'click', '[data-action="close-sheet"]', () => closeSheet());
  return sheetEl;
}

/**
 * openSheet({ title, body, footer, size, onMount }) shows a modal sheet.
 * body/footer are html`` values or functions returning them.
 */
export function openSheet({ title, body, footer = '', size = 'md', onMount, label }) {
  const el = ensureSheet();
  closeSheet(true);
  returnFocus = document.activeElement;
  el.dataset.size = size;
  el.setAttribute('aria-label', label || title || 'Details');
  el.innerHTML = toHTML(html`<div class="sheet__panel">
    <header class="sheet__head">
      <h2 class="sheet__title" tabindex="-1" autofocus>${title}</h2>
      <button type="button" class="icon-btn sheet__close" data-action="close-sheet" aria-label="Close">${icon('x', { size: 20 })}</button>
    </header>
    <div class="sheet__body">${body}</div>
    ${footer ? html`<footer class="sheet__foot">${footer}</footer>` : ''}
  </div>`);
  if (typeof el.showModal === 'function') el.showModal(); else el.setAttribute('open', '');
  el.querySelector('.sheet__title')?.focus({ preventScroll: true });
  document.documentElement.classList.add('has-sheet');
  if (onMount) {
    const c = onMount(el);
    if (typeof c === 'function') sheetCleanup.push(c);
  }
  return el;
}

export function closeSheet(silent = false) {
  if (!sheetEl) return;
  for (const c of sheetCleanup) c();
  sheetCleanup = [];
  if (sheetEl.open) {
    if (typeof sheetEl.close === 'function') sheetEl.close(); else sheetEl.removeAttribute('open');
  }
  document.documentElement.classList.remove('has-sheet');
  if (!silent && returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
}

export function openInfo(key) {
  const g = db.glossary[key];
  if (!g) return;
  openSheet({
    title: g.term,
    size: 'sm',
    body: html`<p class="lead">${g.short}</p>${g.more ? html`<p class="muted">${g.more}</p>` : ''}
      ${g.link ? html`<p><a class="link" href="${g.link.url}" target="_blank" rel="noopener">${g.link.text}${icon('external', { size: 14 })}</a></p>` : ''}`,
    footer: html`<button type="button" class="btn btn-primary btn-block" data-action="close-sheet">Got it</button>`,
  });
}

/** confirmSheet → Promise<boolean>. */
export function confirmSheet({ title, message, confirm = 'OK', cancel = 'Cancel', destructive = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openSheet({
      title,
      size: 'sm',
      body: html`<p>${message}</p>`,
      footer: html`<div class="btn-row">
        <button type="button" class="btn btn-secondary" data-answer="no">${cancel}</button>
        <button type="button" class="btn ${destructive ? 'btn-destructive' : 'btn-primary'}" data-answer="yes">${confirm}</button></div>`,
      onMount(el) {
        // closeSheet() runs this cleanup however the sheet closes (button, backdrop or Escape).
        const off = on(el, 'click', '[data-answer]', (e, t) => { finish(t.dataset.answer === 'yes'); closeSheet(); });
        return () => { off(); finish(false); };
      },
    });
  });
}

// ---- Toasts -----------------------------------------------------------------------------

let toastTimer = null;
export function toast(message, { ms = 2600 } = {}) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

// ---- Small building blocks ----------------------------------------------------------------

export function section(title, body, { infoKey = null, id = null, cls = '' } = {}) {
  return html`<section class="section ${cls}"${attr('id', id)}>
    <h2 class="section__title">${title}${infoKey ? info(infoKey) : ''}</h2>
    ${body}
  </section>`;
}

export function expander(summary, body, { open = false, cls = '' } = {}) {
  return html`<details class="expander ${cls}"${open ? raw(' open') : ''}>
    <summary><span>${summary}</span>${icon('chevronDown', { size: 16, cls: 'expander__chev' })}</summary>
    <div class="expander__body">${body}</div>
  </details>`;
}

export function externalLink(url, text, cls = 'link') {
  if (!url) return '';
  return html`<a class="${cls}" href="${url}" target="_blank" rel="noopener">${text}${icon('external', { size: 14 })}</a>`;
}

export function dateStatus(status) {
  if (!status) return '';
  const k = status === 'Confirmed' ? 'confirmed' : 'expected';
  return html`<span class="date-tag is-${k}">${status}</span>`;
}

export function emptyState(title, text, action = '') {
  return html`<div class="empty"><p class="empty__title">${title}</p><p class="muted">${text}</p>${action}</div>`;
}

export { esc };
