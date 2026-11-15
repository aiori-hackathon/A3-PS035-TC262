"""Bounded, compact link-metric history for the Live Monitoring trends."""
from datetime import datetime
import math
import numbers

MAX_HISTORY_SAMPLES = 120


def history_sample(snapshot):
    """Reduce one sanitized telemetry snapshot to chart-safe per-link metrics."""
    observed_at = snapshot.get('collected_at')
    if not isinstance(observed_at, str):
        return None
    try:
        parsed = datetime.fromisoformat(observed_at.replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None

    links = []
    for item in snapshot.get('measurements', []):
        if not isinstance(item, dict) or not isinstance(item.get('link'), str):
            continue
        observations = [probe for probe in item.get('observations', [])
                        if isinstance(probe, dict) and probe.get('available') is True]
        def average(field):
            values = [probe.get(field) for probe in observations]
            values = [float(value) for value in values
                      if isinstance(value, numbers.Real) and not isinstance(value, bool)
                      and math.isfinite(value) and value >= 0]
            return round(sum(values) / len(values), 3) if values else None
        links.append({'link': item['link'], 'packet_loss_percent': average('packet_loss_percent'),
                      'rtt_avg_ms': average('rtt_avg_ms'), 'probes_available': len(observations)})
    return {'observed_at': observed_at, 'links': links}


def append_history(history, sample, limit=MAX_HISTORY_SAMPLES):
    """Append a sample once, preserving chronological order and a fixed bound."""
    if not isinstance(history, list) or not isinstance(sample, dict):
        raise ValueError('Invalid telemetry history')
    existing = [item for item in history if isinstance(item, dict)]
    if existing and existing[-1].get('observed_at') == sample.get('observed_at'):
        existing[-1] = sample
    else:
        existing.append(sample)
    return existing[-limit:]


def valid_history(history, limit=MAX_HISTORY_SAMPLES):
    if not isinstance(history, list) or len(history) > limit:
        return False
    for sample in history:
        if not isinstance(sample, dict) or not isinstance(sample.get('observed_at'), str) or not isinstance(sample.get('links'), list) or len(sample['links']) > 1000:
            return False
        try:
            parsed = datetime.fromisoformat(sample['observed_at'].replace('Z', '+00:00'))
        except ValueError:
            return False
        if parsed.tzinfo is None:
            return False
        for link in sample['links']:
            if not isinstance(link, dict) or not isinstance(link.get('link'), str) or not isinstance(link.get('probes_available'), int) or isinstance(link.get('probes_available'), bool) or link['probes_available'] < 0:
                return False
            for key in ('packet_loss_percent', 'rtt_avg_ms'):
                value = link.get(key)
                if value is not None and (isinstance(value, bool) or not isinstance(value, numbers.Real) or not math.isfinite(value) or value < 0):
                    return False
            if link.get('packet_loss_percent') is not None and link['packet_loss_percent'] > 100:
                return False
    return True
