"""Bounded active ICMP probes across configured lab adjacencies."""
import re
from app.collector.command import run_command


def parse_ping(output):
    received = re.search(r'(\d+) packets transmitted, (\d+) (?:packets )?received', output, re.I)
    summary = re.search(r'(?:rtt|round-trip) min/avg/max(?:/mdev)? = ([\d.]+)/([\d.]+)/([\d.]+)', output, re.I)
    sent = int(received.group(1)) if received else 0
    replies = int(received.group(2)) if received else 0
    loss = round((sent - replies) * 100 / sent, 1) if sent else None
    # `ping` commonly exits nonzero when zero replies arrive; its packet summary
    # still proves the probe ran and measured total loss. No summary means unknown.
    return {'available': bool(sent), 'packets_sent': sent, 'packets_received': replies,
            'packet_loss_percent': loss, 'rtt_min_ms': float(summary.group(1)) if summary else None,
            'rtt_avg_ms': float(summary.group(2)) if summary else None,
            'rtt_max_ms': float(summary.group(3)) if summary else None}


def probe_link(link, routers_by_id, count=10, timeout=1):
    observations = []
    for side, peer_side in (('a', 'b'), ('b', 'a')):
        router = link[side]
        source = link[side + '_endpoint']['address']
        target = link[peer_side + '_endpoint']['address']
        container = routers_by_id[router]['container']
        result = run_command(['docker','exec',container,'ping','-n','-I',source,'-c',str(count),'-W',str(timeout),target], timeout=count * (timeout + 1) + 3)
        observations.append({'router':router,'target':peer_side,'target_address':target,**parse_ping(result['output'])})
    return {'link':link['id'], 'observations':observations}
