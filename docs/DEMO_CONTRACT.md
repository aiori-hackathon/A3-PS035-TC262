# NETSCOPE Demo Contract: Fault Catalog, Evidence Matrix & Diagnostic Result Contract

## 1. Executive Summary & Purpose

This contract defines the operational specifications, ground-truth fault catalog, multi-layer evidence matrix, identifiability analysis, and standard diagnostic result schema for NETSCOPE's PS-035 demonstration.

NETSCOPE provides transparent, evidence-ranked root cause localization over an instrumented five-router autonomous system (AS) network. It correlates Linux kernel network interfaces, FRRouting (FRR) eBGP states, container syslog streams, and active bidirectional ICMP telemetry into deterministic diagnostic hypotheses.

---

## 2. PS-035 Five-Router Lab Topology Reference

The reference topology consists of five autonomous system border routers configured in Containerlab (`lab/ps035.clab.yml` and `lab/topology.json`):

| Router ID | Container Name | AS Number | Role | Configured Interfaces & Subnets |
| :--- | :--- | :--- | :--- | :--- |
| **r1** | `clab-ps035-r1` | 65001 | Edge | `eth1`: 10.0.12.1/30 (to R2), `eth2`: 10.0.13.1/30 (to R3), `lo`: 192.168.1.1/32 |
| **r2** | `clab-ps035-r2` | 65002 | Edge | `eth1`: 10.0.12.2/30 (to R1), `eth2`: 10.0.24.1/30 (to R4), `lo`: 192.168.2.1/32 |
| **r3** | `clab-ps035-r3` | 65003 | Core | `eth1`: 10.0.13.2/30 (to R1), `eth2`: 10.0.34.1/30 (to R4), `lo`: 192.168.3.1/32 |
| **r4** | `clab-ps035-r4` | 65004 | Core | `eth1`: 10.0.24.2/30 (to R2), `eth2`: 10.0.34.2/30 (to R3), `eth3`: 10.0.45.1/30 (to R5), `lo`: 192.168.4.1/32 |
| **r5** | `clab-ps035-r5` | 65005 | Edge | `eth1`: 10.0.45.2/30 (to R4), `lo`: 192.168.5.1/32 |

### Configured Inter-Router Links:
1. **`R1-R2`**: Subnet `10.0.12.0/30` | `r1 eth1` (`10.0.12.1`) $\longleftrightarrow$ `r2 eth1` (`10.0.12.2`)
2. **`R1-R3`**: Subnet `10.0.13.0/30` | `r1 eth2` (`10.0.13.1`) $\longleftrightarrow$ `r3 eth1` (`10.0.13.2`)
3. **`R2-R4`**: Subnet `10.0.24.0/30` | `r2 eth2` (`10.0.24.1`) $\longleftrightarrow$ `r4 eth1` (`10.0.24.2`)
4. **`R3-R4`**: Subnet `10.0.34.0/30` | `r3 eth2` (`10.0.34.1`) $\longleftrightarrow$ `r4 eth2` (`10.0.34.2`)
5. **`R4-R5`**: Subnet `10.0.45.0/30` | `r4 eth3` (`10.0.45.1`) $\longleftrightarrow$ `r5 eth1` (`10.0.45.2`)

---

## 3. The Five Seeded Fault Scenarios

Every fault is executed only through the guarded controller (`app.collector.fault_lab`) requiring explicit confirmation (`--confirm-lab ps035`). Arbitrary shell snippets and unmanaged container names are strictly prohibited.

```
                      +-------------------+
                      |      Router R1    |
                      |      AS 65001     |
                      +---------+---------+
                               / \
              10.0.12.0/30    /   \   10.0.13.0/30
     [Fault 2: BGP Shutdown] /     \
                            /       \
              +------------+         +------------+
              |  Router R2 |         |  Router R3 |
              |  AS 65002  |         |  AS 65003  |
              +-----+------+         +------+-----+
                    |                       |
       10.0.24.0/30 |                       | 10.0.34.0/30
   [Fault 1: Link Down]                     | [Fault 5: Link Down]
   [Fault 4: Delay/Loss]                    |
                    |                       |
              +-----+-----------------------+-----+
              |              Router R4            |
              |              AS 65004             |
              +-------------------+---------------+
                                  |
                     10.0.45.0/30 | [Fault 3: Prefix Withdrawal]
                                  |
                      +-----------+-------+
                      |      Router R5    |
                      |      AS 65005     |
                      +-------------------+
```

