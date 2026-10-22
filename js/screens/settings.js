// Settings: appearance, her details, about the data, Home Screen help, backup/restore and reset.

import * as store from '../store.js';
import { db } from '../data.js';
import { html, raw, $, on, plural } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { gradeSelect, toast, confirmSheet, openSheet, closeSheet } from '../ui/components.js';
import { subjectLabel } from '../logic/grades.js';
import { formatDate, isStale, todayISO } from '../logic/dates.js';

const GCSE = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];

function gcseSelect(key, label, value) {
  return html`<span class="grade-pick"><select class="grade-select" data-gcse="${key}" data-fkey="gcse-${key}" aria-label="${label}">
    <option value=""${!value ? raw(' selected') : ''}>Not set</option>
    ${GCSE.map((g) => html`<option value="${g}"${value === g ? raw(' selected') : ''}>${g}</option>`)}</select>${icon('chevronDown', { size: 14, cls: 'grade-pick__chev' })}</span>`;
}

function subjectEditRow(s, i) {
  const opts = [...new Set([s.name, ...(db.subjects || [])])];
  return html`<li class="row subj-edit">
    <span class="grade-pick grade-pick--wide subj-edit__name"><select class="grade-select" data-subj-name="${s.id}" data-fkey="sn-${s.id}" aria-label="Subject ${i + 1}">
      ${opts.map((n) => html`<option value="${n}"${n === s.name ? raw(' selected') : ''}>${subjectLabel(n) === n ? n : `${n} (${subjectLabel(n)})`}</option>`)}</select>${icon('chevronDown', { size: 14, cls: 'grade-pick__chev' })}</span>
    <input class="input input--small" type="text" value="${s.board || ''}" placeholder="Exam board" aria-label="Exam board for ${subjectLabel(s.name)}" data-subj-board="${s.id}" data-fkey="sb-${s.id}" maxlength="20">
    ${gradeSelect({ value: s.grade, label: `${subjectLabel(s.name)} grade`, data: { action: 'set-grade', scope: 'profile', id: s.id, fkey: `set-grade-${s.id}` } })}
    ${i >= 3 ? html`<button type="button" class="icon-btn icon-btn--sm" data-action="remove-subject" data-scope="profile" data-id="${s.id}" aria-label="Remove ${subjectLabel(s.name)}">${icon('minus', { size: 18 })}</button>` : ''}
  </li>`;
}

function aboutData() {
  const m = db.meta;
  const counts = {};
  for (const c of db.courses) if (c.entryYear) counts[c.entryYear] = (counts[c.entryYear] || 0) + 1;
  const years = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const yearText = !years.length ? '—' : `${years[0]} entry${years.length > 1
    ? `, plus ${years.slice(1).map((y) => `${plural(counts[y], 'course')} for ${y}`).join(' and ')}` : ''}`;
  const stale = isStale(m.lastChecked);
  return html`<ul class="group">
    <li class="row"><span class="row__title">Entry year</span><span class="row__value">${yearText}</span></li>
    <li class="row"><span class="row__title">Last checked</span><span class="row__value">${m.lastChecked ? formatDate(m.lastChecked) : '—'}</span></li>
    <li class="row"><span class="row__title">Covers</span><span class="row__value">${db.unis.length} unis · ${db.courses.length} courses · ${db.programmes.length} programmes</span></li>
    <li class="row"><span class="row__title">Official sources</span><span class="row__value">${m.sourceCount || '—'}</span></li>
    ${m.leagueTable ? html`<li class="row"><span class="row__title">League table</span><span class="row__value">${m.leagueTable.name}</span></li>` : ''}
  </ul>
  ${stale ? html`<p class="note note--warn">${icon('clock', { size: 16 })}<span>Some info may be out of date. It was last checked more than 4 months ago.</span></p>` : ''}
  <p class="muted small">You'll start in 2028, but most unis haven't published 2028 requirements yet, so these are for 2027 entry. They're usually similar.</p>
  <p class="muted small">Uni Bob checks official websites, but things change. Always check the uni's own page before you apply.</p>`;
}

