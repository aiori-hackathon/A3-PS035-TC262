export function filterIncidents(incidents, filter = 'all') {
  const records = Array.isArray(incidents) ? incidents : [];
  if (filter === 'active') return records.filter(item => item?.status?.toUpperCase() === 'ACTIVE');
  if (filter === 'resolved') return records.filter(item => item?.status?.toUpperCase() === 'RESOLVED');
  return records;
}

export function incidentSpan(incident) {
  const start = Date.parse(incident?.first_detected_at);
  const end = Date.parse(incident?.resolved_at || incident?.last_observed_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const minutes = Math.floor((end - start) / 60000);
  if (minutes < 1) return 'Under 1 minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
