// Uni page: key facts first, then courses, personalised recommendations, open days, costs and links.

import * as store from '../store.js';
import { db, chanceFor, programmesForUni } from '../data.js';
import { html, raw } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chanceSlider, chanceLabel, chip, info, heart, section, externalLink, dateStatus, emptyState } from '../ui/components.js';
import { distanceText } from '../logic/geo.js';
import { formatDate, parseISO, startOfDay } from '../logic/dates.js';
import { offerPoints, CHANCES } from '../logic/grades.js';
import { offerText } from './explore.js';
import { estimate } from '../logic/contextual.js';

const WORD = ['no', 'one', 'two', 'three', 'four'];
const gradesWord = (n) => `${WORD[n] || n} grade${n === 1 ? '' : 's'}`;

export function rankChips(u) {
  const out = [];
  if (u.russellGroup) out.push(chip('Russell Group', 'chip--navy'));
  if (u.setting === 'campus') out.push(chip('Campus uni', '', 'home'));
  if (u.setting === 'city') out.push(chip('City uni', '', 'building'));
  if (u.setting === 'mixed') out.push(chip('Campus and city', '', 'building'));
  return out;
}

export function rankText(u) {
  const r = u.rank;
  if (!r?.overall) return null;
  return `${ordinal(r.overall)} in the UK${r.economics ? ` · ${ordinal(r.economics)} for Economics` : ''}`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function nextOpenDays(u, today = new Date()) {
  const t = startOfDay(today);
  return (u.openDays?.events || []).filter((e) => {
    const d = parseISO(e.endDate || e.date);
    return d && d >= t;
  });
}

function findProgramme(name, uniId) {
  if (!name) return null;
  const n = name.toLowerCase();
  return db.programmes.find((p) => p.name.toLowerCase() === n)
    || db.programmes.find((p) => (p.uniIds || []).includes(uniId) && (p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase())));
}

/** Personalised, official-only suggestions for this uni. */
export function recommendations(u) {
  const courses = u.courses || [];
  const results = courses.map((c) => ({ c, r: chanceFor(c) }));
  const below = results.some(({ r }) => r && ['reach', 'longshot'].includes(r.chance));
  const main = courses.find((c) => (c.types || []).includes('economics')) || courses[0];
  const recs = [];
  const seen = new Set();
  const pickExample = (type) => {
    const withAlt = courses.filter((c) => (c.alternativeOffers || []).some((a) => a.type === type && a.offer));
    const c = withAlt.includes(main) ? main : withAlt[0];
    if (!c) return null;
    const a = c.alternativeOffers.find((x) => x.type === type && x.offer);
    const drop = offerPoints(c.offer?.typical) != null && offerPoints(a.offer) != null ? offerPoints(c.offer.typical) - offerPoints(a.offer) : null;
    return { c, a, drop, count: withAlt.length };
  };

  const epq = pickExample('epq');
  if (epq) {
    recs.push({
      gap: true, icon: 'doc',
      title: `An EPQ could lower your offer${epq.drop > 0 ? ` by ${gradesWord(epq.drop)}` : ''}`,
      text: `For ${epq.c.name}: ${epq.a.offer} instead of ${epq.c.offer.typical}${epq.a.conditions ? `, ${epq.a.conditions.replace(/^plus /i, 'plus ')}` : ''}.`,
      href: `#/course/${epq.c.id}`, link: 'See the course',
    });
    seen.add('epq');
  }
  const tm = pickExample('tmua');
  const tmuaOptional = courses.find((c) => c.admissionsTest?.status === 'optional' && /tmua/i.test(c.admissionsTest?.name || ''));
  if (tm) {
    recs.push({ gap: true, icon: 'pencil', title: 'Take the TMUA: a good score can lower your offer', text: `For ${tm.c.name}: ${tm.a.offer}${tm.a.conditions ? ` ${tm.a.conditions}` : ''}.`, href: `#/course/${tm.c.id}`, link: 'See the course' });
  } else if (tmuaOptional) {
    recs.push({ gap: true, icon: 'pencil', title: 'The TMUA is optional here', text: tmuaOptional.admissionsTest.effect || 'Check what a good score does on the course page.', href: `#/course/${tmuaOptional.id}`, link: 'See the course' });
  }
  const progs = programmesForUni(u.id).filter((p) => p.lowersOffer && (p.lowersOfferAt || []).includes(u.id));
  for (const p of progs.slice(0, 2)) {
    recs.push({
      gap: true, icon: 'sun',
      title: `Do ${p.name}: if you're eligible, your offer could be lower`,
      text: p.offerReduction ? `${p.offerReduction}. ${p.eligibility === 'criteria' ? 'It has eligibility criteria.' : 'It’s open to everyone.'}` : (p.summary || ''),
      href: `#/summer/${p.id}`, link: 'See it in Summer Schools',
    });
  }
  if (!progs.length) {
    const acc = pickExample('accessProgramme') || pickExample('summerSchool');
    if (acc) {
      const p = findProgramme(acc.a.programme, u.id);
      recs.push({
        gap: true, icon: 'sun',
        title: `${acc.a.programme ? `Do ${acc.a.programme}` : 'Do their access programme'}: if you're eligible, your offer could be lower`,
        text: `For ${acc.c.name}: ${acc.a.offer}${acc.a.conditions ? `, ${acc.a.conditions}` : ''}.`,
        href: p ? `#/summer/${p.id}` : `#/course/${acc.c.id}`, link: p ? 'See it in Summer Schools' : 'See the course',
      });
    }
  }
  if (u.contextual?.offersContextual) {
    const est = estimate(u, store.get().contextual);
    const ctxEx = pickExample('contextual');
    recs.push({
      gap: true, icon: 'people',
      title: 'Check if you could get a contextual offer',
      text: `${u.contextual.typicalReduction ? `${capital(u.contextual.typicalReduction)}.` : ''}${ctxEx ? ` For ${ctxEx.c.name}: ${ctxEx.a.offer}.` : ''}${est.level === 'likely' || est.level === 'possible' ? ` From your answers: ${est.level === 'likely' ? 'Likely' : 'Possible'}.` : ''}`.trim(),
      href: '#/contextual', link: 'Contextual Offers',
    });
  }
  const od = nextOpenDays(u);
  recs.push({
    gap: false, icon: 'calendar', title: 'Come to an open day',
    text: od.length ? `Next: ${formatDate(od[0].date)}${od[0].label ? ` (${od[0].label})` : ''}.` : (u.openDays?.text || 'Dates not announced yet.'),
    url: u.openDays?.url || u.links?.openDays, link: 'Open days',
  });
  // If she's below the offer, put the ways to close the gap first.
  return below ? recs : [recs[recs.length - 1], ...recs.slice(0, -1)];
}

