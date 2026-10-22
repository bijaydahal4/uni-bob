// The iPad-Settings-style sidebar: app name, her grades, and the sections.

import { html, attr } from './dom.js';
import { icon } from './icons.js';
import { gradeSelect, info } from './components.js';
import { subjectLabel } from '../logic/grades.js';

export const SECTIONS = [
  { id: 'explore', label: 'Explore', icon: 'search', tone: 'navy' },
  { id: 'favourites', label: 'Favourites', icon: 'heart', tone: 'pink' },
  { id: 'summer', label: 'Summer Schools', icon: 'sun', tone: 'navy' },
  { id: 'whatif', label: 'What ifs', icon: 'sparkles', tone: 'pink' },
  { id: 'contextual', label: 'Contextual Offers', icon: 'people', tone: 'navy' },
  { id: 'timeline', label: 'Timeline', icon: 'calendar', tone: 'pink' },
  { id: 'settings', label: 'Settings', icon: 'gear', tone: 'grey' },
];

// Which sidebar row is highlighted for each route.
const PARENT = { uni: 'explore', course: 'explore' };

export function subjectRow(s, { scope = 'profile', removable = false } = {}) {
  const label = subjectLabel(s.name);
  return html`<li class="row grade-row">
    <span class="row__main"><span class="row__title">${label}</span>${s.board ? html`<span class="row__sub">${s.board}</span>` : ''}</span>
    ${removable ? html`<button type="button" class="icon-btn icon-btn--sm" data-action="remove-subject" data-scope="${scope}" data-id="${s.id}" aria-label="Remove ${label}">${icon('minus', { size: 18 })}</button>` : ''}
    ${gradeSelect({ value: s.grade, label: `${label} grade`, data: { action: 'set-grade', scope, id: s.id, fkey: `${scope}-grade-${s.id}` } })}
  </li>`;
}

export function renderSidebar(state, routeName, dataMeta) {
  const active = PARENT[routeName] || routeName;
  const subs = state.profile.subjects;
  const w = state.whatIf;
  return html`<div class="sidebar__inner">
    <header class="sidebar__head">
      <div class="brand"><span class="brand__mark" aria-hidden="true">${icon('cap', { size: 20 })}</span><span class="brand__name">Uni Bob</span></div>
      ${state.profile.name ? html`<p class="sidebar__name">${state.profile.name}</p>` : ''}
      <button type="button" class="icon-btn sidebar__close" data-action="close-sidebar" aria-label="Close sidebar">${icon('sidebar', { size: 22 })}</button>
    </header>

    <section class="sidebar__grades" aria-labelledby="my-grades-h">
      <h2 class="group-title" id="my-grades-h">My grades ${info('predicted', 'predicted grades')}</h2>
      <ul class="group">
        ${subs.map((s, i) => subjectRow(s, { scope: 'profile', removable: i >= 3 }))}
        ${subs.length < 4 ? html`<li class="row"><button type="button" class="row__button" data-action="add-subject" data-scope="profile">
          <span class="row__icon-plain">${icon('plus', { size: 20 })}</span><span>Add a subject</span></button></li>` : ''}
      </ul>
      ${w.active ? html`<p class="sidebar__note">${icon('sparkles', { size: 14 })} A What-if is on. These are your real grades.</p>` : ''}
    </section>

    <nav class="sidebar__nav" aria-label="Sections">
      <ul class="group">
        ${SECTIONS.map((s) => html`<li><a class="row nav-row ${active === s.id ? 'is-active' : ''}" href="#/${s.id}"${attr('aria-current', active === s.id ? 'page' : null)} data-nav="${s.id}">
          <span class="tile tile--${s.tone}" aria-hidden="true">${icon(s.icon, { size: 18 })}</span>
          <span class="row__title">${s.label}</span>
          ${icon('chevronRight', { size: 16, cls: 'row__chev' })}
        </a></li>`)}
      </ul>
    </nav>
    ${dataMeta?.lastChecked ? html`<p class="sidebar__foot">Uni info checked ${dataMeta.lastCheckedText || dataMeta.lastChecked}</p>` : ''}
  </div>`;
}
