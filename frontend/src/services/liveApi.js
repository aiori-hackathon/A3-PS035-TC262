export function liveEndpoint(base, origin = globalThis.location?.origin || 'http://localhost') {
  if (!base?.trim()) return null;
  if (base !== '/api' && !/^https?:\/\//.test(base)) throw new Error('Use /api or an absolute HTTPS API URL.');
  const url = new URL(base, origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || (base.startsWith('/') && base !== '/api')) {
    throw new Error('Live API must use HTTPS (or loopback HTTP) with no credentials, query or fragment.');
  }
  return `${url.href.replace(/\/$/, '')}/live/snapshot`;
}
export function liveConfiguration() {
  try { return { endpoint: liveEndpoint(import.meta.env.VITE_LIVE_API_BASE_URL), error: '' }; }
  catch (error) { return { endpoint: null, error: error.message }; }
}
export function validateLiveSnapshot(data) {
  if (data?.schema_version !== 1 || data.source !== 'live' || data.provenance !== 'backend_recorded_snapshot'
      || !Array.isArray(data.routers) || !Array.isArray(data.topology?.links)
      || !Array.isArray(data.diagnosis?.findings) || !Array.isArray(data.diagnosis?.candidate_root_causes)
      || !Array.isArray(data.evidence) || !Array.isArray(data.incidents)) throw new Error('The backend returned an unsupported snapshot.');
  const strings = (item, fields) => item && typeof item === 'object' && fields.every(field => typeof item[field] === 'string');
  const history = data.history ?? [];
  if (!Number.isInteger(data.incidents_total) || (data.diagnosis.impact_analysis?.limitations != null && typeof data.diagnosis.impact_analysis.limitations !== 'string') || data.routers.length > 100 || data.topology.links.length > 1000 || data.evidence.length > 10000
    || !data.routers.every(item => strings(item, ['id', 'status']) && typeof item.collection_ok === 'boolean' && Number.isInteger(item.findings_count))
    || !data.topology.links.every(item => strings(item, ['id','a','b','status','physical_status']))
    || !data.diagnosis.findings.every(item => strings(item, ['router','type','severity','message']))
    || !data.diagnosis.candidate_root_causes.every(item => strings(item, ['candidate_link','severity','assessment','evidence']) && Array.isArray(item.observations) && item.observations.every(value => strings(value,['router','neighbor'])))
    || !data.incidents.every(item => item && Object.values(item).every(value => value === null || typeof value === 'string'))
    || !Array.isArray(history) || history.length > 120
    || !history.every(sample => strings(sample, ['observed_at']) && Array.isArray(sample.links) && sample.links.length <= 1000
      && sample.links.every(link => strings(link, ['link']) && Number.isInteger(link.probes_available) && link.probes_available >= 0
        && ['packet_loss_percent','rtt_avg_ms'].every(key => link[key] === null || (typeof link[key] === 'number' && Number.isFinite(link[key]) && link[key] >= 0))
        && (link.packet_loss_percent === null || link.packet_loss_percent <= 100)))
    || (data.diagnosis.impact_analysis?.affected_links && (!Array.isArray(data.diagnosis.impact_analysis.affected_links) || !data.diagnosis.impact_analysis.affected_links.every(item => strings(item,['link','impact','assessment']))))) {
    throw new Error('The backend snapshot contains invalid records.');
  }
  return data;
}
export function freshness(data, now = Date.now()) {
  if (data?.freshness === 'unknown') return 'Unknown observation time';
  if (data?.freshness === 'stale') return 'Stale telemetry';
  const observed = Date.parse(data?.observed_at);
  if (!Number.isFinite(observed) || observed > now) return 'Unknown observation time';
  return now - observed > 180000 ? 'Stale telemetry' : 'Recent recorded telemetry';
}
export async function fetchLiveSnapshot({ endpoint, user, signal, fetcher = fetch, timeoutMs = 10000, currentUid = () => user?.uid }) {
  if (!endpoint) throw new Error('Live API is not configured.');
  if (!user?.uid) throw Object.assign(new Error('Sign in to access live monitoring.'), { status: 401 });
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = () => reject(Object.assign(new Error(signal?.aborted ? 'Request cancelled.' : 'Backend request timed out.'), { name: 'AbortError' })); controller.signal.addEventListener('abort', rejectAbort, { once: true }); if (controller.signal.aborted) rejectAbort(); });
  try {
    const operation = async () => {
      const token = await user.getIdToken();
      controller.signal.throwIfAborted();
      if (currentUid() !== user.uid) throw new Error('Your session changed. Sign in again.');
      const response = await fetcher(endpoint, { method: 'GET', signal: controller.signal, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', credentials: 'omit', redirect: 'error' });
      if (!response.ok) {
        const messages = {401:'Session expired or invalid. Sign in again.',403:'Your account is not authorized for this network.',404:'No telemetry has been collected yet.',503:'Backend or authentication service is not ready.'};
        throw Object.assign(new Error(messages[response.status] || 'The backend could not provide a snapshot.'), { status: response.status });
      }
      const data = validateLiveSnapshot(await response.json());
      if (currentUid() !== user.uid) throw new Error('Your session changed. Sign in again.');
      return data;
    };
    return await Promise.race([operation(), aborted]);
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', rejectAbort);
  }
}
