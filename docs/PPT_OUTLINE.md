# NETSCOPE — Presentation Content Reference

## 1. Project Overview & Problem Statement
- **Title:** NETSCOPE — Evidence-Based Network Diagnostics & Telemetry Correlation
- **Problem:**
  - **Alarm Cascades:** A single physical fiber cut or interface failure triggers a flood of secondary alarms (BGP session drops, route withdrawals, transit timeouts) across neighboring routers.
  - **Cognitive Overload:** NOC engineers must manually correlate CLI outputs (`show bgp summary`, `ip -br addr`, syslog, ping) across multiple devices under time pressure.
  - **Misdiagnosis Risk:** Downstream symptoms appear on healthy routers, leading engineers to troubleshoot the wrong device or link.
  - **Black-Box AI Risk:** Uncalibrated ML models can hallucinate root causes when telemetry is missing or ambiguous.
- **Solution:**
  - **Evidence-Based:** Every diagnosis cites exact supporting, contradictory, and missing observations with timestamps and router/interface references.
  - **Deterministic & Auditable:** Rule-based ranking exposes the exact reasons contributing to every score.
  - **Explicit Abstention:** Refuses to guess when telemetry is missing, stale, or ambiguous (`INSUFFICIENT_TELEMETRY`, `INSUFFICIENT_EVIDENCE`, `AMBIGUOUS_HYPOTHESES`).
  - **Provenance-Aware:** Strictly separates `LIVE_LAB`, `RECORDED_REPLAY`, and `TEST_FIXTURE` data.

---

## 2. System Architecture & End-to-End Workflow
```text
[Containerlab 5-Router Mesh (FRR)]
        │  (docker exec: vtysh, ip -br addr, syslog, ICMP probes)
        ▼
[Telemetry Collector (app/collector/)]
        │  Snapshot JSON + Data Quality Checks
        ▼
[Diagnostic Engine (app/diagnosis/)]
   ├── 1. Observation Normalization & Deduplication
   ├── 2. BGP & Interface/Probe/Syslog Analysis
   ├── 3. Bilateral Root-Cause Correlation & Deterministic Ranking
   ├── 4. Abstention Gate
   └── 5. Graph-Theoretic Impact Analysis (BFS)
        │
        ▼
[Flask REST API (:5000)] ──▶ [React Operator Dashboard (:5173)]
```

---

## 3. 5-Router eBGP Lab Topology
- **Emulated Plane:** 5 FRRouting (`frr:containerlab-10.7.1`) routers in Containerlab (`lab/ps035.clab.yml`), each in its own AS (`AS 65001` – `AS 65005`) advertising its loopback (`192.168.X.1/32`).
- **Point-to-Point Links (`/30`):**
  - `R1 — R2` (`10.0.12.0/30`)
  - `R1 — R3` (`10.0.13.0/30`)
  - `R2 — R4` (`10.0.24.0/30`)
  - `R3 — R4` (`10.0.34.0/30`)
  - `R4 — R5` (`10.0.45.0/30` — single-homed edge link to `R5`)
- **Plane Segregation:** `eth0` (`172.20.20.0/24`) is out-of-band management; `eth1`–`eth3` carry data and eBGP control plane.

---

## 4. Diagnostic Engine Pipeline
1. **Normalize Observations:** Standardizes BGP state, interface state, syslog events, active ICMP probes, and collection failures with observation IDs, router/interface IDs, timestamps, and raw evidence references.
2. **Data Quality Guardrails:** Handles missing/stale observations, invalid timestamps, and failed collection commands—a failed collection never automatically becomes an observed network fault.
3. **Evidence Correlation:** Groups bilateral symptoms across peers onto candidate links while deduplicating repeated syslog/probe messages so they are not counted as independent corroboration.
4. **Deterministic Ranking:** Scores candidate hypotheses transparently with explicit reason breakdowns (not calibrated probabilities).
5. **Abstention Gate:** Outputs `DIAGNOSIS` only when evidence is sufficient; otherwise outputs `INSUFFICIENT_TELEMETRY`, `INSUFFICIENT_EVIDENCE`, or `AMBIGUOUS_HYPOTHESES`.

---

