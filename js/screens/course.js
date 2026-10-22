// Course page: the few key facts first, with the detail tucked away.

import * as store from '../store.js';
import { db, chanceFor, subjectLinks } from '../data.js';
import { html, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chanceSlider, chip, info, heart, section, expander, externalLink, emptyState } from '../ui/components.js';
import { subjectKey, subjectLabel } from '../logic/grades.js';
import { formatDate } from '../logic/dates.js';
import { offerText } from './explore.js';

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'official page'; }
}

const OPTION_TEXT = {
  yearAbroad: { optional: 'Year abroad: optional', required: 'Includes a year abroad' },
  placement: { optional: 'Placement year: optional', required: 'Includes a placement year' },
  foundationYear: { available: 'Foundation year available' },
};

function optionChips(c) {
  const o = c.options || {};
  const out = [];
  for (const k of Object.keys(OPTION_TEXT)) {
    const t = OPTION_TEXT[k][o[k]];
    if (t) out.push(chip(t, k === 'placement' ? '' : 'chip--navy'));
  }
  return out;
}

const tick = (ok) => (ok === true ? html`<span class="tick is-ok" aria-hidden="true">${icon('checkCircle', { size: 20 })}</span>`
  : ok === false ? html`<span class="tick is-no" aria-hidden="true">${icon('xCircle', { size: 20 })}</span>`
    : html`<span class="tick is-unknown" aria-hidden="true">${icon('dashCircle', { size: 20 })}</span>`);
const srTick = (ok) => (ok === true ? 'Yes: ' : ok === false ? 'No: ' : 'Check: ');

function reqRows(c, r, profile) {
  const rows = [];
  const checks = r?.checks || [];
  for (const g of c.subjectRequirements || []) {
    const ch = checks.find((x) => x.group === g || (x.group.subjects.join() === g.subjects.join() && x.group.minGrade === g.minGrade));
    const names = g.subjects.map(subjectLabel).join(' or ');
    const need = g.minGrade ? `they need ${g.minGrade}` : 'they need it';
    if (g.checkable === false || !ch) {
      rows.push({ ok: null, text: `They need ${g.minGrade ? `${g.minGrade} in ` : ''}${g.subjects.join(' or ')}${g.note ? ` (${g.note})` : ''}` });
    } else if (ch.status === 'missing') {
      rows.push({ ok: false, text: `${names}: ${need}, and you're not taking it` });
    } else {
      rows.push({ ok: ch.status === 'met', text: `${subjectLabel(ch.subject)}: ${need}, you have ${ch.have}` });
    }
  }
  return rows;
}

const shortNote = (n) => (n && n.length <= 40 ? ` (${n})` : '');

function gcseRows(c, gcse) {
  return (c.gcse || []).map((g) => {
    const k = subjectKey(g.subject);
    const mine = k === 'mathematics' ? gcse.maths : (k === 'english language' || k === 'english') ? gcse.english : null;
    const label = `GCSE ${g.subject === 'Mathematics' ? 'Maths' : g.subject}`;
    if (!g.minGrade) return { ok: null, text: `${label}: see More details` };
    if (mine == null) return { ok: null, text: `${label}: they need ${g.minGrade}${shortNote(g.note)}. Add your GCSEs in Settings to check.` };
    const ok = Number(mine) >= Number(g.minGrade);
    return { ok, text: `${label}: they need ${g.minGrade}, you have ${mine}${shortNote(g.note)}` };
  });
}

/** Her subjects that appear on the course's preferred-subjects list. */
function preferredRows(c, profile) {
  const pref = (c.preferredSubjects || []).flatMap((p) => [...(p.subjects || []), p.note || ''].join(' '));
  if (!pref.length) return [];
  const text = pref.join(' ').toLowerCase();
  return profile.subjects
    .filter((s) => !['mathematics'].includes(subjectKey(s.name)) && text.includes(subjectKey(s.name)))
    .map((s) => ({ ok: true, text: `${subjectLabel(s.name)} is on their preferred subjects list` }));
}

