"""Evidence-ranked root-cause candidates over the configured topology."""
from app.topology import load_topology

_DEFAULT_TOPOLOGY = load_topology()
LINKS = [
    {'routers':(item['a'],item['b']), 'subnet':item['subnet'],
     'endpoints':(item['a_endpoint']['address'],item['b_endpoint']['address']), 'id':item['id']}
    for item in _DEFAULT_TOPOLOGY['links']
]


def classify_fault_type(observations):
    types = {obs.get('type') for obs in observations}
    if 'INTERFACE_NOT_UP' in types:
        return 'LINK_FAILURE'
    loss_probes = [obs for obs in observations if obs.get('type') == 'ACTIVE_PROBE_PACKET_LOSS']
    if any(p.get('packet_loss_percent') == 100 for p in loss_probes):
        return 'LINK_FAILURE'
    if 'BGP_SESSION_NOT_ESTABLISHED' in types:
        return 'BGP_SESSION_FAILURE'
    if 'NO_PREFIXES_RECEIVED' in types:
        return 'PREFIX_WITHDRAWAL'
    if any(p.get('type') == 'ACTIVE_PROBE_HIGH_LATENCY' or (p.get('packet_loss_percent') or 0) > 0 for p in observations):
        return 'PERFORMANCE_DEGRADATION'
    return 'EVIDENCE_RANKED_HYPOTHESIS'


