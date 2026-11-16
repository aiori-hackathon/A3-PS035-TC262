import { useEffect, useState } from 'react';
import { Link } from 'react-router';
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
  const [source, setSource] = useState('demo');
  const [scenarioId, setScenarioId] = useState('healthy');
  return <div className="workspace-page live-page fault-page">
    <header className="workspace-header"><Link className="workspace-brand" to="/dashboard">NETSCOPE.</Link><nav aria-label="Workspace"><Link to="/dashboard">Dashboard</Link><Link to="/dashboard/investigations">My Investigations</Link><Link to="/dashboard/live">Live monitoring</Link><Link to="/demo">Demo</Link></nav></header>
    <main className="live-main"><p className="live-eyebrow">EVIDENCE / HYPOTHESES / VERIFICATION</p><h1>Fault investigation</h1><p>Select a source, review a fixed diagnostic result, then preserve the evidence. Changing source clears the current result.</p>
      <section className="live-panel"><h2>1. Choose observations</h2><div className="fault-selectors"><label>Source<select value={source} onChange={event => setSource(event.target.value)}><option value="demo">Demo · simulated</option><option value="live">Live · stored telemetry</option></select></label>{source === 'demo' && <label>Recorded scenario<select value={scenarioId} onChange={event => setScenarioId(event.target.value)}>{SCENARIO_IDS.map(id => <option key={id} value={id}>{text(id)}</option>)}</select></label>}</div></section>
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
    <section className="live-panel"><h2>2. Start investigation</h2><p>{source === 'demo' ? 'Review the prerecorded diagnosis for this simulated scenario. This does not run new analysis.' : 'Request the backend diagnosis of its latest stored telemetry. This is read-only and does not trigger collection or control the lab.'}</p>
      {disabled && <p role="status">{configuration.error || 'Live API is not configured. You can investigate demo scenarios independently.'}</p>}
      <button disabled={disabled || state.status === 'loading'} onClick={start}>{state.status === 'loading' ? 'Preparing investigation…' : attempt ? 'Start a new investigation' : source === 'demo' ? 'Review recorded diagnosis' : 'Diagnose stored telemetry'}</button>
      <p role="status">{state.status === 'idle' ? 'Ready when you are.' : state.status === 'loading' ? 'Loading observations and diagnosis…' : state.status === 'complete' ? 'Result captured. It will not change automatically.' : 'Investigation unavailable.'}</p>
      {state.error && <p role="alert" className="live-error">{state.error}</p>}
    </section>
    {snapshot && <>
      <section className="live-panel"><h2>3. Inspect the result</h2><p><strong>{source === 'demo' ? 'SIMULATED DEMO · recorded diagnosis' : 'LIVE SOURCE · stored observations'}</strong></p><p>{snapshot.investigation.limitation}</p>
        {source === 'live' && <p>{freshness(snapshot.provenance)}. API response time does not establish telemetry freshness.</p>}
        <dl className="live-times"><div><dt>Observed at</dt><dd>{date(snapshot.telemetry.collected_at)}</dd></div><div><dt>Review started</dt><dd>{date(snapshot.investigation.started_at)}</dd></div><div><dt>Result captured</dt><dd>{date(snapshot.investigation.completed_at)}</dd></div></dl>
        {snapshot.diagnosis.coverage && <p>Coverage: {snapshot.diagnosis.coverage.routers_collected}/{snapshot.diagnosis.coverage.routers_total} routers · {snapshot.diagnosis.coverage.links_measured}/{snapshot.diagnosis.coverage.links_total} links probed · {snapshot.diagnosis.coverage.syslog_events} parsed log events.</p>}
        {snapshot.diagnosis.diagnosis_status === 'insufficient_evidence' && <p role="status">{snapshot.diagnosis.unsupported_conclusion || 'Available evidence does not support a specific fault conclusion.'}</p>}
        <h3>Router and link context</h3><div className="live-routers">{snapshot.telemetry.routers.map(router => <button key={router.router} aria-pressed={selection?.id === router.router.toUpperCase()} onClick={() => setSelection({kind:'router',id:router.router.toUpperCase()})}><strong>{router.router.toUpperCase()}</strong><span>{router.healthy_collection === true ? 'Collection succeeded' : 'Collection incomplete or unknown'}</span></button>)}</div>
        <div className="live-links">{snapshot.topology.links.map(link => <button key={link.id} aria-pressed={selection?.id === link.id} onClick={() => setSelection({kind:'link',id:link.id})}><strong>{link.id}</strong><span>Physical: {text(link.physical_status)}</span><span>Recorded status: {text(link.status)}</span></button>)}</div>
        <h3>{selection ? `Context: ${selection.id}` : 'All observations'}</h3>{selection && <button onClick={() => setSelection(null)}>Show all observations</button>}
        <h3>Recorded findings ({context.findings.length})</h3>{context.findings.map((item,index) => <article className="live-record" key={index}><strong>{text(item.type)} · {text(item.severity)}</strong><p>{item.message ? text(item.message) : `Evidence references: ${text(item.evidence_ids)}`}</p><small>{text(item.router)} · {text(item.link || item.neighbor)}</small></article>)}{!context.findings.length && <p>No matching findings; missing evidence is not proof of health.</p>}
        {snapshot.diagnosis.measurements && <><h3>Active probe measurements</h3>{snapshot.diagnosis.measurements.map(link => <article className="live-record" key={link.link}><strong>{link.link}</strong>{(link.observations || []).map((probe,index) => <p key={`${probe.router}-${index}`}>{text(probe.router?.toUpperCase())} → {text(probe.target_address || probe.target)}: {probe.available ? `${probe.packets_received ?? '—'}/${probe.packets_sent ?? '—'} replies · ${probe.packet_loss_percent ?? '—'}% loss · ${Number.isFinite(probe.rtt_avg_ms) ? `${probe.rtt_avg_ms} ms average RTT` : 'RTT unavailable'}` : 'Probe unavailable; missing evidence.'}</p>)}</article>)}</>}
        {snapshot.diagnosis.syslog_events && <><h3>Parsed router log events</h3>{snapshot.diagnosis.syslog_events.length ? snapshot.diagnosis.syslog_events.map((event,index) => <article className="live-record" key={`${event.router}-${index}`}><strong>{text(event.router)} · {text(event.event_type)}</strong><p>{text(event.message)}</p></article>) : <p>No matching events were parsed from the available logs.</p>}</>}
        <h3>Ranked hypotheses ({context.causes.length})</h3>{context.causes.map((cause,index) => <article className="live-record" key={index}><strong>#{cause.rank || index + 1} {text(cause.suspected_link || cause.candidate_link)} · {text(cause.confidence_label || 'confidence not rated')} · score {text(cause.score)}</strong><p>{text(cause.assessment || cause.explanation || cause.reason)}</p><p>Support: {text(cause.evidence || cause.evidence_ids)}</p>{cause.supporting_signals?.map((signal,signalIndex) => <small key={signalIndex} className="live-signal">{text(signal.source)} · {text(signal.type)} · {text(signal.router)} · {text(signal.message)}</small>)}</article>)}{!context.causes.length && <p>No supported correlated hypothesis recorded for this context.</p>}
        {snapshot.diagnosis.optional_model && <div className="live-optional-model"><h3>Optional model comparison <span>EXPERIMENTAL</span></h3><p>{text(snapshot.diagnosis.optional_model.reason)}</p>{snapshot.diagnosis.optional_model.status === 'available' && <><p>Method: {text(snapshot.diagnosis.optional_model.algorithm)} · trained on {text(snapshot.diagnosis.optional_model.training_runs)} runs. Relative scores are not calibrated probabilities.</p>{snapshot.diagnosis.optional_model.predictions.map(item => <p key={item.candidate_link}><strong>{text(item.candidate_link)}</strong> · relative score {text(item.relative_score)}</p>)}<small>Signals considered: {snapshot.diagnosis.optional_model.explanation.map(text).join(', ') || 'none'}</small></>}</div>}
        <h3>Supporting observations ({context.evidence.length})</h3>{context.evidence.map((item,index) => <article className="live-record" key={item.id || index}><strong>{text(item.id)} · {text(item.source)}</strong><p>{text(item.message || item.observation)}</p><small>{text(item.router)} · {date(item.timestamp)}</small></article>)}{!context.evidence.length && <p>No associated evidence recorded. Verify coverage before reaching a conclusion.</p>}
      </section>
      <section className="live-panel"><h2>Estimated impact</h2><p>Impact applies to the full captured result, including faults outside the selected context.</p><p>{text(snapshot.diagnosis.impact_analysis?.limitations || snapshot.diagnosis.impact_analysis?.message)}</p>{(snapshot.diagnosis.impact_analysis?.affected_links || []).map((item,index) => <article className="live-record" key={index}><strong>{text(typeof item === 'string' ? item : item.link)}{item.impact && ` · ${text(item.impact)}`}</strong>{item.assessment && <p>{text(item.assessment)}</p>}</article>)}</section>
      <section className="live-panel"><h2>4. Suggested investigative steps</h2><p>Recommendations for an authorized operator; these checks have not been executed.</p><ol>{investigativeSteps(snapshot, context).map(step => <li key={step}>{step}</li>)}</ol></section>
      <section className="live-panel"><h2>5. Preserve this result</h2><p>Saves the complete captured snapshot, including observations outside the selected context. {source === 'live' && 'This copies network observations into your private Firestore investigation history.'}</p><SaveInvestigation key={attempt} scenario={snapshot} /></section>
    </>}
  </>;
}
