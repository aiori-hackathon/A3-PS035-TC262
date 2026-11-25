"""Evaluate labeled held-out NETSCOPE diagnoses from a JSON Lines file."""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import random
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.diagnosis.optional_model import load_model, predict

METRIC_DEFINITIONS = {
    "top1_accuracy": "Fraction of fault cases where the top-ranked candidate link matches the ground truth label.",
    "top3_accuracy": "Fraction of fault cases where the ground truth label appears within the top 3 ranked candidates.",
    "mean_reciprocal_rank": "Mean of the reciprocal ranks (1/rank) of the ground truth label across all fault cases (0 if not in ranked candidates).",
    "selective_accuracy": "Accuracy evaluated strictly on runs where the engine issued a confident diagnosis without abstaining.",
    "abstention_coverage": "Fraction of evaluated runs where the engine issued a diagnosis rather than abstaining.",
    "false_confident_diagnosis_rate": "Fraction of non-abstained diagnoses where the top-ranked prediction was incorrect.",
    "unsupported_abstention_accuracy": "Fraction of healthy / unsupported runs where the engine correctly abstained.",
    "unsupported_conclusion_rate": "Fraction of healthy / unsupported runs where the engine falsely issued a fault conclusion.",
}


def extract_run_identifiers(record):
    """Extract standard run identifiers from a record."""
    scenario_id = record.get("scenario_id") or record.get("scenario", {}).get("id") or "unknown"
    injection_run_id = record.get("injection_run_id") or record.get("run_id") or "run-unknown"
    snapshot_id = record.get("snapshot_id") or record.get("snapshot", {}).get("id") or "snap-unknown"
    ground_truth = record.get("ground_truth_label", record.get("expected_candidate_link"))
    return {
        "scenario_id": scenario_id,
        "injection_run_id": injection_run_id,
        "snapshot_id": snapshot_id,
        "ground_truth_label": ground_truth,
    }


def ranked_links(record):
    diagnosis = record.get('diagnosis', record)
    candidates = diagnosis.get('candidate_root_causes', diagnosis.get('ranked_hypotheses', []))
    res = []
    for item in candidates:
        if isinstance(item, str):
            res.append(item)
        elif isinstance(item, dict):
            link = item.get('candidate_link')
            if link:
                res.append(link)
    return res


def is_abstained(row, links):
    status = row.get('diagnosis_status', row.get('diagnosis', {}).get('diagnosis_status'))
    outcome = row.get('outcome', row.get('diagnosis', {}).get('outcome'))
    return (
        status == 'insufficient_evidence'
        or outcome in ('INSUFFICIENT_TELEMETRY', 'INSUFFICIENT_EVIDENCE', 'AMBIGUOUS_HYPOTHESES')
        or not links
    )


def split_by_injection_run(records, test_ratio=0.3, min_runs_per_class=2, seed=42):
    """
    Split records by independent injection run ID.
    All snapshots from the same injection event stay strictly together in train or held-out.
    Discloses limitation if independent run count is insufficient without fabricating data.
    """
    rng = random.Random(seed)
    runs_by_scenario = defaultdict(lambda: defaultdict(list))
    for rec in records:
        scen = rec.get("scenario_id", "unknown")
        run_id = rec.get("injection_run_id") or rec.get("run_id") or str(id(rec))
        runs_by_scenario[scen][run_id].append(rec)

    train_records = []
    held_out_records = []
    disclosures = []
    run_counts_per_scenario = {}

    for scen, run_map in sorted(runs_by_scenario.items()):
        run_ids = sorted(run_map.keys())
        run_counts_per_scenario[scen] = len(run_ids)
        if len(run_ids) < min_runs_per_class:
            disclosures.append(
                f"Scenario '{scen}' has only {len(run_ids)} independent run(s); "
                f"minimum required for clean split without leakage is {min_runs_per_class}. "
                "Disclosing limitation rather than manufacturing artificial runs."
            )
            for r_id in run_ids:
                for rec in run_map[r_id]:
                    rec_copy = dict(rec)
                    rec_copy["held_out"] = False
                    train_records.append(rec_copy)
            continue

        shuffled = list(run_ids)
        rng.shuffle(shuffled)
        n_held_out = max(1, int(round(len(shuffled) * test_ratio)))
        held_out_ids = set(shuffled[:n_held_out])
        for r_id in run_ids:
            is_held_out = r_id in held_out_ids
            for rec in run_map[r_id]:
                rec_copy = dict(rec)
                rec_copy["held_out"] = is_held_out
                if is_held_out:
                    held_out_records.append(rec_copy)
                else:
                    train_records.append(rec_copy)

    return {
        "train_records": train_records,
        "held_out_records": held_out_records,
        "run_counts_per_scenario": run_counts_per_scenario,
        "disclosures": disclosures,
        "is_sufficient": len(disclosures) == 0,
    }


