# NETSCOPE Final PS-035 Demonstration Runbook

## Overview

NETSCOPE is an evidence-led network diagnosis and observability platform built for the **PS-035** problem statement. It analyzes an instrumented 5-router FRRouting network, ingests multi-layer telemetry (BGP states, interface carrier states, syslog events, and bidirectional ICMP active probes), and isolates root causes using deterministic rule-based ranking with cross-layer correlation and explicit abstention.

This runbook documents the complete operator demonstration procedure for both:
1. **Live Lab Execution**: Running guarded fault injection and diagnosis against the live 5-router Containerlab network.
2. **Local Replay Demonstration**: Running the full operator investigation UI entirely offline without cloud dependencies (no Render or Firebase required).

---

## 1. Startup Commands

### Option A: Local Frontend & Replay Mode (Zero Cloud Dependencies)
To run the operator workspace and interactive demo dashboard locally:

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies (if not already installed)
npm install

# Start local development server
npm run dev
# Or build and preview production assets
npm run build && npm run preview
```

Open `http://localhost:5173` (or `http://localhost:4173` for preview) to access:
- **Interactive 5-Router Topology**: Visualizing `R1`, `R2`, `R3`, `R4`, `R5` with traffic path flow and link status.
- **Main Diagnostic View**: Top-ranked hypotheses, diagnostic scores, supporting/contradictory evidence, and BFS graph impact.
- **Manual vs. NETSCOPE Comparison**: Interactive CLI triage terminal vs. automated synthesis.
- **Benchmark Evaluation Dashboard**: Empirical metrics dynamically loaded from held-out evaluations.

### Option B: Live 5-Router Containerlab Startup
On the Linux/VM host (or macOS Docker Desktop with netns sharing):

```bash
# Deploy the isolated 5-router Containerlab topology
cd lab
docker run --rm --privileged --pid=host --net=host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /var/run/netns:/var/run/netns \
  -v "$PWD/..:$PWD/.." -w "$PWD" \
  ghcr.io/srl-labs/clab:latest /usr/bin/containerlab deploy -t ps035.clab.yml
```

---

## 2. Lab Health Checks

Verify that all five router containers are operational and BGP routing is fully converged before any testing:

```bash
# 1. Verify container runtime state
python3 -m app.collector.fault_lab check

# 2. Inspect BGP session summary on all five routers
for r in r1 r2 r3 r4 r5; do
  echo "=== Router $r BGP Adjacencies ==="
  docker exec clab-ps035-$r vtysh -c "show ip bgp summary" | grep -E "Neighbor|10.0"
done

# 3. Verify bidirectional direct link ping reachability
docker exec clab-ps035-r1 ping -c 2 10.0.12.2   # R1 -> R2
docker exec clab-ps035-r1 ping -c 2 10.0.13.2   # R1 -> R3
docker exec clab-ps035-r2 ping -c 2 10.0.24.2   # R2 -> R4
docker exec clab-ps035-r3 ping -c 2 10.0.34.2   # R3 -> R4
docker exec clab-ps035-r4 ping -c 2 10.0.45.2   # R4 -> R5

# 4. Collect and verify a healthy telemetry baseline
mkdir -p /tmp/netscope-runs && chmod 700 /tmp/netscope-runs
python3 -m app.collector.telemetry --output-dir /tmp/netscope-runs
```

---

## 3. The Five Seeded Fault Scenarios

| Scenario ID | Fault Category | Target Device & Link | Injection Mechanism | Ground Truth Label | Restoration Command |
|---|---|---|---|---|---|
| `link_r2_r4_down` | `LINK_FAILURE` | R2-R4 (`eth2` / `eth1`) | `ip link set dev eth2 down` | `R2-R4` | `ip link set dev eth2 up` |
| `bgp_r1_r2_shutdown` | `BGP_SESSION_FAILURE` | R1-R2 (Peer `10.0.12.2`) | `neighbor 10.0.12.2 shutdown` | `R1-R2` | `no neighbor 10.0.12.2 shutdown` |
| `route_r5_withdrawal` | `PREFIX_WITHDRAWAL` | R5 (`192.168.5.1/32`) | `no network 192.168.5.1/32` | `R4-R5` | `network 192.168.5.1/32` |
| `degraded_r2_r4` | `PERFORMANCE_DEGRADATION` | R2-R4 (`eth2`) | `tc netem delay 200ms loss 20%` | `R2-R4` | `tc qdisc del dev eth2 root` |
| `link_r3_r4_down` | `LINK_FAILURE` | R3-R4 (`eth2` / `eth2`) | `ip link set dev eth2 down` | `R3-R4` | `ip link set dev eth2 up` |

---

