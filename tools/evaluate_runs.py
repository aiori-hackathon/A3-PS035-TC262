"""Evaluate labeled held-out NETSCOPE diagnoses from a JSON Lines file."""
import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.diagnosis.optional_model import load_model, predict


def ranked_links(record):
    diagnosis = record.get('diagnosis', record)
    candidates = diagnosis.get('candidate_root_causes', diagnosis.get('ranked_hypotheses', []))
    return [item if isinstance(item, str) else item.get('candidate_link') for item in candidates]


def evaluate(records):
    held_out = [row for row in records if row.get('held_out') is True]
    if not held_out:
        raise ValueError('No records marked held_out=true.')
    labeled = [row for row in held_out if 'expected_candidate_link' in row]
    if not labeled:
        raise ValueError('Held-out records need expected_candidate_link (use null for no supported fault).')
    top1 = top3 = 0
    unsupported = correct_abstentions = 0
    false_abstentions = 0
    fault_cases = 0
    for row in labeled:
        expected = row.get('expected_candidate_link')
        links = [link for link in ranked_links(row) if isinstance(link, str)]
        status = row.get('diagnosis_status', row.get('diagnosis', {}).get('diagnosis_status'))
        abstained = status == 'insufficient_evidence' or not links
        if expected is None:
            unsupported += 1
            correct_abstentions += int(abstained)
        else:
            fault_cases += 1
            top1 += int(bool(links) and links[0] == expected)
            top3 += int(expected in links[:3])
            false_abstentions += int(abstained)
    count = len(labeled)
    return {
        'held_out_records': len(held_out), 'labeled_records': count,
        'fault_cases': fault_cases,
        'top1_accuracy': round(top1 / fault_cases, 4) if fault_cases else None,
        'top3_accuracy': round(top3 / fault_cases, 4) if fault_cases else None,
        'unsupported_cases': unsupported,
        'unsupported_conclusion_rate': round((unsupported - correct_abstentions) / unsupported, 4) if unsupported else None,
        'unsupported_abstention_accuracy': round(correct_abstentions / unsupported, 4) if unsupported else None,
        'fault_case_abstention_rate': round(false_abstentions / fault_cases, 4) if fault_cases else None,
        'note': 'Metrics are calculated only from supplied held-out labels; this tool does not establish dataset quality or generalize beyond it.'
    }


def evaluate_optional_model(records, model):
    held_out = [row for row in records if row.get('held_out') is True and 'expected_candidate_link' in row]
    if not held_out:
        raise ValueError('Optional model evaluation requires labeled held-out records.')
    fault_cases = unsupported = top1 = top3 = correct_abstentions = fault_abstentions = 0
    for row in held_out:
        result = predict(model, row.get('diagnosis', row))
        ranked = [item['candidate_link'] for item in result['predictions']]
        abstained = result['status'] != 'available'
        expected = row['expected_candidate_link']
        if expected is None:
            unsupported += 1
            correct_abstentions += int(abstained)
        else:
            fault_cases += 1
            top1 += int(bool(ranked) and ranked[0] == expected)
            top3 += int(expected in ranked[:3])
            fault_abstentions += int(abstained)
    return {
        'held_out_records': len(held_out),
        'fault_cases': fault_cases,
        'top1_accuracy': round(top1 / fault_cases, 4) if fault_cases else None,
        'top3_accuracy': round(top3 / fault_cases, 4) if fault_cases else None,
        'unsupported_cases': unsupported,
        'unsupported_abstention_accuracy': round(correct_abstentions / unsupported, 4) if unsupported else None,
        'fault_case_abstention_rate': round(fault_abstentions / fault_cases, 4) if fault_cases else None,
        'note': 'Experimental relative model scores; metrics reflect only the supplied held-out labels and do not establish generalization.'
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jsonl', type=Path)
    parser.add_argument('--model', type=Path, help='Optional trained model JSON for separate held-out comparison')
    args = parser.parse_args()
    records = [json.loads(line) for line in args.jsonl.read_text(encoding='utf-8').splitlines() if line.strip()]
    result = evaluate(records)
    if args.model:
        result['optional_model'] = evaluate_optional_model(records, load_model(args.model))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