def evaluate(records):
    held_out = [row for row in records if row.get('held_out') is True]
    if not held_out:
        raise ValueError('No records marked held_out=true.')
    labeled = [row for row in held_out if 'expected_candidate_link' in row or 'ground_truth_label' in row]
    if not labeled:
        raise ValueError('Held-out records need expected_candidate_link (use null for no supported fault).')

    top1 = top3 = 0
    rr_sum = 0.0
    unsupported = correct_abstentions = 0
    false_abstentions = 0
    fault_cases = 0

    non_abstained_count = 0
    correct_non_abstained = 0

    scenario_counts = Counter()
    scenario_top1 = Counter()
    scenario_abstentions = Counter()

    independent_run_ids = set()

    # Track multi-fault cases separately
    multi_fault_cases = []

    # Confusion matrix: actual -> predicted -> count
    classes = set()
    confusion_matrix = defaultdict(Counter)

    for row in labeled:
        expected = row.get('ground_truth_label', row.get('expected_candidate_link'))
        run_id = row.get('injection_run_id') or row.get('run_id')
        if run_id:
            independent_run_ids.add(run_id)

        scen = row.get('scenario_id', 'unknown')
        scenario_counts[scen] += 1

        links = [link for link in ranked_links(row) if isinstance(link, str)]
        abstained = is_abstained(row, links)

        if abstained:
            scenario_abstentions[scen] += 1
        else:
            non_abstained_count += 1

        # Check for multi-fault scenario / set ground-truth
        if isinstance(expected, (list, set, tuple)):
            expected_set = set(expected)
            predicted_set = set(links[:len(expected_set)]) if not abstained else set()
            exact_match = (predicted_set == expected_set)
            jaccard = (
                len(predicted_set & expected_set) / len(predicted_set | expected_set)
                if (predicted_set | expected_set) else 1.0
            )
            multi_fault_cases.append({
                'run_id': run_id,
                'scenario_id': scen,
                'expected': sorted(expected_set),
                'predicted': sorted(predicted_set),
                'abstained': abstained,
                'exact_match': exact_match,
                'jaccard_similarity': round(jaccard, 4),
            })
            continue

        # Single fault or unsupported
        actual_class = "NO_FAULT" if expected is None else str(expected)
        pred_class = "ABSTAIN" if abstained else (links[0] if links else "ABSTAIN")

        classes.add(actual_class)
        classes.add(pred_class)
        confusion_matrix[actual_class][pred_class] += 1

        if expected is None:
            unsupported += 1
            if abstained:
                correct_abstentions += 1
        else:
            fault_cases += 1
            is_top1 = bool(links) and (links[0] == expected)
            is_top3 = expected in links[:3]
            top1 += int(is_top1)
            top3 += int(is_top3)
            reciprocal_rank = (1.0 / (links.index(expected) + 1)) if expected in links else 0.0
            rr_sum += reciprocal_rank
            if abstained:
                false_abstentions += 1
            else:
                if is_top1:
                    correct_non_abstained += 1
                    scenario_top1[scen] += 1

    # Per-class precision & recall
    classes_list = sorted(classes)
    per_class_metrics = {}
    for c in classes_list:
        if c == "ABSTAIN":
            continue
        tp = confusion_matrix[c][c]
        fp = sum(confusion_matrix[other][c] for other in classes_list if other != c)
        fn = sum(confusion_matrix[c][other] for other in classes_list if other != c)
        support = sum(confusion_matrix[c].values())
        prec = round(tp / (tp + fp), 4) if (tp + fp) > 0 else None
        rec = round(tp / (tp + fn), 4) if (tp + fn) > 0 else None
        per_class_metrics[c] = {
            "support": support,
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": prec,
            "recall": rec,
        }

    # Per-scenario results
    per_scenario_results = {}
    for scen, count in sorted(scenario_counts.items()):
        s_top1 = scenario_top1.get(scen, 0)
        s_abstained = scenario_abstentions.get(scen, 0)
        per_scenario_results[scen] = {
            "total_runs": count,
            "top1_matches": s_top1,
            "abstentions": s_abstained,
            "accuracy": round(s_top1 / count, 4) if count > 0 else None,
        }

    # Multi-fault evaluation
    multi_fault_evaluation = None
    if multi_fault_cases:
        exact_matches = sum(1 for m in multi_fault_cases if m['exact_match'])
        mean_jaccard = sum(m['jaccard_similarity'] for m in multi_fault_cases) / len(multi_fault_cases)
        multi_fault_evaluation = {
            "cases_count": len(multi_fault_cases),
            "exact_set_matches": exact_matches,
            "exact_set_accuracy": round(exact_matches / len(multi_fault_cases), 4),
            "mean_jaccard_similarity": round(mean_jaccard, 4),
            "details": multi_fault_cases,
        }

    count = len(labeled)
    abstained_total = count - non_abstained_count

    return {
        'held_out_records': len(held_out),
        'labeled_records': count,
        'independent_runs': len(independent_run_ids),
        'fault_cases': fault_cases,
        'unsupported_cases': unsupported,
        'top1_accuracy': round(top1 / fault_cases, 4) if fault_cases else None,
        'top3_accuracy': round(top3 / fault_cases, 4) if fault_cases else None,
        'mrr': round(rr_sum / fault_cases, 4) if fault_cases else None,
        'mean_reciprocal_rank': round(rr_sum / fault_cases, 4) if fault_cases else None,
        'selective_accuracy': round(correct_non_abstained / non_abstained_count, 4) if non_abstained_count else None,
        'abstention_coverage': round(non_abstained_count / count, 4) if count else None,
        'abstention_rate': round(abstained_total / count, 4) if count else None,
        'false_confident_diagnosis_rate': round((non_abstained_count - correct_non_abstained) / non_abstained_count, 4) if non_abstained_count else None,
        'unsupported_conclusion_rate': round((unsupported - correct_abstentions) / unsupported, 4) if unsupported else None,
        'unsupported_abstention_accuracy': round(correct_abstentions / unsupported, 4) if unsupported else None,
        'fault_case_abstention_rate': round(false_abstentions / fault_cases, 4) if fault_cases else None,
        'per_class_metrics': per_class_metrics,
        'confusion_matrix': {row_label: dict(col_map) for row_label, col_map in confusion_matrix.items()},
        'per_scenario_results': per_scenario_results,
        'multi_fault_evaluation': multi_fault_evaluation,
        'dataset_split_details': {
            'total_records': len(records),
            'held_out_records': len(held_out),
            'training_records': len(records) - len(held_out),
            'independent_held_out_runs': len(independent_run_ids),
            'run_counts_per_scenario': dict(scenario_counts),
            'limitation_disclosure': 'Evaluated only on held-out records. No synthetic samples manufactured.',
        },
        'metric_definitions': METRIC_DEFINITIONS,
        'note': 'Metrics are calculated only from supplied held-out labels; this tool does not establish dataset quality or generalize beyond it.'
    }


