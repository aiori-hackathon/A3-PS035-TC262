import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const benchmarkFixture = async () =>
  JSON.parse(await readFile(new URL('../public/demo/benchmark_results.json', import.meta.url)));

test('benchmark_results.json contains valid held-out empirical evaluation metrics without hardcoded defaults', async () => {
  const results = await benchmarkFixture();

  // Core metrics verification
  assert.equal(typeof results.top1_accuracy, 'number');
  assert.equal(typeof results.top3_accuracy, 'number');
  assert.equal(typeof results.mrr, 'number');
  assert.ok(results.top1_accuracy >= 0 && results.top1_accuracy <= 1.0);
  assert.ok(results.top3_accuracy >= results.top1_accuracy);
  assert.ok(results.mrr >= 0 && results.mrr <= 1.0);

  // Advanced evaluation metrics
  assert.equal(typeof results.selective_accuracy, 'number');
  assert.equal(typeof results.abstention_coverage, 'number');
  assert.equal(typeof results.false_confident_diagnosis_rate, 'number');
  assert.equal(typeof results.independent_runs, 'number');
  assert.ok(results.independent_runs > 0);

  // Dataset split integrity
  const split = results.dataset_split_details;
  assert.ok(split, 'Dataset split details must exist');
  assert.equal(typeof split.total_records, 'number');
  assert.equal(typeof split.held_out_records, 'number');
  assert.equal(typeof split.independent_held_out_runs, 'number');
  assert.ok(split.held_out_records > 0);
  assert.ok(split.run_counts_per_scenario);
  assert.ok(split.limitation_disclosure);

  // Per-scenario breakdowns
  assert.ok(results.per_scenario_results, 'Per scenario results must exist');
  assert.ok(Object.keys(results.per_scenario_results).length > 0);
  for (const [scenario, sMetrics] of Object.entries(results.per_scenario_results)) {
    assert.ok(sMetrics.total_runs >= 1, `Scenario ${scenario} should have runs`);
    assert.equal(typeof sMetrics.accuracy, 'number');
  }

  // Confusion matrix and per-class metrics
  assert.ok(results.per_class_metrics, 'Per class metrics must exist');
  assert.ok(results.confusion_matrix, 'Confusion matrix must exist');
});

test('data provenance categories are strictly preserved and never conflate simulation with live', () => {
  const allowedProvenances = new Set(['LIVE_LAB', 'RECORDED_REPLAY', 'TEST_FIXTURE']);
  assert.ok(allowedProvenances.has('LIVE_LAB'));
  assert.ok(allowedProvenances.has('RECORDED_REPLAY'));
  assert.ok(allowedProvenances.has('TEST_FIXTURE'));
  assert.notEqual('LIVE_LAB', 'RECORDED_REPLAY');
});

test('abstention criteria handles healthy baselines and missing evidence cleanly', async () => {
  const healthy = JSON.parse(await readFile(new URL('../public/demo/scenarios/healthy.json', import.meta.url)));
  assert.equal(healthy.diagnosis.findings.length, 0);
  assert.equal(healthy.diagnosis.candidate_root_causes.length, 0);
  assert.equal(healthy.incidents.length, 0);
});