function homeScreen() {
  return html`<ol class="steps">
    <li>Open Uni Bob in <b>Safari</b>.</li>
    <li>Tap the <b>Share</b> button ${icon('share', { size: 18, label: 'Share' })} (top right on iPad, bottom of the screen on iPhone).</li>
    <li>Scroll down and tap <b>Add to Home Screen</b> ${icon('plusSquare', { size: 18, label: 'Add to Home Screen' })}.</li>
    <li>Tap <b>Add</b>. Uni Bob now opens like an app, even offline.</li>
  </ol>`;
}

function download(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function restoreFrom(text) {
  let next;
  try {
    next = store.parseBackup(text);
  } catch (e) {
    toast(e.message && e.message.length < 80 ? e.message : 'That doesn’t look like a Uni Bob backup');
    return;
  }
  const ok = await confirmSheet({
    title: 'Restore this backup?',
    message: `This replaces everything on this device with the backup${next.profile?.name ? ` for ${next.profile.name}` : ''}.`,
    confirm: 'Restore',
  });
  if (ok) store.restore(next);
}

export default {
  label: 'Settings',
  title: () => 'Settings',
  render() {
    const st = store.get();
    const p = st.profile;
    return html`<div class="page">
      <h1 class="large-title">Settings</h1>

      <section class="section"><h2 class="section__title">Appearance</h2>
        <div class="segmented segmented--wide" role="radiogroup" aria-label="Appearance">
          ${['light', 'dark'].map((t) => html`<button type="button" role="radio" class="segmented__btn ${st.settings.theme === t ? 'is-on' : ''}" aria-checked="${st.settings.theme === t ? 'true' : 'false'}" data-theme-set="${t}" data-fkey="theme-${t}">${icon(t === 'light' ? 'sun' : 'moon', { size: 18 })}${t === 'light' ? 'Light' : 'Dark'}</button>`)}
        </div></section>

      <section class="section"><h2 class="section__title">Your details</h2>
        <ul class="group"><li class="row"><label class="row__title" for="set-name">Name</label>
          <input class="input input--inline" id="set-name" type="text" value="${p.name}" maxlength="40" autocomplete="given-name" data-fkey="set-name"></li></ul>
        <h3 class="mini-h">A-levels</h3>
        <ul class="group">${p.subjects.map(subjectEditRow)}
          ${p.subjects.length < 4 ? html`<li class="row"><button type="button" class="row__button" data-action="add-subject" data-scope="profile"><span class="row__icon-plain">${icon('plus', { size: 20 })}</span><span>Add a subject</span></button></li>` : ''}</ul>
        <h3 class="mini-h">GCSEs (optional)</h3>
        <ul class="group">
          <li class="row grade-row"><span class="row__title">GCSE Maths</span>${gcseSelect('maths', 'GCSE Maths grade', p.gcse.maths)}</li>
          <li class="row grade-row"><span class="row__title">GCSE English Language</span>${gcseSelect('english', 'GCSE English Language grade', p.gcse.english)}</li>
        </ul></section>

      <section class="section"><h2 class="section__title">About the data</h2>${aboutData()}</section>

      <section class="section"><h2 class="section__title">Add Uni Bob to your Home Screen</h2>${homeScreen()}</section>

      <section class="section"><h2 class="section__title">Back up and restore</h2>
        <p class="muted small">iPads sometimes clear website data. A backup keeps your grades, favourites, tracker and What-ifs safe.</p>
        <div class="btn-stack">
          <button type="button" class="btn btn-secondary" data-backup="file">${icon('download', { size: 18 })}<span>Save a backup file</span></button>
          <button type="button" class="btn btn-secondary" data-backup="code">${icon('copy', { size: 18 })}<span>Copy a backup code</span></button>
          <label class="btn btn-secondary file-btn">${icon('upload', { size: 18 })}<span>Restore from a file</span><input type="file" accept="application/json,.json,text/plain" data-restore="file" class="sr-only"></label>
          <button type="button" class="btn btn-secondary" data-restore="code">${icon('doc', { size: 18 })}<span>Restore from a code</span></button>
        </div></section>

      <section class="section"><h2 class="section__title">Reset</h2>
        <button type="button" class="btn btn-destructive btn-block" data-reset="1">${icon('trash', { size: 18 })}<span>Reset everything</span></button>
        <p class="muted small">This deletes your name, grades, favourites, tracker and What-ifs from this device.</p></section>

      <p class="muted small center">Uni Bob · No accounts, no tracking. Everything stays on this device.</p>
    </div>`;
  },
  mount(main) {
    let nameTimer = null;
    let boardTimer = null;
    const offs = [
      on(main, 'click', '[data-theme-set]', (e, t) => store.update((s) => { s.settings.theme = t.dataset.themeSet; }, 'settings')),
      on(main, 'input', '#set-name', (e, t) => {
        clearTimeout(nameTimer);
        nameTimer = setTimeout(() => store.update((s) => { s.profile.name = t.value.trim().slice(0, 40); }, 'name'), 400);
      }),
      on(main, 'change', '[data-subj-name]', (e, t) => store.update((s) => {
        const x = s.profile.subjects.find((y) => y.id === t.dataset.subjName);
        if (x) x.name = t.value;
      }, 'profile')),
      on(main, 'input', '[data-subj-board]', (e, t) => {
        clearTimeout(boardTimer);
        boardTimer = setTimeout(() => store.update((s) => {
          const x = s.profile.subjects.find((y) => y.id === t.dataset.subjBoard);
          if (x) x.board = t.value.trim().slice(0, 20);
        }, 'name'), 400);
      }),
      on(main, 'change', '[data-gcse]', (e, t) => store.update((s) => { s.profile.gcse[t.dataset.gcse] = t.value || null; }, 'profile')),
      on(main, 'click', '[data-backup="file"]', () => { download(store.exportBackup(), `uni-bob-backup-${todayISO()}.json`); toast('Backup saved to Downloads'); }),
      on(main, 'click', '[data-backup="code"]', async () => {
        const code = store.exportCode();
        try {
          await navigator.clipboard.writeText(code);
          toast('Backup code copied. Paste it somewhere safe, like Notes.');
        } catch {
          openSheet({ title: 'Your backup code', size: 'md', body: html`<p class="muted small">Copy all of this and keep it somewhere safe, like Notes.</p><textarea class="input textarea code-box" rows="8" readonly>${code}</textarea>`, footer: html`<button type="button" class="btn btn-primary btn-block" data-action="close-sheet">Done</button>` });
        }
      }),
      on(main, 'change', '[data-restore="file"]', async (e, t) => {
        const f = t.files?.[0];
        if (!f) return;
        const text = await f.text();
        t.value = '';
        restoreFrom(text);
      }),
      on(main, 'click', '[data-restore="code"]', () => openSheet({
        title: 'Restore from a code', size: 'md',
        body: html`<label class="field"><span class="field__label">Paste your backup code</span><textarea class="input textarea code-box" id="restore-code" rows="6" placeholder="UNIBOB1:…"></textarea></label>`,
        footer: html`<button type="button" class="btn btn-primary btn-block" id="restore-go">Restore</button>`,
        onMount(el) {
          $('#restore-go', el).addEventListener('click', () => { const v = $('#restore-code', el).value; closeSheet(true); restoreFrom(v); });
        },
      })),
      on(main, 'click', '[data-reset]', async () => {
        const ok = await confirmSheet({ title: 'Reset everything?', message: 'This deletes everything you’ve entered on this device. You can’t undo this unless you have a backup.', confirm: 'Reset', destructive: true });
        if (ok) store.resetAll();
      }),
    ];
    return () => { clearTimeout(nameTimer); clearTimeout(boardTimer); offs.forEach((o) => o()); };
  },
  update(what) {
    return what === 'name';
  },
};

