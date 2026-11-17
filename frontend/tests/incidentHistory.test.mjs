import test from 'node:test';
import assert from 'node:assert/strict';
import { filterIncidents, incidentSpan } from '../src/utils/incidentHistory.js';

const incidents = [
  { incident_id: 'active-1', status: 'ACTIVE' },
  { incident_id: 'resolved-1', status: 'RESOLVED' },
  { incident_id: 'legacy-1', status: null },
];

test('incident filters retain all, active, or resolved records explicitly', () => {
  assert.deepEqual(filterIncidents(incidents).map(item => item.incident_id), ['active-1', 'resolved-1', 'legacy-1']);
  assert.deepEqual(filterIncidents(incidents, 'active').map(item => item.incident_id), ['active-1']);
  assert.deepEqual(filterIncidents(incidents, 'resolved').map(item => item.incident_id), ['resolved-1']);
  assert.deepEqual(filterIncidents(null, 'active'), []);
});

test('incident span uses the resolution time for closed incidents', () => {
  assert.equal(incidentSpan({
    first_detected_at: '2026-11-16T10:00:00Z',
    last_observed_at: '2026-11-16T10:08:00Z',
    resolved_at: '2026-11-16T10:12:00Z',
  }), '12 min');
});

test('active incident span ends at its last observed time', () => {
  assert.equal(incidentSpan({
    first_detected_at: '2026-11-16T10:00:00Z',
    last_observed_at: '2026-11-16T11:30:00Z',
    resolved_at: null,
  }), '1 hr 30 min');
});

test('missing, invalid, or reversed incident timestamps remain unavailable', () => {
  assert.equal(incidentSpan({ first_detected_at: 'bad', last_observed_at: '2026-11-16T10:00:00Z' }), null);
  assert.equal(incidentSpan({ first_detected_at: '2026-11-16T10:00:00Z', last_observed_at: '2026-11-16T09:00:00Z' }), null);
});
