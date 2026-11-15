"""Rule-based evidence extraction from interface and active probe observations."""
import re


def analyze_interfaces(routers, topology):
    states = {}
    findings = []
    for router in routers:
        name = str(router.get('router','')).lower()
        output = router.get('interface_state', {}).get('output', '')
        if not router.get('interface_state', {}).get('success'):
            continue
        for line in output.splitlines():
            fields = line.split()
            if len(fields) >= 2:
                # `ip -br link` may print veth peer indexes, e.g. eth2@if73.
                interface = fields[0].split('@', 1)[0]
                states[(name, interface)] = fields[1].upper()
    for link in topology.get('links', []):
        for side, peer_side in (('a','b'),('b','a')):
            router = link[side]
            endpoint = link[side + '_endpoint']
            state = states.get((router, endpoint['interface']))
            if state and state not in {'UP','UNKNOWN'}:
                findings.append({'router':router.upper(),'interface':endpoint['interface'],'neighbor':link[peer_side + '_endpoint']['address'],
                                 'link':link['id'],'severity':'CRITICAL','type':'INTERFACE_NOT_UP','state':state,
                                 'message':f"{router.upper()} {endpoint['interface']} toward {peer_side.upper()} is {state}.",
                                 'evidence_source':'interface_state'})
    return findings


def analyze_probes(measurements):
    findings = []
    for link in measurements or []:
        for probe in link.get('observations', []):
            loss = probe.get('packet_loss_percent')
            if loss is None or not probe.get('available'):
                findings.append({'router':probe.get('router','').upper(),'neighbor':probe.get('target_address'),
                                 'link':link.get('link'),'severity':'WARNING','type':'ACTIVE_PROBE_UNAVAILABLE',
                                 'message':f"Probe from {probe.get('router','').upper()} to {probe.get('target','').upper()} was unavailable; this is missing evidence, not proof of failure.", 'evidence_source':'active_probe'})
            elif loss > 0:
                findings.append({'router':probe.get('router','').upper(),'neighbor':probe.get('target_address'),
                                 'link':link.get('link'),'severity':'CRITICAL' if loss >= 100 else 'WARNING',
                                 'type':'ACTIVE_PROBE_PACKET_LOSS','packet_loss_percent':loss,'rtt_avg_ms':probe.get('rtt_avg_ms'),
                                 'message':f"Probe from {probe.get('router','').upper()} to {probe.get('target','').upper()} reports {loss}% packet loss.", 'evidence_source':'active_probe'})
            elif probe.get('rtt_avg_ms') is not None and probe['rtt_avg_ms'] >= 100:
                findings.append({'router':probe.get('router','').upper(),'neighbor':probe.get('target','').upper(),
                                 'link':link.get('link'),'severity':'WARNING','type':'ACTIVE_PROBE_HIGH_LATENCY',
                                 'rtt_avg_ms':probe['rtt_avg_ms'],'message':f"Probe reports elevated RTT of {probe['rtt_avg_ms']} ms.", 'evidence_source':'active_probe'})
    return findings


def summarize_syslog(routers):
    patterns = [
        ('BGP_NEIGHBOR_STATE', re.compile(r"neighbor\s+(\d+(?:\.\d+){3}).{0,100}?(Down|Idle|Active|Established)", re.I)),
        ('INTERFACE_STATE', re.compile(r"(eth\d+).{0,80}?(?:link down|state down|changed state to down)", re.I)),
    ]
    events=[]
    for router in routers:
        if not router.get('syslog',{}).get('success'):
            continue
        for line in router['syslog']['output'].splitlines()[-100:]:
            for kind, pattern in patterns:
                match=pattern.search(line)
                if match:
                    state = match.group(2).upper() if kind == 'BGP_NEIGHBOR_STATE' else None
                    # A neighbor becoming Established is recovery context, not a fault signal.
                    if state == 'ESTABLISHED':
                        break
                    events.append({'router':router.get('router','').upper(),'event_type':kind,
                                   'peer':match.group(1) if kind=='BGP_NEIGHBOR_STATE' else None,
                                   'interface':match.group(1) if kind=='INTERFACE_STATE' else None,
                                   'state':state,
                                   'message':line[-500:]})
                    break
    return events
