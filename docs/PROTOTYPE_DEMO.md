# NETSCOPE prototype demonstration

## Mentor walkthrough

1. Show the five-router/five-link PS-035 topology and the collector's interface,
   BGP, bounded syslog and bidirectional ICMP observations.
2. Open the Live Monitoring page and identify the source and age of its stored
   snapshot. Point out where missing data is represented as unknown.
3. Review the rule-based ranked hypotheses and supporting observations. Explain
   that the score is a ranking weight, not a probability, and show the unsupported
   conclusion path.
4. If the isolated Ubuntu lab is available, run one guarded scenario through the
   benchmark runner, observe the recorded diagnosis, and verify restoration before
   ending the demo. Never inject faults into venue or production equipment.
5. Show evaluation tooling and explain that accuracy is reported only after
   independent held-out runs are collected. Optional model comparisons remain
   experimental and cannot replace the rule baseline.

## Diagnosis pseudocode

```text
snapshot = collect_from_five_lab_routers()
observations = parse_bgp(snapshot) + parse_interfaces(snapshot)
observations += probe_each_adjacency_both_directions(snapshot)
observations += summarize_available_router_logs(snapshot)

if collection_is_incomplete(snapshot):
    preserve_unknowns_and_do_not_resolve_active_incidents()

hypotheses = correlate_observations_with_configured_topology(observations)
ranked = sort_by_transparent_rule_score(hypotheses)

if ranked has no supported candidate:
    report_insufficient_evidence()
else:
    for candidate in ranked:
        show_rank_score_and_supporting_observations(candidate)
        label_as_hypothesis_not_confirmed_root_cause()

if optional_model_is_configured:
    compare_model_output_without_replacing_rule_baseline()
    abstain_when_features_are_unknown_or_model_prefers_no_fault()
```

## Safe benchmark sequence

```text
verify_exact_isolated_lab()
baseline = collect_and_require_complete_healthy_baseline()
for scenario in selected_fixed_scenarios:
    apply_fixed_fault_with_explicit_lab_confirmation()
    try:
        fault_snapshot = collect()
    finally:
        restore_same_scenario()
    recovered = collect()
    require_interface_and_bgp_states_match_baseline()
    for delay/loss scenario: require_netem_qdisc_is_absent()
    append_labeled_non_held_out_record()
```

The executable version is `tools/run_lab_benchmark.py`; the first invocation should
be `--dry-run`. Real runs require the operator to use the Ubuntu VM that owns the
isolated lab and explicitly confirm `ps035`.