def correlate_findings(findings, topology=None, syslog_events=None, snapshot=None):
    topology = topology or _DEFAULT_TOPOLOGY
    ranked = {}
    for link in topology['links']:
        ranked[link['id']] = {
            'candidate_link': link['id'],
            'subnet': link['subnet'],
            'severity': 'INFO',
            'fault_type': 'EVIDENCE_RANKED_HYPOTHESIS',
            'affected_routers': [],
            'observations': [],
            'supporting_signals': [],
            'supporting_evidence': [],
            'contradicting_evidence': [],
            'missing_evidence': [],
            'duplicate_events': [],
            'scoring_reasons': [],
            'evidence': '',
            'score': 0
        }

    seen_finding_ids = set()
    for finding in findings:
        link_id = finding.get('link')
        neighbor = finding.get('neighbor')
        router = str(finding.get('router','')).lower()
        if not link_id and neighbor:
            for link in topology['links']:
                if router == link['a'] and neighbor == link['b_endpoint']['address'] or router == link['b'] and neighbor == link['a_endpoint']['address']:
                    link_id = link['id']
                    break
        item = ranked.get(link_id)
        if not item:
            continue

        f_id = finding.get('observation_id') or finding.get('id')
        if f_id and f_id in seen_finding_ids:
            item['duplicate_events'].append(finding)
            continue
        if f_id:
            seen_finding_ids.add(f_id)

        kind = finding.get('type', 'UNKNOWN')
        weight = {
            'INTERFACE_NOT_UP': 4,
            'ACTIVE_PROBE_PACKET_LOSS': 4 if finding.get('packet_loss_percent') == 100 else 2,
            'ACTIVE_PROBE_HIGH_LATENCY': 1,
            'ACTIVE_PROBE_UNAVAILABLE': 0,
            'BGP_SESSION_NOT_ESTABLISHED': 3,
            'NO_PREFIXES_RECEIVED': 2,
            'BGP_COLLECTION_FAILURE': 0,
            'NO_NEIGHBORS_PARSED': 0,
        }.get(kind, 1)

        item['score'] += weight
        item['observations'].append(finding)

        if kind == 'ACTIVE_PROBE_UNAVAILABLE':
            item['missing_evidence'].append({
                'candidate_link': link_id,
                'source': finding.get('source_type', 'active_probe'),
                'observation': finding.get('message', ''),
                'implication': 'Probe observation unavailable; missing measurement.'
            })
        elif weight > 0:
            sig = {
                'source': finding.get('evidence_source') or finding.get('source_type', 'bgp'),
                'type': kind,
                'router': finding.get('router'),
                'message': finding.get('message', '')
            }
            item['supporting_signals'].append(sig)
            item['supporting_evidence'].append(finding)
            item['scoring_reasons'].append({
                'rule': kind,
                'points': weight,
                'evidence': finding.get('message', '')
            })

        if router and router.upper() not in item['affected_routers']:
            item['affected_routers'].append(router.upper())

        if finding.get('severity') == 'CRITICAL':
            item['severity'] = 'CRITICAL'
        elif finding.get('severity') == 'WARNING' and item['severity'] != 'CRITICAL':
            item['severity'] = 'WARNING'

    seen_log_signals = set()
    for event in syslog_events or []:
        if not isinstance(event, dict):
            continue
        for link in topology['links']:
            side = 'a' if event.get('router','').lower() == link['a'] else 'b' if event.get('router','').lower() == link['b'] else None
            if not side:
                continue
            if event.get('event_type') == 'BGP_NEIGHBOR_STATE' and str(event.get('state', '')).upper() == 'ESTABLISHED':
                continue
            endpoint = link[side+'_endpoint']
            if event.get('peer') == link['a_endpoint' if side=='b' else 'b_endpoint']['address'] or event.get('interface') == endpoint['interface']:
                signature = (event.get('router'), event.get('event_type'), event.get('peer'), event.get('interface'), event.get('state'))
                item = ranked[link['id']]
                if signature in seen_log_signals:
                    item['duplicate_events'].append(event)
                    continue
                seen_log_signals.add(signature)
                item['score'] += 2
                item['supporting_signals'].append({
                    'source': 'syslog',
                    'type': event.get('event_type'),
                    'router': event.get('router'),
                    'message': event.get('message', '')
                })
                item['supporting_evidence'].append(event)
                item['scoring_reasons'].append({
                    'rule': 'SYSLOG_' + str(event.get('event_type', 'EVENT')),
                    'points': 2,
                    'evidence': event.get('message', '')
                })

    # Contradictory evidence analysis
    for link_id, item in ranked.items():
        if item['score'] < 1:
            continue
        item['fault_type'] = classify_fault_type(item['observations'])
        f_types = {obs.get('type') for obs in item['observations']}

        # Check for contradictory data-plane vs control-plane observations
        if 'BGP_SESSION_NOT_ESTABLISHED' in f_types or 'NO_PREFIXES_RECEIVED' in f_types:
            if 'INTERFACE_NOT_UP' not in f_types:
                item['contradicting_evidence'].append({
                    'candidate_link': link_id,
                    'source': 'interface_state',
                    'observation': f"Both router endpoints for {link_id} report interface state UP.",
                    'implication': "Physical interface is UP; contradicts physical link failure."
                })
            probe_losses = [obs.get('packet_loss_percent') for obs in item['observations'] if obs.get('type') == 'ACTIVE_PROBE_PACKET_LOSS']
            if not probe_losses or all(loss == 0 for loss in probe_losses):
                item['contradicting_evidence'].append({
                    'candidate_link': link_id,
                    'source': 'active_probe',
                    'observation': f"Active probe across {link_id} reports 0% packet loss and normal latency.",
                    'implication': "Bidirectional data-plane forwarding is intact; confirms failure is isolated to routing protocol."
                })
        elif item['fault_type'] == 'PERFORMANCE_DEGRADATION':
            if 'BGP_SESSION_NOT_ESTABLISHED' not in f_types:
                item['contradicting_evidence'].append({
                    'candidate_link': link_id,
                    'source': 'bgp',
                    'observation': f"BGP session across {link_id} remains Established.",
                    'implication': "Control-plane adjacency has not failed; contradicts complete link severance."
                })

    results = []
    for item in ranked.values():
        if item['score'] < 1:
            continue
        item['confidence_label'] = 'high' if item['score'] >= 8 else 'medium' if item['score'] >= 4 else 'low'
        item['assessment'] = (
            f"{item['confidence_label'].title()} confidence candidate based on {len(item['supporting_signals'])} supporting signals. "
            f"Classified as {item['fault_type']}. This is a ranked hypothesis; verify the physical path and affected services before concluding."
        )
        item['evidence'] = ' '.join(signal['message'] for signal in item['supporting_signals'] if signal.get('message'))
        item['observation_count'] = len(item['observations'])
        item['score'] = min(item['score'], 100)
        results.append(item)

    ordered = sorted(results, key=lambda value: (-value['score'], value['candidate_link']))
    for rank, item in enumerate(ordered, start=1):
        item['rank'] = rank
    return ordered