function acceptRows(c, profile) {
  const no = new Set((c.notAccepted || []).map(subjectKey));
  return profile.subjects.map((s) => {
    const k = subjectKey(s.name);
    const label = subjectLabel(s.name);
    if (no.has(k)) return { ok: false, text: `They don't accept ${label}` };
    const flag = k === 'psychology' ? c.acceptsPsychology : k === 'geography' ? c.acceptsGeography : null;
    if (flag === 'yes') return { ok: true, text: `${label} is accepted` };
    if (flag === 'no') return { ok: false, text: `They don't accept ${label}` };
    if (k === 'mathematics' || k === 'further mathematics') return null;
    return { ok: null, text: `${label}: not confirmed. Check their page.` };
  }).filter(Boolean);
}

function rowsList(rows) {
  if (!rows.length) return '';
  return html`<ul class="check-list">${rows.map((x) => html`<li class="check ${x.ok === true ? 'is-ok' : x.ok === false ? 'is-no' : 'is-unknown'}">${tick(x.ok)}<span><span class="sr-only">${srTick(x.ok)}</span>${x.text}</span></li>`)}</ul>`;
}

const ALT_TITLES = {
  epq: 'With an EPQ', contextual: 'Contextual offer', accessProgramme: 'Access programme', summerSchool: 'Summer school', tmua: 'With the TMUA', other: 'Alternative offer',
};
const ALT_INFO = { epq: 'epq', contextual: 'contextual', tmua: 'tmua' };

function findProgramme(name, uniId) {
  if (!name) return null;
  const n = name.toLowerCase();
  return db.programmes.find((p) => p.name.toLowerCase() === n)
    || db.programmes.find((p) => ((p.uniIds || []).includes(uniId) || (p.lowersOfferAt || []).includes(uniId)) && (p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase())));
}

function altList(c) {
  const alts = c.alternativeOffers || [];
  if (!alts.length) return html`<p class="muted">We couldn't find any officially published ways to lower the offer for this course.</p>`;
  return html`<ul class="group alt-list">${alts.map((a) => {
    const prog = (a.type === 'accessProgramme' || a.type === 'summerSchool') ? findProgramme(a.programme, c.uniId) : null;
    return html`<li class="row row--stack alt">
      <span class="row__title">${ALT_TITLES[a.type] || ALT_TITLES.other}${ALT_INFO[a.type] ? info(ALT_INFO[a.type]) : ''}${a.offer ? html` <b class="alt__offer">${a.offerText || a.offer}</b>` : ''}</span>
      ${a.programme ? html`<span class="row__sub">${a.programme}</span>` : ''}
      ${a.conditions ? html`<span class="row__text">${a.conditions}</span>` : ''}
      ${prog ? html`<a class="link" href="#/summer/${prog.id}">See it in Summer Schools${icon('chevronRight', { size: 14 })}</a>` : ''}
      ${a.type === 'contextual' ? html`<a class="link" href="#/contextual">Check if you might be eligible${icon('chevronRight', { size: 14 })}</a>` : ''}
    </li>`;
  })}</ul>
  <p class="muted small">Most of these are for students who meet certain criteria. Try them in ${raw('<a class="link" href="#/whatif">What ifs</a>')}.</p>`;
}

