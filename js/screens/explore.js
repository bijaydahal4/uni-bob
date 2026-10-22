// Explore: search with autocomplete, quick chips, a Filters sheet, sorting and course cards.

import * as store from '../store.js';
import { db, chanceFor, subjectLinks, TYPE_LABELS } from '../data.js';
import { html, toHTML, raw, $, $$, on, plural } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chanceSlider, chanceLabel, chip, info, heart, openSheet, emptyState } from '../ui/components.js';
import { suggest, makeMatcher } from '../logic/search.js';
import * as F from '../logic/filters.js';
import { CHANCES, CHANCE_LABELS } from '../logic/grades.js';

const PAGE = 40;
let shown = PAGE;

// ---- State -----------------------------------------------------------------------

function es() {
  const e = store.get().explore || {};
  return { q: e.q || '', sort: e.sort || 'best', filters: { ...F.defaultFilters(), ...(e.filters || {}) } };
}

function save(patch) {
  store.update((s) => { s.explore = { ...es(), ...patch }; }, 'explore');
}

const isSaved = (c) => store.isFavourite('courses', c.id) || store.isFavourite('unis', c.uniId);

// ---- Results ---------------------------------------------------------------------------

export function computeResults(state = es()) {
  const q = state.q.trim();
  const matcher = q.length >= 2 ? makeMatcher(q, db.unis, db.courses) : null;
  const ctx = { chance: (c) => chanceFor(c), isSaved };
  const hits = [];
  for (const c of db.courses) {
    let m = null;
    if (matcher) {
      m = matcher(c, c.uni);
      if (!m.score) continue;
    }
    const reasons = F.filterReasons(c, state.filters, ctx);
    if (reasons.length && !(m && m.byUni)) continue;
    hits.push({ c, m, outside: reasons });
  }
  const subjects = store.effectiveProfile().subjects;
  const memo = new Map();
  const best = (c) => {
    if (!memo.has(c.id)) memo.set(c.id, F.bestMatchScore(c, chanceFor(c), subjectLinks(c, subjects)));
    return memo.get(c.id);
  };
  const byId = new Map(hits.map((h) => [h.c.id, h]));
  let sorted = F.sortCourses(hits.map((h) => h.c), state.sort, { best });
  if (matcher) {
    // Closest matches first, keeping the chosen order within each group.
    const bucket = (c) => Math.round((byId.get(c.id).m.score || 0) * 5);
    sorted = sorted.map((c, i) => [c, i]).sort((a, b) => bucket(b[0]) - bucket(a[0]) || a[1] - b[1]).map((x) => x[0]);
  }
  return sorted.map((c) => byId.get(c.id));
}

export function offerText(c) {
  const o = c.offer;
  if (!o) return 'Not confirmed';
  if (o.kind === 'tariff' && typeof o.tariff === 'number') {
    return o.tariffLow && o.tariffLow !== o.tariff ? `${o.tariffLow}–${o.tariff} UCAS points` : `${o.tariff} UCAS points`;
  }
  if (o.typical) return o.low && o.low !== o.typical ? `${o.typical}–${o.low}` : o.typical;
  return 'Not confirmed';
}

/** Up to two chips, most useful first. */
export function cardChips(c, subjects) {
  const out = [];
  if (c.notOpen) out.push(chip('Not open for 2027 entry', 'chip--pink'));
  if (c.mathsNeed === 'astar') out.push(chip('Needs A* in Maths', 'chip--pink'));
  if (c.furtherMaths === 'required') out.push(chip('Needs Further Maths', 'chip--pink'));
  if (c.testStatus === 'required') out.push(chip(`Needs the ${c.admissionsTest?.name || 'admissions test'}`, 'chip--pink'));
  for (const s of subjectLinks(c, subjects)) out.push(chip(`Fits your ${s}`, 'chip--navy', 'star'));
  if (c.uni.russellGroup) out.push(chip('Russell Group', 'chip--navy'));
  if (c.lengthYears >= 4 && c.uni.country === 'Scotland') out.push(chip('4 years'));
  return out.slice(0, 2);
}