def evaluate_optional_model(records, model):
    held_out = [row for row in records if row.get('held_out') is True and ('expected_candidate_link' in row or 'ground_truth_label' in row)]
    if not held_out:
        raise ValueError('Optional model evaluation requires labeled held-out records.')
    fault_cases = unsupported = top1 = top3 = correct_abstentions = fault_abstentions = 0
    rr_sum = 0.0
    for row in held_out:
        result = predict(model, row.get('diagnosis', row))
        ranked = [item['candidate_link'] for item in result.get('predictions', [])]
        abstained = result.get('status') != 'available'
        expected = row.get('ground_truth_label', row.get('expected_candidate_link'))
        if expected is None:
            unsupported += 1
            correct_abstentions += int(abstained)
        else:
            fault_cases += 1
            is_top1 = bool(ranked) and ranked[0] == expected
            is_top3 = expected in ranked[:3]
            top1 += int(is_top1)
            top3 += int(is_top3)
            reciprocal_rank = (1.0 / (ranked.index(expected) + 1)) if expected in ranked else 0.0
            rr_sum += reciprocal_rank
            fault_abstentions += int(abstained)
    return {
        'held_out_records': len(held_out),
        'fault_cases': fault_cases,
        'top1_accuracy': round(top1 / fault_cases, 4) if fault_cases else None,
        'top3_accuracy': round(top3 / fault_cases, 4) if fault_cases else None,
        'mrr': round(rr_sum / fault_cases, 4) if fault_cases else None,
        'mean_reciprocal_rank': round(rr_sum / fault_cases, 4) if fault_cases else None,
        'unsupported_cases': unsupported,
        'unsupported_abstention_accuracy': round(correct_abstentions / unsupported, 4) if unsupported else None,
        'fault_case_abstention_rate': round(fault_abstentions / fault_cases, 4) if fault_cases else None,
        'note': 'Experimental relative model scores; metrics reflect only the supplied held-out labels and do not establish generalization.'
    }