### Scenario 1: `link_r2_r4_down`
- **Scenario ID**: `link_r2_r4_down`
- **Fault Category**: Interface / Physical link failure (`interface_down`)
- **Affected Router**: `r2` (target `eth2`)
- **Affected Link**: `R2-R4` (`10.0.24.0/30`)
- **Injection Mechanism**:
  ```sh
  docker exec clab-ps035-r2 ip link set dev eth2 down
  ```
- **Expected Interface Observations**:
  - `r2`: `eth2` reports status `DOWN`.
  - `r4`: `eth1` may remain `UP` (Linux veth namespace decoupling).
- **Expected BGP Observations**:
  - `r2`: Neighbor `10.0.24.2` drops from `Established` to `Active` or `Idle`.
  - `r4`: Neighbor `10.0.24.1` drops from `Established` to `Connect` or `Active`.
- **Expected Syslog Observations**:
  - `r2`: `%BGP-5-ADJCHANGE: neighbor 10.0.24.2 Down` and/or `eth2 link down`.
  - `r4`: `%BGP-5-ADJCHANGE: neighbor 10.0.24.1 Down`.
- **Expected Active Probe Observations**:
  - `r2 -> r4` (`10.0.24.1 -> 10.0.24.2`): 100% packet loss (`ACTIVE_PROBE_PACKET_LOSS`, loss=100%).
  - `r4 -> r2` (`10.0.24.2 -> 10.0.24.1`): 100% packet loss (`ACTIVE_PROBE_PACKET_LOSS`, loss=100%).
- **Ground-Truth Diagnosis**: Candidate Link `R2-R4`, Rank 1, Confidence `high` (score $\ge 14$).
- **Restoration Procedure**:
  ```sh
  docker exec clab-ps035-r2 ip link set dev eth2 up
  ```
- **Recovery Verification**: `r2 eth2` returns to `UP`, BGP neighbor `10.0.24.2` reaches `Established`.

---

### Scenario 2: `bgp_r1_r2_shutdown`
- **Scenario ID**: `bgp_r1_r2_shutdown`
- **Fault Category**: Control-plane BGP peer shutdown (`bgp_peer_shutdown`)
- **Affected Router**: `r1` (administrative shutdown of neighbor `10.0.12.2`)
- **Affected Link / Peering**: Link `R1-R2` (`10.0.12.0/30`)
- **Injection Mechanism**:
  ```sh
  docker exec clab-ps035-r1 vtysh -c 'configure terminal' -c 'router bgp 65001' -c 'neighbor 10.0.12.2 shutdown'
  ```
- **Expected Interface Observations**:
  - `r1 eth1` and `r2 eth1` remain **`UP`** (physical link is healthy).
- **Expected BGP Observations**:
  - `r1`: Neighbor `10.0.12.2` transitions to `Idle (Admin)` / `Idle`.
  - `r2`: Neighbor `10.0.12.1` transitions to `Active` / `Idle`.
- **Expected Syslog Observations**:
  - `r1`: `%BGP-5-ADJCHANGE: neighbor 10.0.12.2 Down User reset`.
  - `r2`: `%BGP-5-ADJCHANGE: neighbor 10.0.12.1 Down BGP Notification`.
- **Expected Active Probe Observations**:
  - `r1 -> r2` (`10.0.12.1 -> 10.0.12.2`): **0% packet loss**, RTT normal (~2-5 ms).
  - `r2 -> r1` (`10.0.12.2 -> 10.0.12.1`): **0% packet loss**, RTT normal (~2-5 ms).