export function courseCard(c, { outside = [], subjects = store.effectiveProfile().subjects } = {}) {
  const r = chanceFor(c);
  const chips = cardChips(c, subjects);
  return html`<article class="card course-card">
    <a class="course-card__link" href="#/course/${c.id}">
      <h3 class="course-card__name">${c.name}</h3>
      <p class="course-card__uni">${c.uni.name}${c.degree ? html` · ${c.degree}` : ''}</p>
      <p class="course-card__offer"><span>Typical offer</span> <b>${offerText(c)}</b></p>
      <div class="course-card__chance">${chanceLabel(r)}${chanceSlider(r, { compact: true })}</div>
      ${chips.length ? html`<div class="chips">${chips}</div>` : ''}
      ${outside.length ? html`<p class="course-card__outside">${icon('info', { size: 14 })}<span>Outside your filters: ${outside[0]}</span></p>` : ''}
    </a>
    ${heart('course', c.id, store.isFavourite('courses', c.id), `${c.name} at ${c.uni.shortName}`)}
  </article>`;
}

// ---- Quick chips ---------------------------------------------------------------------------

const toggleAll = (list, vals) => {
  const has = vals.every((v) => list.includes(v));
  const rest = list.filter((v) => !vals.includes(v));
  return has ? rest : [...rest, ...vals];
};

const QUICK = [
  { id: 'rg', label: 'Russell Group', on: (f) => f.rgOnly, apply: (f) => { f.rgOnly = !f.rgOnly; } },
  { id: 'safe', label: 'Safe for me', on: (f) => f.chances.includes('safe') && f.chances.includes('good'), apply: (f) => { f.chances = toggleAll(f.chances, ['safe', 'good']); } },
  { id: 'match', label: 'Match', on: (f) => f.chances.includes('match'), apply: (f) => { f.chances = toggleAll(f.chances, ['match']); } },
  { id: 'reach', label: 'Reach', on: (f) => f.chances.includes('reach'), apply: (f) => { f.chances = toggleAll(f.chances, ['reach']); } },
  { id: 'near', label: 'Near home', on: (f) => f.maxMiles <= F.NEAR_HOME_MILES, apply: (f) => { f.maxMiles = f.maxMiles <= F.NEAR_HOME_MILES ? F.DEFAULT_MILES : F.NEAR_HOME_MILES; } },
  { id: 'london', label: 'London', on: (f) => f.london === 'london', apply: (f) => { f.london = f.london === 'london' ? 'any' : 'london'; } },
  { id: 'campus', label: 'Campus uni', on: (f) => f.setting === 'campus', apply: (f) => { f.setting = f.setting === 'campus' ? 'any' : 'campus'; } },
];

function quickChips(f) {
  return html`<div class="chip-row" role="group" aria-label="Quick filters">
    ${QUICK.map((q) => html`<button type="button" class="chip chip--toggle ${q.on(f) ? 'is-on' : ''}" aria-pressed="${q.on(f) ? 'true' : 'false'}" data-quick="${q.id}">${q.on(f) ? icon('check', { size: 14 }) : ''}${q.label}</button>`)}
  </div>`;
}

// ---- Filters sheet -------------------------------------------------------------------------------

const MATHS = [['astar', 'A* needed'], ['a', 'A needed'], ['b', 'B needed'], ['any', 'A-level Maths needed'], ['none', 'Not needed']];
const TESTS = [['required', 'Needed'], ['optional', 'Optional'], ['none', 'None']];

function multi(name, options, selected) {
  return html`<div class="chip-row" role="group">${options.map(([v, label]) => {
    const onNow = selected.includes(v);
    return html`<button type="button" class="chip chip--toggle ${onNow ? 'is-on' : ''}" aria-pressed="${onNow ? 'true' : 'false'}" data-multi="${name}" data-value="${v}">${onNow ? icon('check', { size: 14 }) : ''}${label}</button>`;
  })}</div>`;
}

function segmented(name, options, value, label) {
  return html`<div class="segmented" role="radiogroup" aria-label="${label}">${options.map(([v, text]) => html`<button type="button" role="radio" class="segmented__btn ${value === v ? 'is-on' : ''}" aria-checked="${value === v ? 'true' : 'false'}" data-seg="${name}" data-value="${v}">${text}</button>`)}</div>`;
}

function toggleRow(name, label, value, infoKey = null) {
  return html`<label class="row switch-row"><span class="row__title">${label}${infoKey ? info(infoKey) : ''}</span>
    <input type="checkbox" class="switch" data-switch="${name}"${value ? raw(' checked') : ''}></label>`;
}

function milesLabel(m) {
  return m >= F.MAX_MILES ? 'Any distance' : `Up to about ${m} miles`;
}

