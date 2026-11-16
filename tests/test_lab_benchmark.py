import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
import json

from app.topology import load_topology
from tools.run_lab_benchmark import operational_signature, recovery_matches, run_benchmark, verify_scenario_recovery


def snapshot(interface_override=None, neighbor_override=None, omit_neighbor=False):
    interface_override = interface_override or {}
    neighbor_override = neighbor_override or {}
    topology = load_topology()
    routers = {router["id"]: {"router": router["id"], "interface_state": {"output": ""}, "bgp": {"output": ""}} for router in topology["routers"]}
    interfaces = {name: [] for name in routers}
    neighbors = {name: [] for name in routers}
    for link in topology["links"]:
        for side, other in (("a", "b"), ("b", "a")):
            name = link[side]
            interfaces[name].append((link[f"{side}_endpoint"]["interface"], "UP"))
            peer = link[other]
            neighbors[name].append((link[f"{other}_endpoint"]["address"], 65000 + int(peer[1:])))
    for name in routers:
        routers[name]["interface_state"]["output"] = "\n".join(
            f"{interface} {interface_override.get((name, interface), state)}" for interface, state in interfaces[name]
        )
        rows = []
        for ip, remote_as in neighbors[name]:
            if omit_neighbor and name == "r1":
                continue
            state = neighbor_override.get((name, ip), "4")
            rows.append(f"{ip} 4 {remote_as} 10 10 0 0 0 00:00:10 {state} 5 N/A")
        routers[name]["bgp"]["output"] = "\n".join(rows)
    return {"topology": topology, "routers": list(routers.values())}


class LabBenchmarkTests(unittest.TestCase):
    def test_recovery_signature_ignores_counters_but_compares_interface_and_peer_state(self):
        baseline = snapshot()
        recovered = snapshot()
        self.assertTrue(recovery_matches(baseline, recovered))
        interface = ("r2", "eth2")
        self.assertFalse(recovery_matches(baseline, snapshot({interface: "DOWN"})))
        neighbor = ("r1", "10.0.12.2")
        self.assertFalse(recovery_matches(baseline, snapshot(neighbor_override={neighbor: "Active"})))

    def test_missing_expected_observation_prevents_recovery_claim(self):
        with self.assertRaisesRegex(ValueError, "lacks expected"):
            operational_signature(snapshot(omit_neighbor=True))

    def test_delay_scenario_requires_netem_qdisc_removal(self):
        class Result:
            returncode = 0
            stdout = "qdisc noqueue 0: root refcnt 2\\n"

        self.assertTrue(verify_scenario_recovery("degraded_r2_r4", snapshot(), snapshot(), runner=lambda *_args, **_kwargs: Result()))
        Result.stdout = "qdisc netem 10: root delay 200ms loss 20%\\n"
        self.assertFalse(verify_scenario_recovery("degraded_r2_r4", snapshot(), snapshot(), runner=lambda *_args, **_kwargs: Result()))

    def test_benchmark_orders_apply_restore_and_recovery_before_label_append(self):
        events = []
        samples = iter([snapshot(), snapshot(), snapshot()])

        def collect(_directory):
            events.append("collect")
            return next(samples), Path("/tmp/run.json")

        def apply(scenario):
            events.append(f"apply:{scenario}")
            return 0

        def restore(scenario):
            events.append(f"restore:{scenario}")
            return 0

        with TemporaryDirectory() as directory:
            manifest = run_benchmark(
                ["bgp_r1_r2_shutdown"], Path(directory), collector=collect,
                apply_fault=apply, restore_fault=restore,
                diagnosis_builder=lambda _snapshot: {"candidate_root_causes": [], "diagnosis_status": "insufficient_evidence"},
                collection_complete=lambda _snapshot: True, lab_verifier=lambda: events.append("verify"),
                recovery_checker=lambda _scenario, before, after: recovery_matches(before, after),
            )
            self.assertEqual([row["scenario_id"] for row in map(json.loads, manifest.read_text().splitlines())], ["healthy_baseline", "bgp_r1_r2_shutdown"])
        self.assertEqual(events, ["verify", "collect", "apply:bgp_r1_r2_shutdown", "collect", "restore:bgp_r1_r2_shutdown", "collect"])

    def test_benchmark_retries_recovery_until_state_matches(self):
        events = []
        samples = iter([snapshot(), snapshot(), snapshot(), snapshot()])
        checks = iter([False, True])

        def collect(_directory):
            events.append("collect")
            return next(samples), Path("/tmp/run.json")

        with TemporaryDirectory() as directory:
            manifest = run_benchmark(
                ["bgp_r1_r2_shutdown"], Path(directory), collector=collect,
                apply_fault=lambda _scenario: events.append("apply") or 0,
                restore_fault=lambda _scenario: events.append("restore") or 0,
                diagnosis_builder=lambda _snapshot: {"candidate_root_causes": [], "diagnosis_status": "insufficient_evidence"},
                collection_complete=lambda _snapshot: True, lab_verifier=lambda: None,
                recovery_checker=lambda *_args: next(checks),
                sleep_fn=lambda delay: events.append(f"wait:{delay:g}"),
            )
            self.assertEqual(len(manifest.read_text().splitlines()), 2)
        self.assertEqual(events, ["collect", "apply", "collect", "restore", "collect", "wait:15", "collect"])

    def test_recovery_timeout_stops_before_appending_fault_label(self):
        events = []
        now = [0]

        def collect(_directory):
            events.append("collect")
            return snapshot(), Path("/tmp/run.json")

        def sleep(delay):
            now[0] += delay

        with TemporaryDirectory() as directory, self.assertRaisesRegex(RuntimeError, "no further faults"):
            run_benchmark(
                ["bgp_r1_r2_shutdown"], Path(directory), collector=collect,
                apply_fault=lambda _scenario: events.append("apply") or 0,
                restore_fault=lambda _scenario: events.append("restore") or 0,
                diagnosis_builder=lambda _snapshot: {"candidate_root_causes": [], "diagnosis_status": "insufficient_evidence"},
                collection_complete=lambda _snapshot: True, lab_verifier=lambda: None,
                recovery_checker=lambda *_args: False, recovery_timeout=10,
                recovery_poll_interval=10, sleep_fn=sleep, clock_fn=lambda: now[0],
            )
        self.assertEqual(events, ["collect", "apply", "collect", "restore", "collect", "collect"])

    def test_failed_apply_still_attempts_restore_and_never_collects_fault_result(self):
        events = []
        samples = iter([snapshot()])

        def collect(_directory):
            events.append("collect")
            return next(samples), Path("/tmp/run.json")

        def apply(_scenario):
            events.append("apply")
            return 1

        def restore(_scenario):
            events.append("restore")
            return 0

        with TemporaryDirectory() as directory, self.assertRaisesRegex(RuntimeError, "apply failed"):
            run_benchmark(
                ["bgp_r1_r2_shutdown"], Path(directory), collector=collect,
                apply_fault=apply, restore_fault=restore,
                diagnosis_builder=lambda _snapshot: {"candidate_root_causes": []},
                collection_complete=lambda _snapshot: True, lab_verifier=lambda: None,
            )
        self.assertEqual(events, ["collect", "apply", "restore"])


if __name__ == "__main__":
    unittest.main()
