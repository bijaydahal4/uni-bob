// Uni Bob: app shell, routing and shared actions.

import * as store from './store.js';
import { db, loadData, invalidate } from './data.js';
import { html, toHTML, $, $$, on, prefersReducedMotion } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { openInfo, toast, closeSheet } from './ui/components.js';
import { renderSidebar } from './ui/sidebar.js';
import { pickGreeting } from './ui/greetings.js';
import { formatDate } from './logic/dates.js';
import { runOnboarding } from './screens/onboarding.js';
import { openAddSubject, removeSubject, setGrade } from './screens/subjects.js';
import explore from './screens/explore.js';
import uni from './screens/uni.js';
import course from './screens/course.js';
import favourites from './screens/favourites.js';
import summer from './screens/summer.js';
import whatif from './screens/whatif.js';
import contextual from './screens/contextual.js';
import timeline from './screens/timeline.js';
import settings from './screens/settings.js';

const SCREENS = { explore, uni, course, favourites, summer, whatif, contextual, timeline, settings };
const app = document.getElementById('app');
let route = { name: 'explore', params: [] };
let cleanup = null;
const navStack = [];

// ---- Theme ------------------------------------------------------------------

export function applyTheme(theme = store.get().settings.theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  const colour = t === 'dark' ? '#000000' : '#F2F2F7';
  for (const m of $$('meta[name="theme-color"]')) m.setAttribute('content', colour);
}

// ---- Routing ------------------------------------------------------------------

function parseRoute() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [name, ...params] = h.split('/').filter(Boolean);
  return SCREENS[name] ? { name, params } : { name: 'explore', params: [] };
}

export function go(path) {
  location.hash = path.startsWith('#') ? path : `#/${path}`;
}

function onHashChange() {
  const next = parseRoute();
  const key = `${next.name}/${next.params.join('/')}`;
  const prevKey = navStack[navStack.length - 1];
  if (navStack.length > 1 && navStack[navStack.length - 2] === key) navStack.pop();
  else if (prevKey !== key) navStack.push(key);
  route = next;
  closeSidebar();
  closeSheet(true);
  renderSidebarNow();
  renderMain({ fresh: true });
}

function backTarget() {
  const prev = navStack[navStack.length - 2];
  if (prev) {
    const [name, id] = prev.split('/');
    return { label: labelFor(name, id), history: true };
  }
  const s = SCREENS[route.name];
  const parent = s.parent ? s.parent(route.params) : { href: '#/explore', label: 'Explore' };
  return { ...parent, history: false };
}

function labelFor(name, id) {
  if (name === 'uni') return db.uni.get(id)?.shortName || 'Back';
  if (name === 'course') return db.course.get(id)?.name || 'Back';
  return SCREENS[name]?.label || 'Back';
}

// ---- Shell --------------------------------------------------------------------

function renderShell() {
  app.innerHTML = toHTML(html`<div class="shell" id="shell" data-sidebar="closed">
    <aside class="sidebar" id="sidebar" aria-label="Uni Bob"></aside>
    <div class="scrim" data-action="close-sidebar" aria-hidden="true"></div>
    <div class="detail" id="detail">
      <header class="toolbar" id="toolbar"></header>
      <div id="banner"></div>
      <main class="content" id="main" tabindex="-1"></main>
    </div>
  </div>
  <div id="whats-new"></div>`);
  bindGlobal();
}

// ---- What's new -----------------------------------------------------------------
// Change the id and the text to announce the next feature; closing it is remembered on this device.
const WHATS_NEW = { id: 'summer-favourites', text: 'You can now tap the heart on a summer school to save it in its own section of Favourites.' };

function renderWhatsNew() {
  const el = $('#whats-new');
  if (!el || store.get().meta.whatsNewSeen === WHATS_NEW.id) return;
  el.innerHTML = toHTML(html`<aside class="whats-new" role="status" aria-label="What's new">
    <div class="whats-new__body">
      <p class="whats-new__title">What's new!</p>
      <p class="whats-new__text">${WHATS_NEW.text}</p>
    </div>
    <button type="button" class="icon-btn icon-btn--sm whats-new__close" aria-label="Close What's new">${icon('x', { size: 18 })}</button>
  </aside>`);
  $('.whats-new__close', el).addEventListener('click', () => {
    store.update((s) => { s.meta.whatsNewSeen = WHATS_NEW.id; }, 'meta');
    el.innerHTML = '';
  });
}

function renderSidebarNow() {
  const el = $('#sidebar');
  if (!el) return;
  const st = store.get();
  const meta = { lastChecked: db.meta.lastChecked, lastCheckedText: db.meta.lastChecked ? formatDate(db.meta.lastChecked) : '' };
  withFocusKept(() => { el.innerHTML = toHTML(renderSidebar(st, route.name, meta)); });
}

