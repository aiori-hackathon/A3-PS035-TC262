"""Server-only latest snapshot storage for stateless hosting."""
import json
import math
import numbers
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request

telemetry_ingest = Blueprint('telemetry_ingest', __name__)
MAX_BYTES = 500_000


def document():
    from firebase_admin import firestore
    from app.api.security import firebase_app
    return firestore.client(app=firebase_app()).collection('_netscope_private').document('latest')


def validate_snapshot(data):
    if not isinstance(data, dict):
        raise ValueError('Invalid snapshot')
    observed = datetime.fromisoformat(data['collected_at'].replace('Z', '+00:00'))
    if observed.tzinfo is None or not -60 <= (datetime.now(timezone.utc) - observed).total_seconds() <= 300:
        raise ValueError('Snapshot timestamp is not recent')
    routers = data['routers']
    if not isinstance(routers, list) or len(routers) != 5 or {r['router'] for r in routers} != {'r1','r2','r3','r4','r5'}:
        raise ValueError('Expected five lab routers')
    clean = []
    for router in routers:
        bgp = router['bgp']
        if not isinstance(bgp['success'], bool) or not isinstance(bgp['output'], str) or len(bgp['output']) > 50_000 or not isinstance(router['healthy_collection'], bool):
            raise ValueError('Invalid router data')
        # Older collector snapshots may omit newer signals; represent these as
        # unavailable rather than treating the upload as malformed or healthy.
        interface_state=router.get('interface_state', {'success':False,'output':''})
        if not isinstance(interface_state,dict) or not isinstance(interface_state.get('success'),bool) or not isinstance(interface_state.get('output',''),str):
            raise ValueError('Invalid interface state')
        clean.append({'router': router['router'], 'collected_at': data['collected_at'],
                      'healthy_collection': router['healthy_collection'],
                      'bgp': {'success': bgp['success'], 'output': bgp['output']},
                      'interface_state': {'success':interface_state['success'],'output':interface_state.get('output','')[:20000]}})
    from app.topology import load_topology
    configured_topology=load_topology()
    topology=data.get('topology', configured_topology)
    if topology != configured_topology:
        raise ValueError('Unexpected topology definition')
    measurements=data.get('measurements', [])
    topology_links={item['id']:item for item in topology['links']}
    if not isinstance(measurements,list) or len(measurements)>1000:
        raise ValueError('Invalid measurements')
    safe_measurements=[]
    for link in measurements:
        if not isinstance(link,dict) or link.get('link') not in topology_links or not isinstance(link.get('observations'),list) or len(link['observations'])>2:
            raise ValueError('Invalid measurement record')
        observations=[]
        configured_link=topology_links[link['link']]
        for probe in link['observations']:
            if not isinstance(probe,dict) or not isinstance(probe.get('available'),bool):
                raise ValueError('Invalid probe record')
            sources={(configured_link[side],configured_link[peer+'_endpoint']['address']) for side,peer in (('a','b'),('b','a'))}
            if (probe.get('router'),probe.get('target_address')) not in sources or probe.get('target') not in {configured_link['a'],configured_link['b']}:
                raise ValueError('Probe does not match configured link endpoints')
            expected_target=configured_link['b'] if probe['router']==configured_link['a'] else configured_link['a']
            if probe['target'] != expected_target:
                raise ValueError('Probe target does not match its source router')
            for key in ('packets_sent','packets_received','packet_loss_percent','rtt_min_ms','rtt_avg_ms','rtt_max_ms'):
                value=probe.get(key)
                if value is not None and (isinstance(value,bool) or not isinstance(value,numbers.Real) or not math.isfinite(value) or value < 0):
                    raise ValueError('Invalid probe measurement value')
            sent,received=probe.get('packets_sent'),probe.get('packets_received')
            if sent is not None and received is not None and (received > sent or sent > 10):
                raise ValueError('Invalid packet counts')
            if probe.get('packet_loss_percent') is not None and probe['packet_loss_percent'] > 100:
                raise ValueError('Invalid packet loss value')
            observations.append({key:probe.get(key) for key in ('router','target','target_address','available','packets_sent','packets_received','packet_loss_percent','rtt_min_ms','rtt_avg_ms','rtt_max_ms')})
        safe_measurements.append({'link':link['link'],'observations':observations})
    events=data.get('syslog_events',[])
    if not isinstance(events,list) or len(events)>500:
        raise ValueError('Invalid log events')
    safe_events=[]
    for event in events:
        if not isinstance(event,dict) or event.get('router') not in {'R1','R2','R3','R4','R5'} or event.get('event_type') not in {'BGP_NEIGHBOR_STATE','INTERFACE_STATE'}:
            raise ValueError('Invalid summarized log event')
        router_id=event['router'].lower()
        valid_peers={endpoint['address'] for item in topology['links'] for side,peer in (('a','b'),('b','a')) if item[side]==router_id for endpoint in (item[peer+'_endpoint'],)}
        valid_interfaces={item[side+'_endpoint']['interface'] for item in topology['links'] for side in ('a','b') if item[side]==router_id}
        peer=str(event.get('peer') or '')
        interface=str(event.get('interface') or '')
        if event['event_type']=='BGP_NEIGHBOR_STATE' and peer not in valid_peers or event['event_type']=='INTERFACE_STATE' and interface not in valid_interfaces:
            raise ValueError('Log event does not match configured topology')
        state=str(event.get('state') or '').upper()
        if event['event_type']=='BGP_NEIGHBOR_STATE' and state not in {'DOWN','IDLE','ACTIVE'}:
            raise ValueError('Invalid BGP log state')
        if event['event_type']=='INTERFACE_STATE' and state:
            raise ValueError('Invalid interface log state')
        safe_events.append({key:str(event.get(key) or '')[:500] for key in ('router','event_type','peer','interface','state','message')})
    return {'collected_at': data['collected_at'], 'topology':topology, 'routers': clean,
            'measurements':safe_measurements, 'syslog_events':safe_events}