const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function money(n) {
  return typeof n === 'number' ? `£${n.toLocaleString('en-GB')}` : null;
}

function costsBody(u) {
  const f = u.fees;
  const l = u.livingCosts;
  return html`<ul class="group">
    <li class="row row--stack"><span class="row__title">${icon('pound', { size: 18 })} Tuition fee (UK students)</span>
      <span class="row__value">${f?.homeAnnual ? html`${money(f.homeAnnual)} a year${f.academicYear ? html` <span class="muted">(${f.academicYear})</span>` : ''}` : 'Not confirmed: check the uni’s page'}</span>
      ${f?.text ? html`<span class="row__sub">${f.text}</span>` : ''}</li>
    <li class="row row--stack"><span class="row__title">${icon('home', { size: 18 })} ${l?.kind === 'halls rent' ? 'Halls rent' : 'Living costs'}</span>
      <span class="row__value">${l?.text || 'Not confirmed: check the uni’s page'}</span></li>
  </ul>
  <p class="muted small">Student Finance can help with fees and living costs ${info('studentFinance', 'Student Finance')}</p>`;
}

function courseRow(c) {
  const r = chanceFor(c);
  return html`<li class="course-row-wrap"><a class="row course-row" href="#/course/${c.id}">
    <span class="course-row__main">
      <span class="row__title">${c.name}</span>
      <span class="row__sub">${[c.degree, c.lengthYears ? `${c.lengthYears} years` : null, `Typical offer ${offerText(c)}`].filter(Boolean).join(' · ')}</span>
      <span class="course-row__chance">${chanceLabel(r)}${chanceSlider(r, { compact: true })}</span>
    </span>
    ${icon('chevronRight', { size: 16, cls: 'row__chev' })}
  </a>${heart('course', c.id, store.isFavourite('courses', c.id), `${c.name} at ${c.uni.shortName}`)}</li>`;
}