def generate_markdown_report(result):
    """Dynamically format evaluation results into a Markdown report without hardcoded metrics."""
    split = result.get('dataset_split_details', {})
    per_class = result.get('per_class_metrics', {})
    conf_mat = result.get('confusion_matrix', {})
    multi_fault = result.get('multi_fault_evaluation')
    opt_model = result.get('optional_model')

    lines = [
        "# NETSCOPE Diagnostic Engine Benchmark Report",
        "",
        "## 1. Dataset & Independent Run Summary",
        f"- **Total Evaluated Records**: {result.get('labeled_records', 'N/A')}",
        f"- **Independent Held-Out Runs**: {result.get('independent_runs', 'N/A')}",
        f"- **Fault Cases Evaluated**: {result.get('fault_cases', 'N/A')}",
        f"- **Unsupported / Healthy Baseline Cases**: {result.get('unsupported_cases', 'N/A')}",
        f"- **Limitation Disclosure**: {split.get('limitation_disclosure', 'None')}",
        "",
        "## 2. Deterministic Rule Baseline Performance",
        "| Metric | Value | Definition |",
        "|---|---|---|",
        f"| **Top-1 Accuracy** | {result.get('top1_accuracy')} | {METRIC_DEFINITIONS['top1_accuracy']} |",
        f"| **Top-3 Accuracy** | {result.get('top3_accuracy')} | {METRIC_DEFINITIONS['top3_accuracy']} |",
        f"| **Mean Reciprocal Rank (MRR)** | {result.get('mrr')} | {METRIC_DEFINITIONS['mean_reciprocal_rank']} |",
        f"| **Selective Accuracy** | {result.get('selective_accuracy')} | {METRIC_DEFINITIONS['selective_accuracy']} |",
        f"| **Abstention Coverage** | {result.get('abstention_coverage')} | {METRIC_DEFINITIONS['abstention_coverage']} |",
        f"| **False Confident Diagnosis Rate** | {result.get('false_confident_diagnosis_rate')} | {METRIC_DEFINITIONS['false_confident_diagnosis_rate']} |",
        f"| **Unsupported Abstention Accuracy** | {result.get('unsupported_abstention_accuracy')} | {METRIC_DEFINITIONS['unsupported_abstention_accuracy']} |",
        f"| **Unsupported Conclusion Rate** | {result.get('unsupported_conclusion_rate')} | {METRIC_DEFINITIONS['unsupported_conclusion_rate']} |",
        "",
    ]

    # Per-scenario breakdown
    per_scen = result.get('per_scenario_results', {})
    if per_scen:
        lines.extend([
            "## 3. Per-Scenario Results",
            "| Scenario ID | Total Runs | Top-1 Matches | Abstentions | Accuracy |",
            "|---|---|---|---|---|",
        ])
        for scen, data in sorted(per_scen.items()):
            lines.append(f"| `{scen}` | {data.get('total_runs')} | {data.get('top1_matches')} | {data.get('abstentions')} | {data.get('accuracy')} |")
        lines.append("")

    # Per-class precision & recall
    if per_class:
        lines.extend([
            "## 4. Per-Class Precision & Recall",
            "| Class | Support | True Positives | False Positives | False Negatives | Precision | Recall |",
            "|---|---|---|---|---|---|---|",
        ])
        for c, data in sorted(per_class.items()):
            prec_str = str(data.get('precision')) if data.get('precision') is not None else "N/A"
            rec_str = str(data.get('recall')) if data.get('recall') is not None else "N/A"
            lines.append(f"| `{c}` | {data.get('support')} | {data.get('true_positives')} | {data.get('false_positives')} | {data.get('false_negatives')} | {prec_str} | {rec_str} |")
        lines.append("")

    # Confusion matrix
    if conf_mat:
        all_pred_classes = sorted({col for cols in conf_mat.values() for col in cols.keys()})
        lines.extend([
            "## 5. Confusion Matrix",
            "| Actual \\ Predicted | " + " | ".join(f"`{c}`" for c in all_pred_classes) + " |",
            "|---|" + "|".join("---" for _ in all_pred_classes) + "|",
        ])
        for actual, row in sorted(conf_mat.items()):
            row_str = " | ".join(str(row.get(col, 0)) for col in all_pred_classes)
            lines.append(f"| `{actual}` | {row_str} |")
        lines.append("")

    # Multi-fault evaluation
    if multi_fault:
        lines.extend([
            "## 6. Multi-Fault Scenario Evaluation (Exact-Set)",
            f"- **Evaluated Multi-Fault Cases**: {multi_fault.get('cases_count')}",
            f"- **Exact-Set Match Accuracy**: {multi_fault.get('exact_set_accuracy')}",
            f"- **Mean Jaccard Similarity**: {multi_fault.get('mean_jaccard_similarity')}",
            "",
        ])

    # Optional model comparison
    if opt_model:
        lines.extend([
            "## 7. Baseline vs. Bernoulli Naive Bayes Model Comparison",
            "| Metric | Deterministic Rule Baseline | Bernoulli Naive Bayes (Optional) |",
            "|---|---|---|",
            f"| **Top-1 Accuracy** | {result.get('top1_accuracy')} | {opt_model.get('top1_accuracy')} |",
            f"| **Top-3 Accuracy** | {result.get('top3_accuracy')} | {opt_model.get('top3_accuracy')} |",
            f"| **MRR** | {result.get('mrr')} | {opt_model.get('mrr')} |",
            f"| **Unsupported Abstention Accuracy** | {result.get('unsupported_abstention_accuracy')} | {opt_model.get('unsupported_abstention_accuracy')} |",
            f"| **Fault-Case Abstention Rate** | {result.get('fault_case_abstention_rate')} | {opt_model.get('fault_case_abstention_rate')} |",
            "",
            "> [!NOTE]",
            "> The Bernoulli Naive Bayes model is evaluated on identical held-out runs. Features are coarse symptoms without candidate link labels.",
            "",
        ])

    lines.extend([
        "## 8. Metric Definitions",
        "| Metric | Formula / Meaning |",
        "|---|---|",
    ])
    for m, definition in sorted(METRIC_DEFINITIONS.items()):
        lines.append(f"| `{m}` | {definition} |")

    lines.extend([
        "",
        "---",
        "*Benchmark metrics generated automatically by NETSCOPE evaluation harness.*",
    ])

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('jsonl', type=Path, help='Path to JSON Lines file with labeled runs')
    parser.add_argument('--model', type=Path, help='Optional trained model JSON for separate held-out comparison')
    parser.add_argument('--markdown', action='store_true', help='Output human-readable Markdown report instead of raw JSON')
    parser.add_argument('--report-file', type=Path, help='Save Markdown report to specified file')
    args = parser.parse_args()

    records = [json.loads(line) for line in args.jsonl.read_text(encoding='utf-8').splitlines() if line.strip()]
    result = evaluate(records)

    if args.model:
        result['optional_model'] = evaluate_optional_model(records, load_model(args.model))

    if args.report_file:
        md_text = generate_markdown_report(result)
        args.report_file.parent.mkdir(parents=True, exist_ok=True)
        args.report_file.write_text(md_text, encoding='utf-8')
        print(f"Report written to {args.report_file}", file=sys.stderr)

    if args.markdown:
        print(generate_markdown_report(result))
    else:
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
