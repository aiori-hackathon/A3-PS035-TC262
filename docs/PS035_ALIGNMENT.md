# PS-035 lab and evaluation workflow

NETSCOPE uses the five-node topology in `lab/topology.json` for inventory, collection,
active adjacency probes, and diagnosis. `app/collector/telemetry.py` gathers bounded
BGP, interface, recent container log, and ping observations. Missing probe/log data
is retained as missing evidence; the diagnostic output is a ranked hypothesis and
topology-based impact estimate, not a guaranteed root cause or a physical-layer test.

## Seeded lab scenarios

`lab/fault_scenarios.json` defines five labeled cases: two interface outages, a BGP
peer shutdown, a prefix withdrawal, and delay/loss. The catalog is not a claim that
these scenarios have been executed or evaluated. To inspect it, run:

```sh
python -m app.collector.fault_lab list
```

Applying and restoring a scenario requires an explicit scenario ID plus
`--confirm-lab ps035`; the helper verifies that all five configured `clab-ps035-*`
containers are running and executes only a fixed command for that scenario. It does
not accept shell snippets or arbitrary container names. Always keep the printed
restore command available and collect a healthy baseline after restoration. Do not
point this tool at venue or production routers.

## Held-out evaluation

Keep training/demo examples separate from the held-out JSON Lines file. Each line is
one labeled, independently collected run:

```json
{"held_out":true,"expected_candidate_link":"R2-R4","diagnosis_status":"ranked_hypotheses","diagnosis":{"candidate_root_causes":[{"candidate_link":"R2-R4"},{"candidate_link":"R1-R2"}]}}
{"held_out":true,"expected_candidate_link":null,"diagnosis_status":"insufficient_evidence","diagnosis":{"candidate_root_causes":[]}}
```

Use `expected_candidate_link: null` only when the reference review concludes that
available evidence should not support a specific link fault. Evaluate with:

```sh
python tools/evaluate_runs.py path/to/held-out-runs.jsonl
```

For collected snapshots, `tools/label_run.py` creates a diagnosis record using the
scenario's expected link label. See `docs/FAULT_LAB_RUNBOOK.md` for the baseline,
apply, collect, restore and recovery sequence. Keep the held-out flag off while
tuning; reserve independent runs for final evaluation.

The report includes Top-1/Top-3 accuracy for labeled fault cases, unsupported
conclusion rate and abstention accuracy for no-supported-fault cases, plus the rate
at which fault cases were left unsupported. It reports only the supplied labels;
record scenario, run ID, timestamp, fault application/restore verification, and
reviewer separately so repeated or contaminated runs can be excluded. Do not publish
accuracy claims until a held-out set has actually been collected and checked.

## Interpretation boundaries

- A successful ping verifies ICMP reachability for that probe and time only; it does
  not prove physical link health or application service reachability.
- Syslog parsing is best-effort and depends on available container logs. Missing log
  events are not evidence that no event occurred.
- Link scoring is a transparent rule baseline. Scores are ranking weights, not
  calibrated probabilities.
- Impact analysis removes sufficiently supported candidate links from the configured
  graph; it estimates alternate paths and does not validate forwarding or prefixes.
- Live collection and fault application require a suitable isolated lab runtime and
  explicit operator action. The hosted read-only API never invokes Docker or this
  fault controller.
