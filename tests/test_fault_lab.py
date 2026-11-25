import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.collector.fault_lab import main as fault_lab_main, verify_lab, scenarios, FAULTS
from tools.label_run import main as label_run_main
from tests.test_diagnosis import make_healthy_snapshot


class FaultLabTests(unittest.TestCase):

    def test_scenarios_catalog_defines_all_five_faults(self):
        catalog = scenarios()
        self.assertEqual(len(catalog), 5)
        scenario_ids = {s["id"] for s in catalog}
        expected_ids = {
            "link_r2_r4_down",
            "bgp_r1_r2_shutdown",
            "route_r5_withdrawal",
            "degraded_r2_r4",
            "link_r3_r4_down",
        }
        self.assertEqual(scenario_ids, expected_ids)
        # All scenario IDs must have defined fixed commands
        self.assertTrue(all(s_id in FAULTS for s_id in scenario_ids))
        for s in catalog:
            self.assertIn("expected_link", s)
            self.assertIn("description", s)
            self.assertIn("target", s)

    def test_verify_lab_succeeds_when_all_five_containers_running(self):
        class MockResult:
            returncode = 0
            stdout = "true\n"

        def mock_runner(cmd, **_kwargs):
            return MockResult()

        # Should not raise
        verify_lab(runner=mock_runner)

    def test_verify_lab_fails_when_any_container_not_running(self):
        class MockResult:
            def __init__(self, running):
                self.returncode = 0 if running else 1
                self.stdout = "true\n" if running else "false\n"

        def mock_runner(cmd, **_kwargs):
            container = cmd[-1]
            return MockResult(running=(container != "clab-ps035-r3"))

        with self.assertRaisesRegex(RuntimeError, "expected running lab container clab-ps035-r3"):
            verify_lab(runner=mock_runner)

    def test_cli_list_action(self):
        with patch("sys.stdout") as mock_stdout:
            exit_code = fault_lab_main(["list"])
            self.assertEqual(exit_code, 0)

    def test_cli_check_action_success_and_failure(self):
        with patch("app.collector.fault_lab.verify_lab", return_value=None):
            self.assertEqual(fault_lab_main(["check"]), 0)

        with patch("app.collector.fault_lab.verify_lab", side_effect=RuntimeError("Lab missing")):
            self.assertEqual(fault_lab_main(["check"]), 2)

    def test_cli_apply_requires_exact_lab_confirmation(self):
        with self.assertRaises(SystemExit):
            fault_lab_main(["apply", "link_r2_r4_down"])

        with self.assertRaises(SystemExit):
            fault_lab_main(["apply", "link_r2_r4_down", "--confirm-lab", "wrong_lab"])

    def test_cli_apply_and_restore_fixed_commands(self):
        executed_cmds = []

        def mock_sub_run(cmd, **_kwargs):
            executed_cmds.append(cmd)
            class Res:
                returncode = 0
            return Res()

        with patch("app.collector.fault_lab.verify_lab", return_value=None), \
             patch("subprocess.run", side_effect=mock_sub_run):
            # Apply link_r2_r4_down
            code_apply = fault_lab_main(["apply", "link_r2_r4_down", "--confirm-lab", "ps035"])
            self.assertEqual(code_apply, 0)
            self.assertEqual(len(executed_cmds), 1)
            self.assertEqual(executed_cmds[0], ["docker", "exec", "clab-ps035-r2", "ip", "link", "set", "dev", "eth2", "down"])

            # Restore link_r2_r4_down
            code_restore = fault_lab_main(["restore", "link_r2_r4_down", "--confirm-lab", "ps035"])
            self.assertEqual(code_restore, 0)
            self.assertEqual(len(executed_cmds), 2)
            self.assertEqual(executed_cmds[1], ["docker", "exec", "clab-ps035-r2", "ip", "link", "set", "dev", "eth2", "up"])


class LabelRunTests(unittest.TestCase):

    def test_label_run_appends_record_with_expected_link(self):
        snapshot_data = make_healthy_snapshot()
        with TemporaryDirectory() as tmpdir:
            snap_path = Path(tmpdir) / "snapshot.json"
            snap_path.write_text(json.dumps(snapshot_data), encoding="utf-8")
            out_path = Path(tmpdir) / "runs.jsonl"

            # Label as link_r2_r4_down (expected link R2-R4)
            with patch("sys.argv", ["label_run.py", str(snap_path), "--scenario", "link_r2_r4_down", "--run-id", "test-run-1", "--output", str(out_path), "--held-out"]):
                label_run_main()

            # Label as healthy_baseline (expected link None)
            with patch("sys.argv", ["label_run.py", str(snap_path), "--scenario", "healthy_baseline", "--run-id", "test-run-2", "--output", str(out_path)]):
                label_run_main()

            records = [json.loads(line) for line in out_path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(len(records), 2)

            self.assertTrue(records[0]["held_out"])
            self.assertEqual(records[0]["scenario_id"], "link_r2_r4_down")
            self.assertEqual(records[0]["expected_candidate_link"], "R2-R4")

            self.assertFalse(records[1]["held_out"])
            self.assertEqual(records[1]["scenario_id"], "healthy_baseline")
            self.assertIsNone(records[1]["expected_candidate_link"])


if __name__ == "__main__":
    unittest.main()
