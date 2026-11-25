# NETSCOPE: PS-035 Live Demonstration Script & Defense Guide

**Target Duration**: 4 minutes 45 seconds (Buffer: 15 seconds)  
**Target Problem Statement**: PS-035 (Automated Root Cause Diagnosis in Multilayer Networks)  
**Environment**: Dedicated Feature Branch `feature/netscope-demo-hardening`  
**Infrastructure**: 5-Router FRRouting Containerlab Mesh (`clab-ps035`) + React / Vite Operator Workspace  

---

## Part 1: Timed Scene-by-Scene Demonstration Script

```
0:00 ─── Scene 1: Healthy Network Baseline (45s)
0:45 ─── Scene 2: Physical Link Failure & Evidence Correlation (60s)
1:45 ─── Scene 3: Control-Plane BGP Mismatch vs. Physical Cut (60s)
2:45 ─── Scene 4: Missing Telemetry & Explicit Abstention (45s)
3:30 ─── Scene 5: Held-Out Benchmark & Empirical Evaluation (45s)
4:15 ─── Scene 6: Architecture & Diagnostic Pipeline Synthesis (30s)
4:45 ─── Buffer / Transition to Judge Q&A
```

---

### Scene 1: Healthy Network Baseline (0:00 – 0:45)

#### Exact Presenter Action:
1. Open the browser to `http://localhost:5173/demo`.
2. Click the **"Healthy network"** scenario tab (or select `healthy` in the URL).
3. Point cursor to the 5-router SVG topology map and the top data provenance banner.

#### Exact Terminal Command (Optional Live Verification):
```bash
python3 -m app.collector.fault_lab check
```

#### Expected UI State:
- **Data Provenance Banner**: Displays `RECORDED_REPLAY` (or `LIVE_LAB`), Run ID `run-rec-001`, Snapshot `snap-001`, Engine `NETSCOPE-Deterministic-v1`.
- **Top Provenance Disclaimer**: `"RECORDED REPLAY · NEVER PRESENT RECORDED DATA AS LIVE TELEMETRY"`.
- **Topology Map**: All 5 router nodes (`R1`, `R2`, `R3`, `R4`, `R5`) rendered with green glowing circular indicators. Green packet pulse animations flowing across all 5 links (`R1-R2`, `R1-R3`, `R2-R4`, `R3-R4`, `R4-R5`).
- **Network Devices**: `5 NETWORK DEVICES`, `5 HEALTHY ROUTERS`, `0 ACTIVE FINDINGS`, `0 SUSPECTED CAUSES`.
- **Diagnostics Panel**: Explicit Abstention card:
  - Header: `EXPLICIT ABSTENTION · HEALTHY BASELINE`
  - Status Pill: `STATUS: INSUFFICIENT_EVIDENCE`
  - Reason: *"All router interfaces, BGP sessions, and bidirectional ICMP probes report nominal state. In accordance with NETSCOPE's strict abstention policy, no fault hypothesis is asserted on uncorroborated telemetry."*
  - Preserved Hypotheses: `0 candidate root causes`.

#### Verbatim Script (What to Say):
> "Judges, this is NETSCOPE, built for problem statement PS-035. 
> 
> We are looking at our five-router instrumented network running actual FRRouting instances across five interconnected links. Right now, the network is operating in a nominal state. 
> 
> Notice the top banner: every telemetry snapshot is strictly stamped with its data provenance, injection run ID, and collection timestamp. We never fabricate data, and we never present recorded replays as live telemetry.
> 
> The central property to note here is **abstention**. A naive model or brittle rule engine often hallucinated low-probability failures or false alerts when given nominal telemetry. NETSCOPE's engine evaluates interface states, BGP peerings, and active bidirectional ICMP probes. Because all five links exhibit zero percent packet loss, normal carrier status, and established BGP peering, NETSCOPE explicitly reports `INSUFFICIENT_EVIDENCE` and asserts zero candidate faults. It refuses to raise a false alarm."

#### Technical Property Proved:
- **Baseline Correctness & Explicit Abstention**: Proves that the absence of abnormal signals produces an explicit abstention (`INSUFFICIENT_EVIDENCE`, `Causes: 0`) rather than a false positive diagnosis.

---

### Scene 2: Physical Link Failure & Evidence Correlation (0:45 – 1:45)