function renderBanner() {
  const el = $('#banner');
  if (!el) return;
  const w = store.get().whatIf;
  const name = w.currentId ? w.saved.find((x) => x.id === w.currentId)?.name : null;
  el.innerHTML = w.active
    ? toHTML(html`<div class="whatif-banner" role="status">
        <span class="whatif-banner__text">${icon('sparkles', { size: 16 })}<span>You're trying a What-if${name ? html`: <b>${name}</b>` : ''}</span></span>
        <button type="button" class="btn btn-small btn-on-banner" data-action="whatif-off">Back to my grades</button>
      </div>`)
    : '';
}

function renderToolbar() {
  const el = $('#toolbar');
  const s = SCREENS[route.name];
  const tb = s.toolbar ? s.toolbar(route.params, ctx()) : {};
  const back = s.back ? backTarget() : null;
  el.innerHTML = toHTML(html`
    <div class="toolbar__left">
      <button type="button" class="icon-btn toolbar__sidebar" data-action="open-sidebar" aria-label="Show sections" aria-controls="sidebar">${icon('sidebar', { size: 22 })}</button>
      ${back ? html`<button type="button" class="toolbar__back" data-action="back" ${back.href ? html`data-href="${back.href}"` : ''}>
        ${icon('chevronLeft', { size: 22 })}<span>${back.label}</span></button>` : ''}
    </div>
    <div class="toolbar__title" aria-hidden="true">${s.title ? s.title(route.params, ctx()) : ''}</div>
    <div class="toolbar__right">${tb.actions || ''}</div>`);
}

function ctx() {
  return { state: store.get(), db, profile: store.effectiveProfile(), go, rerender: () => renderMain() };
}

function withFocusKept(fn) {
  const a = document.activeElement;
  const key = a?.dataset?.fkey;
  fn();
  if (key) {
    const again = document.querySelector(`[data-fkey="${CSS.escape(key)}"]`);
    if (again) again.focus({ preventScroll: true });
  }
}

function renderMain({ fresh = false } = {}) {
  const main = $('#main');
  const detail = $('#detail');
  if (!main) return;
  const s = SCREENS[route.name];
  const scroll = detail.scrollTop;
  if (cleanup) { cleanup(); cleanup = null; }
  withFocusKept(() => {
    main.innerHTML = toHTML(s.render(route.params, ctx()));
    main.dataset.screen = route.name;
  });
  renderToolbar();
  renderBanner();
  document.title = s.title ? `${s.title(route.params, ctx())} · Uni Bob` : 'Uni Bob';
  if (s.mount) cleanup = s.mount(main, route.params, ctx()) || null;
  observeTitle(main);
  if (fresh) {
    detail.scrollTop = 0;
    const h1 = main.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  } else {
    detail.scrollTop = scroll;
  }
}

let titleObserver = null;
function observeTitle(main) {
  if (titleObserver) titleObserver.disconnect();
  const h1 = main.querySelector('h1');
  const tb = $('#toolbar');
  if (!h1 || !('IntersectionObserver' in window)) return;
  titleObserver = new IntersectionObserver(([e]) => tb.classList.toggle('is-scrolled', !e.isIntersecting), { root: $('#detail'), rootMargin: '-56px 0px 0px 0px' });
  titleObserver.observe(h1);
}

function openSidebar() {
  const sh = $('#shell');
  sh.dataset.sidebar = 'open';
  const first = $('#sidebar a.is-active') || $('#sidebar a');
  first?.focus({ preventScroll: true });
}

function closeSidebar() {
  const sh = $('#shell');
  if (sh && sh.dataset.sidebar === 'open') sh.dataset.sidebar = 'closed';
}

// ---- Shared actions -------------------------------------------------------------------