- **Ground-Truth Diagnosis**: Candidate Link `R1-R2`, Rank 1, Confidence `medium` (score 6-8). Contradictory evidence (healthy interface and 0% probe loss) isolates fault to control plane.
- **Restoration Procedure**:
  ```sh
  docker exec clab-ps035-r1 vtysh -c 'configure terminal' -c 'router bgp 65001' -c 'no neighbor 10.0.12.2 shutdown'
  ```
- **Recovery Verification**: `r1` neighbor `10.0.12.2` and `r2` neighbor `10.0.12.1` reach `Established`.

---

### Scenario 3: `route_r5_withdrawal`
- **Scenario ID**: `route_r5_withdrawal`
- **Fault Category**: Routing policy prefix starvation (`prefix_withdrawal`)
- **Affected Router**: `r5` (withdrawal of loopback `192.168.5.1/32`)
- **Affected Link / Prefix**: Link `R4-R5` (`10.0.45.0/30`), Prefix `192.168.5.1/32`
- **Injection Mechanism**:
  ```sh
  docker exec clab-ps035-r5 vtysh -c 'configure terminal' -c 'router bgp 65005' -c 'address-family ipv4 unicast' -c 'no network 192.168.5.1/32'
  ```
- **Expected Interface Observations**:
  - All interfaces remain `UP`.
- **Expected BGP Observations**:
  - `r4`: Neighbor `10.0.45.2` session remains `Established`, but `State/PfxRcd` changes to **`0`** (`NO_PREFIXES_RECEIVED`).
  - `r5`: Session remains `Established`.
- **Expected Syslog Observations**:
  - None. BGP sessions and interfaces remain up.
- **Expected Active Probe Observations**:
  - `r4 -> r5` and `r5 -> r4` (/30 point-to-point IP addresses): **0% loss**, normal RTT.
- **Ground-Truth Diagnosis**: Candidate Link `R4-R5`, Rank 1, Confidence `low` (score 2).
- **Restoration Procedure**:
  ```sh
  docker exec clab-ps035-r5 vtysh -c 'configure terminal' -c 'router bgp 65005' -c 'address-family ipv4 unicast' -c 'network 192.168.5.1/32'
  ```
- **Recovery Verification**: `r4 vtysh -c "show bgp ipv4 unicast 192.168.5.1/32"` contains `"Paths: (1 available, best #1)"`.

---

### Scenario 4: `degraded_r2_r4`
- **Scenario ID**: `degraded_r2_r4`
- **Fault Category**: Performance degradation / SLA breach (`delay_and_loss`)
- **Affected Router**: `r2` (target `eth2` netem queue discipline)
- **Affected Link**: `R2-R4` (`10.0.24.0/30`)
- **Injection Mechanism**:
  ```sh
  docker exec clab-ps035-r2 tc qdisc replace dev eth2 root netem delay 200ms loss 20%
  ```
- **Expected Interface Observations**:
  - Interface `eth2` remains `UP`.
- **Expected BGP Observations**:
  - BGP session on `r2` and `r4` remains `Established` (keepalive tolerance).
- **Expected Syslog Observations**:
  - None under steady-state netem (unless keepalive timeout occurs).
- **Expected Active Probe Observations**:
  - `r2 -> r4`: ~20% packet loss and elevated average RTT ~200 ms.
  - `r4 -> r2`: ~20% packet loss and elevated average RTT ~200 ms (return replies traverse `r2 eth2`).
- **Ground-Truth Diagnosis**: Candidate Link `R2-R4`, Rank 1, Confidence `medium` (score 4-6: `ACTIVE_PROBE_PACKET_LOSS` + `ACTIVE_PROBE_HIGH_LATENCY`).
- **Restoration Procedure**:
  ```sh
  docker exec clab-ps035-r2 tc qdisc del dev eth2 root
  ```
- **Recovery Verification**: `tc qdisc show dev eth2` on `r2` does not contain `netem`, probes return to 0% loss / < 5 ms RTT.

---

### Scenario 5: `link_r3_r4_down`
- **Scenario ID**: `link_r3_r4_down`
- **Fault Category**: Core interface outage (`interface_down`)
- **Affected Router**: `r3` (target `eth2`)
- **Affected Link**: `R3-R4` (`10.0.34.0/30`)
- **Injection Mechanism**:
  ```sh
  docker exec clab-ps035-r3 ip link set dev eth2 down
  ```
