"""Validated topology inventory shared by collection and diagnosis."""
import json
from pathlib import Path

TOPOLOGY_FILE = Path(__file__).resolve().parents[1] / 'lab' / 'topology.json'

def load_topology(path=TOPOLOGY_FILE):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    routers, links = data.get('routers'), data.get('links')
    if not isinstance(routers, list) or not isinstance(links, list) or not routers:
        raise ValueError('Topology must define routers and links')
    names = {item.get('id') for item in routers if isinstance(item, dict)}
    if len(names) != len(routers) or not all(isinstance(name, str) for name in names):
        raise ValueError('Router IDs must be unique strings')
    seen = set()
    for link in links:
        if not isinstance(link, dict) or link.get('a') not in names or link.get('b') not in names or link['a'] == link['b']:
            raise ValueError('Link endpoints must reference two distinct routers')
        key = tuple(sorted((link['a'], link['b'])))
        if key in seen:
            raise ValueError('Duplicate topology link')
        seen.add(key)
        for side in ('a', 'b'):
            endpoint = link.get(side + '_endpoint')
            if not isinstance(endpoint, dict) or not all(isinstance(endpoint.get(key), str) for key in ('interface', 'address')):
                raise ValueError('Each link endpoint needs interface and address')
    return data
