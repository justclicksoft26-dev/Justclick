export const TIMEZONE = process.env.TIMEZONE || 'Asia/Riyadh';

const m = (h, min = 0) => h * 60 + min;

// Times are local (TIMEZONE), as [start, end) in minutes since midnight.
// Working window: 07:30 - 14:00. Outside it both buttons are closed.
// Check-in  : open 07:30 - 13:00
// Check-out : open 13:45 - 14:00 (closed 07:30 - 13:00 and 13:00 - 13:45)
export const DAY_START = m(7, 30);
export const DAY_END = m(14);
export const CHECK_IN_CLOSED = [[m(0), m(7, 30)], [m(13), m(24)]];
export const CHECK_OUT_CLOSED = [[m(0), m(13, 45)], [m(14), m(24)]];

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
  const minute = Number(p.minute);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour,
    minute,
    minutes: hour * 60 + minute,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

const inRanges = (min, ranges) => ranges.some(([a, b]) => min >= a && min < b);

export function windows(minutes = localParts().minutes) {
  return {
    checkIn: !inRanges(minutes, CHECK_IN_CLOSED),
    checkOut: !inRanges(minutes, CHECK_OUT_CLOSED),
  };
}
