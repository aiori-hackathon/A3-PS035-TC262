"""Rule-based evidence extraction from interface and active probe observations."""
import re


def analyze_interfaces(routers, topology):
    states = {}
    raw_lines = {}
    timestamps = {}
    findings = []
    for router in routers:
        name = str(router.get('router','')).lower()
        timestamps[name] = router.get('collected_at')
        output = router.get('interface_state', {}).get('output', '')
        if not router.get('interface_state', {}).get('success'):
            continue
        for line in output.splitlines():
            fields = line.split()
            if len(fields) >= 2:
                # `ip -br link` may print veth peer indexes, e.g. eth2@if73.
                interface = fields[0].split('@', 1)[0]
                states[(name, interface)] = fields[1].upper()
                raw_lines[(name, interface)] = line.strip()
    for link in topology.get('links', []):
        for side, peer_side in (('a','b'),('b','a')):
            router = link[side]
            endpoint = link[side + '_endpoint']
            state = states.get((router, endpoint['interface']))
            if state and state not in {'UP','UNKNOWN'}:
                obs_id = f"obs-if-{router.lower()}-{endpoint['interface']}"
                findings.append({
                    'id': obs_id,
                    'observation_id': obs_id,
                    'source_type': 'interface_state',
                    'evidence_source': 'interface_state',
                    'router': router.upper(),
                    'router_id': router.upper(),
                    'interface': endpoint['interface'],
                    'interface_or_peer_id': endpoint['interface'],
                    'neighbor': link[peer_side + '_endpoint']['address'],
                    'link': link['id'],
                    'severity': 'CRITICAL',
                    'type': 'INTERFACE_NOT_UP',
                    'state': state,
                    'timestamp': timestamps.get(router),
                    'collection_status': 'success',
                    'raw_evidence_reference': raw_lines.get((router, endpoint['interface']), f"{endpoint['interface']} {state}"),
                    'message': f"{router.upper()} {endpoint['interface']} toward {peer_side.upper()} is {state}."
                })
    return findings


def analyze_probes(measurements):
    findings = []
    for link in measurements or []:
        link_id = link.get('link')
        for probe in link.get('observations', []):
            loss = probe.get('packet_loss_percent')
            router_str = probe.get('router','').upper()
            target_str = probe.get('target','').upper()
            target_addr = probe.get('target_address')
            rtt_avg = probe.get('rtt_avg_ms')
            base_obs = f"obs-probe-{link_id}-{router_str.lower()}-{target_str.lower()}"
            if loss is None or not probe.get('available'):
                findings.append({
                    'id': f"{base_obs}-unavail",
                    'observation_id': f"{base_obs}-unavail",
                    'source_type': 'active_probe',
                    'evidence_source': 'active_probe',
                    'router': router_str,
                    'router_id': router_str,
                    'target_router': target_str,
                    'neighbor': target_addr,
                    'interface_or_peer_id': target_addr,
                    'link': link_id,
                    'severity': 'WARNING',
                    'type': 'ACTIVE_PROBE_UNAVAILABLE',
                    'collection_status': 'failed',
                    'raw_evidence_reference': str(probe),
                    'message': f"Probe from {router_str} to {target_str} was unavailable; this is missing evidence, not proof of failure."
                })
            else:
                raw_summary = f"loss={loss}%, rtt_avg={rtt_avg}ms, sent={probe.get('packets_sent')}, recv={probe.get('packets_received')}"
                if loss > 0:
                    findings.append({
                        'id': f"{base_obs}-loss",
                        'observation_id': f"{base_obs}-loss",
                        'source_type': 'active_probe',
                        'evidence_source': 'active_probe',
                        'router': router_str,
                        'router_id': router_str,
                        'target_router': target_str,
                        'neighbor': target_addr,
                        'interface_or_peer_id': target_addr,
                        'link': link_id,
                        'severity': 'CRITICAL' if loss >= 100 else 'WARNING',
                        'type': 'ACTIVE_PROBE_PACKET_LOSS',
                        'packet_loss_percent': loss,
                        'rtt_avg_ms': rtt_avg,
                        'collection_status': 'success',
                        'raw_evidence_reference': raw_summary,
                        'message': f"Probe from {router_str} to {target_str} reports {loss}% packet loss."
                    })
                if rtt_avg is not None and rtt_avg >= 100:
                    findings.append({
                        'id': f"{base_obs}-lat",
                        'observation_id': f"{base_obs}-lat",
                        'source_type': 'active_probe',
                        'evidence_source': 'active_probe',
                        'router': router_str,
                        'router_id': router_str,
                        'target_router': target_str,
                        'neighbor': target_addr,
                        'interface_or_peer_id': target_addr,
                        'link': link_id,
                        'severity': 'WARNING',
                        'type': 'ACTIVE_PROBE_HIGH_LATENCY',
                        'rtt_avg_ms': rtt_avg,
                        'collection_status': 'success',
                        'raw_evidence_reference': raw_summary,
                        'message': f"Probe from {router_str} to {target_str} reports elevated RTT of {rtt_avg} ms."
                    })
    return findings


def summarize_syslog(routers):
    patterns = [
        ('BGP_NEIGHBOR_STATE', re.compile(r"neighbor\s+(\d+(?:\.\d+){3}).{0,100}?(Down|Idle|Active|Established)", re.I)),
        ('INTERFACE_STATE', re.compile(r"(eth\d+).{0,80}?(?:link down|state down|changed state to down)", re.I)),
    ]
    events=[]
    for router in routers:
        r_name = router.get('router','').upper()
        timestamp = router.get('collected_at')
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
                    peer_or_if = match.group(1)
                    obs_id = f"obs-syslog-{r_name.lower()}-{kind.lower()}-{peer_or_if}"
                    events.append({
                        'id': obs_id,
                        'observation_id': obs_id,
                        'source_type': 'syslog',
                        'evidence_source': 'syslog',
                        'router': r_name,
                        'router_id': r_name,
                        'event_type': kind,
                        'peer': peer_or_if if kind=='BGP_NEIGHBOR_STATE' else None,
                        'interface': peer_or_if if kind=='INTERFACE_STATE' else None,
                        'interface_or_peer_id': peer_or_if,
                        'state': state,
                        'timestamp': timestamp,
                        'collection_status': 'success',
                        'raw_evidence_reference': line.strip()[-200:],
                        'message': line[-500:]
                    })
                    break
    return events