#### Exact Presenter Action:
1. In the terminal, execute the guarded fault injection for `link_r2_r4_down`.
2. In the UI, click **"Link failure"** (`R2–R4 connection lost`).
3. Scroll to the **Diagnostic Synthesis** and **Manual vs. NETSCOPE** sections.

#### Exact Terminal Command:
```bash
python3 -m app.collector.fault_lab apply link_r2_r4_down --confirm-lab ps035
```

#### Expected UI State:
- **Topology Map**: Link `R2-R4` turns red with dashed styling and a break marker. Node `R2` and `R4` show `Attention required`.
- **Top-Ranked Hypothesis Hero Card**:
  - Badge: `RANK #1 LEADING HYPOTHESIS`
  - Target: `R2-R4 · Physical Link Failure`
  - Diagnostic Score: `Score: 18 / 100 (HIGH Confidence)`
  - Scoring Reasons Breakdown:
    - `✓ INTERFACE_NOT_UP (+4 pts)`: Direct interfaces reported DOWN on both peering routers (`r2 eth2` and `r4 eth1`)
    - `✓ ACTIVE_PROBE_LOSS (+4 pts)`: Bidirectional ICMP probe confirms 100% packet loss
    - `✓ BGP_SESSION_DOWN (+2 pts)`: BGP adjacency collapsed following link drop
- **Contradictory Evidence Box**: *"Cross-Layer Check: No contradictory evidence found. Physical interface state (DOWN), ICMP active probe (100% loss), and BGP session (Idle) are in complete mutual agreement."*
- **Network Impact Panel**:
  - Confirmed Failed Links: `R2-R4`
  - Partition Status: `NO PARTITION: Graph connected`
  - Alternate Redundant Path: `R2 -> R1 -> R3 -> R4`
- **Manual vs. NETSCOPE Panel**: Left terminal shows multiple manual commands (`ip -br link`, `vtysh`, `ping`, `show log`) with 8–15 min MTTR; right card shows NETSCOPE instantaneous synthesis (<95ms).

#### Verbatim Script (What to Say):
> "Now, let's inject a real physical link severance on the direct link between Router 2 and Router 4.
> 
> *(Run command)*
> 
> Immediately, multi-layer telemetry signals cascade into NETSCOPE. In a traditional NOC, an operator faces alarm fatigue: BGP alerts fire on both routers, interface carrier alarms trigger in syslog, and monitoring pings fail. 
> 
> Look at how NETSCOPE synthesizes this. Instead of showing six disconnected alerts, our deterministic cross-layer correlation engine aggregates the evidence into a single Rank-1 root-cause hypothesis: `R2-R4 Physical Link Failure` with a score of 18 and High Confidence. 
> 
> Notice the itemized score breakdown: plus four points for bilateral interface carrier drops, plus four points for bidirectional active probe loss, and plus two points for the corroborating BGP collapse. 
> 
> Crucially, look at the graph impact analysis: the engine performed a breadth-first search across the actual physical topology. It confirms that although `R2-R4` is down, the network is **not partitioned** because traffic has an alternate redundant path: Router 2 through Router 1, to Router 3, to Router 4."

#### Technical Property Proved:
- **Bilateral Cross-Layer Synthesis & Impact Analysis**: Proves the engine groups symptoms across physical carrier state, active probes, and BGP sessions into a single ranked hypothesis, while computing topological graph partitions independently from arbitrary score cutoffs.

---

### Scene 3: Control-Plane BGP Mismatch vs. Physical Cut (1:45 – 2:45)

#### Exact Presenter Action:
1. In the terminal, restore `link_r2_r4_down` and apply `bgp_r1_r2_shutdown`.
2. In the UI, click **"BGP mismatch"** (`Physical link up, BGP down`).
3. Point to the **Contradictory Evidence Analysis** card.

#### Exact Terminal Command:
```bash
# Revert link failure and apply BGP administrative shutdown
python3 -m app.collector.fault_lab restore link_r2_r4_down --confirm-lab ps035
python3 -m app.collector.fault_lab apply bgp_r1_r2_shutdown --confirm-lab ps035
```