## 5. Graph-Theoretic Impact Analysis
- **Observed Link States (Telemetry-Driven, Not Score-Driven):**
  - `CONFIRMED_DOWN`, `PROBABLE_DOWN`, `DEGRADED`, `UP`, `UNKNOWN`
- **Key Rule:** A link edge is **not** removed from the topology graph merely because packet loss is partial, BGP is down, or telemetry is missing.
- **Graph Outputs:**
  - **Connected Components & Actual Partitions** (e.g., `R4-R5` down isolates `R5`)
  - **Redundant Paths** (e.g., `R2-R4` down preserves `R1 -> R3 -> R4`)
  - **Conditional Partition Risk** for `PROBABLE_DOWN` / `UNKNOWN` links

---

## 6. Fault Scenarios & Identifiability
Evaluated across **5 real Containerlab fault scenarios** + **1 healthy baseline**:
1. **`link_r2_r4_down`** — Physical interface down on `R2-R4` (interface down + BGP drop + 100% probe loss; alternate path via `R1-R3-R4`).
2. **`link_r3_r4_down`** — Physical interface down on `R3-R4` (alternate path via `R1-R2-R4`).
3. **`bgp_r1_r2_shutdown`** — BGP-only fault (`neighbor shutdown` on `R1-R2`): BGP drops while physical interface & ICMP reachability remain `UP`.
4. **`degraded_r2_r4`** — Partial packet loss / latency degradation on `R2-R4` via `tc netem`.
5. **`route_r5_withdrawal`** — Prefix withdrawal (`no network 192.168.5.1/32` on `R5`): BGP session stays `Established`, `0` prefixes received (`NO_PREFIXES_RECEIVED`).
6. **`healthy_baseline`** — All 5 routers healthy; engine abstains rather than forcing a fault.

---

## 7. Empirical Benchmark Results (Held-Out Evaluation)
From `docs/EVALUATION_REPORT.md` (6 independent held-out runs: 5 fault cases + 1 healthy baseline):

| Metric | Value | Meaning |
| :--- | :--- | :--- |
| **Top-1 Accuracy** | **1.0 (100%)** | Top-ranked candidate matches ground truth on all 5 fault cases |
| **Top-3 Accuracy** | **1.0 (100%)** | Ground truth appears in top 3 candidates |
| **Mean Reciprocal Rank (MRR)** | **1.0** | Ground truth consistently ranked #1 |
| **Selective Accuracy** | **1.0 (100%)** | 100% accuracy on non-abstained diagnoses |
| **Abstention Coverage** | **0.8333 (83.3%)** | Issued diagnosis on 5/6 runs; abstained on healthy baseline |
| **False Confident Diagnosis Rate** | **0.0 (0%)** | Zero incorrect confident diagnoses |
| **Unsupported Abstention Accuracy** | **1.0 (100%)** | Correctly abstained on healthy/unsupported run |

---

## 8. Operator Dashboard & Demo Capabilities (`/demo`)
- **Interactive 5-Router Topology:** Live visual status of nodes and links.
- **Top Hypothesis & Top-3 Ranking:** Shows ranking score, supporting evidence, contradictory evidence, missing evidence, timestamps, and router/interface references.
- **Abstention & Impact Panels:** Displays abstention reason, remaining hypotheses, connected components, and partition vs. redundancy status.
- **Manual vs. NETSCOPE Comparison:** Side-by-side view of raw CLI/telemetry vs. NETSCOPE's correlated diagnosis.
- **Benchmark Dashboard:** Reads actual `benchmark_results.json` metrics dynamically.
- **Offline-Safe Local Mode:** Runs locally without mandatory cloud/Firebase credentials.

---

## 9. Limitations & Future Work
- **Dataset Size:** Current empirical evaluation covers 6 independent held-out runs (1 per scenario + 1 healthy baseline); expanding to multi-run statistical sweeps is straightforward using `tools/run_lab_benchmark.py`.
- **Optional ML Comparison:** Bernoulli Naive Bayes comparison is gated on having sufficient independent training runs to avoid data leakage.
- **Protocol Scope:** Currently focused on eBGP + interface/ICMP/syslog telemetry; extensible to OSPF/IS-IS and streaming gNMI telemetry.
