// Favourites: saved unis and courses, grouped by uni, each course with its chance slider.

import * as store from '../store.js';
import { db, chanceFor } from '../data.js';
import { html } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { chanceSlider, chanceLabel, heart, emptyState } from '../ui/components.js';
import { distanceText } from '../logic/geo.js';
import { offerText } from './explore.js';

function groups() {
  const st = store.get();
  const savedCourses = st.favourites.courses.map((id) => db.course.get(id)).filter(Boolean);
  const uniIds = new Set([...st.favourites.unis.filter((id) => db.uni.has(id)), ...savedCourses.map((c) => c.uniId)]);
  return [...uniIds].map((id) => {
    const u = db.uni.get(id);
    const mine = savedCourses.filter((c) => c.uniId === id);
    return { u, courses: mine.length ? mine : (u.courses || []), all: !mine.length, uniSaved: st.favourites.unis.includes(id) };
  }).sort((a, b) => (a.u.rank?.overall ?? 999) - (b.u.rank?.overall ?? 999) || a.u.name.localeCompare(b.u.name));
}

function courseLine(c) {
  const r = chanceFor(c);
  return html`<li class="course-row-wrap"><a class="row course-row" href="#/course/${c.id}">
    <span class="course-row__main">
      <span class="row__title">${c.name}</span>
      <span class="row__sub">Typical offer ${offerText(c)}</span>
      <span class="course-row__chance">${chanceLabel(r)}${chanceSlider(r, { compact: true })}</span>
    </span>${icon('chevronRight', { size: 16, cls: 'row__chev' })}</a>
    ${heart('course', c.id, store.isFavourite('courses', c.id), `${c.name} at ${c.uni.shortName}`)}</li>`;
}

export default {
  label: 'Favourites',
  title: () => 'Favourites',
  render() {
    const gs = groups();
    if (!gs.length) {
      return html`<div class="page"><h1 class="large-title">Favourites</h1>
        ${emptyState('Nothing saved yet', 'Tap the heart on a uni or a course to save it here, so you can compare them side by side.',
          html`<a class="btn btn-primary" href="#/explore">${icon('search', { size: 18 })}<span>Explore courses</span></a>`)}</div>`;
    }
    const n = gs.reduce((t, g) => t + (g.all ? 0 : g.courses.length), 0);
    return html`<div class="page">
      <h1 class="large-title">Favourites</h1>
      <p class="lead muted">${gs.length} uni${gs.length === 1 ? '' : 's'}${n ? ` · ${n} saved course${n === 1 ? '' : 's'}` : ''}</p>
      ${gs.map((g) => html`<section class="fav-group">
        <header class="fav-group__head">
          <a class="fav-group__link" href="#/uni/${g.u.id}">
            <span class="fav-group__name">${g.u.name}</span>
            <span class="fav-group__sub">${g.u.city}${g.u.distance != null ? ` · ${distanceText(g.u.distance)}` : ''}</span>
          </a>
          ${heart('uni', g.u.id, g.uniSaved, g.u.name)}
        </header>
        ${g.all ? html`<p class="muted small fav-group__note">You saved this uni. Here are all its courses in Uni Bob.</p>` : ''}
        <ul class="group course-list">${g.courses.map(courseLine)}</ul>
      </section>`)}
    </div>`;
  },
  update(what) {
    return what !== 'favourites' && what !== 'profile' && what !== 'whatif' && what !== 'settings' ? true : false;
  },
};