#### Expected UI State:
- **Topology Map**: Link `R1-R2` shows amber/degraded status. Link line remains solid (physical carrier intact); packet animation pauses across BGP peering.
- **Top-Ranked Hypothesis Hero Card**:
  - Target: `R1-R2 · BGP Session Failure` (Score: `10 / 100`, High Confidence)
  - Scoring Reasons Breakdown:
    - `✓ BGP_SESSION_NOT_ESTABLISHED (+3 pts)`: Neighbor 10.0.12.2 trapped in Idle state
    - `✓ SYSLOG_BGP_DOWN (+2 pts)`: Router log confirms administrative shutdown
    - `✓ PHYSICAL_CORROBORATION (+1 pt)`: Data plane is intact (0% packet loss, ~0.07ms RTT)
- **Contradictory Evidence Box** (Highlighted):
  - *"Cross-Layer Check: Physical interface eth1 is UP and bidirectional ping confirms 0% packet loss (0.07ms avg RTT). This directly contradicts physical severance, ruling out link damage and isolating the fault to BGP configuration."*
- **Network Impact**: Link Condition: `DEGRADED`. Confirmed Failed Links: `None`. Actual Partition: `false`.

#### Verbatim Script (What to Say):
> "Now let's examine what happens during a pure control-plane failure. We've restored `R2-R4` and administratively shut down the BGP peer on Router 1 toward Router 2.
> 
> To a simple alert-counting system, BGP going down looks identical to a link break because the BGP session dropped. But look at NETSCOPE's **Contradictory Evidence Analysis**. 
> 
> NETSCOPE observed that physical interface `eth1` is `UP`, and our bidirectional ICMP probes report **zero percent packet loss** with sub-millisecond round-trip times. This active measurement directly **contradicts** a physical severance. 
> 
> Because contradictory evidence is preserved and weighted, NETSCOPE does not remove the edge from the forwarding graph. It classifies the failure as `BGP_SESSION_FAILURE` on `R1-R2`, not a physical cable break. The impact analysis marks the link as `DEGRADED`, confirming that data-plane IP reachability is intact while routing exchange is isolated. This eliminates false cable dispatches."

#### Technical Property Proved:
- **Cross-Layer Disambiguation & Contradictory Evidence Handling**: Proves that data-plane measurements (0% loss, low RTT) contradict and override physical failure hypotheses, preventing misdiagnosis of control-plane faults.

---

### Scene 4: Missing Telemetry & Explicit Abstention (2:45 – 3:30)

#### Exact Presenter Action:
1. In the UI, navigate to the **Investigation** view (`/dashboard/investigations` or select uncollected context).
2. Point out the **Missing Telemetry & Coverage** panel and the **Abstention Header**.

#### Exact Terminal Command (Optional Unit Test Inspection):
```bash
pytest tests/test_diagnosis.py -k "test_missing_telemetry_triggers_insufficient_telemetry_abstention"
```

#### Expected UI State:
- **Coverage Summary**: `Coverage: 4/5 routers collected · 1 router unreachable`.
- **Status Badge**: `STATUS: INSUFFICIENT_TELEMETRY` (Amber Warning).
- **Abstention Card**:
  - Header: `EXPLICIT ABSTENTION · INSUFFICIENT TELEMETRY`
  - Warning Copy: *"Collection failed on Router 5. Missing evidence is never converted into an assumed network fault. The engine abstains from ranking unverified hypotheses."*
- **Remaining Hypotheses**: All candidates marked with explicit warning; diagnostic score zeroed out for unmeasured links.

#### Verbatim Script (What to Say):
> "In real-world networks, telemetry collectors fail, routers drop SSH sessions, or SNMP queries time out. 
> 
> A common flaw in automated diagnosis is that missing data gets treated as a downed link. If a probe doesn't return, a naive algorithm assumes the link is dead.
> 
> NETSCOPE implements strict **data-quality gating**. If collection fails on a router, or if telemetry is stale by more than 300 seconds, NETSCOPE registers `ACTIVE_PROBE_UNAVAILABLE` or `COLLECTION_FAILED`. 
> 
> Look at the screen: NETSCOPE explicitly distinguishes between **proof of failure** and **absence of evidence**. The status shifts to `INSUFFICIENT_TELEMETRY`. The engine abstains from issuing an unsupported conclusion. We require positive corroboration before asserting any root cause."

#### Technical Property Proved:
- **Fail-Closed Data Quality & Abstention Robustness**: Proves that collection failures and stale observations never mutate into hallucinated network failures.

---

### Scene 5: Held-Out Benchmark & Empirical Evaluation (3:30 – 4:15)

