"""Bounded, compact link-metric history for the Live Monitoring trends."""
from datetime import datetime
import math
import numbers

MAX_HISTORY_SAMPLES = 120


def history_sample(snapshot):
    """Reduce a snapshot to compact, direction-specific probe metrics."""
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
        for probe in item.get('observations', []):
            if not isinstance(probe, dict) or not isinstance(probe.get('router'), str) or not isinstance(probe.get('target'), str):
                continue
            available = probe.get('available') is True
            def measured(field):
                value = probe.get(field) if available else None
                if isinstance(value, numbers.Real) and not isinstance(value, bool) and math.isfinite(value) and value >= 0:
                    return round(float(value), 3)
                return None
            links.append({'link': item['link'], 'source_router': probe['router'].upper(),
                          'target_router': probe['target'].upper(),
                          'packet_loss_percent': measured('packet_loss_percent'),
                          'rtt_avg_ms': measured('rtt_avg_ms'), 'probes_available': int(available)})
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
            source, target = link.get('source_router'), link.get('target_router')
            if (source is None) != (target is None) or source is not None and (not isinstance(source, str) or not source or len(source) > 16) or target is not None and (not isinstance(target, str) or not target or len(target) > 16):
                return False
            for key in ('packet_loss_percent', 'rtt_avg_ms'):
                value = link.get(key)
                if value is not None and (isinstance(value, bool) or not isinstance(value, numbers.Real) or not math.isfinite(value) or value < 0):
                    return False
            if link.get('packet_loss_percent') is not None and link['packet_loss_percent'] > 100:
                return False
    return True
