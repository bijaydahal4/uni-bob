// What ifs: try different grades and options without losing her real grades.

import * as store from '../store.js';
import { db, countChances } from '../data.js';
import { html, raw, $, on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { gradeSelect, info, openSheet, closeSheet, toast, confirmSheet } from '../ui/components.js';
import { subjectRow } from '../ui/sidebar.js';
import { CHANCES, CHANCE_LABELS, GRADES, profileSummary } from '../logic/grades.js';
import { NEAR_HOME_MILES } from '../logic/filters.js';

const TMUA_SCORES = ['1.0', '2.0', '3.0', '4.0', '4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0'];
const EPQ_GRADES = GRADES.filter((g) => g !== 'U');

function current() {
  const w = store.get().whatIf;
  return w.active && w.current ? w.current : store.blankWhatIf();
}

function inScope(c, scope) {
  const u = c.uni;
  if (scope.rgOnly && !u.russellGroup) return false;
  if (scope.londonOnly && !u.isLondon) return false;
  if (scope.campusOnly && u.setting !== 'campus') return false;
  if (scope.nearHome && !(u.distance != null && u.distance <= NEAR_HOME_MILES)) return false;
  return true;
}

/** Change the What-if (turning it on if needed). */
function edit(fn) {
  store.update((s) => {
    if (!s.whatIf.active || !s.whatIf.current) {
      s.whatIf.current = store.blankWhatIf();
      s.whatIf.active = true;
      s.whatIf.currentId = null;
    }
    fn(s.whatIf.current, s);
  }, 'whatif');
}

function switchRow(key, label, onNow, extra = '', infoKey = null) {
  return html`<li class="row switch-row"><label class="switch-row__label" for="w-${key}"><span class="row__title">${label}${infoKey ? info(infoKey) : ''}</span></label>
    ${extra}<input type="checkbox" class="switch" id="w-${key}" data-wt="${key}" data-fkey="w-${key}"${onNow ? raw(' checked') : ''}></li>`;
}

function summary(counts) {
  return html`<ul class="summary">${CHANCES.map((c) => html`<li class="summary__item is-${c}"><span class="summary__n">${counts[c]}</span><span class="summary__l">${CHANCE_LABELS[c]}</span></li>`)}</ul>`;
}

function line(counts) {
  return CHANCES.filter((c) => counts[c]).map((c) => `${counts[c]} ${CHANCE_LABELS[c]}`).join(' · ') || 'No courses';
}

export default {
  label: 'What ifs',
  title: () => 'What ifs',
  render() {
    const st = store.get();
    const w = st.whatIf;
    const cur = current();
    const t = cur.toggles;
    const courses = db.courses.filter((c) => inScope(c, cur.scope));
    const counts = countChances(courses, { subjects: cur.subjects, toggles: t });
    const real = countChances(courses, { subjects: st.profile.subjects, toggles: null });
    const realGrades = profileSummary(st.profile.subjects).grades;
    return html`<div class="page">
      <h1 class="large-title">What ifs</h1>
      <p class="lead">Try out different grades and options. Your real grades stay safe, and every slider in the app shows the What-if while it’s on.</p>

      <section class="section">
        <h2 class="section__title">Your chances with this What-if</h2>
        <div class="card summary-card" aria-live="polite">
          ${summary(counts)}
          <p class="muted small">Across ${courses.length} courses${cur.scope.rgOnly || cur.scope.londonOnly || cur.scope.campusOnly || cur.scope.nearHome ? ' that match your switches below' : ''}. With your real grades (${realGrades}): ${line(real)}.</p>
        </div>
        ${w.active ? html`<button type="button" class="btn btn-secondary btn-block" data-action="whatif-off">${icon('refresh', { size: 18 })}<span>Back to my grades</span></button>` : ''}
      </section>

      <section class="section">
        <h2 class="section__title">Grades</h2>
        <ul class="group">
          ${cur.subjects.map((s, i) => subjectRow(s, { scope: 'whatif', removable: i >= 3 }))}
          ${cur.subjects.length < 4 ? html`<li class="row"><button type="button" class="row__button" data-action="add-subject" data-scope="whatif">
            <span class="row__icon-plain">${icon('plus', { size: 20 })}</span><span>Add a subject (for example Further Maths)</span></button></li>` : ''}
        </ul>
      </section>

      <section class="section">
        <h2 class="section__title">Options</h2>
        <ul class="group">
          ${switchRow('epq', 'I do an EPQ', t.epq.on, t.epq.on ? gradeSelect({ value: t.epq.grade, label: 'EPQ grade', grades: EPQ_GRADES, data: { wepq: '1', fkey: 'w-epq-grade' } }) : '', 'epq')}
          ${switchRow('contextual', 'I’m eligible for a contextual offer', t.contextual, '', 'contextual')}
          ${switchRow('summerSchool', 'I do a uni summer school or access programme', t.summerSchool)}
          ${switchRow('tmua', 'I take the TMUA', t.tmua.on, t.tmua.on ? html`<span class="grade-pick"><select class="grade-select" data-wtmua="1" data-fkey="w-tmua-score" aria-label="Rough TMUA score">${TMUA_SCORES.map((x) => html`<option value="${x}"${Number(x) === Number(t.tmua.score) ? raw(' selected') : ''}>${x}</option>`)}</select>${icon('chevronDown', { size: 14, cls: 'grade-pick__chev' })}</span>` : '', 'tmua')}
        </ul>
        <p class="muted small">Lower offers only show where a uni officially publishes them, and most have conditions. The summer school switch only counts at unis whose own programme gives a lower offer.</p>
      </section>

      <section class="section">
        <h2 class="section__title">Which unis to count</h2>
        <ul class="group">
          ${[['rgOnly', 'Russell Group only'], ['londonOnly', 'London only'], ['campusOnly', 'Campus unis only'], ['nearHome', `Near home (about ${NEAR_HOME_MILES} miles)`]].map(([k, l]) => html`<li class="row switch-row"><label class="switch-row__label" for="ws-${k}"><span class="row__title">${l}</span></label><input type="checkbox" class="switch" id="ws-${k}" data-ws="${k}" data-fkey="ws-${k}"${cur.scope[k] ? raw(' checked') : ''}></li>`)}
        </ul>
      </section>

      <section class="section">
        <h2 class="section__title">Saved What-ifs</h2>
        ${w.saved.length ? html`<ul class="group">${w.saved.map((x) => html`<li class="row saved-row ${w.currentId === x.id && w.active ? 'is-current' : ''}">
          <span class="row__main"><span class="row__title">${x.name}</span><span class="row__sub">${profileSummary(x.subjects).grades}${x.toggles?.epq?.on ? ' · EPQ' : ''}${x.toggles?.contextual ? ' · Contextual' : ''}${x.toggles?.summerSchool ? ' · Summer school' : ''}${x.toggles?.tmua?.on ? ` · TMUA ${x.toggles.tmua.score}` : ''}</span></span>
          <button type="button" class="btn btn-small btn-secondary" data-wuse="${x.id}">${w.currentId === x.id && w.active ? 'In use' : 'Use'}</button>
          <button type="button" class="icon-btn icon-btn--sm" data-wdel="${x.id}" aria-label="Delete ${x.name}">${icon('trash', { size: 18 })}</button></li>`)}</ul>`
        : html`<p class="muted">Save up to five What-ifs, like “If I get A*AA”, and switch between them.</p>`}
        <button type="button" class="btn btn-primary btn-block" data-wsave="1"${w.saved.length >= store.MAX_WHATIFS ? raw(' disabled') : ''}>${icon('plus', { size: 18 })}<span>${w.saved.length >= store.MAX_WHATIFS ? 'You’ve saved five. Delete one to save another.' : 'Save this What-if'}</span></button>
      </section>
    </div>`;
  },
  mount(main) {
    const offs = [
      on(main, 'change', '[data-wt]', (e, t) => edit((c) => {
        const k = t.dataset.wt;
        if (k === 'epq' || k === 'tmua') c.toggles[k] = { ...c.toggles[k], on: t.checked };
        else c.toggles[k] = t.checked;
      })),
      on(main, 'change', '[data-wepq]', (e, t) => edit((c) => { c.toggles.epq = { ...c.toggles.epq, grade: t.value }; })),
      on(main, 'change', '[data-wtmua]', (e, t) => edit((c) => { c.toggles.tmua = { ...c.toggles.tmua, score: Number(t.value) }; })),
      on(main, 'change', '[data-ws]', (e, t) => edit((c) => { c.scope = { ...c.scope, [t.dataset.ws]: t.checked }; })),
      on(main, 'click', '[data-wuse]', (e, t) => {
        const x = store.get().whatIf.saved.find((s) => s.id === t.dataset.wuse);
        if (!x) return;
        store.update((s) => {
          s.whatIf.current = JSON.parse(JSON.stringify({ subjects: x.subjects, toggles: x.toggles, scope: x.scope }));
          s.whatIf.active = true;
          s.whatIf.currentId = x.id;
        }, 'whatif');
        toast(`Using “${x.name}”`);
      }),
      on(main, 'click', '[data-wdel]', async (e, t) => {
        const x = store.get().whatIf.saved.find((s) => s.id === t.dataset.wdel);
        if (!x || !(await confirmSheet({ title: 'Delete this What-if?', message: `“${x.name}” will be removed.`, confirm: 'Delete', destructive: true }))) return;
        store.update((s) => {
          s.whatIf.saved = s.whatIf.saved.filter((y) => y.id !== x.id);
          if (s.whatIf.currentId === x.id) s.whatIf.currentId = null;
        }, 'whatif');
      }),
      on(main, 'click', '[data-wsave]', () => {
        if (store.get().whatIf.saved.length >= store.MAX_WHATIFS) return;
        const cur = current();
        openSheet({
          title: 'Save this What-if', size: 'sm',
          body: html`<label class="field"><span class="field__label">Name</span>
            <input class="input" id="w-name" type="text" maxlength="40" value="If I get ${profileSummary(cur.subjects).grades}" autocomplete="off"></label>`,
          footer: html`<button type="button" class="btn btn-primary btn-block" id="w-save-go">Save</button>`,
          onMount(el) {
            const input = $('#w-name', el);
            const go = () => {
              const name = input.value.trim().slice(0, 40) || 'My What-if';
              const id = store.uid();
              store.update((s) => {
                const snap = JSON.parse(JSON.stringify(cur));
                s.whatIf.saved.push({ id, name, ...snap });
                s.whatIf.current = snap;
                s.whatIf.active = true;
                s.whatIf.currentId = id;
              }, 'whatif');
              closeSheet();
              toast(`Saved “${name}”`);
            };
            $('#w-save-go', el).addEventListener('click', go);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
            setTimeout(() => input.select(), 60);
          },
        });
      }),
    ];
    return () => offs.forEach((o) => o());
  },
};