function gradeOptions(value, top) {
  return F.GRADE_STEPS.filter((g) => g.pts <= F.GRADE_TOP).map((g) => {
    const label = g.pts === F.GRADE_TOP && top ? `${g.label} or higher` : g.pts === F.GRADE_BOTTOM && !top ? `${g.label} or lower` : g.label;
    return html`<option value="${g.pts}"${g.pts === value ? raw(' selected') : ''}>${label}</option>`;
  });
}

function filtersBody(f) {
  return html`
    <div class="sheet-group">${toggleRow('rgOnly', 'Russell Group only', f.rgOnly, 'russellGroup')}</div>
    <h3 class="sheet-h">Course type</h3>
    ${multi('types', Object.entries(TYPE_LABELS), f.types)}
    <h3 class="sheet-h">Entry grades ${info('typicalOffer', 'typical offer')}</h3>
    <div class="range-pair">
      <label class="field"><span class="field__label">From</span>
        <span class="grade-pick grade-pick--wide"><select class="grade-select" data-grade="gradeHigh" aria-label="Highest entry grades">${gradeOptions(f.gradeHigh, true)}</select>${icon('chevronDown', { size: 14, cls: 'grade-pick__chev' })}</span></label>
      <label class="field"><span class="field__label">Down to</span>
        <span class="grade-pick grade-pick--wide"><select class="grade-select" data-grade="gradeLow" aria-label="Lowest entry grades">${gradeOptions(f.gradeLow, false)}</select>${icon('chevronDown', { size: 14, cls: 'grade-pick__chev' })}</span></label>
    </div>
    <h3 class="sheet-h">Your chances ${info('chances', 'how chances work')}</h3>
    ${multi('chances', CHANCES.map((c) => [c, CHANCE_LABELS[c]]), f.chances)}
    <h3 class="sheet-h">Maths</h3>
    ${multi('maths', MATHS, f.maths)}
    <h3 class="sheet-h">Admissions test ${info('tmua', 'TMUA')}</h3>
    ${multi('test', TESTS, f.test)}
    <h3 class="sheet-h">Distance from Bournemouth</h3>
    <div class="slider-field">
      <input type="range" class="range" min="25" max="${F.MAX_MILES}" step="25" value="${f.maxMiles}" data-range="maxMiles" aria-label="Maximum distance in miles" aria-valuetext="${milesLabel(f.maxMiles)}">
      <p class="slider-field__value" id="miles-label">${milesLabel(f.maxMiles)}</p>
      <p class="muted small">About 200 miles reaches roughly Sheffield. Searching for a uni by name always finds it.</p>
    </div>
    <h3 class="sheet-h">Region</h3>
    ${multi('regions', F.REGIONS.map((r) => [r, r]), f.regions)}
    <h3 class="sheet-h">Campus or city</h3>
    ${segmented('setting', [['any', 'Either'], ['campus', 'Campus'], ['city', 'City']], f.setting, 'Campus or city')}
    <h3 class="sheet-h">Costs</h3>
    ${segmented('london', [['any', 'Anywhere'], ['notLondon', 'Outside London'], ['london', 'London']], f.london, 'London or not')}
    <p class="muted small">London is usually the most expensive place to live. Each uni page shows its own estimate of living costs or halls rent.</p>
    <h3 class="sheet-h">More</h3>
    <div class="sheet-group">
      ${toggleRow('yearAbroad', 'Year abroad available', f.yearAbroad)}
      ${toggleRow('foundation', 'Foundation year available', f.foundation)}
      ${toggleRow('savedOnly', 'Saved only', f.savedOnly)}
    </div>`;
}