## 4. Scenario Walkthroughs: Execution, Observation & Diagnosis

### Scenario 1: `link_r2_r4_down` (Physical Link Failure)

#### Injection Command:
```bash
python3 -m app.collector.fault_lab apply link_r2_r4_down --confirm-lab ps035
```

#### Expected Telemetry Observations:
- **Interfaces**: `r2 eth2` is `DOWN`, `r4 eth1` is `DOWN` (`NO-CARRIER`).
- **BGP**: Neighbor `10.0.24.2` on R2 transitions to `Idle` / `Active`.
- **Active ICMP Probe**: 100% packet loss between R2 and R4.
- **Syslog**: `%LINK-3-UPDOWN: Interface eth2, changed state to down`.

#### Expected NETSCOPE Diagnosis:
- **Status**: `DIAGNOSIS`
- **Rank #1 Hypothesis**: `R2-R4` (Class: `LINK_FAILURE`, Score: `18/100`, Confidence: `HIGH`).
- **Supporting Evidence**: Corroborated by interface DOWN + 100% probe loss + BGP session collapse.
- **Contradictory Evidence**: `None` (Physical layer and data plane agree).
- **Topology Impact**: Link condition `CONFIRMED_DOWN`. Alternate path `R2 -> R1 -> R3 -> R4` active (`network_partitioned: false`).

#### Restoration & Recovery Verification:
```bash
python3 -m app.collector.fault_lab restore link_r2_r4_down --confirm-lab ps035
python3 -m app.collector.fault_lab check
docker exec clab-ps035-r2 vtysh -c "show ip bgp summary"
```

---

### Scenario 2: `bgp_r1_r2_shutdown` (Control Plane BGP Mismatch)

#### Injection Command:
```bash
python3 -m app.collector.fault_lab apply bgp_r1_r2_shutdown --confirm-lab ps035
```

#### Expected Telemetry Observations:
- **Interfaces**: `r1 eth1` and `r2 eth1` remain `UP`.
- **Active ICMP Probe**: 0% packet loss, nominal RTT (~0.05ms) across `10.0.12.0/30`.
- **BGP**: Neighbor `10.0.12.2` on R1 transitions to `Idle (Admin)`.
- **Syslog**: `%BGP-5-ADJCHANGE: neighbor 10.0.12.2 Down User shutdown`.

#### Expected NETSCOPE Diagnosis:
- **Status**: `DIAGNOSIS`
- **Rank #1 Hypothesis**: `R1-R2` (Class: `BGP_SESSION_FAILURE`, Score: `10/100`, Confidence: `HIGH`).
- **Supporting Evidence**: BGP adjacency down + syslog notification.
- **Contradictory Evidence**: Interface `eth1` is `UP` and ICMP probe reports 0% loss, which **contradicts** a physical cable severance and isolates the defect to BGP configuration.
- **Topology Impact**: Link condition `DEGRADED`. Data-plane path remains connected (`network_partitioned: false`).

#### Restoration & Recovery Verification:
```bash
python3 -m app.collector.fault_lab restore bgp_r1_r2_shutdown --confirm-lab ps035
docker exec clab-ps035-r1 vtysh -c "show ip bgp summary" | grep "10.0.12.2"
```

---

### Scenario 3: `route_r5_withdrawal` (Route Missing from RIB)

#### Injection Command:
```bash
python3 -m app.collector.fault_lab apply route_r5_withdrawal --confirm-lab ps035
```

#### Expected Telemetry Observations:
- **Interfaces**: All router interfaces remain `UP`.
- **BGP Adjacencies**: All sessions remain `Established`.
- **Routing Table (RIB)**: Prefix `192.168.5.1/32` missing from R4 and upstream routing tables.
- **Syslog**: BGP update/withdrawal notifications.

#### Expected NETSCOPE Diagnosis:
- **Status**: `DIAGNOSIS`
- **Rank #1 Hypothesis**: `R4-R5` (Class: `PREFIX_WITHDRAWAL`, Score: `8/100`, Confidence: `MEDIUM`).
- **Topology Impact**: Physical topology intact (`actual_partition: false`). Specific loopback route unroutable.

#### Restoration & Recovery Verification:
```bash
python3 -m app.collector.fault_lab restore route_r5_withdrawal --confirm-lab ps035
docker exec clab-ps035-r4 vtysh -c "show bgp ipv4 unicast 192.168.5.1/32"
```

---

### Scenario 4: `degraded_r2_r4` (Packet Loss & Latency Spike)

#### Injection Command:
```bash
python3 -m app.collector.fault_lab apply degraded_r2_r4 --confirm-lab ps035
```

