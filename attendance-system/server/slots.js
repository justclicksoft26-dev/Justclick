export const TIMEZONE = process.env.TIMEZONE || 'Asia/Riyadh';

export const SLOTS = [
  { id: '08-10', label: '8:00 - 10:00', start: 8, end: 10 },
  { id: '10-12', label: '10:00 - 12:00', start: 10, end: 12 },
  { id: '12-14', label: '12:00 - 2:00', start: 12, end: 14 },
  { id: '14-16', label: '2:00 - 4:00', start: 14, end: 16 },
];

export function now() {
  return process.env.FAKE_NOW ? new Date(process.env.FAKE_NOW) : new Date();
}

export function localParts(d = now()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, hour, minute: Number(p.minute) };
}

export function currentSlot() {
  const { hour } = localParts();
  return SLOTS.find((s) => hour >= s.start && hour < s.end) || null;
}