export default {
  label: 'Uni',
  back: true,
  title: ([id]) => db.uni.get(id)?.shortName || 'Uni',
  toolbar([id]) {
    const u = db.uni.get(id);
    return u ? { actions: heart('uni', u.id, store.isFavourite('unis', u.id), u.name) } : {};
  },
  render([id]) {
    const u = db.uni.get(id);
    if (!u) return emptyState('Uni not found', 'It may have been removed. Try searching in Explore.', html`<a class="btn btn-secondary" href="#/explore">Go to Explore</a>`);
    const rank = rankText(u);
    const recs = recommendations(u);
    const od = nextOpenDays(u);
    const progs = programmesForUni(u.id);
    const checked = (u.courses || []).map((c) => c.offer?.source?.checked).filter(Boolean).sort().pop() || u.checked;
    return html`<div class="page">
      <header class="hero">
        <h1 class="large-title">${u.name}</h1>
        <p class="hero__sub">${icon('pin', { size: 16 })}<span>${u.city}${u.distance != null ? html` · ${distanceText(u.distance)}` : ''}</span></p>
        <div class="chips">${rankChips(u)}${rank ? html`<span class="chip chip--plain">${icon('star', { size: 14 })}${rank}${info('leagueTable', 'league table')}</span>` : ''}</div>
        ${u.country === 'Scotland' ? html`<p class="note">${icon('info', { size: 16 })}<span>Most degrees in Scotland take 4 years.</span></p>` : ''}
      </header>

      ${section('Courses', u.courses?.length
        ? html`<ul class="group course-list">${u.courses.map(courseRow)}</ul>`
        : html`<p class="muted">No matching courses here.</p>`)}

      ${section('Recommended for you', html`<ul class="rec-list">${recs.map((r) => html`<li class="rec">
          <span class="rec__icon" aria-hidden="true">${icon(r.icon, { size: 20 })}</span>
          <span class="rec__body"><span class="rec__title">${r.title}</span>${r.text ? html`<span class="rec__text">${r.text}</span>` : ''}
            ${r.href ? html`<a class="link" href="${r.href}">${r.link}${icon('chevronRight', { size: 14 })}</a>` : ''}
            ${r.url ? externalLink(r.url, r.link) : ''}</span></li>`)}</ul>
        <p class="muted small">Only things this uni officially offers are listed here.</p>`)}

      ${section('Open days', html`${od.length
        ? html`<ul class="group">${od.slice(0, 4).map((e) => html`<li class="row"><span class="row__main"><span class="row__title">${formatDate(e.date)}${e.endDate && e.endDate !== e.date ? html` to ${formatDate(e.endDate)}` : ''}</span>${e.label ? html`<span class="row__sub">${e.label}${e.format ? ` · ${e.format}` : ''}</span>` : ''}</span>${dateStatus(e.status)}</li>`)}</ul>`
        : html`<p>${u.openDays?.text || '2027 dates not announced yet.'}</p>`}
        ${externalLink(u.openDays?.url || u.links?.openDays, 'Open days on the uni’s website')}`, { infoKey: 'openDay' })}

      ${section('Costs', costsBody(u))}

      ${u.contextual ? section('Contextual offers', html`<p>${u.contextual.summary || 'Not confirmed: check the uni’s page.'}</p>
        <p><a class="link" href="#/contextual">See if you might be eligible${icon('chevronRight', { size: 14 })}</a></p>`, { infoKey: 'contextual' }) : ''}

      ${progs.length ? section('Summer schools and access programmes', html`<ul class="group">${progs.map((p) => html`<li><a class="row" href="#/summer/${p.id}"><span class="row__main"><span class="row__title">${p.name}</span><span class="row__sub">${p.summary || ''}</span></span>${icon('chevronRight', { size: 16, cls: 'row__chev' })}</a></li>`)}</ul>`) : ''}

      ${section('Links', html`<ul class="link-list">
        ${u.links?.home ? html`<li>${externalLink(u.links.home, `${u.shortName} official website`)}</li>` : ''}
        ${u.links?.economics ? html`<li>${externalLink(u.links.economics, 'Economics department')}</li>` : ''}
        ${u.links?.courses ? html`<li>${externalLink(u.links.courses, 'Undergraduate courses')}</li>` : ''}
        ${u.links?.contextual ? html`<li>${externalLink(u.links.contextual, 'Contextual admissions')}</li>` : ''}
        ${u.links?.accommodation ? html`<li>${externalLink(u.links.accommodation, 'Accommodation')}</li>` : ''}
      </ul>`)}

      <footer class="source-foot">${checked ? `Last checked ${formatDate(checked)} · ` : ''}Uni Bob checks official websites, but things change. Always check the uni’s own page before you apply.</footer>
    </div>`;
  },
};
