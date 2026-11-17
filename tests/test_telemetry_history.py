import unittest
from app.api.telemetry_history import append_history, history_sample, valid_history


class TelemetryHistoryTests(unittest.TestCase):
    def test_sample_keeps_probe_directions_separate_and_missing_as_unavailable(self):
        sample = history_sample({
            'collected_at': '2026-11-16T10:00:00Z',
            'measurements': [
                {'link': 'R1-R2', 'observations': [
                    {'router': 'r1', 'target': 'r2', 'available': True, 'packet_loss_percent': 0, 'rtt_avg_ms': 2},
                    {'router': 'r2', 'target': 'r1', 'available': True, 'packet_loss_percent': 20, 'rtt_avg_ms': 4},
                    {'router': 'r1', 'target': 'r2', 'available': False, 'packet_loss_percent': 100, 'rtt_avg_ms': None},
                ]},
                {'link': 'R2-R4', 'observations': [{'router': 'r2', 'target': 'r4', 'available': False}]},
            ],
        })
        self.assertEqual(sample, {
            'observed_at': '2026-11-16T10:00:00Z',
            'links': [
                {'link': 'R1-R2', 'source_router': 'R1', 'target_router': 'R2', 'packet_loss_percent': 0.0, 'rtt_avg_ms': 2.0, 'probes_available': 1},
                {'link': 'R1-R2', 'source_router': 'R2', 'target_router': 'R1', 'packet_loss_percent': 20.0, 'rtt_avg_ms': 4.0, 'probes_available': 1},
                {'link': 'R1-R2', 'source_router': 'R1', 'target_router': 'R2', 'packet_loss_percent': None, 'rtt_avg_ms': None, 'probes_available': 0},
                {'link': 'R2-R4', 'source_router': 'R2', 'target_router': 'R4', 'packet_loss_percent': None, 'rtt_avg_ms': None, 'probes_available': 0},
            ],
        })

    def test_append_replaces_duplicate_timestamp_and_bounds_history(self):
        history = [{'observed_at': str(index), 'links': []} for index in range(120)]
        updated = append_history(history, {'observed_at': '119', 'links': [{'link': 'R1-R2'}]})
        self.assertEqual(len(updated), 120)
        self.assertEqual(updated[-1]['links'][0]['link'], 'R1-R2')
        bounded = append_history(updated, {'observed_at': '120', 'links': []})
        self.assertEqual(len(bounded), 120)
        self.assertEqual(bounded[0]['observed_at'], '1')

    def test_history_shape_is_bounded_and_rejects_invalid_metrics(self):
        valid = [{'observed_at': '2026-11-16T10:00:00Z', 'links': [
            {'link': 'R1-R2', 'packet_loss_percent': 0, 'rtt_avg_ms': 1.5, 'probes_available': 2},
        ]}]
        self.assertTrue(valid_history(valid))
        directional = [{'observed_at': '2026-11-16T10:00:00Z', 'links': [
            {'link': 'R1-R2', 'source_router': 'R1', 'target_router': 'R2', 'packet_loss_percent': 0, 'rtt_avg_ms': 1.5, 'probes_available': 1},
        ]}]
        self.assertTrue(valid_history(directional))
        self.assertFalse(valid_history([{'observed_at': '2026-11-16T10:00:00Z', 'links': [
            {'link': 'R1-R2', 'source_router': 'R1', 'packet_loss_percent': 0, 'rtt_avg_ms': 1, 'probes_available': 1},
        ]}]))
        self.assertFalse(valid_history(valid + valid * 120))
        invalid = [{'observed_at': 'time', 'links': [
            {'link': 'R1-R2', 'packet_loss_percent': float('nan'), 'rtt_avg_ms': 1, 'probes_available': 2},
        ]}]
        self.assertFalse(valid_history(invalid))


if __name__ == '__main__':
    unittest.main()
