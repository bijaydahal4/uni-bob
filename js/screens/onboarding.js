// First launch: five short screens. Everything is saved on this device only.

import * as store from '../store.js';
import { html, toHTML, $, on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { gradeSelect } from '../ui/components.js';
import { subjectLabel } from '../logic/grades.js';

const STEPS = 5;
const GCSE = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];

function gcseSelect(id, label, value) {
  return html`<span class="grade-pick"><select class="grade-select" id="${id}" aria-label="${label}">
    <option value=""${!value ? { __html: ' selected' } : ''}>Not set</option>
    ${GCSE.map((g) => html`<option value="${g}"${value === g ? { __html: ' selected' } : ''}>${g}</option>`)}
  </select>${icon('chevronDown', { size: 14, cls: 'grade-pick__chev' })}</span>`;
}

function stepHTML(step, st) {
  const p = st.profile;
  switch (step) {
    case 0:
      return html`<div class="ob__hero">
          <div class="ob__mark" aria-hidden="true">${icon('cap', { size: 46 })}</div>
          <h1 class="ob__title">Welcome to Uni Bob</h1>
          <p class="ob__lead">Explore universities for Economics and courses like it, see your chances, and plan your next steps.</p>
          <p class="ob__small">${icon('home', { size: 16 })} Everything you type stays on this device. No accounts, no tracking.</p>
        </div>`;
    case 1:
      return html`<h1 class="ob__title">What's your name?</h1>
        <p class="ob__lead">Bob will use it to say hi.</p>
        <label class="field ob__field"><span class="sr-only">Your first name</span>
          <input class="input input--large" id="ob-name" type="text" value="${p.name}" placeholder="First name" autocomplete="given-name" autocapitalize="words" enterkeyhint="next" maxlength="40">
        </label>`;
    case 2:
      return html`<h1 class="ob__title">Light or dark?</h1>
        <p class="ob__lead">Pick the look you like. You can change it any time in Settings.</p>
        <div class="theme-pick" role="radiogroup" aria-label="Appearance">
          ${['light', 'dark'].map((t) => html`<button type="button" class="theme-card ${st.settings.theme === t ? 'is-on' : ''}" role="radio" aria-checked="${st.settings.theme === t ? 'true' : 'false'}" data-theme-pick="${t}">
            <span class="theme-card__preview theme-card__preview--${t}" aria-hidden="true">
              <span class="tp-side"><i></i><i></i><i></i></span><span class="tp-main"><i></i><i></i><b></b></span>
            </span>
            <span class="theme-card__label">${icon(t === 'light' ? 'sun' : 'moon', { size: 18 })}${t === 'light' ? 'Light' : 'Dark'}</span>
          </button>`)}
        </div>`;
    case 3:
      return html`<h1 class="ob__title">Your subjects and grades</h1>
        <p class="ob__lead">No predicted grades yet? Put your best guess. You can change these any time.</p>
        <ul class="group ob__group">
          ${p.subjects.map((s) => html`<li class="row grade-row">
            <span class="row__main"><span class="row__title">${subjectLabel(s.name)}</span>${s.board ? html`<span class="row__sub">${s.board}</span>` : ''}</span>
            ${gradeSelect({ value: s.grade, label: `${subjectLabel(s.name)} grade`, data: { ob: s.id } })}
          </li>`)}
        </ul>
        <p class="ob__small">Taking a 4th A-level? You can add it from the sidebar later.</p>`;
    default:
      return html`<h1 class="ob__title">GCSE Maths and English</h1>
        <p class="ob__lead">Some courses ask for certain GCSE grades. This is optional.</p>
        <ul class="group ob__group">
          <li class="row grade-row"><span class="row__main"><span class="row__title">GCSE Maths</span></span>${gcseSelect('ob-gm', 'GCSE Maths grade', p.gcse.maths)}</li>
          <li class="row grade-row"><span class="row__main"><span class="row__title">GCSE English Language</span></span>${gcseSelect('ob-ge', 'GCSE English Language grade', p.gcse.english)}</li>
        </ul>
        <p class="ob__small">Grades go from 9 (highest) to 1.</p>`;
  }
}

export function runOnboarding(root, { applyTheme }) {
  return new Promise((resolve) => {
    let step = 0;
    const render = (dir = 0) => {
      const st = store.get();
      root.innerHTML = toHTML(html`<div class="ob" data-step="${step}">
        <header class="ob__bar">
          ${step > 0 ? html`<button type="button" class="toolbar__back" data-ob="back">${icon('chevronLeft', { size: 22 })}<span>Back</span></button>` : html`<span></span>`}
          <ol class="ob__dots" aria-label="Step ${step + 1} of ${STEPS}">${Array.from({ length: STEPS }, (_, i) => html`<li class="${i === step ? 'is-on' : i < step ? 'is-done' : ''}"></li>`)}</ol>
          <span></span>
        </header>
        <div class="ob__body ${dir > 0 ? 'slide-in' : dir < 0 ? 'slide-back' : ''}">${stepHTML(step, st)}</div>
        <footer class="ob__foot">
          <button type="button" class="btn btn-primary btn-large btn-block" data-ob="next" id="ob-next">
            ${step === 0 ? 'Get started' : step === STEPS - 1 ? "Let's go" : 'Next'}</button>
          ${step === STEPS - 1 ? html`<button type="button" class="btn btn-plain btn-block" data-ob="skip">Skip for now</button>` : ''}
        </footer>
      </div>`);
      const h = root.querySelector('h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      if (step === 1) {
        const input = $('#ob-name', root);
        const next = $('#ob-next', root);
        const sync = () => { next.disabled = !input.value.trim(); };
        sync();
        input.addEventListener('input', sync);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) advance(); });
        setTimeout(() => input.focus(), 80);
      }
    };

    const save = () => {
      if (step === 1) {
        const v = $('#ob-name', root).value.trim().slice(0, 40);
        store.update((s) => { s.profile.name = v; }, 'profile');
      }
      if (step === 4) {
        const gm = $('#ob-gm', root).value || null;
        const ge = $('#ob-ge', root).value || null;
        store.update((s) => { s.profile.gcse = { maths: gm, english: ge }; }, 'profile');
      }
    };

    const finish = () => {
      store.update((s) => { s.settings.onboarded = true; }, 'settings');
      resolve();
    };

    const advance = () => {
      save();
      if (step >= STEPS - 1) { finish(); return; }
      step++;
      render(1);
    };

    on(root, 'click', '[data-ob="next"]', () => advance());
    on(root, 'click', '[data-ob="skip"]', () => finish());
    on(root, 'click', '[data-ob="back"]', () => { save(); step = Math.max(0, step - 1); render(-1); });
    on(root, 'click', '[data-theme-pick]', (e, t) => {
      store.update((s) => { s.settings.theme = t.dataset.themePick; }, 'settings');
      applyTheme(t.dataset.themePick);
      for (const b of root.querySelectorAll('[data-theme-pick]')) {
        const onNow = b === t;
        b.classList.toggle('is-on', onNow);
        b.setAttribute('aria-checked', onNow ? 'true' : 'false');
      }
    });
    on(root, 'change', 'select[data-ob]', (e, t) => {
      store.update((s) => { const sub = s.profile.subjects.find((x) => x.id === t.dataset.ob); if (sub) sub.grade = t.value; }, 'profile');
    });
    render();
  });
}
