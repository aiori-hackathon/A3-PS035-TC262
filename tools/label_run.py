"""Create an evaluator record from one collected snapshot and its lab label."""
import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.collector.fault_lab import scenarios
from app.diagnosis.engine import build_diagnosis


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('--scenario', required=True, help='Scenario ID, or healthy_baseline')
    parser.add_argument('--run-id', required=True, help='Unique operator-assigned run identifier')
    parser.add_argument('--injection-run-id', help='Identifier of the independent injection event (defaults to --run-id)')
    parser.add_argument('--snapshot-id', help='Identifier of this specific snapshot (defaults to file stem)')
    parser.add_argument('--held-out', action='store_true', help='Mark this run as held out from tuning')
    parser.add_argument('--output', type=Path, default=Path('/tmp/netscope-runs.jsonl'))
    args = parser.parse_args()

    labels = {item['id']: item['expected_link'] for item in scenarios()}
    labels['healthy_baseline'] = None
    if args.scenario not in labels:
        parser.error('unknown scenario ID')
    snapshot = json.loads(args.snapshot.read_text(encoding='utf-8'))
    diagnosis = build_diagnosis(snapshot)
    expected_label = labels[args.scenario]
    injection_run_id = args.injection_run_id or args.run_id
    snapshot_id = args.snapshot_id or args.snapshot.stem
    record = {
        'held_out': args.held_out,
        'run_id': args.run_id,
        'injection_run_id': injection_run_id,
        'snapshot_id': snapshot_id,
        'scenario_id': args.scenario,
        'ground_truth_label': expected_label,
        'expected_candidate_link': expected_label,
        'diagnosis_status': diagnosis['diagnosis_status'],
        'outcome': diagnosis.get('outcome', 'DIAGNOSIS'),
        'diagnosis': diagnosis,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(record, separators=(',', ':')) + '\n')
    print(f"Labeled {args.run_id} as {args.scenario}; held_out={args.held_out}; appended to {args.output}")


if __name__ == '__main__':
    main()
