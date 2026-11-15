"""Evidence-ranked root-cause candidates over the configured topology."""
from app.topology import load_topology

_DEFAULT_TOPOLOGY = load_topology()
LINKS = [
    {'routers':(item['a'],item['b']), 'subnet':item['subnet'],
     'endpoints':(item['a_endpoint']['address'],item['b_endpoint']['address']), 'id':item['id']}
    for item in _DEFAULT_TOPOLOGY['links']
]


def correlate_findings(findings, topology=None, syslog_events=None):
    topology = topology or _DEFAULT_TOPOLOGY
    ranked = {}
    for link in topology['links']:
        ranked[link['id']] = {'candidate_link':link['id'], 'subnet':link['subnet'], 'severity':'INFO',
                              'fault_type':'EVIDENCE_RANKED_HYPOTHESIS', 'affected_routers':[],
                              'observations':[], 'supporting_signals':[], 'evidence':'', 'score':0}
    for finding in findings:
        link_id = finding.get('link')
        neighbor = finding.get('neighbor')
        router = str(finding.get('router','')).lower()
        if not link_id and neighbor:
            for link in topology['links']:
                if router == link['a'] and neighbor == link['b_endpoint']['address'] or router == link['b'] and neighbor == link['a_endpoint']['address']:
                    link_id = link['id']; break
        item = ranked.get(link_id)
        if not item: continue
        kind = finding.get('type','UNKNOWN')
        weight = {'INTERFACE_NOT_UP':4,'ACTIVE_PROBE_PACKET_LOSS':4 if finding.get('packet_loss_percent') == 100 else 2,
                  'ACTIVE_PROBE_HIGH_LATENCY':1,'ACTIVE_PROBE_UNAVAILABLE':0,'BGP_SESSION_NOT_ESTABLISHED':3,
                  'NO_PREFIXES_RECEIVED':2,'BGP_COLLECTION_FAILURE':0}.get(kind,1)
        item['score'] += weight
        item['observations'].append(finding)
        if weight:
            item['supporting_signals'].append({'source':finding.get('evidence_source', 'bgp'), 'type':kind,
                                               'router':finding.get('router'), 'message':finding.get('message')})
        if router and router.upper() not in item['affected_routers']: item['affected_routers'].append(router.upper())
        if finding.get('severity') == 'CRITICAL': item['severity']='CRITICAL'
        elif finding.get('severity') == 'WARNING' and item['severity'] != 'CRITICAL': item['severity']='WARNING'
    seen_log_signals = set()
    for event in syslog_events or []:
        if not isinstance(event, dict):
            continue
        for link in topology['links']:
            side = 'a' if event.get('router','').lower() == link['a'] else 'b' if event.get('router','').lower() == link['b'] else None
            if not side: continue
            if event.get('event_type') == 'BGP_NEIGHBOR_STATE' and str(event.get('state', '')).upper() == 'ESTABLISHED':
                continue
            endpoint=link[side+'_endpoint']
            if event.get('peer') == link['a_endpoint' if side=='b' else 'b_endpoint']['address'] or event.get('interface') == endpoint['interface']:
                signature=(event.get('router'),event.get('event_type'),event.get('peer'),event.get('interface'),event.get('state'))
                if signature in seen_log_signals:
                    continue
                seen_log_signals.add(signature)
                item=ranked[link['id']]; item['score'] += 2
                item['supporting_signals'].append({'source':'syslog','type':event.get('event_type'), 'router':event['router'], 'message':event.get('message','')})
    results=[]
    for item in ranked.values():
        if item['score'] < 1: continue
        item['confidence_label']='high' if item['score'] >= 8 else 'medium' if item['score'] >= 4 else 'low'
        item['assessment']=(f"{item['confidence_label'].title()} confidence candidate based on {len(item['supporting_signals'])} supporting signals. This is a ranked hypothesis; verify the physical path and affected services before concluding.")
        item['evidence']=' '.join(signal['message'] for signal in item['supporting_signals'] if signal.get('message'))
        item['observation_count']=len(item['observations'])
        item['score']=min(item['score'],100)
        results.append(item)
    ordered = sorted(results,key=lambda value:(-value['score'],value['candidate_link']))
    for rank, item in enumerate(ordered, start=1):
        item['rank'] = rank
    return ordered