- **Expected Interface Observations**:
  - `r3`: `eth2` reports `DOWN`.
  - `r4`: `eth2` may remain `UP`.
- **Expected BGP Observations**:
  - `r3`: Neighbor `10.0.34.2` drops to `Active` or `Idle`.
  - `r4`: Neighbor `10.0.34.1` drops to `Connect` or `Active`.
- **Expected Syslog Observations**:
  - `r3`: `%BGP-5-ADJCHANGE: neighbor 10.0.34.2 Down` and/or `eth2 link down`.
  - `r4`: `%BGP-5-ADJCHANGE: neighbor 10.0.34.1 Down`.
- **Expected Active Probe Observations**:
  - `r3 -> r4`: 100% packet loss.
  - `r4 -> r3`: 100% packet loss.
- **Ground-Truth Diagnosis**: Candidate Link `R3-R4`, Rank 1, Confidence `high` (score $\ge 14$).
- **Restoration Procedure**:
  ```sh
  docker exec clab-ps035-r3 ip link set dev eth2 up
  ```
- **Recovery Verification**: `r3 eth2` returns to `UP`, BGP neighbor `10.0.34.2` reaches `Established`.

---

## 4. Fault-to-Evidence Matrix

This matrix categorizes every evidence observation for each scenario into:
- **Supporting (S)**: Direct positive signal supporting the failure hypothesis.
- **Contradictory (C)**: Signal proving a specific layer or link is functional (negating a physical outage).
- **Missing (M)**: Expected telemetry that could not be collected (e.g. timeout or buffer gap).
- **Optional (O)**: Signal that may or may not appear due to timing or buffering (e.g. syslog).
- **Ambiguous (A)**: Signal observed on multiple nodes or compatible with multiple fault types.

| Telemetry Dimension | `link_r2_r4_down` | `bgp_r1_r2_shutdown` | `route_r5_withdrawal` | `degraded_r2_r4` | `link_r3_r4_down` | `healthy_baseline` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Interface `r2 eth2`** | **S**: DOWN (score +4) | **C**: UP | **C**: UP | **C**: UP | **C**: UP | **C**: UP |
| **Interface `r3 eth2`** | **C**: UP | **C**: UP | **C**: UP | **C**: UP | **S**: DOWN (score +4) | **C**: UP |
| **Other Interfaces** | **C**: UP | **C**: UP | **C**: UP | **C**: UP | **C**: UP | **C**: UP |
| **BGP `r1 <-> r2`** | **C**: Established | **S**: Idle/Active (+6) | **C**: Established | **C**: Established | **C**: Established | **C**: Established |
| **BGP `r2 <-> r4`** | **S**: Not Est (+6) | **C**: Established | **C**: Established | **C**: Established | **C**: Established | **C**: Established |
| **BGP `r3 <-> r4`** | **C**: Established | **C**: Established | **C**: Established | **C**: Established | **S**: Not Est (+6) | **C**: Established |
| **BGP `r4 <-> r5`** | **C**: Established | **C**: Established | **S**: PfxRcd=0 (+2) | **C**: Established | **C**: Established | **C**: Established |
| **Ping `R1-R2`** | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms |
| **Ping `R2-R4`** | **S**: 100% loss (+8) | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **S**: 20% loss, 200ms (+6) | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms |
| **Ping `R3-R4`** | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **S**: 100% loss (+8) | **C**: 0% loss, <5ms |
| **Ping `R4-R5`** | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms | **C**: 0% loss, <5ms |
| **Syslog Events** | **O/S**: R2/R4 down (+2) | **O/S**: R1/R2 down (+2) | **C**: None | **C**: None | **O/S**: R3/R4 down (+2) | **C**: None / Est |
| **Overall Diagnosis** | **Link R2-R4 Down** | **BGP R1-R2 Outage** | **R5 Prefix Starvation**| **R2-R4 Degradation** | **Link R3-R4 Down** | **Insufficient Evidence (Abstain)** |