function openFilters(onChange) {
  const countText = (n) => `Show ${plural(n, 'course')}`;
  openSheet({
    title: 'Filters',
    size: 'lg',
    body: filtersBody(es().filters),
    footer: html`<div class="btn-row btn-row--main">
      <button type="button" class="btn btn-secondary" data-f="reset">Reset filters</button>
      <button type="button" class="btn btn-primary" data-action="close-sheet" id="f-count">${countText(computeResults().length)}</button></div>`,
    onMount(el) {
      const apply = (fn) => {
        const f = es().filters;
        fn(f);
        save({ filters: f });
        onChange();
        $('#f-count', el).textContent = countText(computeResults().length);
      };
      const offs = [
        on(el, 'click', '[data-multi]', (e, t) => apply((f) => {
          const k = t.dataset.multi;
          const v = t.dataset.value;
          f[k] = f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v];
          const onNow = f[k].includes(v);
          t.classList.toggle('is-on', onNow);
          t.setAttribute('aria-pressed', onNow ? 'true' : 'false');
          t.innerHTML = toHTML(html`${onNow ? icon('check', { size: 14 }) : ''}${t.textContent}`);
        })),
        on(el, 'click', '[data-seg]', (e, t) => apply((f) => {
          f[t.dataset.seg] = t.dataset.value;
          for (const b of el.querySelectorAll(`[data-seg="${t.dataset.seg}"]`)) {
            b.classList.toggle('is-on', b === t);
            b.setAttribute('aria-checked', b === t ? 'true' : 'false');
          }
        })),
        on(el, 'change', '[data-switch]', (e, t) => apply((f) => { f[t.dataset.switch] = t.checked; })),
        on(el, 'change', '[data-grade]', (e, t) => apply((f) => {
          f[t.dataset.grade] = Number(t.value);
          if (f.gradeLow > f.gradeHigh) {
            if (t.dataset.grade === 'gradeHigh') f.gradeLow = f.gradeHigh; else f.gradeHigh = f.gradeLow;
            el.querySelector('[data-grade="gradeHigh"]').value = String(f.gradeHigh);
            el.querySelector('[data-grade="gradeLow"]').value = String(f.gradeLow);
          }
        })),
        on(el, 'input', '[data-range]', (e, t) => apply((f) => {
          f.maxMiles = Number(t.value);
          $('#miles-label', el).textContent = milesLabel(f.maxMiles);
          t.setAttribute('aria-valuetext', milesLabel(f.maxMiles));
        })),
        on(el, 'click', '[data-f="reset"]', () => {
          save({ filters: F.defaultFilters() });
          onChange();
          el.querySelector('.sheet__body').innerHTML = toHTML(filtersBody(F.defaultFilters()));
          $('#f-count', el).textContent = countText(computeResults().length);
        }),
      ];
      return () => offs.forEach((o) => o());
    },
  });
}

// ---- Screen ----------------------------------------------------------------------------------

function entryYearNote() {
  const years = new Set(db.courses.map((c) => c.entryYear).filter(Boolean));
  if (years.has(2028) && years.size === 1) return 'These requirements are for 2028 entry, when you’ll start.';
  if (years.has(2028)) return 'You’ll start in 2028. A few unis have published 2028 requirements (marked on each course); the rest are for 2027 entry. They’re usually similar.';
  return 'You’ll start in 2028, but most unis haven’t published 2028 requirements yet, so these are for 2027 entry. They’re usually similar.';
}

function resultsHTML(list) {
  const subjects = store.effectiveProfile().subjects;
  if (!list.length) {
    return toHTML(emptyState('No courses match', 'Try removing a filter or searching for something else.',
      html`<button type="button" class="btn btn-secondary" data-action="reset-filters">Reset filters</button>`));
  }
  const slice = list.slice(0, shown);
  return toHTML(html`<div class="card-grid">${slice.map((h) => courseCard(h.c, { outside: h.outside, subjects }))}</div>
    ${list.length > shown ? html`<div class="more-row"><button type="button" class="btn btn-secondary" data-action="more">Show more (${list.length - shown} left)</button></div>` : ''}`);
}

function headerCount(list) {
  const unis = new Set(list.map((h) => h.c.uniId)).size;
  return `${plural(list.length, 'course')} at ${plural(unis, 'uni')}`;
}

function renderParts(main) {
  const state = es();
  const list = computeResults(state);
  const res = $('#results', main);
  if (res) res.innerHTML = resultsHTML(list);
  const count = $('#result-count', main);
  if (count) count.textContent = headerCount(list);
  const chips = $('#quick', main);
  if (chips) chips.innerHTML = toHTML(quickChips(state.filters));
  const fb = $('#filters-badge', main);
  if (fb) {
    const n = F.activeCount(state.filters);
    fb.textContent = n ? String(n) : '';
    fb.hidden = !n;
  }
}

