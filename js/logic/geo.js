// Straight-line distance and friendly wording.

const R_MILES = 3958.8;
const rad = (d) => (d * Math.PI) / 180;

export function milesBetween(a, b) {
  if (!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number') return null;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(h));
}

/** 7 → "under 10", 47 → 45, 123 → 120, 384 → 380. */
export function roundMiles(m) {
  if (m == null) return null;
  if (m < 10) return Math.max(1, Math.round(m));
  if (m < 100) return Math.round(m / 5) * 5;
  return Math.round(m / 10) * 10;
}

export function distanceText(m, home = 'Bournemouth') {
  if (m == null) return '';
  if (m < 3) return `In ${home}`;
  return `About ${roundMiles(m)} miles from ${home}`;
}