---

## 5. Identifiability & Ambiguity Analysis

### A. Pairwise Distinguishability

1. **`link_r2_r4_down` vs `link_r3_r4_down`**:
   - Both produce physical cut symptoms (Interface DOWN + 100% probe loss + BGP session down).
   - **Distinguishability: Deterministic.** The subnets (`10.0.24.0/30` vs `10.0.34.0/30`), router IDs (`r2` vs `r3`), and interface names isolate `R2-R4` from `R3-R4`.

2. **`link_r2_r4_down` vs `degraded_r2_r4`**:
   - Both affect link `R2-R4`.
   - **Distinguishability: Deterministic.**
     - Physical cut: `loss = 100%`, `rtt = None`, Interface = `DOWN`, BGP = `Active/Idle`.
     - Degraded link: `loss = 20%`, `rtt ~ 200ms`, Interface = `UP`, BGP = `Established`.
     - The presence of packet replies and established BGP contradicts a physical cut.

3. **`link_r2_r4_down` vs `bgp_r1_r2_shutdown`**:
   - Different links (`R2-R4` vs `R1-R2`).
   - Furthermore, `bgp_r1_r2_shutdown` has `loss = 0%` and interfaces `UP`.

4. **`bgp_r1_r2_shutdown` vs Physical Link Outage on `R1-R2`**:
   - **Distinguishability: Deterministic.**
   - If `R1-R2` suffered a cable cut, `r1 eth1` would be DOWN and ICMP ping would experience 100% loss.
   - For `bgp_r1_r2_shutdown`, ICMP ping succeeds with 0% loss and interfaces remain `UP`. These contradictory signals prove that the underlying link is operational and isolate the failure to BGP peering.

5. **`route_r5_withdrawal` vs Physical Link Outage on `R4-R5`**:
   - **Distinguishability: Deterministic.**
   - In `route_r5_withdrawal`, the BGP session on `R4-R5` remains `Established`, interfaces are `UP`, and the point-to-point ping has 0% loss. Only `State/PfxRcd == 0` is observed.

### B. Inherent Ambiguities & Edge Cases

1. **Docker Syslog Latency & Volatility**:
   Syslog events in containerized environments may suffer buffer loss or timing lag. NETSCOPE treats syslog as **additive confirmation** (+2 score) but never requires syslog to diagnose a fault.
2. **Linux Container Veth Carrier Decoupling**:
   Bringing an interface `DOWN` inside one network namespace does not automatically trigger link-down detection on the peer namespace in some kernel configurations. NETSCOPE overcomes this by requiring bidirectional active probes and bilateral BGP state checks.
3. **Transient Convergence State vs Route Withdrawal**:
   When BGP sessions establish during boot or post-recovery, `State/PfxRcd` may briefly read `0` before routes are exchanged. NETSCOPE benchmark runner requires convergence polling (up to 240 seconds) to ensure transient convergence is not misdiagnosed as prefix withdrawal.

---

## 6. Diagnostic Result Contract (Schema Specification)

