// Contextual Offers: a gentle explanation, an optional checklist, and each uni's published criteria.

import * as store from '../store.js';
import { db } from '../data.js';
import { html, raw, on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { info, externalLink, term } from '../ui/components.js';
import { CHECKLIST, LEVELS, estimate, meetsCriterion } from '../logic/contextual.js';

const QUINTILES = [['', 'Not checked'], ['1', '1 (fewest go to uni)'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 (most go to uni)']];

function answerControl(item, answers) {
  if (item.kind === 'quintile') {
    const v = answers.area ? String(answers.area) : '';
    return html`<span class="grade-pick grade-pick--wide"><select class="grade-select" data-ctx-area="1" data-fkey="ctx-area" aria-label="Your area's quintile from the Office for Students checker">
      ${QUINTILES.map(([k, l]) => html`<option value="${k}"${v === k ? raw(' selected') : ''}>${l}</option>`)}</select>${icon('chevronDown', { size: 14, cls: 'grade-pick__chev' })}</span>`;
  }
  const v = answers[item.key];
  const opt = (val, label) => {
    const onNow = (val === 'yes' && v === true) || (val === 'no' && v === false) || (val === 'unsure' && v === undefined);
    return html`<button type="button" role="radio" class="segmented__btn ${onNow ? 'is-on' : ''}" aria-checked="${onNow ? 'true' : 'false'}" data-ctx="${item.key}" data-val="${val}" data-fkey="ctx-${item.key}-${val}">${label}</button>`;
  };
  return html`<div class="segmented segmented--sm" role="radiogroup" aria-label="${item.label}">${opt('yes', 'Yes')}${opt('no', 'No')}${opt('unsure', 'Not sure')}</div>`;
}

const ITEM_INFO = { area: 'polar', school: 'schoolResults', income: 'householdIncome', firstGen: 'firstGen', care: 'careExperienced', carer: 'youngCarer', estranged: 'estranged', refugee: 'refugee', access: 'accessProgramme', fsm: 'fsm' };

function checklist(answers) {
  const ref = db.meta.reference || {};
  return html`<ul class="group checklist">${CHECKLIST.map((item) => html`<li class="row row--stack checklist__item">
    <span class="row__title">${item.label}${db.glossary[ITEM_INFO[item.key]] ? info(ITEM_INFO[item.key]) : ''}</span>
    ${item.key === 'area' ? html`<span class="row__sub">Use the ${externalLink(ref.polarCheckerUrl, 'Office for Students postcode checker')}, then pick the number it gives you (your quintile). You don't need to type your postcode here.</span>` : ''}
    ${item.key === 'school' ? html`<span class="row__sub">You can compare your sixth form's A-level results with the national average on the ${externalLink(ref.schoolPerformanceUrl, 'government’s school results website')}, or ask your sixth form.</span>` : ''}
    ${answerControl(item, answers)}
  </li>`)}</ul>`;
}

const LEVEL_CLASS = { likely: 'is-likely', possible: 'is-possible', unlikely: 'is-unlikely', unknown: 'is-unknown', none: 'is-unknown', unanswered: 'is-unknown' };

function uniBlock(u, answers, open) {
  const ctx = u.contextual;
  const est = estimate(u, answers);
  const crit = (ctx?.criteria || []).filter(Boolean);
  return html`<details class="ctx-uni"${open ? raw(' open') : ''}>
    <summary><span class="ctx-uni__name">${u.name}</span><span class="level-tag ${LEVEL_CLASS[est.level]}">${LEVELS[est.level]}</span>${icon('chevronDown', { size: 16, cls: 'expander__chev' })}</summary>
    <div class="ctx-uni__body">
      ${ctx?.summary ? html`<p>${ctx.summary}</p>` : html`<p class="muted">Not confirmed: check the uni's page.</p>`}
      ${ctx?.typicalReduction ? html`<p><b>What it usually looks like:</b> ${ctx.typicalReduction}</p>` : ''}
      ${crit.length ? html`<p class="mini-h">Their main criteria</p><ul class="check-list">${crit.map((c) => {
        const m = meetsCriterion(c, answers);
        return html`<li class="check ${m === true ? 'is-ok' : m === false ? 'is-no' : 'is-unknown'}">
          <span class="tick" aria-hidden="true">${icon(m === true ? 'checkCircle' : m === false ? 'xCircle' : 'dashCircle', { size: 20 })}</span>
          <span><span class="sr-only">${m === true ? 'You meet this: ' : m === false ? 'You don’t meet this: ' : 'Not answered: '}</span>${c.detail || c.key}</span></li>`;
      })}</ul>` : ''}
      ${ctx?.rulesText ? html`<p class="muted small">${ctx.rulesText}</p>` : ''}
      <p class="muted small">${icon('info', { size: 14 })} Only the uni can decide this.</p>
      ${externalLink(ctx?.url || u.links?.contextual, 'Their contextual admissions page')}
    </div>
  </details>`;
}

export default {
  label: 'Contextual Offers',
  title: () => 'Contextual Offers',
  render() {
    const st = store.get();
    const answers = st.contextual || {};
    const saved = new Set([...st.favourites.unis, ...st.favourites.courses.map((id) => db.course.get(id)?.uniId)]);
    const unis = [...db.unis].sort((a, b) => (saved.has(b.id) - saved.has(a.id)) || a.name.localeCompare(b.name));
    return html`<div class="page">
      <h1 class="large-title">Contextual Offers</h1>
      <div class="card explain">
        <p class="lead">A ${term('contextual', 'contextual offer')} is a lower offer some unis make when your background or circumstances might have made school harder.</p>
        <p>Most students get standard offers, and that's completely normal. This page is just so you can check, privately.</p>
      </div>

      <section class="section">
        <h2 class="section__title">Your checklist (optional)</h2>
        <p class="muted small">${icon('home', { size: 14 })} Your answers are saved on this device only.</p>
        ${checklist(answers)}
      </section>

      <section class="section">
        <h2 class="section__title">Uni by uni</h2>
        <p class="muted small">Your saved unis come first. Each estimate (Likely, Possible or Unlikely) compares your answers with what the uni publishes.</p>
        <div class="ctx-list">${unis.map((u) => uniBlock(u, answers, saved.has(u.id)))}</div>
      </section>
    </div>`;
  },
  mount(main) {
    const offs = [
      on(main, 'click', '[data-ctx]', (e, t) => {
        store.update((s) => {
          const v = t.dataset.val;
          if (v === 'unsure') delete s.contextual[t.dataset.ctx];
          else s.contextual[t.dataset.ctx] = v === 'yes';
        }, 'contextual');
      }),
      on(main, 'change', '[data-ctx-area]', (e, t) => {
        store.update((s) => {
          if (!t.value) delete s.contextual.area; else s.contextual.area = Number(t.value);
        }, 'contextual');
      }),
    ];
    return () => offs.forEach((o) => o());
  },
};