export default {
  label: 'Explore',
  title: () => 'Explore',
  render() {
    const state = es();
    const list = computeResults(state);
    const n = F.activeCount(state.filters);
    return html`<div class="page page--wide">
      <h1 class="large-title">Explore</h1>
      <div class="search" role="search">
        <div class="search__field">
          ${icon('search', { size: 20, cls: 'search__icon' })}
          <input id="q" class="search__input" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="q-list"
            aria-label="Search unis or courses" placeholder="Search unis or courses" value="${state.q}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
          <button type="button" class="search__clear" data-action="clear-q" aria-label="Clear search"${state.q ? '' : raw(' hidden')}>${icon('x', { size: 16 })}</button>
        </div>
        <ul id="q-list" class="suggest" role="listbox" aria-label="Suggestions" hidden></ul>
      </div>
      <div id="quick">${quickChips(state.filters)}</div>
      <div class="results-bar">
        <button type="button" class="btn btn-secondary btn-small" data-action="filters">${icon('filter', { size: 18 })}<span>Filters</span><span class="badge" id="filters-badge"${n ? '' : raw(' hidden')}>${n || ''}</span></button>
        <label class="sort"><span class="sr-only">Sort by</span>${icon('sort', { size: 18 })}
          <select class="sort__select" data-action="sort" aria-label="Sort by">${Object.entries(F.SORTS).map(([k, v]) => html`<option value="${k}"${state.sort === k ? raw(' selected') : ''}>${v}</option>`)}</select></label>
        <span class="results-bar__count" id="result-count" aria-live="polite">${headerCount(list)}</span>
      </div>
      <p class="note">${icon('info', { size: 16 })}<span>${entryYearNote()}</span></p>
      <div id="results">${raw(resultsHTML(list))}</div>
    </div>`;
  },
  mount(main) {
    shown = PAGE;
    const input = $('#q', main);
    const listEl = $('#q-list', main);
    const clear = $('[data-action="clear-q"]', main);
    let active = -1;
    let items = [];
    let timer = null;

    const closeList = () => { listEl.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const paint = () => {
      listEl.innerHTML = toHTML(items.map((it, i) => html`<li role="option" id="sg-${i}" class="suggest__item ${i === active ? 'is-active' : ''}" aria-selected="${i === active ? 'true' : 'false'}" data-i="${i}">
        <span class="suggest__icon" aria-hidden="true">${icon(it.type === 'uni' ? 'building' : 'cap', { size: 18 })}</span>
        <span class="suggest__text"><span class="suggest__label">${it.label}</span><span class="suggest__sub">${it.type === 'uni' ? it.sub : `Course · ${it.sub}`}</span></span></li>`));
      listEl.hidden = !items.length;
      input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
      if (active >= 0) input.setAttribute('aria-activedescendant', `sg-${active}`); else input.removeAttribute('aria-activedescendant');
    };
    const choose = (it) => {
      closeList();
      if (it.type === 'uni') { location.hash = `#/uni/${it.id}`; return; }
      input.value = it.label;
      save({ q: it.label });
      shown = PAGE;
      renderParts(main);
    };
    const onInput = () => {
      const v = input.value;
      clear.hidden = !v;
      items = v.trim() ? suggest(v, db.unis, db.courses, 8) : [];
      active = -1;
      paint();
      clearTimeout(timer);
      timer = setTimeout(() => { save({ q: v }); shown = PAGE; renderParts(main); }, 160);
    };
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); active = (active + 1) % items.length; paint(); }
      else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (active >= 0) choose(items[active]);
        else { closeList(); save({ q: input.value }); renderParts(main); input.blur(); }
      } else if (e.key === 'Escape') closeList();
    });
    input.addEventListener('blur', () => setTimeout(closeList, 150));
    const offs = [
      on(listEl, 'pointerdown', '[data-i]', (e) => e.preventDefault()),
      on(listEl, 'click', '[data-i]', (e, t) => choose(items[Number(t.dataset.i)])),
      on(main, 'click', '[data-action="clear-q"]', () => { input.value = ''; clear.hidden = true; items = []; paint(); save({ q: '' }); renderParts(main); input.focus(); }),
      on(main, 'click', '[data-quick]', (e, t) => {
        const q = QUICK.find((x) => x.id === t.dataset.quick);
        const f = es().filters;
        q.apply(f);
        save({ filters: f });
        shown = PAGE;
        renderParts(main);
      }),
      on(main, 'click', '[data-action="filters"]', () => openFilters(() => { shown = PAGE; renderParts(main); })),
      on(main, 'change', '[data-action="sort"]', (e, t) => { save({ sort: t.value }); renderParts(main); }),
      on(main, 'click', '[data-action="more"]', () => { shown += PAGE; renderParts(main); }),
      on(main, 'click', '[data-action="reset-filters"]', () => { save({ filters: F.defaultFilters() }); renderParts(main); }),
    ];
    return () => { clearTimeout(timer); offs.forEach((o) => o()); };
  },
  update(what) {
    if (what === 'explore' || what === 'meta') return true;
    if (what === 'favourites') {
      const main = document.getElementById('main');
      if (es().filters.savedOnly && main) renderParts(main);
      return true;
    }
    return false;
  },
};
