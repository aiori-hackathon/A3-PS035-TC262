"""Run fixed seeded faults against the isolated PS-035 Containerlab only."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import stat
import sys
import subprocess
from uuid import uuid4

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.collector.fault_lab import main as fault_lab_main, scenarios, verify_lab
from app.collector.telemetry import collect_snapshot, save_snapshot
from app.topology import load_topology

def operational_signature(snapshot):
    """Capture comparable interface/BGP state while ignoring counters and clocks."""
    topology = snapshot.get("topology") or load_topology()
    interfaces = {}
    neighbors = {}
    for router in snapshot.get("routers", []):
        name = str(router.get("router", "")).lower()
        output = router.get("interface_state", {}).get("output", "")
        for line in output.splitlines():
            fields = line.split()
            if len(fields) >= 2:
                interfaces[(name, fields[0].split("@", 1)[0])] = fields[1].upper()
        bgp_output = router.get("bgp", {}).get("output", "")
        for line in bgp_output.splitlines():
            fields = line.split()
            if len(fields) < 10:
                continue
            try:
                neighbor = str(ipaddress.ip_address(fields[0]))
            except ValueError:
                continue
            if fields[1].isdigit() and fields[2].isdigit():
                neighbors[(name, neighbor)] = fields[9]
    expected_interfaces = {(link[side], link[f"{side}_endpoint"]["interface"]) for link in topology["links"] for side in ("a", "b")}
    expected_neighbors = {(link[side], link[f"{other}_endpoint"]["address"]) for link in topology["links"] for side, other in (("a", "b"), ("b", "a"))}
    if not expected_interfaces.issubset(interfaces) or not expected_neighbors.issubset(neighbors):
        raise ValueError("Snapshot lacks expected interface or BGP observations; recovery cannot be verified.")
    return {
        "interfaces": {key: interfaces[key] for key in sorted(expected_interfaces)},
        "neighbors": {key: neighbors[key] for key in sorted(expected_neighbors)},
    }


def recovery_matches(baseline, recovered):
    try:
        return operational_signature(baseline) == operational_signature(recovered)
    except (KeyError, TypeError, ValueError):
        return False


def verify_scenario_recovery(scenario_id, baseline, recovered, runner=subprocess.run):
    if not recovery_matches(baseline, recovered):
        return False
    if scenario_id == "degraded_r2_r4":
        try:
            result = runner(["docker", "exec", "clab-ps035-r2", "tc", "qdisc", "show", "dev", "eth2"],
                            capture_output=True, text=True, timeout=8, check=False)
        except (OSError, subprocess.TimeoutExpired):
            return False
        return result.returncode == 0 and "netem" not in result.stdout.lower()
    return True


def _private_directory(path):
    resolved = Path(path).expanduser().resolve()
    if resolved == PROJECT_ROOT or PROJECT_ROOT in resolved.parents:
        raise ValueError("Benchmark artifacts must be stored outside the Git checkout.")
    if resolved.exists():
        if not resolved.is_dir() or stat.S_IMODE(resolved.stat().st_mode) & 0o077:
            raise ValueError("Existing output directory must be a private directory (mode 700 or stricter).")
    else:
        resolved.mkdir(parents=True, mode=0o700)
    return resolved


def _collect_to(directory):
    snapshot = collect_snapshot()
    path = save_snapshot(snapshot, directory)
    return snapshot, path


def run_benchmark(scenario_ids, output_dir, collector=_collect_to, apply_fault=None, restore_fault=None,
                  diagnosis_builder=None, collection_complete=None, lab_verifier=None, recovery_checker=None):
    """Collect baseline, fault and recovery records; always attempt rollback."""
    if diagnosis_builder is None or collection_complete is None:
        from app.api.main import build_diagnosis, telemetry_collection_complete
        diagnosis_builder = diagnosis_builder or build_diagnosis
        collection_complete = collection_complete or telemetry_collection_complete
    apply_fault = apply_fault or (lambda scenario: fault_lab_main(["apply", scenario, "--confirm-lab", "ps035"]))
    restore_fault = restore_fault or (lambda scenario: fault_lab_main(["restore", scenario, "--confirm-lab", "ps035"]))
    (lab_verifier or verify_lab)()
    baseline, baseline_path = collector(output_dir)
    if not collection_complete(baseline) or diagnosis_builder(baseline)["candidate_root_causes"]:
        raise RuntimeError("Refusing benchmark: baseline collection is incomplete or already has ranked fault candidates.")
    run_records = []
    baseline_id = f"baseline-{uuid4().hex[:12]}"
    run_records.append({"held_out": False, "run_id": baseline_id, "scenario_id": "healthy_baseline",
                        "expected_candidate_link": None, "diagnosis_status": "insufficient_evidence",
                        "diagnosis": diagnosis_builder(baseline)})
    print(f"Baseline saved: {baseline_path}")
    catalog = {item["id"]: item for item in scenarios()}
    for scenario_id in scenario_ids:
        if scenario_id not in catalog:
            raise ValueError(f"Unknown scenario: {scenario_id}")
        fault_snapshot = None
        fault_path = None
        apply_attempted = False
        failure = None
        try:
            apply_attempted = True
            if apply_fault(scenario_id) != 0:
                raise RuntimeError(f"Fault apply failed for {scenario_id}.")
            fault_snapshot, fault_path = collector(output_dir)
        except Exception as error:
            failure = error
        finally:
            if apply_attempted and restore_fault(scenario_id) != 0:
                raise RuntimeError(f"RESTORE FAILED for {scenario_id}. Stop the benchmark and recover the isolated lab manually.") from failure
        if failure:
            raise failure
        recovered, recovered_path = collector(output_dir)
        checker = recovery_checker or (lambda scenario, before, after: verify_scenario_recovery(scenario, before, after))
        if not collection_complete(recovered) or not checker(scenario_id, baseline, recovered):
            raise RuntimeError(f"Recovery check failed after {scenario_id}; no further faults will be applied.")
        diagnosis = diagnosis_builder(fault_snapshot)
        run_id = f"{scenario_id}-{uuid4().hex[:12]}"
        run_records.append({"held_out": False, "run_id": run_id, "scenario_id": scenario_id,
                            "expected_candidate_link": catalog[scenario_id]["expected_link"],
                            "diagnosis_status": diagnosis["diagnosis_status"], "diagnosis": diagnosis})
        print(f"{scenario_id}: fault snapshot {fault_path}; recovery verified {recovered_path}")
    manifest = output_dir / "runs.jsonl"
    flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
    descriptor = os.open(manifest, flags, 0o600)
    try:
        with os.fdopen(descriptor, "a", encoding="utf-8") as stream:
            for record in run_records:
                stream.write(json.dumps(record, separators=(",", ":")) + "\n")
    except Exception:
        raise
    print(f"Appended {len(run_records)} non-held-out labels to {manifest}; reserve independent runs for held-out evaluation.")
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True, help="Private path outside the repository; use /tmp/netscope-benchmark")
    parser.add_argument("--scenario", choices=[item["id"] for item in scenarios()], action="append", help="Repeat for selected scenarios; default runs all five in order")
    parser.add_argument("--confirm-lab", help="Required exact confirmation: ps035")
    parser.add_argument("--dry-run", action="store_true", help="Print the plan without Docker access, collection, or file writes")
    args = parser.parse_args(argv)
    selected = args.scenario or [item["id"] for item in scenarios()]
    if args.dry_run:
        print("Dry run only; no lab or files changed.")
        print("Planned: healthy baseline, then for each scenario apply → collect → restore → compare recovery state.")
        print("Scenarios:", ", ".join(selected))
        return 0
    if args.confirm_lab != "ps035":
        parser.error("running the benchmark requires --confirm-lab ps035")
    try:
        output_dir = _private_directory(args.output_dir)
        old_umask = os.umask(0o077)
        try:
            run_benchmark(selected, output_dir)
        finally:
            os.umask(old_umask)
        return 0
    except (OSError, RuntimeError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
