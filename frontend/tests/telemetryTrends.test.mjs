import test from 'node:test';
import assert from 'node:assert/strict';
import {filterTrendHistory, summarizeTrendHistory} from '../src/utils/telemetryTrends.js';

const origin = Date.parse('2026-11-16T10:00:00Z');
const history = [
  {observed_at:new Date(origin-90*60_000).toISOString(),links:[{link:'R1-R2',source_router:'R1',target_router:'R2',packet_loss_percent:0,rtt_avg_ms:2,probes_available:1}]},
  {observed_at:new Date(origin-30*60_000).toISOString(),links:[{link:'R1-R2',source_router:'R1',target_router:'R2',packet_loss_percent:100,rtt_avg_ms:null,probes_available:1},{link:'R1-R2',source_router:'R2',target_router:'R1',packet_loss_percent:0,rtt_avg_ms:3,probes_available:1},{link:'R2-R4',source_router:'R2',target_router:'R4',packet_loss_percent:0,rtt_avg_ms:7,probes_available:1}]},
  {observed_at:new Date(origin).toISOString(),links:[]},
];

test('time window is anchored to the newest recorded sample and retains empty samples as gaps',()=> {
  const recent=filterTrendHistory(history,{minutes:30});
  assert.equal(recent.length,2);
  assert.equal(recent[1].links.length,0);
  assert.deepEqual(filterTrendHistory(history,{minutes:10}).map(sample=>sample.links.length),[0]);
  assert.deepEqual(filterTrendHistory(history,{minutes:0}),[]);
});

test('link selection keeps both directions while dropping unrelated links',()=> {
  const selected=filterTrendHistory(history,{minutes:120,link:'R1-R2'});
  assert.equal(selected[1].links.length,2);
  assert.ok(selected.every(sample=>sample.links.every(point=>point.link==='R1-R2')));
});

test('summary reports directional asymmetry and excludes unavailable measurements',()=> {
  const summary=summarizeTrendHistory(history.slice(0,2));
  assert.equal(summary.probeReadings,4);
  assert.equal(summary.probeDirections,4);
  assert.equal(summary.averageRttMs,4);
  assert.equal(summary.averageLossPercent,25);
  assert.equal(summary.peakLossPercent,100);
});
