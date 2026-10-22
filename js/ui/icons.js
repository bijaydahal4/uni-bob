// Simple line icons in the spirit of SF Symbols (inline SVG, drawn for this app).

import { raw } from './dom.js';

function gear() {
  const pts = [];
  const teeth = 8, n = teeth * 4;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / n;
    const r = k % 4 < 2 ? 9.3 : 7.3;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<path d="M${pts.join('L')}Z"/><circle cx="12" cy="12" r="3"/>`;
}

const P = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 20.5 20.5"/>',
  heart: '<path d="M12 20.2 4.8 13.3a4.7 4.7 0 0 1 0-6.7 4.7 4.7 0 0 1 6.7 0l.5.5.5-.5a4.7 4.7 0 0 1 6.7 0 4.7 4.7 0 0 1 0 6.7z"/>',
  heartFill: '<path fill="currentColor" d="M12 20.2 4.8 13.3a4.7 4.7 0 0 1 0-6.7 4.7 4.7 0 0 1 6.7 0l.5.5.5-.5a4.7 4.7 0 0 1 6.7 0 4.7 4.7 0 0 1 0 6.7z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  sparkles: '<path d="M10 3.5l1.6 4.7 4.9 1.8-4.9 1.8L10 16.5l-1.6-4.7L3.5 10l4.9-1.8z"/><path d="M17.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.3c1.9.6 3 2.5 3 5.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.6"/><path d="M3.5 9.8h17M8 3v4M16 3v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/>',
  gear: gear(),
  sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="2.8"/><path d="M9.5 4.5v15M5.4 8.2h2M5.4 11h2M5.4 13.8h2"/>',
  chevronLeft: '<path d="M14.5 5 7.5 12l7 7"/>',
  chevronRight: '<path d="M9.5 5l7 7-7 7"/>',
  chevronDown: '<path d="M5.5 9.5 12 16l6.5-6.5"/>',
  chevronUp: '<path d="M5.5 14.5 12 8l6.5 6.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  sort: '<path d="M7.5 4v16M4 7.5 7.5 4 11 7.5M16.5 20V4M13 16.5l3.5 3.5 3.5-3.5"/>',
  pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  building: '<path d="M3.5 9.5 12 4.5l8.5 5H3.5z"/><path d="M6 10v7.5M10 10v7.5M14 10v7.5M18 10v7.5M3.5 19.5h17"/>',
  cap: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.6v4.1c0 1.3 2.5 2.8 5.5 2.8s5.5-1.5 5.5-2.8v-4.1M21.5 9.5v5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.2 9.6"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  dashCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12h7"/>',
  share: '<path d="M12 3.5v11M8 7l4-3.5L16 7"/><path d="M8 10.5H6.5A1.5 1.5 0 0 0 5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7a1.5 1.5 0 0 0-1.5-1.5H16"/>',
  plusSquare: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="12" rx="2.2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7M10 11v6M14 11v6"/>',
  refresh: '<path d="M4.8 12a7.2 7.2 0 1 0 2.1-5.1"/><path d="M4.5 4.5v4h4"/>',
  external: '<path d="M8.5 15.5 17 7M10 7h7v7"/><path d="M17 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8.5A1.5 1.5 0 0 1 6 7h4.5"/>',
  moon: '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  bulb: '<path d="M9.5 18h5M10.3 21h3.4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.1v.1h5v-.1c0-.8.4-1.5 1.1-2.1A6 6 0 0 0 12 3z"/>',
  pound: '<circle cx="12" cy="12" r="9"/><path d="M14.6 8.6a2.4 2.4 0 0 0-4.4 1.3V15M8.6 12.4h4M8.6 15.8h6.8"/>',
  doc: '<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M13.5 3.5V8h4.5M8.5 12h7M8.5 15.5h7"/>',
  arrowDown: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M8 12.5l4 4 4-4"/>',
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>',
  pencil: '<path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/>',
  flag: '<path d="M5.5 21V4.5M5.5 4.5h11l-2 4 2 4h-11"/>',
  door: '<path d="M6 20.5V4.5A1 1 0 0 1 7 3.5h10a1 1 0 0 1 1 1v16M4 20.5h16"/><circle cx="14.5" cy="12" r=".9" fill="currentColor" stroke="none"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="17.5" r="1" fill="currentColor" stroke="none"/>',
  star: '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15V15h-6v5.5H5.5A1.5 1.5 0 0 1 4 19z"/>',
};

/** icon('heart') → inline SVG. Pass { label } to make it readable by VoiceOver. */
export function icon(name, { size = 22, label = null, cls = '' } = {}) {
  const body = P[name] || P.info;
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
  return raw(`<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`);
}

export const ICON_NAMES = Object.keys(P);
