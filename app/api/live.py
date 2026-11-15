"""A read-only view of operator-collected snapshots; never invokes Docker."""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
from flask import Blueprint, jsonify
from app.topology import load_topology
from app.diagnosis.incident_tracker import select_incident_records

live = Blueprint('live', __name__)


def read_json(path):
    if path.stat().st_size > 2_000_000:
        raise ValueError('Snapshot is too large')
    return json.loads(path.read_text(encoding='utf-8'))


def snapshot_age(value, now):
    try:
        observed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if observed.tzinfo is None:
            return None
        age = (now - observed).total_seconds()
        return age if age >= 0 else None
    except (ValueError, TypeError, AttributeError):
        return None


def build_live_response(snapshot, diagnosis, incidents, now=None):
    now = now or datetime.now(timezone.utc)
    age = snapshot_age(snapshot.get('collected_at'), now)
    findings = diagnosis['findings']
    candidates = diagnosis['candidate_root_causes']
    routers = []
    for router in snapshot['routers']:
        name = router['router'].upper()
        complete = router.get('healthy_collection') is True and router.get('bgp', {}).get('success') is True
        related = [item for item in findings if item.get('router', '').upper() == name]
        routers.append({'id': name, 'collected_at': router.get('collected_at'),
                        'collection_ok': complete,
                        'status': 'unknown' if not complete else 'attention' if related else 'no_findings',
                        'findings_count': len(related)})
    configured = snapshot.get('topology') or load_topology()
    measurement_by_link = {item.get('link'): item for item in diagnosis.get('measurements', [])}
    topology = []
    for item in configured['links']:
        name = item['id']
        probes = measurement_by_link.get(name, {}).get('observations', [])
        if not probes or not any(probe.get('available') for probe in probes):
            physical = 'not_measured'
        elif any(probe.get('packet_loss_percent') == 100 for probe in probes):
            physical = 'probe_unreachable'
        elif any((probe.get('packet_loss_percent') or 0) > 0 for probe in probes):
            physical = 'probe_packet_loss'
        else:
            physical = 'probe_reachable'
        topology.append({'id': name, 'a': item['a'].upper(), 'b': item['b'].upper(), 'subnet': item['subnet'],
                         'physical_status': physical,
                         'status': 'suspected' if any(c['candidate_link'] == name for c in candidates) else 'observed_healthy' if physical == 'probe_reachable' else 'unknown'})
    # No collector stdout, shell commands, configuration files or fault-control state.
    incident_fields = ('incident_id', 'candidate_link', 'status', 'severity', 'first_detected_at', 'last_observed_at', 'resolved_at', 'assessment')
    return {'schema_version': 1, 'source': 'live', 'provenance': 'backend_recorded_snapshot',
            'served_at': now.isoformat(), 'observed_at': snapshot.get('collected_at'),
            'age_seconds': age, 'stale_after_seconds': 180,
            'freshness': 'unknown' if age is None else 'stale' if age > 180 else 'recent',
            'routers': routers, 'topology': {'links': topology}, 'diagnosis': diagnosis,
            'evidence': [{'id': f'finding-{index+1}', **item} for index, item in enumerate(findings)],
            'measurements': diagnosis.get('measurements', []), 'syslog_events': diagnosis.get('syslog_events', []),
            'incidents': [{key: item.get(key) for key in incident_fields}
                          for item in select_incident_records(incidents, limit=50)],
            'incidents_total': len(incidents), 'incidents_scope': 'last_50_stored_records',
            'limitations': 'Read-only stored telemetry. No collection is triggered. No physical link health is inferred from BGP. Impact is a topology-based estimate.'}


@live.get('/api/live/snapshot')
def snapshot():
    if os.environ.get('NETSCOPE_TELEMETRY_STORAGE') == 'firestore':
        try:
            from app.api.telemetry_store import load_live_state
            from app.api.main import build_diagnosis
            data, incidents = load_live_state()
            if data is None:
                return jsonify(error='No telemetry has been collected.'), 404
            result = build_live_response(data, build_diagnosis(data), incidents)
            return jsonify(result)
        except Exception:
            return jsonify(error='Telemetry storage unavailable.'), 503
    directory = os.environ.get('NETSCOPE_TELEMETRY_DIR')
    if not directory:
        return jsonify(error='Live telemetry storage is not configured.'), 503
    try:
        paths = sorted(Path(directory).glob('telemetry_*.json'))
        if not paths:
            return jsonify(error='No telemetry has been collected.'), 404
        data = read_json(paths[-1])
        routers = data.get('routers') if isinstance(data, dict) else None
        if not isinstance(routers, list) or not routers or len(routers) > 100:
            raise ValueError('Invalid routers')
        for router in routers:
            if not isinstance(router, dict) or not isinstance(router.get('router'), str) or not isinstance(router.get('bgp'), dict):
                raise ValueError('Invalid router')
        from app.api.main import build_diagnosis
        diagnosis = build_diagnosis(data)
        incident_path = Path(directory) / 'incident_history.json'
        incidents = read_json(incident_path) if incident_path.exists() else []
        if not isinstance(incidents, list) or not all(isinstance(item, dict) for item in incidents):
            raise ValueError('Invalid incident history')
        return jsonify(build_live_response(data, diagnosis, incidents))
    except (OSError, ValueError, TypeError, AttributeError, KeyError):
        return jsonify(error='Stored telemetry could not be read safely.'), 503
