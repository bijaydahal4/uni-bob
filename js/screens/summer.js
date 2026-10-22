// Summer Schools: a tracker for summer schools, access programmes and Year 12 tasters.

import * as store from '../store.js';
import { db } from '../data.js';
import { html, toHTML, raw, $, $$, on, plural } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chip, info, externalLink, emptyState, dateStatus } from '../ui/components.js';
import { programmeStatus, deadlineSortKey, formatDate } from '../logic/dates.js';
import { meetsCriterion } from '../logic/contextual.js';

export const MY_STATUS = [
  ['', 'Not tracking'], ['interested', 'Interested'], ['applying', 'Applying'], ['applied', 'Applied'], ['place', 'Got a place'], ['notForMe', 'Not for me'],
];

const FILTERS = [
  ['open', 'Open now'], ['lowers', 'Lowers offers'], ['everyone', 'Open to everyone'], ['free', 'Free'],
  ['online', 'Online'], ['inPerson', 'In person'], ['saved', 'Unis I’ve saved'], ['eligible', 'I might be eligible'],
];

let ui = { q: '', filters: [], sort: 'deadline' };

function mightBeEligible(p, answers) {
  if (p.eligibility === 'open' || p.eligibility == null) return true;
  const keys = p.eligibilityCriteria || [];
  if (!keys.length) return false;
  return keys.some((k) => (k === 'area' ? Number(answers.area) > 0 && Number(answers.area) <= 2 : meetsCriterion({ key: k }, answers) === true));
}

function passes(p, f, st) {
  const status = programmeStatus(p);
  switch (f) {
    case 'open': return status.key === 'open' || status.key === 'closingSoon';
    case 'lowers': return !!p.lowersOffer;
    case 'everyone': return p.eligibility === 'open';
    case 'free': return p.isFree === true;
    case 'online': return p.format === 'online' || p.format === 'mixed';
    case 'inPerson': return ['day', 'residential', 'mixed'].includes(p.format);
    case 'saved': {
      const saved = new Set([...st.favourites.unis, ...st.favourites.courses.map((id) => db.course.get(id)?.uniId)]);
      return [...(p.uniIds || []), ...(p.lowersOfferAt || [])].some((id) => saved.has(id));
    }
    case 'eligible': return mightBeEligible(p, st.contextual || {});
    default: return true;
  }
}