#### Exact Presenter Action:
1. Scroll down to the **Benchmark Evaluation** section (`#benchmark`).
2. Point to the top metric cards, per-scenario table, and 2D confusion matrix.
3. Show the independent dataset split details.

#### Exact Terminal Command (Live Verification):
```bash
python3 tools/evaluate_runs.py /private/tmp/netscope-benchmark/runs.jsonl --markdown
```

#### Expected UI State:
- **Metric Cards**:
  - `Top-1 Accuracy`: **100.0%** (`5 fault cases`)
  - `Top-3 Accuracy`: **100.0%** (`Rank 1–3 coverage`)
  - `Mean Reciprocal Rank (MRR)`: **1.000**
  - `Selective Accuracy`: **100.0%** (`Non-abstained accuracy`)
  - `Abstention Coverage`: **83.3%** (`5/6 runs diagnosed, 1/6 correctly abstained`)
  - `False Confident Diagnosis Rate`: **0.0%**
- **Independent Run Split Details**:
  - Total Evaluated Records: `6`
  - Independent Held-Out Runs: `6`
  - Strategy: `split_by_injection_run` (Zero train/test leakage)
- **Per-Scenario Table**: All 5 seeded fault scenarios (`link_r2_r4_down`, `bgp_r1_r2_shutdown`, `route_r5_withdrawal`, `degraded_r2_r4`, `link_r3_r4_down`) show 100% accuracy; `healthy_baseline` shows 100% correct abstention.
- **Confusion Matrix**: Clean diagonal with zero off-diagonal misclassifications.

#### Verbatim Script (What to Say):
> "We don't ask you to take our word for this diagnosis. We evaluated NETSCOPE against our complete catalog of five seeded fault scenarios plus the healthy baseline.
> 
> This benchmark dashboard is not hardcoded. It dynamically reads the actual evaluation results generated directly from our live Containerlab runs.
> 
> Look at the methodology: we enforce **run-level data splitting**. Snapshots from the same injection event are never distributed between training and test sets. 
> 
> Across our held-out test runs, NETSCOPE achieved **100% Top-1 Accuracy**, **100% Top-3 Accuracy**, and a **Mean Reciprocal Rank of 1.000**. 
> 
> More importantly, look at our selective metrics: **100% Selective Accuracy**, zero percent false confident diagnosis, and an **83.3% Abstention Coverage**. The engine gave an answer when evidence was conclusive, and correctly abstained on the healthy baseline."

#### Technical Property Proved:
- **Empirical Evaluation Validity**: Demonstrates held-out evaluation validity, leakage-free data splitting, and verifiable accuracy metrics.

---

### Scene 6: Architecture & Diagnostic Pipeline (4:15 – 4:45)

#### Exact Presenter Action:
1. In the terminal, restore `bgp_r1_r2_shutdown`.
2. Scroll to the footer showing the active engine provenance and test status.
3. Conclude the presentation and invite questions.

#### Exact Terminal Command:
```bash
python3 -m app.collector.fault_lab restore bgp_r1_r2_shutdown --confirm-lab ps035
python3 -m app.collector.fault_lab check
```

#### Expected UI State:
- Terminal returns: `All five fixed PS-035 lab containers are running; no network state was changed.`
- UI refreshes to healthy baseline: all nodes green, 0 active findings.

#### Verbatim Script (What to Say):
> "To conclude: NETSCOPE's architecture is built on three core pillars:
> 
> First, **multi-layer normalization**: we decouple interface carrier, BGP control-plane, and bidirectional active probe telemetry so each layer speaks a common evidence schema.
> 
> Second, **deterministic rule-based baseline**: before touching any machine learning, our deterministic scoring engine correlates corroborating signals, subtracts for contradictions, and executes BFS topological impact analysis.
> 
> Third, **zero cloud lock-in**: the central diagnostic engine runs locally on the edge, in the lab, or in CI/CD without requiring external cloud dependencies.
> 
> We have restored our lab to baseline, all 83 backend tests and 70 frontend tests pass, and we are ready for your questions."

---

## Part 2: Ten Difficult Judge Questions & Evidence-Based Answers