Every diagnostic output complies with the following explicit schema contract:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "NetscopeDiagnosticResult",
  "type": "object",
  "required": [
    "schema_version",
    "engine_version",
    "scenario_id",
    "injection_run_id",
    "snapshot_id",
    "source_provenance",
    "observed_at",
    "diagnosis_status",
    "ranked_hypotheses",
    "supporting_evidence",
    "contradicting_evidence",
    "missing_evidence",
    "abstention_reason",
    "topology_impact"
  ],
  "properties": {
    "schema_version": { "type": "integer", "const": 1 },
    "engine_version": { "type": "string", "example": "netscope-engine/1.0.0" },
    "scenario_id": { "type": ["string", "null"], "example": "link_r2_r4_down" },
    "injection_run_id": { "type": ["string", "null"], "example": "link_r2_r4_down-a1b2c3d4e5f6" },
    "snapshot_id": { "type": "string", "example": "telemetry_20261124T000000Z.json" },
    "source_provenance": { "type": "string", "enum": ["lab_containerlab", "live_backend", "simulated_demo"] },
    "observed_at": { "type": "string", "format": "date-time" },
    "diagnosis_status": { "type": "string", "enum": ["ranked_hypotheses", "insufficient_evidence"] },
    "ranked_hypotheses": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["rank", "candidate_link", "subnet", "severity", "score", "confidence_label", "assessment", "affected_routers", "supporting_signals"],
        "properties": {
          "rank": { "type": "integer", "minimum": 1 },
          "candidate_link": { "type": "string", "example": "R2-R4" },
          "subnet": { "type": "string", "example": "10.0.24.0/30" },
          "severity": { "type": "string", "enum": ["CRITICAL", "WARNING", "INFO"] },
          "score": { "type": "integer", "minimum": 0, "maximum": 100 },
          "confidence_label": { "type": "string", "enum": ["high", "medium", "low"] },
          "assessment": { "type": "string" },
          "affected_routers": { "type": "array", "items": { "type": "string" } },
          "supporting_signals": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["source", "type", "router", "message"],
              "properties": {
                "source": { "type": "string", "enum": ["interface_state", "bgp", "active_probe", "syslog"] },
                "type": { "type": "string" },
                "router": { "type": "string" },
                "message": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "supporting_evidence": {
      "type": "array",
      "items": { "type": "object" }
    },
    "contradicting_evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["candidate_link", "source", "observation", "implication"],
        "properties": {
          "candidate_link": { "type": "string" },
          "source": { "type": "string" },
          "observation": { "type": "string" },
          "implication": { "type": "string" }
        }
      }
    },
    "missing_evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["item", "reason", "impact_on_diagnosis"],
        "properties": {
          "item": { "type": "string" },
          "reason": { "type": "string" },
          "impact_on_diagnosis": { "type": "string" }
        }
      }
    },
    "abstention_reason": { "type": ["string", "null"] },
    "topology_impact": {
      "type": "object",
      "required": ["surviving_components", "affected_links"],
      "properties": {
        "surviving_components": { "type": "array", "items": { "type": "array", "items": { "type": "string" } } },
        "affected_links": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["link", "alternate_path_exists", "impact", "assessment"],
            "properties": {
              "link": { "type": "string" },
              "alternate_path_exists": { "type": "boolean" },
              "impact": { "type": "string", "enum": ["REDUNDANT_PATH_AVAILABLE", "NETWORK_PARTITION_RISK"] },
              "assessment": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

---

## 7. Abstention & Evaluation Governance

### Explicit Abstention Contract
1. When all routers report healthy BGP (`Established` with $\ge 1$ prefix), all interfaces are `UP`, and active ICMP probes report 0% packet loss and normal latency, the engine **must abstain**:
   - `diagnosis_status`: `"insufficient_evidence"`
   - `ranked_hypotheses`: `[]`
   - `abstention_reason`: `"Available telemetry does not support a specific fault conclusion. Check collection coverage, router logs, active probes and timestamps."`
2. Fabricating a physical link failure or reporting `"healthy"` as a root cause is strictly prohibited.
3. If an active probe is unavailable (timeout/drop), it is logged as missing evidence with weight `0`—it must not fabricate packet loss.

### Evaluation Protocol
- **Held-Out Separation**: Labeled evaluation runs with `held_out: true` are held out from model tuning.
- **Metrics Reported**:
  - **Top-1 Accuracy**: Proportion of fault runs where the expected link ranks #1.
  - **Top-3 Accuracy**: Proportion of fault runs where the expected link appears within the top 3 candidates.
  - **Mean Reciprocal Rank (MRR)**: Average reciprocal rank $\frac{1}{\text{rank}_i}$ across all fault cases.
  - **Unsupported Abstention Accuracy**: Proportion of no-supported-fault cases correctly returning `"insufficient_evidence"`.
  - **Unsupported Conclusion Rate**: Proportion of no-supported-fault cases incorrectly assigned a fault candidate.
  - **Fault Case Abstention Rate**: Proportion of real faults where the system incorrectly abstained.