function testBlock(c) {
  const t = c.admissionsTest || {};
  const status = t.status || 'none';
  const head = status === 'required' ? `Needed: ${t.name || 'admissions test'}` : status === 'optional' ? `Optional: ${t.name || 'admissions test'}` : 'No admissions test';
  return html`<p class="lead">${head}${/tmua/i.test(t.name || '') ? info('tmua', 'TMUA') : ''}</p>
    ${t.effect ? html`<p>${t.effect}</p>` : status === 'none' ? html`<p class="muted">This course doesn't use an admissions test.</p>` : ''}
    ${/tmua/i.test(t.name || '') && db.meta.tmuaUrl ? externalLink(db.meta.tmuaUrl, 'About the TMUA') : ''}`;
}

export default {
  label: 'Course',
  back: true,
  title: ([id]) => db.course.get(id)?.name || 'Course',
  toolbar([id]) {
    const c = db.course.get(id);
    return c ? { actions: heart('course', c.id, store.isFavourite('courses', c.id), `${c.name} at ${c.uni.shortName}`) } : {};
  },
  render([id]) {
    const c = db.course.get(id);
    if (!c) return emptyState('Course not found', 'It may have been removed. Try searching in Explore.', html`<a class="btn btn-secondary" href="#/explore">Go to Explore</a>`);
    const u = c.uni;
    const profile = store.effectiveProfile();
    const r = chanceFor(c, profile);
    const links = subjectLinks(c, profile.subjects);
    const req = reqRows(c, r, profile);
    const gc = gcseRows(c, profile.gcse || {});
    const acc = acceptRows(c, profile);
    const src = c.offer?.source?.url || c.links?.course;
    const checked = c.offer?.source?.checked;
    const length = c.lengthYears ? `${c.lengthYears} years` : null;
    return html`<div class="page">
      <header class="hero">
        <h1 class="large-title">${c.name}</h1>
        <p class="hero__sub"><a class="link" href="#/uni/${u.id}">${u.name}</a></p>
        <p class="meta-line">${[c.degree, length, c.lengthNote, c.ucasCode ? `UCAS code ${c.ucasCode}` : null].filter(Boolean).join(' · ')}</p>
        ${c.notOpen ? html`<p class="note note--warn">${icon('info', { size: 16 })}<span>${c.notOpen}</span></p>` : ''}
        <div class="chips">${chip(`${c.entryYear} entry`, 'chip--plain')}${links.map((s) => chip(`Fits your ${s}`, 'chip--navy', 'star'))}${optionChips(c)}</div>
      </header>

      ${section('What you need', html`
        <div class="offer-box">
          <span class="offer-box__label">Typical offer ${info('typicalOffer', 'typical offer')}</span>
          <span class="offer-box__value">${offerText(c)}</span>
          ${c.offer?.text ? html`<span class="offer-box__text">${c.offer.text}</span>` : ''}
          ${!c.offer?.typical && !c.offer?.tariff ? html`<span class="offer-box__text">Not confirmed: ${externalLink(c.links?.course || u.links?.courses, 'check the uni’s page')}</span>` : ''}
        </div>
        ${rowsList([...req, ...preferredRows(c, profile)])}
        ${gc.length ? html`<h3 class="mini-h">GCSEs</h3>${rowsList(gc)}` : ''}
        ${acc.length ? html`<h3 class="mini-h">Your A-level subjects</h3>${rowsList(acc)}` : ''}
        ${(c.notAccepted || []).length ? html`<p class="muted small">They don't accept: ${c.notAccepted.join(', ')}.</p>` : ''}`)}

      ${section('Your chances', html`${chanceSlider(r)}
        ${c.competition ? html`<p class="muted small">${icon('people', { size: 14 })} Official figures: ${c.competition.text || ''}${c.competition.source?.url ? html` ${externalLink(c.competition.source.url, 'source')}` : ''}</p>` : ''}
        ${profile.isWhatIf ? html`<p class="note">${icon('sparkles', { size: 16 })}<span>This uses your What-if, not your real grades.</span></p>` : ''}`)}

      ${section('Ways to lower your offer', altList(c))}

      ${section('Admissions test', testBlock(c), { infoKey: 'tmua' })}

      ${expander('More details', html`
        ${c.offer?.text ? html`<p><b>Entry requirements:</b> ${c.offer.text}</p>` : ''}
        ${(c.preferredSubjects || []).length ? html`<p><b>Preferred subjects:</b> ${c.preferredSubjects.map((p) => `${p.subjects.join(' or ')}${p.note ? ` (${p.note})` : ''}`).join('; ')}</p>` : ''}
        ${c.gcseText || (c.gcse || []).some((g) => g.note) ? html`<p><b>GCSEs:</b> ${c.gcseText || (c.gcse || []).map((g) => `${g.subject}: ${g.minGrade || ''} ${g.note || ''}`.trim()).join('; ')}</p>` : ''}
        ${c.notes ? html`<p>${c.notes}</p>` : ''}
        ${(c.notConfirmed || []).length ? html`<p class="muted"><b>Not confirmed:</b> ${c.notConfirmed.join('; ')}. Check the uni’s page.</p>` : ''}
        <ul class="link-list">
          ${c.links?.course ? html`<li>${externalLink(c.links.course, 'Course page on the uni’s website')}</li>` : ''}
          ${c.links?.ucas ? html`<li>${externalLink(c.links.ucas, 'Course on UCAS')}</li>` : ''}
        </ul>`)}

      <footer class="source-foot">Requirements for <b>${c.entryYear} entry</b>${checked ? html` · Last checked ${formatDate(checked)}` : ''}${src ? html` · Source: ${externalLink(src, hostOf(src))}` : ''}</footer>
    </div>`;
  },
};