function list() {
  const st = store.get();
  const q = ui.q.trim().toLowerCase();
  let items = db.programmes.filter((p) => {
    if (q) {
      const hay = [p.name, p.provider, p.summary, ...(p.uniIds || []).map((id) => db.uni.get(id)?.name || '')].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return ui.filters.every((f) => passes(p, f, st));
  });
  if (ui.sort === 'az') items = items.sort((a, b) => a.name.localeCompare(b.name));
  else items = items.sort((a, b) => {
    const [ra, da] = deadlineSortKey(a);
    const [rb, dbb] = deadlineSortKey(b);
    return ra - rb || da - dbb || a.name.localeCompare(b.name);
  });
  return items;
}

function formatLabel(f) {
  return { online: 'Online', day: 'Day event', residential: 'Residential', mixed: 'Online and in person' }[f] || null;
}

function dateLine(label, d) {
  if (!d || (!d.date && !d.text)) return '';
  const text = d.date ? formatDate(d.date) : d.text;
  return html`<li><span class="dl__k">${label}</span><span class="dl__v">${text} ${dateStatus(d.status)}</span></li>`;
}

function card(p, st) {
  const status = programmeStatus(p);
  const mine = st.tracker[p.id] || {};
  const lowerAt = (p.lowersOfferAt || []).map((id) => db.uni.get(id)?.shortName).filter(Boolean);
  return html`<article class="card prog" id="prog-${p.id}">
    <div class="prog__top">
      <div class="prog__titles">
        <h3 class="prog__name">${p.name}</h3>
        <p class="prog__provider">${p.provider}</p>
      </div>
      <span class="status-tag is-${status.key}">${status.label}${status.daysLeft != null && status.key === 'closingSoon' ? ` · ${plural(status.daysLeft, 'day')} left` : ''}${status.expected ? html` <span class="status-tag__exp">(expected)</span>` : ''}</span>
    </div>
    ${p.summary ? html`<p class="prog__summary">${p.summary}</p>` : ''}
    <div class="chips">
      ${chip(p.eligibility === 'open' ? 'Open to everyone' : p.eligibility === 'criteria' ? 'Eligibility criteria' : 'Check who can apply', p.eligibility === 'open' ? 'chip--navy' : p.eligibility === 'criteria' ? 'chip--pink' : '')}
      ${lowerAt.length ? chip(`Lower offer at ${lowerAt.slice(0, 2).join(', ')}${lowerAt.length > 2 ? ` +${lowerAt.length - 2}` : ''}`, 'chip--navy', 'arrowDown') : ''}
      ${p.isFree ? chip('Free') : p.cost && /£|\d/.test(p.cost) && p.cost.length < 30 ? chip(p.cost) : ''}
      ${formatLabel(p.format) ? chip(formatLabel(p.format)) : ''}
    </div>
    <ul class="dl">
      ${dateLine('Applications open', p.opens)}
      ${dateLine('Deadline', p.deadline)}
      ${p.runs?.text || p.runs?.start ? html`<li><span class="dl__k">When it runs</span><span class="dl__v">${p.runs.text || formatDate(p.runs.start)} ${dateStatus(p.runs.status)}</span></li>` : ''}
    </ul>
    ${p.infoNote ? html`<p class="note small">${icon('info', { size: 14 })}<span>${p.infoNote}</span></p>` : ''}
    <div class="prog__mine">
      <label class="prog__status"><span class="field__label">My status</span>
        <span class="grade-pick grade-pick--wide"><select class="grade-select" data-track="${p.id}" data-fkey="track-${p.id}" aria-label="My status for ${p.name}">
          ${MY_STATUS.map(([v, t]) => html`<option value="${v}"${(mine.status || '') === v ? raw(' selected') : ''}>${t}</option>`)}
        </select>${icon('chevronDown', { size: 14, cls: 'grade-pick__chev' })}</span></label>
      <label class="prog__note"><span class="field__label">Note</span>
        <textarea class="input textarea" rows="2" maxlength="300" placeholder="e.g. Ask Miss about a reference" data-note="${p.id}" data-fkey="note-${p.id}" aria-label="Note for ${p.name}">${mine.note || ''}</textarea></label>
    </div>
    <details class="expander">
      <summary><span>Details</span>${icon('chevronDown', { size: 16, cls: 'expander__chev' })}</summary>
      <div class="expander__body">
        ${p.whoCanApply ? html`<p><b>Who can apply:</b> ${p.whoCanApply}</p>` : ''}
        ${p.eligibilityDetail && p.eligibilityDetail !== p.whoCanApply ? html`<p class="muted">${p.eligibilityDetail}</p>` : ''}
        ${(p.benefits || []).length ? html`<p><b>What you get:</b></p><ul class="bullets">${p.benefits.map((b) => html`<li>${b}</li>`)}</ul>` : ''}
        ${p.offerReduction ? html`<p><b>Offer:</b> ${p.offerReduction}</p>` : ''}
        ${p.cost ? html`<p><b>Cost:</b> ${p.cost}</p>` : ''}
        ${p.subjects ? html`<p><b>Subjects:</b> ${p.subjects}</p>` : ''}
        ${p.yearGroup ? html`<p><b>For:</b> ${p.yearGroup}</p>` : ''}
        <p>${externalLink(p.url, 'Official page')}</p>
        ${p.source?.checked ? html`<p class="muted small">Info from ${p.infoYear || 'the latest'} programme · Last checked ${formatDate(p.source.checked)}</p>` : ''}
      </div>
    </details>
  </article>`;
}

function listHTML() {
  const st = store.get();
  const items = list();
  if (!items.length) return toHTML(emptyState('Nothing matches', 'Try turning off a filter.'));
  return toHTML(html`<div class="card-grid card-grid--single">${items.map((p) => card(p, st))}</div>`);
}

export default {
  label: 'Summer Schools',
  title: () => 'Summer Schools',
  render() {
    const answered = Object.keys(store.get().contextual || {}).length > 0;
    return html`<div class="page">
      <h1 class="large-title">Summer Schools</h1>
      <p class="lead">Summer schools, access programmes and Year 12 taster events for Economics and similar courses. Some can lower your offer.</p>
      <p class="note">${icon('info', { size: 16 })}<span>Be aware: most programmes that lower offers are only for students who meet certain criteria, like where you live or your school. Check “Who can apply” on each one.</span></p>
      <div class="search"><div class="search__field">${icon('search', { size: 20, cls: 'search__icon' })}
        <input class="search__input" id="sq" type="search" placeholder="Search programmes or unis" aria-label="Search programmes" value="${ui.q}" autocomplete="off" enterkeyhint="search"></div></div>
      <div class="chip-row" role="group" aria-label="Filters">${FILTERS.map(([k, t]) => html`<button type="button" class="chip chip--toggle ${ui.filters.includes(k) ? 'is-on' : ''}" aria-pressed="${ui.filters.includes(k) ? 'true' : 'false'}" data-sf="${k}">${ui.filters.includes(k) ? icon('check', { size: 14 }) : ''}${t}</button>`)}</div>
      ${ui.filters.includes('eligible') && !answered ? html`<p class="note small">${icon('people', { size: 14 })}<span>“I might be eligible” uses your answers in <a class="link" href="#/contextual">Contextual Offers</a>. Fill that in first.</span></p>` : ''}
      <div class="results-bar">
        <label class="sort">${icon('sort', { size: 18 })}<select class="sort__select" data-sort aria-label="Sort by">
          <option value="deadline"${ui.sort === 'deadline' ? raw(' selected') : ''}>Sort by deadline</option>
          <option value="az"${ui.sort === 'az' ? raw(' selected') : ''}>A to Z</option></select></label>
        <span class="results-bar__count" id="s-count">${plural(list().length, 'programme')}</span>
      </div>
      <div id="s-list">${raw(listHTML())}</div>
    </div>`;
  },
  mount(main, [focusId]) {
    const refresh = () => { $('#s-list', main).innerHTML = listHTML(); $('#s-count', main).textContent = plural(list().length, 'programme'); };
    const timers = {};
    const offs = [
      on(main, 'input', '#sq', (e, t) => { ui.q = t.value; refresh(); }),
      on(main, 'click', '[data-sf]', (e, t) => {
        const k = t.dataset.sf;
        ui.filters = ui.filters.includes(k) ? ui.filters.filter((x) => x !== k) : [...ui.filters, k];
        const onNow = ui.filters.includes(k);
        t.classList.toggle('is-on', onNow);
        t.setAttribute('aria-pressed', onNow ? 'true' : 'false');
        t.innerHTML = toHTML(html`${onNow ? icon('check', { size: 14 }) : ''}${t.textContent}`);
        refresh();
      }),
      on(main, 'change', '[data-sort]', (e, t) => { ui.sort = t.value; refresh(); }),
      on(main, 'change', '[data-track]', (e, t) => {
        store.update((s) => { s.tracker[t.dataset.track] = { ...(s.tracker[t.dataset.track] || {}), status: t.value }; }, 'tracker');
      }),
      on(main, 'input', '[data-note]', (e, t) => {
        clearTimeout(timers[t.dataset.note]);
        timers[t.dataset.note] = setTimeout(() => {
          store.update((s) => { s.tracker[t.dataset.note] = { ...(s.tracker[t.dataset.note] || {}), note: t.value.slice(0, 300) }; }, 'tracker');
        }, 300);
      }),
    ];
    if (focusId) {
      const el = document.getElementById(`prog-${focusId}`);
      if (el) {
        el.querySelector('details')?.setAttribute('open', '');
        el.classList.add('is-highlight');
        setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
      }
    }
    return () => offs.forEach((o) => o());
  },
  update(what) {
    return what === 'tracker' || what === 'explore';
  },
};
