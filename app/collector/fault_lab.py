"""Explicitly guarded fault controls for the isolated PS-035 Containerlab."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from app.topology import load_topology

SCENARIOS_FILE = Path(__file__).resolve().parents[2] / 'lab' / 'fault_scenarios.json'

# Commands are deliberately fixed here; CLI input can select only a scenario.
FAULTS = {
    'link_r2_r4_down': (('clab-ps035-r2', 'ip', 'link', 'set', 'dev', 'eth2', 'down'),
                        ('clab-ps035-r2', 'ip', 'link', 'set', 'dev', 'eth2', 'up')),
    'bgp_r1_r2_shutdown': (('clab-ps035-r1', 'vtysh', '-c', 'configure terminal', '-c', 'router bgp 65001', '-c', 'neighbor 10.0.12.2 shutdown'),
                           ('clab-ps035-r1', 'vtysh', '-c', 'configure terminal', '-c', 'router bgp 65001', '-c', 'no neighbor 10.0.12.2 shutdown')),
    'route_r5_withdrawal': (('clab-ps035-r5', 'vtysh', '-c', 'configure terminal', '-c', 'router bgp 65005', '-c', 'address-family ipv4 unicast', '-c', 'no network 192.168.5.1/32'),
                            ('clab-ps035-r5', 'vtysh', '-c', 'configure terminal', '-c', 'router bgp 65005', '-c', 'address-family ipv4 unicast', '-c', 'network 192.168.5.1/32')),
    'degraded_r2_r4': (('clab-ps035-r2', 'tc', 'qdisc', 'replace', 'dev', 'eth2', 'root', 'netem', 'delay', '200ms', 'loss', '20%'),
                       ('clab-ps035-r2', 'tc', 'qdisc', 'del', 'dev', 'eth2', 'root')),
    'link_r3_r4_down': (('clab-ps035-r3', 'ip', 'link', 'set', 'dev', 'eth2', 'down'),
                        ('clab-ps035-r3', 'ip', 'link', 'set', 'dev', 'eth2', 'up')),
}


def scenarios():
    return json.loads(SCENARIOS_FILE.read_text(encoding='utf-8'))['scenarios']


def verify_lab(runner=subprocess.run):
    expected = {router['container'] for router in load_topology()['routers']}
    fixed_scope = {f'clab-ps035-r{index}' for index in range(1, 6)}
    if expected != fixed_scope:
        raise RuntimeError('Refusing: topology containers do not match the fixed PS-035 lab scope.')
    # Require the exact five configured container names and a running state.
    for container in sorted(expected):
        result = runner(['docker', 'inspect', '--format', '{{.State.Running}}', container],
                        capture_output=True, text=True, timeout=8, check=False)
        if result.returncode != 0 or result.stdout.strip() != 'true':
            raise RuntimeError(f'Refusing: expected running lab container {container}.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('list', 'check', 'apply', 'restore'))
    parser.add_argument('scenario', nargs='?')
    parser.add_argument('--confirm-lab', metavar='NAME', help='Required exact value: ps035')
    args = parser.parse_args(argv)
    catalog = {item['id']: item for item in scenarios()}
    if args.action == 'list':
        for item in catalog.values():
            print(f"{item['id']}: {item['description']} (expected {item['expected_link']})")
        print('List only: no containers or network state were changed.')
        return 0
    if args.action == 'check':
        try:
            verify_lab()
            print('All five fixed PS-035 lab containers are running; no network state was changed.')
            return 0
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
            print(str(error), file=sys.stderr)
            return 2
    if args.scenario not in catalog:
        parser.error('apply/restore requires a scenario ID from the list')
    if args.scenario not in FAULTS:
        parser.error('scenario has no fixed, reviewed lab command')
    if args.confirm_lab != 'ps035':
        parser.error('apply/restore requires --confirm-lab ps035')
    if args.action == 'apply':
        print('Rollback command: python -m app.collector.fault_lab restore', args.scenario, '--confirm-lab ps035')
    try:
        verify_lab()
        container, *command = FAULTS[args.scenario][0 if args.action == 'apply' else 1]
        result = subprocess.run(['docker', 'exec', container, *command], timeout=15, check=False)
        if result.returncode:
            print('Lab command failed; inspect the target lab and apply the printed restore command if needed.', file=sys.stderr)
        return result.returncode
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
