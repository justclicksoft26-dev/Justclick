import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, classifyDay, STATUS } from './web-attendance.js';

test('classifyDay follows the regulation', () => {
  assert.equal(classifyDay('07:30', '13:50').status, STATUS.ON_TIME);
  assert.equal(classifyDay('07:44', null).status, STATUS.ON_TIME);
  assert.equal(classifyDay('07:45', '13:45').status, STATUS.LATE_QUARTER);
  assert.equal(classifyDay('07:59', null).status, STATUS.LATE_QUARTER);
  assert.equal(classifyDay('08:00', '13:50').status, STATUS.LATE_HALF);
  assert.equal(classifyDay('10:12', null).status, STATUS.LATE_HALF);
  assert.equal(classifyDay(null, null).status, STATUS.ABSENT);
});

const L = (email, date, type, iso) => ({ email, date, type, recordedAt: new Date(iso) });

test('buildRows: absence, weekend, registration date and open day', () => {
  const emps = [
    { email: 'a@x', name: 'A', firstDate: '2026-11-08' },
    { email: 'b@x', name: 'B', firstDate: '2026-11-08' },
    { email: 'c@x', name: 'C', firstDate: '2026-11-12' },
  ];
  // Riyadh = UTC+3
  const logs = [
    L('a@x', '2026-11-09', 'check_in', '2026-11-09T04:35:00Z'), // 07:35
    L('a@x', '2026-11-09', 'check_out', '2026-11-09T10:46:00Z'), // 13:46
    L('b@x', '2026-11-09', 'check_in', '2026-11-09T04:50:00Z'), // 07:50, no check-out
    L('a@x', '2026-11-10', 'check_in', '2026-11-10T05:10:00Z'), // 08:10
    L('a@x', '2026-11-10', 'check_out', '2026-11-10T10:50:00Z'),
  ];
  const now = { date: '2026-11-12', time: '10:00', minutes: 600 };
  const rows = buildRows(emps, logs, '2026-11-08', '2026-11-14', now);
  const get = (email, date) => rows.find((r) => r.email === email && r.date === date);

  assert.equal(get('a@x', '2026-11-09').status, STATUS.ON_TIME);
  assert.equal(get('a@x', '2026-11-09').checkOut, '13:46');
  assert.equal(get('b@x', '2026-11-09').status, STATUS.LATE_QUARTER);
  assert.equal(get('b@x', '2026-11-09').note, 'لم يبصم الانصراف');
  assert.equal(get('a@x', '2026-11-10').status, STATUS.LATE_HALF);
  assert.equal(get('b@x', '2026-11-10').status, STATUS.ABSENT); // nothing at all
  assert.equal(get('a@x', '2026-11-11').status, STATUS.ABSENT);
  assert.equal(get('c@x', '2026-11-10'), undefined); // before he was registered
  assert.equal(get('a@x', '2026-11-13'), undefined); // Friday
  assert.equal(get('a@x', '2026-11-14'), undefined); // Saturday / future
  assert.equal(get('a@x', '2026-11-12'), undefined); // today, 10:00 - day still open
  const later = buildRows(emps, logs, '2026-11-12', '2026-11-12', { date: '2026-11-12', time: '14:05', minutes: 845 });
  assert.equal(later.find((r) => r.email === 'a@x').status, STATUS.ABSENT); // day closed, nothing recorded
});