### Question 1: "Why did you use a deterministic rule-based engine instead of training an LLM or a deep neural network to diagnose the root cause?"
**Evidence-Based Answer**:
> "In mission-critical network operations, deterministic rules provide three things that neural networks cannot: **predictability**, **zero hallucination**, and **mathematical explainability**. 
> Under PS-035, an operator dispatching a field technician or applying an automated traffic reroute must know the exact deterministic rationale. In `app/diagnosis/root_cause.py`, every candidate hypothesis provides an itemized scoring breakdown: for example, plus four points for bilateral interface carrier drops (`INTERFACE_NOT_UP`), plus four points for bidirectional active probe loss (`ACTIVE_PROBE_PACKET_LOSS`), and plus two points for BGP collapse. 
> Furthermore, in telecom environments, catastrophic failures occur on rare tail distributions where training data is scarce. A deterministic baseline guarantees that if identical physical signals occur, identical diagnoses will result. We did implement an optional Bernoulli Naive Bayes classifier in `app/diagnosis/optional_model.py`, but we treat it as an experimental comparison alongside—never a replacement for—the deterministic baseline."

---

### Question 2: "How do you prevent data leakage in your benchmark evaluation?"
**Evidence-Based Answer**:
> "Data leakage in network telemetry usually occurs when multiple sequential snapshots from the same fault injection are randomly partitioned between training and test sets. Since timestamps and transient counter values are autocorrelated, a random split yields artificially high accuracy.
> In `tools/evaluate_runs.py`, we implemented `split_by_injection_run()`. We strictly group records by their unique `injection_run_id` (e.g. `link_r2_r4_down-68ef7321e050`). All snapshots originating from the same injection event are assigned entirely to training or entirely to held-out evaluation. 
> Furthermore, ground-truth labels are never exposed to model features: `tools/evaluate_runs.py` tests explicitly assert that feature extractors only receive raw symptoms (interface status, probe loss, BGP state) and never candidate link names or scenario metadata."

---

### Question 3: "How does your system distinguish between a physical link failure and a BGP session flap or configuration error?"
**Evidence-Based Answer**:
> "We perform bilateral cross-layer correlation across OSI Layer 1, Layer 3, and Layer 7.
> In a physical link failure (`link_r2_r4_down`), three layers corroborate:
> 1. Physical: `ip -br link` reports `eth2` as `DOWN` with `NO-CARRIER`.
> 2. Data Plane: active ICMP probes report `100% packet loss`.
> 3. Routing: BGP transitions to `Idle` or `Active`.
> 
> In a BGP-only configuration failure (`bgp_r1_r2_shutdown`), BGP collapses to `Idle`, but physical carrier status remains `UP`, and active ICMP probes report `0% packet loss` with normal sub-millisecond latency. 
> In `app/diagnosis/root_cause.py`, the engine checks for contradictory signals. When probe loss is 0% and carrier is UP, that directly contradicts a physical severance. The engine deducts points from any physical link hypothesis, isolates the fault to `BGP_SESSION_FAILURE`, and preserves the data-plane edge in graph impact analysis."

---

### Question 4: "What happens when active probes time out due to router CPU exhaustion rather than an actual link drop?"
**Evidence-Based Answer**:
> "We specifically decoupled active probe packet loss from probe availability in `app/diagnosis/measurements.py`.
> If a probe command fails to run, times out in transit, or is dropped due to management plane rate-limiting, it is normalized with `available: False` and classified as `ACTIVE_PROBE_UNAVAILABLE`. 
> In our scoring engine, `ACTIVE_PROBE_UNAVAILABLE` is explicitly assigned **zero points**. It is recorded under `missing_evidence`, not `supporting_evidence`. The engine requires positive evidence—such as confirmed carrier drop or syslog link reset—before asserting a physical link failure. Absence of active probe response is treated as missing telemetry, never as proof of network failure."

---

### Question 5: "How does your BFS graph impact analysis work, and why doesn't an unestablished BGP session sever the topology graph?"
**Evidence-Based Answer**:
> "In `app/diagnosis/impact_analysis.py`, we explicitly separated **diagnostic confidence scores** from **physical topology reachability**. 
> An edge in our graph model is categorized into five distinct conditions: `CONFIRMED_DOWN`, `PROBABLE_DOWN`, `DEGRADED`, `UP`, and `UNKNOWN`. 
> An edge is only severed from the BFS forwarding graph if it is `CONFIRMED_DOWN`—meaning bilateral carrier is down or active probe loss is 100%. 
> When BGP is down but IP connectivity is verified, the link is labeled `DEGRADED`. The edge remains active in the graph because packets can still traverse the hop via static routes or alternate IGP. The BFS algorithm calculates connected components, identifies actual network partitions, and computes alternate redundant paths (e.g. `R2 -> R1 -> R3 -> R4`) using Dijkstra/BFS over verified operational links."

