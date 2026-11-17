import { loadDemoScenario } from './demoScenarios.js';
import { fetchLiveSnapshot, validateLiveSnapshot } from './liveApi.js';

export function liveInvestigation(data) {
  validateLiveSnapshot(data);
  return {
    scenario: { id: 'live_network', name: 'Live network investigation', mode: 'live', simulated: false },
    telemetry: { collected_at: data.observed_at, routers: data.routers.map(router => ({ router: router.id, healthy_collection: router.collection_ok, status: router.status, findings_count: router.findings_count })) },
    topology: data.topology,
    diagnosis: data.diagnosis,
    evidence: data.evidence.map(item => ({ ...item, source: item.evidence_source || 'stored_telemetry', timestamp: data.observed_at })),
    incidents: data.incidents,
    provenance: { source: 'live', kind: data.provenance, observed_at: data.observed_at, served_at: data.served_at, freshness: data.freshness, incidents_total: data.incidents_total },
  };
}
export async function runInvestigation({ source, scenarioId, endpoint, user, signal, currentUid, demoLoader = loadDemoScenario, liveLoader = fetchLiveSnapshot, now = () => new Date().toISOString() }) {
  const startedAt = now();
  let snapshot;
  if (source === 'demo') snapshot = await demoLoader(scenarioId, { signal });
  else if (source === 'live') snapshot = liveInvestigation(await liveLoader({ endpoint, user, signal, currentUid }));
  else throw new Error('Choose a supported investigation source.');
  signal?.throwIfAborted();
  if (currentUid && currentUid() !== user?.uid) throw new Error('Your session changed. Start a new investigation.');
  // Detach the result from subsequent loader/polling updates. Only this result is saved.
  const result = JSON.parse(JSON.stringify(snapshot));
  result.investigation = { started_at: startedAt, completed_at: now(), operation: source === 'demo' ? 'review_recorded_diagnosis' : 'diagnose_stored_telemetry', limitation: 'Suspected causes require verification. No new telemetry collection or fault control was performed.' };
  return result;
}

export function relatedContext(snapshot, selection) {
  const findings = snapshot.diagnosis.findings;
  const causes = snapshot.diagnosis.candidate_root_causes;
  const evidence = snapshot.evidence || [];
  if (!selection) return { findings, causes, evidence };
  const isRouter = selection.kind === 'router';
  const linkId = cause => cause.suspected_link || cause.candidate_link;
  const relatedCauses = causes.filter(cause => isRouter ? linkId(cause)?.split('-').includes(selection.id) : linkId(cause) === selection.id);
  const relatedFindings = findings.filter(item => isRouter ? item.router?.toUpperCase() === selection.id : item.link === selection.id || relatedCauses.some(cause => cause.observations?.some(observation => observation.router === item.router && observation.neighbor === item.neighbor)));
  const cited = new Set([...relatedFindings, ...relatedCauses].flatMap(item => item.evidence_ids || []));
  const relatedEvidence = evidence.filter(item => cited.has(item.id) || (isRouter ? item.router?.toUpperCase() === selection.id : item.link === selection.id || relatedFindings.some(finding => finding.router === item.router && finding.neighbor === item.neighbor && finding.type === item.type)));
  return { findings: relatedFindings, causes: relatedCauses, evidence: relatedEvidence };
}
export function investigativeSteps(snapshot, context) {
  const types = context.findings.map(item => String(item.type).toLowerCase());
  const steps = ['Compare the observation time with the incident window before drawing conclusions.'];
  if (types.some(type => type.includes('collection') || type.includes('parsed'))) steps.push('Ask an authorized operator to verify collection completeness before ruling out faults.');
  if (types.some(type => type.includes('interface') || type.includes('link'))) steps.push('Verify interface state at both endpoints and correlate it with the recorded routing symptoms.');
  if (types.some(type => type.includes('bgp') || type.includes('prefix'))) steps.push('Compare BGP peer state and intended peer configuration at both endpoints; a BGP symptom alone does not confirm a physical failure.');
  if (!context.findings.length) steps.push('No matching findings are recorded. Check coverage and independent reachability evidence; this does not establish network health.');
  if (snapshot.scenario.mode === 'live') steps.push('Request fresh telemetry through the authorized operator workflow if the stored snapshot is stale or incomplete.');
  steps.push('Confirm competing hypotheses with independent observations before making any network changes.');
  return steps;
}
