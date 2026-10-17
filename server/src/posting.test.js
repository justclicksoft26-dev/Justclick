import test from 'node:test';
import assert from 'node:assert/strict';
import { uncovered } from './posting.js';

const R = (from, to) => ({ from, to });

test('uncovered: a fully covered range has no gaps', () => {
  assert.deepEqual(uncovered('2026-10-01', '2026-10-10', [R('2026-01-01', '2099-12-31')]), []);
  assert.deepEqual(uncovered('2026-10-01', '2026-10-10', [R('2026-09-01', '2026-10-05'), R('2026-10-06', '2026-10-31')]), []);
});

test('uncovered: no rows at all means the whole range is a gap', () => {
  assert.deepEqual(uncovered('2026-10-01', '2026-10-10', []), [R('2026-10-01', '2026-10-10')]);
});

test('uncovered: gaps at the start, in the middle and at the end', () => {
  const rows = [R('2026-10-03', '2026-10-04'), R('2026-10-07', '2026-10-08')];
  assert.deepEqual(uncovered('2026-10-01', '2026-10-10', rows), [R('2026-10-01', '2026-10-02'), R('2026-10-05', '2026-10-06'), R('2026-10-09', '2026-10-10')]);
});

test('uncovered: rows outside the range, overlapping rows and unsorted rows are handled', () => {
  const rows = [R('2026-10-06', '2026-10-09'), R('2026-08-01', '2026-09-01'), R('2026-10-03', '2026-10-07'), R('2027-01-01', '2027-02-01')];
  assert.deepEqual(uncovered('2026-10-01', '2026-10-12', rows), [R('2026-10-01', '2026-10-02'), R('2026-10-10', '2026-10-12')]);
});

test('uncovered: a day-long range and the boundaries are exact', () => {
  assert.deepEqual(uncovered('2026-10-17', '2026-10-17', [R('2025-01-01', '2026-10-16')]), [R('2026-10-17', '2026-10-17')]);
  assert.deepEqual(uncovered('2026-10-16', '2026-10-17', [R('2025-01-01', '2026-10-16')]), [R('2026-10-17', '2026-10-17')]);
});
