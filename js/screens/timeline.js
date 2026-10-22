// Timeline: from Year 12 now to starting uni in September 2028, with "You are here".

import { db } from '../data.js';
import { html } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { dateStatus, externalLink, info, expander } from '../ui/components.js';
import { youAreHereIndex, formatDate, formatMonth, parseISO } from '../logic/dates.js';

function whenText(s) {
  if (s.when) return s.when;
  if (s.date && s.endDate && s.endDate !== s.date) return `${formatDate(s.date)} to ${formatDate(s.endDate)}`;
  if (s.date) return s.precision === 'month' ? formatMonth(s.date) : formatDate(s.date);
  return '';
}

export default {
  label: 'Timeline',
  title: () => 'Timeline',
  render() {
    const all = db.timeline.steps || [];
    const now = all.filter((s) => s.now);
    const steps = all.filter((s) => !s.now).sort((a, b) => (parseISO(a.date) || 0) - (parseISO(b.date) || 0));
    const here = youAreHereIndex(steps);
    const item = (s) => html`<li class="tl__item ${s.now ? 'is-now' : parseISO(s.endDate || s.date) < new Date() ? 'is-past' : ''}">
      <span class="tl__dot" aria-hidden="true"></span>
      <div class="tl__card card">
        <p class="tl__when">${whenText(s)} ${dateStatus(s.status)}</p>
        <h3 class="tl__title">${s.title}${s.infoKey ? info(s.infoKey) : ''}</h3>
        ${s.what ? html`<p>${s.what}</p>` : ''}
        ${s.why ? html`<p class="muted">${s.why}</p>` : ''}
        ${s.link ? html`<a class="link" href="${s.link}">Open Summer Schools${icon('chevronRight', { size: 14 })}</a>` : ''}
        ${s.more || s.basedOn || s.source?.url ? expander('More', html`
          ${s.more ? html`<p>${s.more}</p>` : ''}
          ${s.status === 'Expected' && s.basedOn ? html`<p class="muted small">Expected: ${s.basedOn}</p>` : ''}
          ${s.source?.url ? html`<p class="small">${externalLink(s.source.url, s.status === 'Confirmed' ? 'Official source' : 'Source for the last date')}</p>` : ''}`) : ''}
      </div>
    </li>`;
    return html`<div class="page">
      <h1 class="large-title">Timeline</h1>
      <p class="lead">Your road from Year 12 to starting uni in September 2028.</p>
      <p class="note">${icon('info', { size: 16 })}<span><b>Confirmed</b> dates are published for your year. <b>Expected</b> dates are based on previous years, so check nearer the time.</span></p>
      <ol class="tl">
        ${steps.slice(0, here).map(item)}
        <li class="tl__here" aria-label="You are here: ${formatDate(new Date())}"><span class="tl__here-pill">${icon('pin', { size: 14 })}You are here · ${formatDate(new Date(), { short: true })}</span></li>
        ${now.map(item)}
        ${steps.slice(here).map(item)}
      </ol>
    </div>`;
  },
};
