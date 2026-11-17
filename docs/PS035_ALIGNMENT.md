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

## Optional model comparison

The rule baseline remains the primary diagnosis. A standard-library Bernoulli Naive
Bayes comparison can be trained from non-held-out records created with
`tools/label_run.py`; the trainer ignores records marked held out and requires at
least three usable runs for each of two fault-link classes plus a no-supported-fault
class by default. Example:

```sh
python tools/train_optional_model.py /secure/training-runs.jsonl /secure/netscope-model.json
NETSCOPE_DIAGNOSIS_MODEL=/secure/netscope-model.json python -m app.api.main
python tools/evaluate_runs.py /secure/held-out-runs.jsonl --model /secure/netscope-model.json
```

Keep model files and labeled runs outside public/static directories and do not commit
private telemetry. The model uses coarse finding, router, log, coverage and probe
features; it never consumes the expected link label or a pre-ranked candidate. It
reports comparative relative scores, not calibrated probabilities, and abstains if
there is no usable known evidence or the no-fault class ranks first. The API falls
back to the rule baseline if no model is configured or a model cannot be loaded.
Model quality remains unverified until independent held-out lab runs are collected.

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

## Completion gates

The requested software components are implemented: the five-node instrumented lab,
five guarded seeded faults, topology/log/probe collection, rule-based ranked evidence,
unsupported-conclusion behavior, optional model comparison, benchmark/evaluation
tools, and mentor demo material. Remaining proof is operational rather than a claim
about code availability: run and restore each seeded fault on the Ubuntu VM, collect
repeated non-held-out training examples, collect a separate independent held-out set,
and review its measured baseline/model results before publishing accuracy.

The PDF's GitHub collaboration deliverable is also an owner-side action. This checkout
currently points at `Loki-7865/A3-PS035-TC262`; the statement asks for a private
repository, `aiori-hackathon` collaborator access, and ownership transfer to that
organization after acceptance. No ownership or access change has been made by these
code changes. The proposal-only asynchronous syslog receiver and loopback probe mesh
in the README are future extensions, not additional PS-035 key requirements.