#### Expected Telemetry Observations:
- **Interfaces**: Physical interfaces remain `UP`.
- **Active ICMP Probe**: ~20% packet loss, average RTT spikes by ~200ms.
- **BGP**: Adjacencies may stay Established or flap under aggressive keepalive timers.

#### Expected NETSCOPE Diagnosis:
- **Status**: `DIAGNOSIS`
- **Rank #1 Hypothesis**: `R2-R4` (Class: `PERFORMANCE_DEGRADATION`, Score: `10/100`, Confidence: `HIGH`).
- **Topology Impact**: Link condition `DEGRADED`. Graph edges are **not** removed because IP connectivity remains viable.

#### Restoration & Recovery Verification:
```bash
python3 -m app.collector.fault_lab restore degraded_r2_r4 --confirm-lab ps035
docker exec clab-ps035-r2 tc qdisc show dev eth2
```

---

### Scenario 5: `link_r3_r4_down` (Physical Link Failure)

#### Injection Command:
```bash
python3 -m app.collector.fault_lab apply link_r3_r4_down --confirm-lab ps035
```

#### Expected Telemetry Observations:
- **Interfaces**: `r3 eth2` is `DOWN`, `r4 eth2` is `DOWN`.
- **BGP**: Neighbor `10.0.34.2` on R3 transitions to `Idle` / `Active`.
- **Active ICMP Probe**: 100% packet loss between R3 and R4.

#### Expected NETSCOPE Diagnosis:
- **Status**: `DIAGNOSIS`
- **Rank #1 Hypothesis**: `R3-R4` (Class: `LINK_FAILURE`, Score: `18/100`, Confidence: `HIGH`).
- **Topology Impact**: Link condition `CONFIRMED_DOWN`. Alternate path `R3 -> R1 -> R2 -> R4` active.

#### Restoration & Recovery Verification:
```bash
python3 -m app.collector.fault_lab restore link_r3_r4_down --confirm-lab ps035
python3 -m app.collector.fault_lab check
```

---

## 5. Automated Benchmark & Evaluation

NETSCOPE includes an automated, guarded benchmark harness that collects healthy baselines, injects each fault, captures fresh telemetry, restores the network, verifies reconvergence, and evaluates accuracy on strictly held-out data:

```bash
# 1. Run the guarded lab benchmark across all five scenarios (held-out batch)
mkdir -p /tmp/netscope-benchmark && chmod 700 /tmp/netscope-benchmark
python3 tools/run_lab_benchmark.py --output-dir /tmp/netscope-benchmark --confirm-lab ps035 --held-out

# 2. Evaluate held-out accuracy and generate Markdown report
python3 tools/evaluate_runs.py \
  --runs /tmp/netscope-benchmark/runs.jsonl \
  --report docs/EVALUATION_REPORT.md \
  --json-output frontend/public/demo/benchmark_results.json
```

---

## 6. Demonstration Fallback & Offline Replay

When presenting in an environment without Docker, Linux container privileges, or cloud connectivity:

1. **Static Replay Fallback**:
   - The UI automatically loads verified, authentic telemetry snapshots from `frontend/public/demo/scenarios/*.json`.
   - Every scenario preserves original router observations, timestamps, and multi-signal correlations.
2. **Explicit Data Provenance**:
   - The UI displays an authoritative provenance header (`RECORDED_REPLAY` or `TEST_FIXTURE`) with `injection_run_id` and `snapshot_id`.
   - Explicit disclaimer: *"RECORDED REPLAY: Never present recorded data as live telemetry."*
3. **Interactive Investigation**:
   - Operators can click any node or link to trace raw evidence, review contradictory signals, and inspect BFS path impact.
   - The Benchmark Dashboard reads `/demo/benchmark_results.json` directly with zero hardcoded values.

---

## 7. Known Limitations & Edge Cases

1. **BGP Convergence Latency**:
   - Following interface restoration, BGP hold-down timers require 15–30 seconds to re-establish peering. The automated harness implements a 240s exponential polling loop to guarantee convergence before subsequent tests.
2. **Missing Telemetry vs. Network Faults**:
   - A failed telemetry poll or unreachable router is flagged as `INSUFFICIENT_TELEMETRY` or missing evidence; NETSCOPE never conflates collection failures with network disruptions.
3. **Decoupled Packet Loss & Latency**:
   - Partial packet loss (e.g. 20% in `degraded_r2_r4`) does not break physical topology edges. Graph edges are severed only upon confirmed bidirectional carrier drop or 100% active probe loss.
4. **Mandatory Explicit Abstention**:
   - When on a healthy baseline or when signals are ambiguous, NETSCOPE explicitly abstains from asserting uncorroborated faults to eliminate false alarms.