function bindGlobal() {
  const root = document.body;
  on(root, 'click', '[data-action="info"]', (e, t) => { e.preventDefault(); e.stopPropagation(); openInfo(t.dataset.key); });
  on(root, 'click', '[data-action="open-sidebar"]', () => openSidebar());
  on(root, 'click', '[data-action="close-sidebar"]', () => closeSidebar());
  on(root, 'click', '[data-action="back"]', (e, t) => {
    if (navStack.length > 1) history.back();
    else go(t.dataset.href || '#/explore');
  });
  on(root, 'click', '[data-action="whatif-off"]', () => {
    store.update((s) => { s.whatIf.active = false; s.whatIf.current = null; s.whatIf.currentId = null; }, 'whatif');
    toast('Back to your real grades');
  });
  on(root, 'click', '[data-action="fav"]', (e, t) => {
    e.preventDefault();
    e.stopPropagation();
    const kind = { uni: 'unis', course: 'courses', programme: 'programmes' }[t.dataset.kind];
    const nowSaved = store.toggleFavourite(kind, t.dataset.id);
    for (const b of $$(`[data-action="fav"][data-kind="${t.dataset.kind}"][data-id="${CSS.escape(t.dataset.id)}"]`)) {
      b.classList.toggle('is-on', nowSaved);
      b.setAttribute('aria-pressed', nowSaved ? 'true' : 'false');
      const name = b.getAttribute('aria-label').replace(/^(Save|Remove) /, '');
      b.setAttribute('aria-label', `${nowSaved ? 'Remove' : 'Save'} ${name}`);
      b.innerHTML = toHTML(icon(nowSaved ? 'heartFill' : 'heart', { size: 22 }));
    }
    toast(nowSaved ? 'Saved to Favourites' : 'Removed from Favourites');
  });
  on(root, 'change', 'select[data-action="set-grade"]', (e, t) => setGrade(t.dataset.scope, t.dataset.id, t.value));
  on(root, 'click', '[data-action="add-subject"]', (e, t) => openAddSubject(t.dataset.scope));
  on(root, 'click', '[data-action="remove-subject"]', (e, t) => removeSubject(t.dataset.scope, t.dataset.id));
  on(root, 'click', 'a[data-nav]', () => closeSidebar());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });
}

store.subscribe((what) => {
  if (!$('#main') || what === 'meta') return;
  if (what === 'reset' || what === 'restore') { location.hash = '#/explore'; location.reload(); return; }
  if (['profile', 'whatif'].includes(what)) invalidate();
  if (what === 'settings') applyTheme();
  const s = SCREENS[route.name];
  if (s.update && s.update(what, ctx()) === true) {
    if (['profile', 'whatif', 'settings', 'name'].includes(what)) renderSidebarNow();
    renderBanner();
    return;
  }
  if (['profile', 'whatif', 'settings', 'favourites'].includes(what)) renderSidebarNow();
  if (what !== 'favourites' || route.name === 'favourites') renderMain();
});

// ---- Launch ---------------------------------------------------------------------------

async function splash(dataPromise) {
  const st = store.get();
  const g = pickGreeting(st.profile.name, st.meta.lastGreeting);
  store.update((s) => { s.meta.lastGreeting = g.key; }, 'meta');
  app.innerHTML = toHTML(html`<div class="splash" role="button" tabindex="0" aria-label="${g.text} Tap to continue" data-action="skip-splash">
    <div class="splash__mark" aria-hidden="true">${icon('cap', { size: 44 })}</div>
    <p class="splash__greeting">${g.text}</p>
    <p class="splash__hint">Tap to skip</p>
  </div>`);
  const el = $('.splash');
  let skip;
  const skipped = new Promise((r) => { skip = r; });
  el.addEventListener('click', () => skip());
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') skip(); });
  const wait = prefersReducedMotion() ? 900 : 1300;
  await Promise.race([new Promise((r) => setTimeout(r, wait)), skipped]);
  await dataPromise;
  el.classList.add('is-leaving');
  await new Promise((r) => setTimeout(r, prefersReducedMotion() ? 0 : 220));
}

function showLoadError(err) {
  app.innerHTML = toHTML(html`<div class="splash">
    <p class="splash__greeting">Uni Bob couldn't load its uni info.</p>
    <p class="muted">${String(err?.message || err)}</p>
    <button type="button" class="btn btn-primary" onclick="location.reload()">Try again</button></div>`);
}

function noteDataUpdate() {
  const v = db.meta.dataVersion;
  const last = store.get().meta.lastDataVersion;
  if (v && last && v !== last) toast(`Updated: uni info checked ${formatDate(db.meta.lastChecked)}`, { ms: 4000 });
  if (v && v !== last) store.update((s) => { s.meta.lastDataVersion = v; }, 'meta');
}

async function askPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      const ok = await navigator.storage.persist();
      store.update((s) => { s.meta.persisted = ok; }, 'meta');
    }
  } catch { /* not supported */ }
}

function registerSW() {
  if (!('serviceWorker' in navigator) || new URLSearchParams(location.search).has('nosw')) return;
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is a bonus */ });
}

function start() {
  renderShell();
  route = parseRoute();
  navStack.push(`${route.name}/${route.params.join('/')}`);
  renderSidebarNow();
  renderMain({ fresh: true });
  window.addEventListener('hashchange', onHashChange);
  noteDataUpdate();
  renderWhatsNew();
}

async function boot() {
  applyTheme();
  registerSW();
  const dataPromise = loadData();
  dataPromise.catch(() => {});
  try {
    if (!store.get().settings.onboarded) {
      await runOnboarding(app, { applyTheme });
      await dataPromise;
      askPersistence();
    } else {
      await splash(dataPromise);
      askPersistence();
    }
    start();
  } catch (err) {
    console.error(err);
    showLoadError(err);
  }
}

boot();
