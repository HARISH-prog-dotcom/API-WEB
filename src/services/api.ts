import type {
  AnalyzedEvent,
  CsvValidationResult,
  DatasetQualitySummary,
  DashboardMetrics,
  ExplanationEngineMode,
  InvestigationDisposition,
  StructuredRiskExplanation,
  TriageStatus,
  WorkspaceStateResponse,
} from '../types/sentinel';

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      typeof (data as { error?: string }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed with HTTP ${res.status}`;
    const err = new Error(errMsg) as Error & { payload?: unknown; status?: number };
    err.payload = data;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function fetchWorkspaceState(): Promise<WorkspaceStateResponse> {
  const res = await fetch('/api/state');
  return handleJson<WorkspaceStateResponse>(res);
}

export interface DemoBundleResponse {
  datasetLabel: string;
  e04Count: number;
  e18Count: number;
  e19Count: number;
  normalEvent: AnalyzedEvent;
  criticalEvent: AnalyzedEvent;
  approvedSensitiveEvent: AnalyzedEvent | null;
  totalAlerts: number;
  metrics: DashboardMetrics;
}

export async function fetchDemoBundle(): Promise<DemoBundleResponse> {
  const res = await fetch('/api/demo/bundle');
  return handleJson<DemoBundleResponse>(res);
}

export async function validateCsvPayloads(payload: {
  e04Csv?: string;
  e18Csv?: string;
  e19Csv?: string;
}): Promise<{
  e04: CsvValidationResult | null;
  e18: CsvValidationResult | null;
  e19: CsvValidationResult | null;
  quality: DatasetQualitySummary;
}> {
  const res = await fetch('/api/ingest/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function analyzeUploadedCsvs(payload: {
  e04Csv?: string;
  e18Csv: string;
  e19Csv?: string;
  datasetLabel?: string;
}): Promise<WorkspaceStateResponse> {
  const res = await fetch('/api/ingest/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson<WorkspaceStateResponse>(res);
}

export async function loadSyntheticDataset(): Promise<WorkspaceStateResponse> {
  const res = await fetch('/api/dataset/load-synthetic', { method: 'POST' });
  return handleJson<WorkspaceStateResponse>(res);
}

export async function resetWorkspaceDataset(): Promise<WorkspaceStateResponse> {
  const res = await fetch('/api/dataset/reset', { method: 'POST' });
  return handleJson<WorkspaceStateResponse>(res);
}

export async function updateAlertTriage(
  requestId: string,
  triageStatus: TriageStatus
): Promise<WorkspaceStateResponse> {
  const res = await fetch(`/api/alerts/${encodeURIComponent(requestId)}/triage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ triageStatus }),
  });
  return handleJson<WorkspaceStateResponse>(res);
}

export async function addAlertNote(
  requestId: string,
  text: string,
  author = 'Maya Lin (Lead SOC Analyst)'
): Promise<WorkspaceStateResponse> {
  const res = await fetch(`/api/alerts/${encodeURIComponent(requestId)}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author, text }),
  });
  return handleJson<WorkspaceStateResponse>(res);
}

export async function saveInvestigationConclusion(
  requestId: string,
  payload: {
    confirmedFacts: string;
    openHypotheses: string;
    disposition: InvestigationDisposition;
  }
): Promise<WorkspaceStateResponse> {
  const res = await fetch(`/api/alerts/${encodeURIComponent(requestId)}/conclusion`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson<WorkspaceStateResponse>(res);
}

export async function updateEngineSettings(payload: {
  alertThreshold: number;
  baselineFraction: number;
}): Promise<WorkspaceStateResponse> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson<WorkspaceStateResponse>(res);
}

export async function requestRiskExplanation(
  requestId: string,
  mode: ExplanationEngineMode
): Promise<{
  explanation: StructuredRiskExplanation;
}> {
  const res = await fetch('/api/ai/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, mode }),
  });
  return handleJson<{ explanation: StructuredRiskExplanation }>(res);
}