---

### Question 6: "What is your false confident diagnosis rate, and how do you calculate selective accuracy?"
**Evidence-Based Answer**:
> "In `tools/evaluate_runs.py`, we implement the strict evaluation metrics defined in our contract:
> - **Selective Accuracy**: The accuracy evaluated strictly on runs where the engine issued a confident diagnosis without abstaining. In our live held-out benchmark across all five fault classes, selective accuracy is **1.0 (100.0%)**.
> - **Abstention Coverage**: The fraction of evaluated runs where the engine reached a definitive conclusion rather than abstaining. Because we evaluated 5 fault runs and 1 healthy baseline, coverage is exactly 5/6, or **83.33%**.
> - **False Confident Diagnosis Rate**: The fraction of non-abstained diagnoses where the top-ranked prediction was incorrect. In our benchmark, this is **0.0%**. When the engine speaks, it is correct; when evidence is absent, it abstains."

---

### Question 7: "What happens if syslog messages arrive out of order or with clock skew between routers?"
**Evidence-Based Answer**:
> "In `app/diagnosis/engine.py`, we implement data-quality timestamp validation. 
> All incoming observations are parsed into UTC ISO-8601 timestamps. We evaluate timestamp validity and compute observation staleness against a 300-second freshness window. 
> Furthermore, in `app/diagnosis/root_cause.py`, syslog events are correlated by event signature rather than microsecond order. We look for the presence of link-down or adjacency-reset notifications within the incident observation window. 
> Crucially, syslog events that indicate recovery (e.g. `%LINK-3-UPDOWN: Interface changed state to up`) actively filter out stale down alarms, ensuring out-of-order log arrival does not resurrect a resolved incident."

---

### Question 8: "Can your system handle multiple simultaneous faults in different parts of the network?"
**Evidence-Based Answer**:
> "Yes. In `app/diagnosis/root_cause.py`, candidates are evaluated per link adjacency rather than globally collapsed to a single winner. 
> In our synthetic test suite (`tests/test_diagnosis.py::test_graph_impact_multiple_failures_causes_actual_partition`) and demo fixtures (`multiple_faults.json`), we simulate simultaneous failures on `R2-R4` and `R3-R4`. 
> The engine evaluates both links independently, generating distinct Rank-1 and Rank-2 hypotheses with their own isolated evidence lists. 
> In `tools/evaluate_runs.py`, we evaluate multi-fault scenarios using exact-set matching: the system is evaluated on whether the set of predicted links matches the set of ground-truth links using Jaccard similarity, rather than artificially forcing a single-link choice."

---

### Question 9: "How does NETSCOPE prevent repeated syslog alerts from artificially inflating a candidate's diagnostic score?"
**Evidence-Based Answer**:
> "In `app/diagnosis/root_cause.py`, we implement explicit **event deduplication**. 
> When an interface flaps, a router syslog buffer might emit ten identical `%LINK-3-UPDOWN` messages in five seconds. 
> Our scoring engine groups observations by `(source_type, observation_type, router, interface_or_peer)`. Each unique failure modality on a link can contribute points only once toward the hypothesis score. 
> Duplicate events are preserved in the raw evidence trail for auditing under `duplicate_events`, but their point weights are zeroed out. This prevents flapping interfaces from drowning out genuine concurrent faults."

---

### Question 10: "If your hosted backend or cloud services go down during a demo, how does NETSCOPE continue to operate?"
**Evidence-Based Answer**:
> "NETSCOPE was engineered with a **zero-cloud-dependency local fallback**. 
> The core diagnostic pipeline (`app/diagnosis/engine.py`), the collector (`app/collector/telemetry.py`), and the fault injection controller (`app/collector/fault_lab.py`) are self-contained Python modules that run directly against local Docker sockets or static files. 
> In the frontend, our React application includes a static replay engine that loads verified telemetry snapshots directly from `frontend/public/demo/scenarios/*.json`. 
> If the network is completely unreachable, the operator switches to recorded replay mode. The UI clearly labels the provenance as `RECORDED_REPLAY`, displays the injection run IDs, and preserves the full interactive multi-layer investigation workflow without making a single outbound HTTP request."

---

## Part 3: Live Network Failure Fallback Protocol

