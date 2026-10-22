// Hand-written greetings for the loading screen. {name} is replaced with her name.

const MORNING = [
  'Morning, {name}! Let’s find your uni.',
  'Good morning, {name}. Fresh day, fresh ideas.',
  'Rise and shine, {name}. Bob’s got the coffee on.',
  'Morning, {name}! Ready to explore?',
];
const AFTERNOON = [
  'Good afternoon, {name}!',
  'Afternoon, {name}. Let’s pick up where you left off.',
  'Hey {name}, perfect time for a bit of uni hunting.',
  'Afternoon, {name}! What shall we look at today?',
];
const EVENING = [
  'Good evening, {name}.',
  'Evening, {name}. A calm moment to explore.',
  'Hi {name}, winding down with some uni ideas?',
  'Evening, {name}! Bob saved your spot.',
];
const LATE = [
  'Burning the midnight oil, {name}? Don’t stay up too late.',
  'Hi {name}. Quick look, then sleep!',
];
const ANY = [
  'Hey {name}, Bob here.',
  'Hi {name}! Bob’s been keeping your list warm.',
  'Welcome back, {name}.',
  'Hello again, {name}!',
  'Nice to see you, {name}.',
  'Hey {name}, let’s find somewhere you’ll love.',
  'Hi {name}. One step closer to your uni.',
  '{name}! Bob was hoping you’d drop by.',
  'Hey {name}, ready when you are.',
  'Hi {name}, let’s do a little exploring.',
  'Welcome back, {name}. Your favourites are right where you left them.',
  'Hey {name}, small steps add up.',
  'Hello {name}! Big decisions, one tap at a time.',
  'Hi {name}, Bob’s here to help.',
  'Hey {name}, good to have you back.',
  'Hi {name}! Let’s see what’s new.',
];

export const GREETING_COUNT = MORNING.length + AFTERNOON.length + EVENING.length + LATE.length + ANY.length;

function pool(hour) {
  if (hour >= 5 && hour < 12) return [...MORNING, ...ANY];
  if (hour >= 12 && hour < 18) return [...AFTERNOON, ...ANY];
  if (hour >= 18 && hour < 23) return [...EVENING, ...ANY];
  return [...LATE, ...ANY];
}

/** Pick a greeting that isn't the same as last time. Returns { text, key }. */
export function pickGreeting(name, lastKey, date = new Date(), rand = Math.random) {
  const list = pool(date.getHours());
  let choices = list.filter((g) => g !== lastKey);
  if (!choices.length) choices = list;
  const g = choices[Math.floor(rand() * choices.length)];
  const who = (name || '').trim() || 'there';
  return { text: g.replace(/\{name\}/g, who), key: g };
}
