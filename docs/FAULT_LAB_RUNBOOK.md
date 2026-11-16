# PS-035 fault-lab runbook

This procedure is for the isolated five-router `ps035` Containerlab only. It is
designed to collect one healthy baseline, apply one fixed scenario, collect the
observations, restore it, and verify recovery before proceeding. **Never point the
fault controller at venue, campus, customer, or production routers.** The hosted API
does not run the collector or fault controller.

## Before starting

1. Use the Ubuntu lab VM that owns the Containerlab Docker daemon. Do not run these
   commands from the public Render service or against an unfamiliar Docker context.
2. Confirm the lab is isolated and you have a second access path to the VM. Stop if
   the VM disk is critically low, the Docker context is unexpected, or a container
   name differs from `clab-ps035-r1` through `clab-ps035-r5`.
3. Run the read-only checks from the repository root:

   ```sh
   python -m app.collector.fault_lab list
   python -m app.collector.fault_lab check
   ```

   `check` only inspects the five fixed container states. If it fails, do not apply
   a scenario. Do not start/redeploy the topology as part of a fault run.
4. Keep run files out of the Git checkout and protect them because they contain
   router observations:

   ```sh
   umask 077
   mkdir -p /tmp/netscope-runs
   ```

## One scenario at a time

1. Collect a healthy snapshot before the first fault:

   ```sh
   python -m app.collector.telemetry --output-dir /tmp/netscope-runs
   ```

   The command prints the saved timestamped JSON path. Check all five routers report
   collection success. Keep a copy of that path for labeling a healthy run.
2. Choose exactly one scenario ID from the catalog. The `apply` command prints its
   corresponding restore command before executing the fixed action:

   ```sh
   python -m app.collector.fault_lab apply link_r2_r4_down --confirm-lab ps035
   ```

3. Immediately collect one snapshot to the protected temporary directory:

   ```sh
   python -m app.collector.telemetry --output-dir /tmp/netscope-runs
   ```

   Ten bounded ICMP packets are sent per direction on each configured adjacency.
   A run can take longer when probes time out. Review the diagnosis and raw snapshot
   locally; do not treat missing log/probe evidence as confirmation.
4. Restore the same scenario before doing anything else:

   ```sh
   python -m app.collector.fault_lab restore link_r2_r4_down --confirm-lab ps035
   ```

   Use the scenario ID printed in the apply command's rollback line. Run `check`,
   collect another snapshot, and verify the target interface/BGP session/route and
   probe results have returned to the pre-fault baseline. If restoration fails,
   stop all further scenarios and recover the lab manually from the verified
   topology configuration.
5. Only after recovery, label the captured fault snapshot. Omit `--held-out` for
   development runs. Reserve separate runs for final evaluation and mark those with
   `--held-out` only after diagnosis tuning has stopped:

   ```sh
   python tools/label_run.py /tmp/netscope-runs/telemetry_TIMESTAMP.json \
     --scenario link_r2_r4_down --run-id run-001 \
     --output /tmp/netscope-heldout.jsonl --held-out
   ```

   Use unique run IDs. The scenario catalog supplies the expected link label. Use
   `--scenario healthy_baseline` for healthy snapshots, whose expected link is null.
6. For repeatable non-held-out collection, the guarded runner can sequence all five
   scenarios and require interface/BGP recovery to match the healthy baseline before
   it proceeds. Run only on the isolated VM, with a protected output directory and
   explicit confirmation. Dry run is safe and does not access Docker:

   ```sh
   python tools/run_lab_benchmark.py --output-dir /tmp/netscope-benchmark --dry-run
   python tools/run_lab_benchmark.py --output-dir /tmp/netscope-benchmark --confirm-lab ps035
   ```

   A full run actively disrupts one lab link/peer at a time. Keep an independent VM
   access path and follow the printed stop/recovery guidance if any rollback fails.
   It appends labeled non-held-out records to `runs.jsonl`; repeat separate runs to
   gather the default minimum of three examples per class before optional-model
   training. Review and reserve independent records as held-out only after tuning.
7. After every scenario and healthy baseline has an independently collected held-out
   record, calculate the metrics:

   ```sh
   python tools/evaluate_runs.py /tmp/netscope-heldout.jsonl
   ```

   For a separately trained optional model comparison, first train on non-held-out
   records outside the repository and then pass the model explicitly:

   ```sh
   python tools/train_optional_model.py /tmp/netscope-training.jsonl /tmp/netscope-model.json
   python tools/evaluate_runs.py /tmp/netscope-heldout.jsonl --model /tmp/netscope-model.json
   ```

   The evaluator reports only the labels supplied. Keep the scenario/run manifest,
   collection timestamp, restore verification and reviewer notes with the results.

## Expected signals (not guarantees)

| Scenario | Primary expected evidence | Independent cross-check |
| --- | --- | --- |
| `link_r2_r4_down` | R2 `eth2` down; R2-R4 probe loss | BGP peer symptoms on the adjacency |
| `bgp_r1_r2_shutdown` | R1 peer `10.0.12.2` not established | Interface up and ICMP reachability may remain normal |
| `route_r5_withdrawal` | Reduced/zero prefixes from R5 at R4 | R4-R5 interface and ping can remain healthy |
| `degraded_r2_r4` | Elevated RTT; sampled packet loss may vary | Compare both probe directions and the healthy baseline |
| `link_r3_r4_down` | R3 `eth2` down; R3-R4 probe loss | BGP peer symptoms on the adjacency |

Logs are best-effort because the image may not retain events in Docker logs. A fault
can therefore be diagnosable without a matching log event. Container interface
names, FRR output, and `tc netem` availability must be checked against the actual
lab image before a presentation; this workstation did not run any apply/restore
command as part of preparing this runbook.

## Safety and cleanup

- Never run two faults concurrently. Never run a second scenario before successful
  restoration and a healthy follow-up collection.
- If the process is interrupted after apply, execute the printed restore command
  first. For `degraded_r2_r4`, verify `tc qdisc show dev eth2` on R2 no longer shows
  the injected `netem` rule.
- Keep snapshots and held-out labels under `/tmp` or another access-controlled
  location; they may contain topology, routing state and log excerpts.
- Remove temporary run data after preserving only the approved, sanitized evaluation
  records. Do not delete unrelated files or perform broad VM cleanup.
