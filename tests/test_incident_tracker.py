import unittest

from app.diagnosis.incident_tracker import reconcile_incidents


class IncidentReconciliationTests(unittest.TestCase):
    def test_candidate_opens_updates_and_resolves_incident(self):
        candidate = {
            'candidate_link': 'R1-R2',
            'severity': 'CRITICAL',
            'affected_routers': ['R1', 'R2'],
            'observations': [{'type': 'BGP_SESSION_NOT_ESTABLISHED'}],
            'evidence': 'BGP peer is down',
            'assessment': 'Investigate the R1-R2 adjacency.',
        }

        active = reconcile_incidents([candidate], [], '2026-11-16T00:00:00+00:00')
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0]['incident_id'], 'LINK-R1-R2-001')
        self.assertEqual(active[0]['status'], 'ACTIVE')
        self.assertEqual(active[0]['first_detected_at'], '2026-11-16T00:00:00+00:00')

        updated = reconcile_incidents([candidate], active, '2026-11-16T00:01:00+00:00')
        self.assertEqual(len(updated), 1)
        self.assertEqual(updated[0]['incident_id'], active[0]['incident_id'])
        self.assertEqual(updated[0]['last_observed_at'], '2026-11-16T00:01:00+00:00')

        resolved = reconcile_incidents([], updated, '2026-11-16T00:02:00+00:00')
        self.assertEqual(resolved[0]['status'], 'RESOLVED')
        self.assertEqual(resolved[0]['resolved_at'], '2026-11-16T00:02:00+00:00')

    def test_incomplete_snapshot_preserves_active_incident(self):
        incident = {
            'incident_id': 'LINK-R1-R2-001',
            'candidate_link': 'R1-R2',
            'status': 'ACTIVE',
            'last_observed_at': '2026-11-16T00:00:00+00:00',
        }

        result = reconcile_incidents(
            [], [incident], '2026-11-16T00:01:00+00:00', telemetry_complete=False,
        )

        self.assertEqual(result[0]['status'], 'ACTIVE')
        self.assertEqual(result[0]['last_observed_at'], incident['last_observed_at'])
        self.assertIsNot(result[0], incident)


if __name__ == '__main__':
    unittest.main()
