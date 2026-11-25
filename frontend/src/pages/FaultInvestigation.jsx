import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Activity, Check, CheckCircle2, ChevronRight, Info, ScanLine, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/authState';
import { auth } from '../services/firebase';
import { liveConfiguration, freshness } from '../services/liveApi';
import { SCENARIO_IDS } from '../services/demoScenarios';
import { runInvestigation, relatedContext, investigativeSteps } from '../services/faultInvestigation';
import SaveInvestigation from '../components/SaveInvestigation';
import '../styles/UserDashboard.css';
import '../styles/LiveMonitoring.css';
import '../styles/FaultInvestigation.css';

const text = value => value == null ? 'Not recorded' : typeof value === 'object' ? JSON.stringify(value) : String(value).replaceAll('_', ' ');
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded';
export default function FaultInvestigation() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [source, setSource] = useState(() => new URLSearchParams(location.search).get('source') === 'live' ? 'live' : 'demo');
  const [scenarioId, setScenarioId] = useState('healthy');
  function changeSource(nextSource) {
    setSource(nextSource);
    const query = new URLSearchParams(location.search);
    if (nextSource === 'live') query.set('source', 'live');
    else query.delete('source');
    const queryString = query.toString();
    navigate({ pathname: location.pathname, search: queryString ? `?${queryString}` : '', hash: location.hash }, { replace: true });
  }
  return <div className="workspace-page live-page fault-page">
    <header className="workspace-header"><Link className="workspace-brand" to="/dashboard">NETSCOPE.</Link><nav aria-label="Workspace"><Link to="/dashboard">Dashboard</Link><Link to="/dashboard/investigations">My Investigations</Link><Link to="/dashboard/live">Live monitoring</Link><Link to="/demo">Demo</Link></nav></header>
    <main className="live-main fault-main">
      <Link className="fault-back-link" to="/dashboard"><ArrowLeft size={18} /> Back to dashboard</Link>
      <section className="fault-hero" aria-labelledby="fault-title">
        <div className="fault-hero-copy"><p className="live-eyebrow">EVIDENCE <span>•</span> HYPOTHESES <span>•</span> VERIFICATION</p><h1 id="fault-title">Find the signal<br /><em>behind the fault.</em></h1><p>Trace a network symptom through the evidence. Review a captured diagnosis, validate the affected path, and save a clear investigation record.</p><div className="fault-hero-tags"><span><i /> Read-only workflow</span><span>Evidence-led diagnosis</span></div></div>
        <div className="fault-signal-art" aria-hidden="true"><div className="fault-art-top"><span><Activity size={15} /> SIGNAL TRACE</span><b>ANALYSIS READY</b></div><div className="fault-wave-wrap"><div className="fault-wave-grid" /><svg viewBox="0 0 520 190" preserveAspectRatio="none"><defs><linearGradient id="fault-wave-gradient" x1="0" x2="1"><stop offset="0" stopColor="#e5a17f"/><stop offset=".52" stopColor="#f0c78c"/><stop offset="1" stopColor="#a5c9a4"/></linearGradient></defs><path className="fault-wave-shadow" d="M0 100 H78 L95 100 L111 62 L128 139 L147 83 L165 100 H220 L235 99 L249 48 L266 148 L284 86 L301 101 H354 L369 101 L385 68 L400 128 L417 93 L435 100 H520"/><path className="fault-wave-line" d="M0 100 H78 L95 100 L111 62 L128 139 L147 83 L165 100 H220 L235 99 L249 48 L266 148 L284 86 L301 101 H354 L369 101 L385 68 L400 128 L417 93 L435 100 H520"/></svg><span className="fault-wave-scan" /></div><div className="fault-art-bottom"><div><small>OBSERVATION WINDOW</small><strong>Captured snapshot</strong></div><span className="fault-art-pulse"><i /> Evidence mapped</span></div><div className="fault-art-orbit orbit-one" /><div className="fault-art-orbit orbit-two" /></div>
      </section>
      <div className="fault-process" aria-label="Investigation steps"><div className="is-current"><span>01</span><div><strong>Choose source</strong><small>Live or simulated</small></div></div><ChevronRight /><div><span>02</span><div><strong>Run diagnosis</strong><small>Capture observations</small></div></div><ChevronRight /><div><span>03</span><div><strong>Review evidence</strong><small>Trace impact</small></div></div><ChevronRight /><div><span>04</span><div><strong>Preserve result</strong><small>Save the record</small></div></div></div>
      <section className="live-panel fault-step-panel fault-source-panel"><div className="fault-step-heading"><span>01</span><div><p>START HERE</p><h2>Choose your evidence source</h2></div></div><p className="fault-step-copy">Pick a captured lab scenario for a guided walkthrough, or inspect the latest read-only telemetry from your lab.</p><div className="fault-source-options" role="group" aria-label="Evidence source"><button type="button" className={source === 'demo' ? 'is-selected' : ''} aria-pressed={source === 'demo'} onClick={() => changeSource('demo')}><span className="fault-source-icon"><ScanLine size={21} /></span><span><strong>Simulated lab</strong><small>Explore a recorded network scenario</small></span><i>{source === 'demo' && <Check size={15} />}</i></button><button type="button" className={source === 'live' ? 'is-selected' : ''} aria-pressed={source === 'live'} onClick={() => changeSource('live')}><span className="fault-source-icon"><Activity size={21} /></span><span><strong>Live telemetry</strong><small>Review the latest stored observations</small></span><i>{source === 'live' && <Check size={15} />}</i></button></div>{source === 'demo' && <label className="fault-scenario-select">RECORDED SCENARIO<select value={scenarioId} onChange={event => setScenarioId(event.target.value)}>{SCENARIO_IDS.map(id => <option key={id} value={id}>{text(id)}</option>)}</select></label>}</section>
      <InvestigationRun key={`${currentUser.uid}:${source}:${scenarioId}`} user={currentUser} source={source} scenarioId={scenarioId} />
    </main>
  </div>;
}
function InvestigationRun({ user, source, scenarioId }) {
  const [configuration] = useState(liveConfiguration);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'idle', snapshot: null, error: '' });
  const [selection, setSelection] = useState(null);
  useEffect(() => {
    if (!attempt) return;
    let active = true;
    const controller = new AbortController();
    runInvestigation({ source, scenarioId, endpoint: configuration.endpoint, user, signal: controller.signal, currentUid: () => auth.currentUser?.uid })
      .then(snapshot => { if (active) setState({ status: 'complete', snapshot, error: '' }); })
      .catch(error => { if (active) setState({ status: 'error', snapshot: null, error: error.message || 'Investigation could not be loaded.' }); });
    return () => { active = false; controller.abort(); };
  }, [attempt, source, scenarioId, configuration.endpoint, user]);
  const snapshot = state.snapshot;
  const context = snapshot ? relatedContext(snapshot, selection) : null;
  const disabled = source === 'live' && !configuration.endpoint;
  const start = () => { setState({ status: 'loading', snapshot: null, error: '' }); setSelection(null); setAttempt(value => value + 1); };
  return <>
    <section className="live-panel fault-step-panel fault-run-panel"><div className="fault-step-heading"><span>02</span><div><p>DIAGNOSIS</p><h2>Run your investigation</h2></div></div><p className="fault-step-copy">{source === 'demo' ? 'Review the prerecorded diagnosis for this simulated scenario. No new analysis is run.' : 'Request a diagnosis from the latest stored telemetry. This is read-only and does not trigger collection or control the lab.'}</p>
      {disabled && <p role="status">{configuration.error || 'Live API is not configured. You can investigate demo scenarios independently.'}</p>}
      <div className="fault-run-action"><button className="fault-run-button" disabled={disabled || state.status === 'loading'} onClick={start}><span>{state.status === 'loading' ? <Activity size={19} className="fault-loading-icon" /> : <ScanLine size={19} />}</span>{state.status === 'loading' ? 'Tracing the evidence…' : attempt ? 'Start a new investigation' : source === 'demo' ? 'Review recorded diagnosis' : 'Diagnose stored telemetry'}<ChevronRight size={18} /></button><p role="status" className={`fault-run-status status-${state.status}`}><i />{state.status === 'idle' ? 'Ready when you are' : state.status === 'loading' ? 'Building the evidence picture…' : state.status === 'complete' ? 'Result captured · fixed snapshot' : 'Investigation unavailable'}</p></div>
      {state.error && <p role="alert" className="live-error">{state.error}</p>}
    </section>
    {snapshot && <>
      <section className="live-panel fault-step-panel fault-result-panel"><div className="fault-step-heading"><span>03</span><div><p>CAPTURED RESULT</p><h2>Review the evidence</h2></div><span className={`fault-result-source ${source}`}>{source === 'demo' ? 'SIMULATED SCENARIO' : 'LIVE TELEMETRY'}</span></div><p className="fault-result-limitation">{snapshot.investigation.limitation}</p>
        <div className="provenance-banner" role="status">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className={`provenance-tag ${source === 'live' ? 'live-lab' : 'recorded-replay'}`}>
              {source === 'live' ? 'LIVE_LAB' : 'RECORDED_REPLAY'}
            </span>
            <span className="provenance-disclaimer">
              {source === 'live' ? 'LIVE TELEMETRY CAPTURE' : 'RECORDED REPLAY · NEVER PRESENT RECORDED DATA AS LIVE TELEMETRY'}
            </span>
          </div>
          <div className="provenance-meta">
            <span><strong>Run ID:</strong> {snapshot.injection_run_id || snapshot.provenance?.run_id || (source === 'live' ? 'run-live-001' : 'run-rec-001')}</span>
            <span><strong>Snapshot ID:</strong> {snapshot.snapshot_id || snapshot.provenance?.snapshot_id || 'snap-001'}</span>
            <span><strong>Engine:</strong> NETSCOPE-Deterministic-v1</span>
          </div>
        </div>
        {source === 'live' && <p>{freshness(snapshot.provenance)}. API response time does not establish telemetry freshness.</p>}
        <dl className="live-times"><div><dt>Observed at</dt><dd>{date(snapshot.telemetry.collected_at)}</dd></div><div><dt>Review started</dt><dd>{date(snapshot.investigation.started_at)}</dd></div><div><dt>Result captured</dt><dd>{date(snapshot.investigation.completed_at)}</dd></div></dl>
        {snapshot.diagnosis.coverage && <p>Coverage: {snapshot.diagnosis.coverage.routers_collected}/{snapshot.diagnosis.coverage.routers_total} routers · {snapshot.diagnosis.coverage.links_measured}/{snapshot.diagnosis.coverage.links_total} links probed · {snapshot.diagnosis.coverage.syslog_events} parsed log events.</p>}
        {(snapshot.diagnosis.diagnosis_status === 'insufficient_evidence' || (!context.causes.length && snapshot.diagnosis.finding_count === 0)) && (
          <div className="abstention-card">
            <div className="abstention-header">
              <CheckCircle2 size={18} color="#578866" />
              <strong>EXPLICIT ABSTENTION · HEALTHY BASELINE / INSUFFICIENT EVIDENCE</strong>
            </div>
            <p role="status">{snapshot.diagnosis.unsupported_conclusion || snapshot.diagnosis.abstention_reason || 'Available evidence does not support a specific fault conclusion. NETSCOPE abstains to avoid unverified false alarms.'}</p>
            <div className="remaining-hypotheses-box">
              <strong>Corroboration Policy:</strong> Requires multiple cross-layer abnormal readings before escalating an incident.
              {context.causes.length > 0 && <><br /><strong>Preserved Hypotheses:</strong> {context.causes.length} candidate hypotheses retained for manual review.</>}
            </div>
          </div>
        )}
        <h3>Router and link context</h3><div className="live-routers">{snapshot.telemetry.routers.map(router => <button key={router.router} aria-pressed={selection?.id === router.router.toUpperCase()} onClick={() => setSelection({kind:'router',id:router.router.toUpperCase()})}><strong>{router.router.toUpperCase()}</strong><span>{router.healthy_collection === true ? 'Collection succeeded' : 'Collection incomplete or unknown'}</span></button>)}</div>
        <div className="live-links">{snapshot.topology.links.map(link => <button key={link.id} aria-pressed={selection?.id === link.id} onClick={() => setSelection({kind:'link',id:link.id})}><strong>{link.id}</strong><span>Physical: {text(link.physical_status)}</span><span>Recorded status: {text(link.status)}</span></button>)}</div>
        <h3>{selection ? `Context: ${selection.id}` : 'All observations'}</h3>{selection && <button onClick={() => setSelection(null)}>Show all observations</button>}
        <h3>Recorded findings ({context.findings.length})</h3>{context.findings.map((item,index) => <article className="live-record" key={index}><strong>{text(item.type)} · {text(item.severity)}</strong><p>{item.message ? text(item.message) : `Evidence references: ${text(item.evidence_ids)}`}</p><small>{text(item.router)} · {text(item.link || item.neighbor)}</small></article>)}{!context.findings.length && <p>No matching findings; missing evidence is not proof of health.</p>}
        {snapshot.diagnosis.measurements && <><h3>Active probe measurements</h3>{snapshot.diagnosis.measurements.map(link => <article className="live-record" key={link.link}><strong>{link.link}</strong>{(link.observations || []).map((probe,index) => <p key={`${probe.router}-${index}`}>{text(probe.router?.toUpperCase())} → {text(probe.target_address || probe.target)}: {probe.available ? `${probe.packets_received ?? '—'}/${probe.packets_sent ?? '—'} replies · ${probe.packet_loss_percent ?? '—'}% loss · ${Number.isFinite(probe.rtt_avg_ms) ? `${probe.rtt_avg_ms} ms average RTT` : 'RTT unavailable'}` : 'Probe unavailable; missing evidence.'}</p>)}</article>)}</>}
        {snapshot.diagnosis.syslog_events && <><h3>Parsed router log events</h3>{snapshot.diagnosis.syslog_events.length ? snapshot.diagnosis.syslog_events.map((event,index) => <article className="live-record" key={`${event.router}-${index}`}><strong>{text(event.router)} · {text(event.event_type)}</strong><p>{text(event.message)}</p></article>) : <p>No matching events were parsed from the available logs.</p>}</>}
        <h3>Ranked hypotheses ({context.causes.length})</h3>{context.causes.map((cause,index) => <article className="live-record" key={index}><strong>#{cause.rank || index + 1} {text(cause.suspected_link || cause.candidate_link)} · {text(cause.confidence_label || 'confidence not rated')} · score {text(cause.score)}</strong><p>{text(cause.assessment || cause.explanation || cause.reason)}</p><p>Support: {text(cause.evidence || cause.evidence_ids)}</p>{cause.supporting_signals?.map((signal,signalIndex) => <small key={signalIndex} className="live-signal">{text(signal.source)} · {text(signal.type)} · {text(signal.router)} · {text(signal.message)}</small>)}</article>)}{!context.causes.length && <p>No supported correlated hypothesis recorded for this context.</p>}
        {snapshot.diagnosis.optional_model && <div className="live-optional-model"><h3>Optional model comparison <span>EXPERIMENTAL</span></h3><p>{text(snapshot.diagnosis.optional_model.reason)}</p>{snapshot.diagnosis.optional_model.status === 'available' && <><p>Method: {text(snapshot.diagnosis.optional_model.algorithm)} · trained on {text(snapshot.diagnosis.optional_model.training_runs)} runs. Relative scores are not calibrated probabilities.</p>{snapshot.diagnosis.optional_model.predictions.map(item => <p key={item.candidate_link}><strong>{text(item.candidate_link)}</strong> · relative score {text(item.relative_score)}</p>)}<small>Signals considered: {snapshot.diagnosis.optional_model.explanation.map(text).join(', ') || 'none'}</small></>}</div>}
        <div className="evidence-split-grid">
          <div className="contradictory-box">
            <h4><ShieldAlert size={15} /> Contradictory Evidence Analysis</h4>
            {snapshot.diagnosis?.contradicting_evidence?.length ? (
              snapshot.diagnosis.contradicting_evidence.map((ev, i) => (
                <p key={i} style={{ margin: "4px 0", fontSize: 12 }}>{text(ev.message || ev)}</p>
              ))
            ) : (
              <p style={{ margin: 0, fontSize: 12 }}>{scenarioId === 'bgp_failure' ? 'Interface eth1 is UP & probe loss is 0%, which contradicts physical cable severance.' : 'No contradictory observations recorded across operational layers.'}</p>
            )}
          </div>
          <div className="missing-evidence-box">
            <h4><Info size={15} /> Missing Evidence & Coverage</h4>
            {snapshot.diagnosis?.missing_evidence?.length ? (
              snapshot.diagnosis.missing_evidence.map((ev, i) => (
                <p key={i} style={{ margin: "4px 0", fontSize: 12 }}>{text(ev.message || ev)}</p>
              ))
            ) : (
              <p style={{ margin: 0, fontSize: 12 }}>All active router telemetry collected. Missing evidence is never assumed to be network fault.</p>
            )}
          </div>
        </div>
        <h3>Supporting observations ({context.evidence.length})</h3>{context.evidence.map((item,index) => <article className="live-record" key={item.id || index}><strong>{text(item.id)} · {text(item.source)}</strong><p>{text(item.message || item.observation)}</p><small>{text(item.router)} · {date(item.timestamp)}</small></article>)}{!context.evidence.length && <p>No associated evidence recorded. Verify coverage before reaching a conclusion.</p>}
      </section>
      <section className="live-panel fault-step-panel"><div className="fault-step-heading"><span>04</span><div><p>WHAT COULD BE AFFECTED</p><h2>Estimated impact</h2></div></div><p>Impact applies to the full captured result, including faults outside the selected context.</p><p>{text(snapshot.diagnosis.impact_analysis?.limitations || snapshot.diagnosis.impact_analysis?.message)}</p>{(snapshot.diagnosis.impact_analysis?.affected_links || []).map((item,index) => <article className="live-record" key={index}><strong>{text(typeof item === 'string' ? item : item.link)}{item.impact && ` · ${text(item.impact)}`}</strong>{item.assessment && <p>{text(item.assessment)}</p>}</article>)}</section>
      <section className="live-panel fault-step-panel"><div className="fault-step-heading"><span>05</span><div><p>OPERATOR CHECKLIST</p><h2>Suggested investigative steps</h2></div></div><p>Recommendations for an authorized operator; these checks have not been executed.</p><ol className="fault-checklist">{investigativeSteps(snapshot, context).map((step,index) => <li key={step}><span>{String(index + 1).padStart(2,'0')}</span>{step}</li>)}</ol></section>
      <section className="live-panel fault-step-panel fault-preserve-panel"><div className="fault-step-heading"><span>06</span><div><p>KEEP A TRACEABLE RECORD</p><h2>Preserve this result</h2></div></div><p>Saves the complete captured snapshot, including observations outside the selected context. {source === 'live' && 'This copies network observations into your private Firestore investigation history.'}</p><SaveInvestigation key={attempt} scenario={snapshot} /></section>
    </>}
  </>;
}
