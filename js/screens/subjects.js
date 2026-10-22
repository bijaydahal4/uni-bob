// Adding, removing and grading A-level subjects (for her real grades or a What-if).

import * as store from '../store.js';
import { db } from '../data.js';
import { html, toHTML, $, on } from '../ui/dom.js';
import { openSheet, closeSheet, gradeSelect, toast } from '../ui/components.js';
import { subjectKey, subjectLabel, GRADES } from '../logic/grades.js';

export const MAX_SUBJECTS = 4;

function listFor(s, scope) {
  if (scope === 'whatif') {
    if (!s.whatIf.current) { s.whatIf.current = store.blankWhatIf(); }
    s.whatIf.active = true;
    return s.whatIf.current.subjects;
  }
  return s.profile.subjects;
}

export function setGrade(scope, id, grade) {
  if (!GRADES.includes(grade)) return;
  store.update((s) => {
    const sub = listFor(s, scope).find((x) => x.id === id);
    if (sub) sub.grade = grade;
  }, scope === 'whatif' ? 'whatif' : 'profile');
}

export function removeSubject(scope, id) {
  let removed = null;
  store.update((s) => {
    const list = listFor(s, scope);
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0 && list.length > 1) removed = list.splice(i, 1)[0];
  }, scope === 'whatif' ? 'whatif' : 'profile');
  if (removed) toast(`Removed ${subjectLabel(removed.name)}`);
}

export function addSubject(scope, name, grade) {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) return false;
  let ok = false;
  store.update((s) => {
    const list = listFor(s, scope);
    if (list.length >= MAX_SUBJECTS) return;
    if (list.some((x) => subjectKey(x.name) === subjectKey(clean))) return;
    list.push({ id: store.uid(), name: clean, board: '', grade: GRADES.includes(grade) ? grade : 'A' });
    ok = true;
  }, scope === 'whatif' ? 'whatif' : 'profile');
  return ok;
}

export function openAddSubject(scope = 'profile') {
  const st = store.get();
  const current = scope === 'whatif' ? (st.whatIf.current?.subjects || st.profile.subjects) : st.profile.subjects;
  if (current.length >= MAX_SUBJECTS) { toast('You can have up to 4 A-levels'); return; }
  const taken = new Set(current.map((x) => subjectKey(x.name)));
  const all = (db.subjects || []).filter((n) => !taken.has(subjectKey(n)));
  const listHTML = (q = '') => {
    const k = q.trim().toLowerCase();
    const items = all.filter((n) => !k || n.toLowerCase().includes(k)).slice(0, 60);
    return toHTML(html`${items.map((n) => html`<li><button type="button" class="row row--button pick-row" data-pick="${n}"><span class="row__title">${n}</span><span class="pick-row__check" aria-hidden="true"></span></button></li>`)}
      ${!items.length ? html`<li class="row muted">No match. Use "Add" to add "${q.trim()}" as you typed it.</li>` : ''}`);
  };
  openSheet({
    title: scope === 'whatif' ? 'Add a subject to this What-if' : 'Add a subject',
    size: 'md',
    body: html`
      <label class="field">
        <span class="field__label">Subject</span>
        <input type="search" class="input" id="subj-q" placeholder="Search or type a subject" autocomplete="off" autocapitalize="words" enterkeyhint="done">
      </label>
      <ul class="group pick-list" id="subj-list" aria-label="A-level subjects">${{ __html: listHTML() }}</ul>
      <div class="row-inline">
        <span class="field__label">Grade</span>
        ${gradeSelect({ value: 'A', label: 'Grade for the new subject', data: { role: 'new-grade' } })}
      </div>`,
    footer: html`<button type="button" class="btn btn-primary btn-block" id="subj-add" disabled>Add subject</button>`,
    onMount(el) {
      const q = $('#subj-q', el);
      const list = $('#subj-list', el);
      const btn = $('#subj-add', el);
      let chosen = '';
      const sync = () => {
        btn.disabled = !(chosen || q.value.trim());
        btn.textContent = chosen ? `Add ${chosen}` : q.value.trim() ? `Add "${q.value.trim()}"` : 'Add subject';
      };
      q.addEventListener('input', () => { chosen = ''; list.innerHTML = listHTML(q.value); sync(); });
      const off = on(list, 'click', '[data-pick]', (e, t) => {
        chosen = t.dataset.pick;
        for (const b of list.querySelectorAll('[data-pick]')) b.classList.toggle('is-picked', b === t);
        sync();
      });
      btn.addEventListener('click', () => {
        const grade = el.querySelector('[data-role="new-grade"]').value;
        const name = chosen || q.value.trim();
        if (addSubject(scope, name, grade)) { closeSheet(); toast(`Added ${subjectLabel(name)}`); }
        else toast('That subject is already in your list');
      });
      setTimeout(() => q.focus(), 50);
      return off;
    },
  });
}