def load_live_state():
    record = document().get(timeout=8)
    if not record.exists:
        return None, []
    stored = record.to_dict()
    snapshot = json.loads(stored['snapshot'].decode('utf-8'))
    incidents = json.loads(stored.get('incident_history', b'[]').decode('utf-8'))
    if not isinstance(incidents, list) or not all(isinstance(item, dict) for item in incidents):
        raise ValueError('Invalid incident history')
    return snapshot, incidents


def load_snapshot():
    snapshot, _ = load_live_state()
    return snapshot


def load_incidents():
    _, incidents = load_live_state()
    return incidents


@telemetry_ingest.post('/api/telemetry/ingest')
def ingest():
    try:
        raw = request.stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            return jsonify(error='Snapshot too large.'), 413
        clean = validate_snapshot(json.loads(raw))
        from app.api.main import build_diagnosis, telemetry_collection_complete
        from app.diagnosis.incident_tracker import reconcile_incidents

        latest = document()
        record = latest.get(timeout=8)
        stored = record.to_dict() if record.exists else {}
        previous = json.loads(stored.get('incident_history', b'[]').decode('utf-8'))
        if not isinstance(previous, list) or not all(isinstance(item, dict) for item in previous):
            raise ValueError('Invalid incident history')
        diagnosis = build_diagnosis(clean)
        incidents = reconcile_incidents(
            diagnosis['candidate_root_causes'], previous,
            observed_at=clean['collected_at'],
            telemetry_complete=telemetry_collection_complete(clean),
        )
        # Keep active incidents and the most recent resolved records bounded.
        active = [item for item in incidents if item.get('status') == 'ACTIVE']
        resolved = [item for item in incidents if item.get('status') != 'ACTIVE']
        resolved_limit = max(0, 200 - len(active))
        incidents = active + (resolved[-resolved_limit:] if resolved_limit else [])
        # The snapshot and its incident lifecycle are committed together so Live
        # never serves an incident state from a different upload.
        latest.set({
            'snapshot': json.dumps(clean).encode('utf-8'),
            'incident_history': json.dumps(incidents).encode('utf-8'),
        }, timeout=8)
        return jsonify(status='stored'), 201
    except (ValueError, TypeError, KeyError, AttributeError):
        return jsonify(error='Invalid telemetry snapshot.'), 400
    except Exception:
        return jsonify(error='Telemetry storage unavailable.'), 503
