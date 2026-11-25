import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from tools.evaluate_runs import (
    evaluate,
    evaluate_optional_model,
    ranked_links,
    split_by_injection_run,
    generate_markdown_report,
    extract_run_identifiers,
)
from app.diagnosis.optional_model import train_model, diagnosis_features


class EvaluateRunsTests(unittest.TestCase):

    def test_ranked_links_extracts_strings_and_dicts(self):
        record_with_dicts = {
            "diagnosis": {
                "candidate_root_causes": [
                    {"candidate_link": "R1-R2", "score": 8},
                    {"candidate_link": "R2-R4", "score": 4},
                ]
            }
        }
        self.assertEqual(ranked_links(record_with_dicts), ["R1-R2", "R2-R4"])

        record_with_strings = {
            "diagnosis": {
                "candidate_root_causes": ["R1-R3", "R3-R4"]
            }
        }
        self.assertEqual(ranked_links(record_with_strings), ["R1-R3", "R3-R4"])

        record_with_ranked_hypotheses = {
            "ranked_hypotheses": [
                {"candidate_link": "R4-R5"}
            ]
        }
        self.assertEqual(ranked_links(record_with_ranked_hypotheses), ["R4-R5"])

    def test_evaluate_top1_and_top3_accuracy(self):
        records = [
            # Top-1 match
            {
                "held_out": True,
                "expected_candidate_link": "R2-R4",
                "diagnosis_status": "ranked_hypotheses",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R2-R4"}, {"candidate_link": "R1-R2"}]},
            },
            # Top-2 match (in Top-3, but not Top-1)
            {
                "held_out": True,
                "expected_candidate_link": "R1-R2",
                "diagnosis_status": "ranked_hypotheses",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R3-R4"}, {"candidate_link": "R1-R2"}]},
            },
            # Outside Top-3 match
            {
                "held_out": True,
                "expected_candidate_link": "R4-R5",
                "diagnosis_status": "ranked_hypotheses",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R1-R2"}, {"candidate_link": "R2-R4"}, {"candidate_link": "R3-R4"}, {"candidate_link": "R4-R5"}]},
            },
            # Unsupported case: healthy baseline abstained
            {
                "held_out": True,
                "expected_candidate_link": None,
                "diagnosis_status": "insufficient_evidence",
                "diagnosis": {"candidate_root_causes": []},
            },
            # Non-held-out row: must be ignored
            {
                "held_out": False,
                "expected_candidate_link": "R2-R4",
                "diagnosis_status": "ranked_hypotheses",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R2-R4"}]},
            },
        ]

        result = evaluate(records)

        self.assertEqual(result["held_out_records"], 4)
        self.assertEqual(result["labeled_records"], 4)
        self.assertEqual(result["fault_cases"], 3)
        # 1 out of 3 is Top-1 (33.33%)
        self.assertEqual(result["top1_accuracy"], 0.3333)
        # 2 out of 3 is in Top-3 (66.67%)
        self.assertEqual(result["top3_accuracy"], 0.6667)
        # MRR: (1/1 + 1/2 + 1/4) / 3 = 1.75 / 3 = 0.5833
        self.assertEqual(result["mrr"], 0.5833)
        self.assertEqual(result["mean_reciprocal_rank"], 0.5833)
        self.assertEqual(result["unsupported_cases"], 1)
        self.assertEqual(result["unsupported_conclusion_rate"], 0.0)
        self.assertEqual(result["unsupported_abstention_accuracy"], 1.0)
        self.assertEqual(result["fault_case_abstention_rate"], 0.0)

    def test_evaluate_unsupported_false_conclusion_and_false_abstention(self):
        records = [
            # False conclusion: expected None, but model produced candidate
            {
                "held_out": True,
                "expected_candidate_link": None,
                "diagnosis_status": "ranked_hypotheses",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R1-R2"}]},
            },
            # False abstention: expected R2-R4, but model abstained with explicit outcome
            {
                "held_out": True,
                "expected_candidate_link": "R2-R4",
                "diagnosis_status": "insufficient_evidence",
                "outcome": "INSUFFICIENT_TELEMETRY",
                "diagnosis": {"candidate_root_causes": []},
            },
            # Correct abstention with AMBIGUOUS_HYPOTHESES
            {
                "held_out": True,
                "expected_candidate_link": None,
                "outcome": "AMBIGUOUS_HYPOTHESES",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R1-R2"}, {"candidate_link": "R3-R4"}]},
            },
        ]

        result = evaluate(records)
        self.assertEqual(result["unsupported_cases"], 2)
        self.assertEqual(result["unsupported_conclusion_rate"], 0.5)
        self.assertEqual(result["unsupported_abstention_accuracy"], 0.5)
        self.assertEqual(result["fault_cases"], 1)
        self.assertEqual(result["fault_case_abstention_rate"], 1.0)
        self.assertEqual(result["top1_accuracy"], 0.0)
        self.assertEqual(result["top3_accuracy"], 0.0)
        self.assertEqual(result["mrr"], 0.0)

    def test_evaluate_requires_held_out_and_labeled_records(self):
        with self.assertRaisesRegex(ValueError, "No records marked held_out=true"):
            evaluate([{"held_out": False, "expected_candidate_link": "R1-R2"}])

        with self.assertRaisesRegex(ValueError, "Held-out records need expected_candidate_link"):
            evaluate([{"held_out": True}])

    def test_evaluate_optional_model_comparison(self):
        def sample(label, kind, router, held_out=False):
            return {
                "held_out": held_out,
                "expected_candidate_link": label,
                "diagnosis": {
                    "findings": ([{"type": kind, "router": router, "severity": "CRITICAL"}] if kind else []),
                    "syslog_events": [],
                    "coverage": {"routers_collected": 5, "routers_total": 5, "links_measured": 5, "links_total": 5},
                    "measurements": [{"observations": [{"router": "R5", "available": True, "packet_loss_percent": 0, "rtt_avg_ms": 2}]}],
                },
            }

        training = [
            sample("R1-R2", "BGP_SESSION_NOT_ESTABLISHED", "R1"),
            sample("R1-R2", "BGP_SESSION_NOT_ESTABLISHED", "R1"),
            sample("R1-R2", "BGP_SESSION_NOT_ESTABLISHED", "R1"),
            sample("R2-R4", "INTERFACE_NOT_UP", "R2"),
            sample("R2-R4", "INTERFACE_NOT_UP", "R2"),
            sample("R2-R4", "INTERFACE_NOT_UP", "R2"),
            sample(None, "", ""),
            sample(None, "", ""),
            sample(None, "", ""),
        ]
        model = train_model(training)

        held_out = [
            sample("R1-R2", "BGP_SESSION_NOT_ESTABLISHED", "R1", held_out=True),
            sample(None, "", "", held_out=True),
        ]

        metrics = evaluate_optional_model(held_out, model)
        self.assertEqual(metrics["held_out_records"], 2)
        self.assertEqual(metrics["fault_cases"], 1)
        self.assertEqual(metrics["top1_accuracy"], 1.0)
        self.assertEqual(metrics["mrr"], 1.0)
        self.assertEqual(metrics["mean_reciprocal_rank"], 1.0)
        self.assertEqual(metrics["unsupported_cases"], 1)
        self.assertEqual(metrics["unsupported_abstention_accuracy"], 1.0)

    def test_extract_run_identifiers(self):
        record = {
            "scenario_id": "link_r2_r4_down",
            "injection_run_id": "inj-run-001",
            "snapshot_id": "snap-001",
            "ground_truth_label": "R2-R4",
        }
        extracted = extract_run_identifiers(record)
        self.assertEqual(extracted["scenario_id"], "link_r2_r4_down")
        self.assertEqual(extracted["injection_run_id"], "inj-run-001")
        self.assertEqual(extracted["snapshot_id"], "snap-001")
        self.assertEqual(extracted["ground_truth_label"], "R2-R4")

    def test_run_level_isolation_in_data_splitting(self):
        # 3 independent runs of scenario A, each with 2 snapshots
        records = []
        for run_idx in range(1, 4):
            run_id = f"run-A-{run_idx}"
            for snap_idx in range(1, 3):
                records.append({
                    "scenario_id": "scen_a",
                    "injection_run_id": run_id,
                    "snapshot_id": f"snap-{run_idx}-{snap_idx}",
                    "expected_candidate_link": "R1-R2",
                })

        split = split_by_injection_run(records, test_ratio=0.33, min_runs_per_class=2, seed=42)
        self.assertTrue(split["is_sufficient"])

        train_runs = {r["injection_run_id"] for r in split["train_records"]}
        held_out_runs = {r["injection_run_id"] for r in split["held_out_records"]}

        # Run-level isolation: NO overlap of injection_run_id between train and held-out!
        self.assertEqual(len(train_runs.intersection(held_out_runs)), 0)
        self.assertEqual(len(train_runs) + len(held_out_runs), 3)

        # Snapshots from the same injection run stayed together
        for r_id in train_runs:
            matching = [r for r in split["train_records"] if r["injection_run_id"] == r_id]
            self.assertEqual(len(matching), 2)
        for r_id in held_out_runs:
            matching = [r for r in split["held_out_records"] if r["injection_run_id"] == r_id]
            self.assertEqual(len(matching), 2)

    def test_label_leakage_prevention(self):
        sample = {
            "held_out": True,
            "expected_candidate_link": "R2-R4",
            "ground_truth_label": "R2-R4",
            "scenario_id": "link_r2_r4_down",
            "diagnosis": {
                "findings": [{"type": "INTERFACE_NOT_UP", "router": "R2", "severity": "CRITICAL"}],
                "measurements": [],
            },
        }
        features = diagnosis_features(sample)
        # Ground-truth link and scenario ID must NOT appear in feature vocabulary
        for feat in features:
            self.assertNotIn("r2_r4", feat)
            self.assertNotIn("link_r2_r4_down", feat)
            self.assertNotIn("expected", feat)

    def test_abstention_selective_accuracy_and_false_confident_rate(self):
        records = [
            # Run 1: Confident and correct
            {
                "held_out": True,
                "expected_candidate_link": "R1-R2",
                "diagnosis_status": "ranked_hypotheses",
                "outcome": "DIAGNOSIS",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R1-R2"}]},
            },
            # Run 2: Confident but incorrect (false confident)
            {
                "held_out": True,
                "expected_candidate_link": "R2-R4",
                "diagnosis_status": "ranked_hypotheses",
                "outcome": "DIAGNOSIS",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R1-R2"}]},
            },
            # Run 3: Abstained correctly (healthy network)
            {
                "held_out": True,
                "expected_candidate_link": None,
                "diagnosis_status": "insufficient_evidence",
                "outcome": "INSUFFICIENT_EVIDENCE",
                "diagnosis": {"candidate_root_causes": []},
            },
            # Run 4: Abstained on fault due to missing telemetry
            {
                "held_out": True,
                "expected_candidate_link": "R3-R4",
                "diagnosis_status": "insufficient_evidence",
                "outcome": "INSUFFICIENT_TELEMETRY",
                "diagnosis": {"candidate_root_causes": []},
            },
        ]

        result = evaluate(records)

        # 4 total records; 2 non-abstained, 2 abstained
        self.assertEqual(result["labeled_records"], 4)
        self.assertEqual(result["abstention_coverage"], 0.5)  # 2 / 4
        self.assertEqual(result["abstention_rate"], 0.5)      # 2 / 4

        # Selective accuracy: of the 2 non-abstained runs, 1 was correct = 0.5 (50%)
        self.assertEqual(result["selective_accuracy"], 0.5)

        # False confident diagnosis rate: 1 of 2 non-abstained was incorrect = 0.5 (50%)
        self.assertEqual(result["false_confident_diagnosis_rate"], 0.5)

    def test_multi_fault_exact_set_evaluation(self):
        records = [
            # Exact match: both links predicted in top-2
            {
                "held_out": True,
                "ground_truth_label": ["R1-R2", "R2-R4"],
                "diagnosis_status": "ranked_hypotheses",
                "outcome": "DIAGNOSIS",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R1-R2"}, {"candidate_link": "R2-R4"}]},
            },
            # Partial match: only 1 of 2 links in top-2
            {
                "held_out": True,
                "ground_truth_label": ["R1-R2", "R2-R4"],
                "diagnosis_status": "ranked_hypotheses",
                "outcome": "DIAGNOSIS",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R1-R2"}, {"candidate_link": "R3-R4"}]},
            },
        ]

        result = evaluate(records)
        multi = result["multi_fault_evaluation"]
        self.assertIsNotNone(multi)
        self.assertEqual(multi["cases_count"], 2)
        # 1 exact match out of 2 = 50%
        self.assertEqual(multi["exact_set_matches"], 1)
        self.assertEqual(multi["exact_set_accuracy"], 0.5)
        # Jaccard: case 1 = 1.0 (2/2), case 2 = 1/3 = 0.3333 -> mean = 0.6667
        self.assertAlmostEqual(multi["mean_jaccard_similarity"], 0.6667, places=3)

    def test_insufficient_datasets_disclosure(self):
        # Scenario with only 1 run (cannot be safely split without leakage)
        records = [
            {
                "scenario_id": "sparse_scenario",
                "injection_run_id": "single-run-001",
                "snapshot_id": "snap-001",
                "expected_candidate_link": "R1-R2",
            }
        ]

        split = split_by_injection_run(records, min_runs_per_class=2)
        self.assertFalse(split["is_sufficient"])
        self.assertEqual(len(split["disclosures"]), 1)
        self.assertIn("sparse_scenario", split["disclosures"][0])
        self.assertIn("Disclosing limitation rather than manufacturing artificial runs", split["disclosures"][0])

    def test_markdown_report_generation(self):
        records = [
            {
                "held_out": True,
                "expected_candidate_link": "R1-R2",
                "diagnosis_status": "ranked_hypotheses",
                "outcome": "DIAGNOSIS",
                "diagnosis": {"candidate_root_causes": [{"candidate_link": "R1-R2"}]},
            },
            {
                "held_out": True,
                "expected_candidate_link": None,
                "diagnosis_status": "insufficient_evidence",
                "outcome": "INSUFFICIENT_EVIDENCE",
                "diagnosis": {"candidate_root_causes": []},
            },
        ]

        result = evaluate(records)
        report = generate_markdown_report(result)

        self.assertIn("# NETSCOPE Diagnostic Engine Benchmark Report", report)
        self.assertIn("Top-1 Accuracy", report)
        self.assertIn("Mean Reciprocal Rank", report)
        self.assertIn("Selective Accuracy", report)
        self.assertIn("Confusion Matrix", report)
        self.assertIn("Metric Definitions", report)
        # Verify metric value is present in report
        self.assertIn(str(result["top1_accuracy"]), report)


if __name__ == "__main__":
    unittest.main()