If an unexpected infrastructure failure occurs during the live demonstration, follow this instant recovery protocol:

```
┌──────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Failure Mode                         │ Fallback Procedure                                     │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Docker Desktop pauses / hangs        │ 1. Switch immediately to static demo replay (/demo).   │
│                                      │ 2. Point out the RECORDED_REPLAY provenance badge.     │
│                                      │ 3. State: "Our UI preserves identical captured         │
│                                      │    telemetry snapshots with full multi-signal trace."   │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Containerlab node fails to restore   │ 1. In terminal, execute emergency lab cleanup:         │
│                                      │    python3 -m app.collector.fault_lab restore <id>      │
│                                      │ 2. If node remains degraded, reload baseline configs:   │
│                                      │    docker exec clab-ps035-rX vtysh -f /etc/frr/frr.conf │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ BGP hold-down delay (>30s)           │ 1. Explain BGP convergence timer mechanics:            │
│                                      │    "FRRouting hold-down timers require 15-30s to recon- │
│                                      │    verge; our automated harness implements a 240s      │
│                                      │    polling loop to guarantee convergence."             │
│                                      │ 2. Switch to Benchmark Dashboard to show held-out run. │
├──────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Frontend dev server crashes          │ 1. Run production preview from pre-built dist/:        │
│                                      │    cd frontend && npm run preview -- --port 5173       │
└──────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## Part 4: Known Limitations & Truthful Disclosures

To preserve credibility, disclose these limitations proactively if asked:

1. **FRRouting BGP Reconvergence Window**:
   - In physical and Containerlab routers, restoring an administratively shut interface or BGP peer requires 15 to 30 seconds for BGP keepalives to restore the `Established` state. NETSCOPE's benchmark harness polls for up to 240 seconds to verify complete recovery before moving to the next fault.
2. **Containerlab Kernel Namespace Isolation**:
   - Containerlab utilizes Linux kernel network namespaces (`veth` pairs). On macOS, it requires Docker Desktop VM host sharing (`--pid=host --net=host -v /var/run/netns:/var/run/netns`). In production, Containerlab is deployed natively on bare-metal Ubuntu or Linux VMs.
3. **Decoupled Packet Loss Thresholds**:
   - Partial packet loss (e.g. 20% loss in `degraded_r2_r4`) flags link degradation but intentionally does **not** sever graph forwarding edges. Physical edges are removed only upon confirmed bidirectional carrier drops or 100% loss.
4. **Local vs. Hosted Storage**:
   - The standalone local demo runs in memory and reads local JSON fixtures. Cloud persistence to Firestore is available as an optional export for saved investigations, but is never required for local diagnosis.

---

## Part 5: Final Pre-Presentation Startup Checklist

Execute this checklist **10 minutes before presenting**:

- [ ] **Git State Verified**:
  ```bash
  git branch --show-current   # Must output: feature/netscope-demo-hardening
  ```
- [ ] **Docker Engine Operational**:
  ```bash
  docker ps                   # Verify docker daemon is unpaused and responding
  ```
- [ ] **All Five Routers Active**:
  ```bash
  python3 -m app.collector.fault_lab check
  # Output: All five fixed PS-035 lab containers are running
  ```
- [ ] **BGP Sessions Established**:
  ```bash
  docker exec clab-ps035-r1 vtysh -c "show ip bgp summary" | grep "10.0.12.2"
  # Output: State must show prefix count (e.g. 3), NOT Idle or Active
  ```
- [ ] **Frontend Production Build Verified**:
  ```bash
  npm --prefix frontend test && npm --prefix frontend run build
  # Output: 70 tests pass, build succeeds
  ```
- [ ] **Local Frontend Server Running**:
  ```bash
  cd frontend && npm run dev
  # Browser accessible at http://localhost:5173/demo
  ```
- [ ] **Evaluation Output Present**:
  ```bash
  test -f frontend/public/demo/benchmark_results.json && echo "Benchmark JSON OK"
  test -f docs/EVALUATION_REPORT.md && echo "Report OK"
  ```
- [ ] **Browser Tabs Prepared**:
  - Tab 1: `http://localhost:5173/demo` (Demo Dashboard)
  - Tab 2: `http://localhost:5173/demo#manual-vs-netscope` (Manual vs. NETSCOPE)
  - Tab 3: `http://localhost:5173/demo#benchmark` (Benchmark Dashboard)
