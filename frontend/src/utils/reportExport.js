import { savedTime, snapshotOf, sourceOf, titleOf } from './investigationList.js';

const scalar = value => ['string','number','boolean'].includes(typeof value) ? value : null;
const pick = (value, fields) => Object.fromEntries(fields.filter(key => scalar(value?.[key]) !== null).map(key => [key, value[key]]));
const records = (value, fields) => Array.isArray(value) ? value.filter(item => item && typeof item === 'object').map(item => ({ ...pick(item,fields), ...(Array.isArray(item.evidence_ids) ? {evidence_ids:item.evidence_ids.filter(id=>typeof id==='string')} : {}) })) : [];
export const EXPORT_SECTIONS = ['diagnosis', 'evidence', 'incidents', 'impact', 'notes'];
export function buildReportExport(record, selected = {}, exportedAt = new Date().toISOString()) {
  const snapshot = snapshotOf(record);
  const time = savedTime(record);
  const report = {
    format: 'netscope-report', version: 1, exported_at: exportedAt,
    metadata: { title: titleOf(record), source: sourceOf(record), saved_at: time === null ? null : new Date(time).toISOString(), scenario: scalar(record.scenarioId), snapshot_available: !!snapshot,
      observed_at: scalar(snapshot?.telemetry?.collected_at), captured_at: scalar(snapshot?.investigation?.completed_at), operation: scalar(snapshot?.investigation?.operation) },
    disclaimer: sourceOf(record) === 'demo' ? 'Synthetic telemetry and prerecorded diagnosis; not a live incident.' : 'Stored investigation; suspected causes are not confirmed faults. Observation time differs from save/export time.',
    included_sections: EXPORT_SECTIONS.filter(key => selected[key]),
  };
  if (selected.diagnosis) report.diagnosis = snapshot ? {
    findings: records(snapshot.diagnosis?.findings,['id','router','link','neighbor','type','severity','message']),
    suspected_causes: records(snapshot.diagnosis?.candidate_root_causes,['id','suspected_link','candidate_link','type','fault_type','severity','assessment','explanation','evidence','recommended_action']),
    optional_model: snapshot.diagnosis?.optional_model ? {
      status: scalar(snapshot.diagnosis.optional_model.status), reason: scalar(snapshot.diagnosis.optional_model.reason),
      algorithm: scalar(snapshot.diagnosis.optional_model.algorithm), training_runs: scalar(snapshot.diagnosis.optional_model.training_runs),
      score_semantics: scalar(snapshot.diagnosis.optional_model.score_semantics),
      predictions: records(snapshot.diagnosis.optional_model.predictions,['candidate_link','relative_score']),
      explanation: Array.isArray(snapshot.diagnosis.optional_model.explanation) ? snapshot.diagnosis.optional_model.explanation.filter(value=>typeof value==='string') : [],
    } : null,
  } : null;
  if (selected.evidence) report.evidence = snapshot ? records(snapshot.evidence,['id','timestamp','source','router','link','target','type','severity','observation','message']) : null;
  if (selected.incidents) report.incidents = snapshot ? records(snapshot.incidents,['id','incident_id','title','status','severity','affected_link','candidate_link','detected_at','first_detected_at','last_observed_at','resolved_at','description','assessment']) : null;
  if (selected.impact) {
    const impact = snapshot?.diagnosis?.impact_analysis;
    report.impact = impact ? { ...pick(impact,['message','limitations','analysis_type','network_partitioned','alternate_path_type']),
      affected_links: Array.isArray(impact.affected_links) ? impact.affected_links.map(item=>typeof item==='string'?item:pick(item,['link','subnet','alternate_path_exists','impact','assessment'])) : [],
      affected_bgp_sessions: Array.isArray(impact.affected_bgp_sessions) ? impact.affected_bgp_sessions.filter(item=>typeof item==='string') : [],
      alternate_path: Array.isArray(impact.alternate_path) ? impact.alternate_path.filter(item=>typeof item==='string') : [],
    } : null;
  }
  if (selected.notes) report.notes = typeof record.notes === 'string' ? record.notes : '';
  return report;
}
export function reportFilename(record) {
  const name = titleOf(record).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70) || 'investigation';
  return `netscope-${name}.json`;
}
