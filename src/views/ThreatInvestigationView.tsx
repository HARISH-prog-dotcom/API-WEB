import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FileDown,
  KeyRound,
  MessageSquare,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { NavSection } from '../components/LayoutShell';
import {
  DatasetProvenanceBar,
  EmptyWorkspaceNotice,
  RiskScoreMeter,
  SeverityTag,
  formatUtcTimestamp,
} from '../components/RiskUI';
import { requestRiskExplanation } from '../services/api';
import type {
  ExplanationEngineMode,
  InvestigationDisposition,
  StructuredRiskExplanation,
  TriageStatus,
  WorkspaceStateResponse,
} from '../types/sentinel';
import { exportAlertInvestigationPdf } from '../utils/exportReports';

interface ThreatInvestigationViewProps {
  state: WorkspaceStateResponse;
  selectedRequestId: string | null;
  onSelectRequestId: (id: string) => void;
  onNavigate: (section: NavSection) => void;
  onUpdateTriage: (requestId: string, status: TriageStatus) => Promise<void>;
  onAddNote: (requestId: string, text: string) => Promise<void>;
  onSaveConclusion: (
    requestId: string,
    payload: {
      confirmedFacts: string;
      openHypotheses: string;
      disposition: InvestigationDisposition;
    }
  ) => Promise<void>;
  onLoadSynthetic: () => void;
  loadingAction: boolean;
}

export const ThreatInvestigationView: React.FC<ThreatInvestigationViewProps> = ({
  state,
  selectedRequestId,
  onSelectRequestId,
  onNavigate,
  onUpdateTriage,
  onAddNote,
  onSaveConclusion,
  onLoadSynthetic,
  loadingAction,
}) => {
  const selectableEvents = useMemo(() => {
    return [...state.events].sort(
      (a, b) => b.riskScore - a.riskScore || Date.parse(b.tsUtc) - Date.parse(a.tsUtc)
    );
  }, [state.events]);

  const activeEvent = useMemo(() => {
    if (selectedRequestId) {
      const match = state.events.find((e) => e.requestId === selectedRequestId);
      if (match) return match;
    }
    return state.alerts[0] ?? selectableEvents[0] ?? null;
  }, [selectedRequestId, state.events, state.alerts, selectableEvents]);

  const [engineMode, setEngineMode] = useState<ExplanationEngineMode>('deterministic');
  const [explanation, setExplanation] = useState<StructuredRiskExplanation | null>(null);
  const [explLoading, setExplLoading] = useState(false);
  const [explError, setExplError] = useState<string | null>(null);

  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [confirmedFacts, setConfirmedFacts] = useState('');
  const [openHypotheses, setOpenHypotheses] = useState('');
  const [disposition, setDisposition] = useState<InvestigationDisposition>('under_investigation');
  const [savingConclusion, setSavingConclusion] = useState(false);
  const [conclusionSavedBanner, setConclusionSavedBanner] = useState(false);

  useEffect(() => {
    if (!activeEvent) return;
    setConfirmedFacts(activeEvent.conclusion?.confirmedFacts ?? '');
    setOpenHypotheses(activeEvent.conclusion?.openHypotheses ?? '');
    setDisposition(activeEvent.conclusion?.disposition ?? 'under_investigation');
    setConclusionSavedBanner(false);
  }, [activeEvent?.requestId, activeEvent?.conclusion?.updatedAt]);

  useEffect(() => {
    if (!activeEvent) return;
    let cancelled = false;
    const loadExplanation = async () => {
      setExplLoading(true);
      setExplError(null);
      try {
        const res = await requestRiskExplanation(activeEvent.requestId, engineMode);
        if (!cancelled) {
          setExplanation(res.explanation);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Unable to generate explanation.';
          setExplError(msg);
          const payload = (err as Error & { payload?: { deterministicExplanation?: StructuredRiskExplanation } }).payload;
          if (payload?.deterministicExplanation) {
            setExplanation(payload.deterministicExplanation);
          }
        }
      } finally {
        if (!cancelled) setExplLoading(false);
      }
    };
    loadExplanation();
    return () => {
      cancelled = true;
    };
  }, [activeEvent?.requestId, engineMode]);

  if (state.datasetSource === 'empty' || !activeEvent) {
    return (
      <div className="space-y-6">
        <DatasetProvenanceBar
          source={state.datasetSource}
          label={state.datasetLabel}
          lastAnalyzedAt={state.lastAnalyzedAt}
          onOpenUpload={() => onNavigate('upload')}
        />
        <EmptyWorkspaceNotice
          onUploadClick={() => onNavigate('upload')}
          onLoadSynthetic={onLoadSynthetic}
          loading={loadingAction}
        />
      </div>
    );
  }

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    setSavingNote(true);
    try {
      await onAddNote(activeEvent.requestId, noteInput.trim());
      setNoteInput('');
    } finally {
      setSavingNote(false);
    }
  };

  const handleConclusionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConclusion(true);
    setConclusionSavedBanner(false);
    try {
      await onSaveConclusion(activeEvent.requestId, {
        confirmedFacts,
        openHypotheses,
        disposition,
      });
      setConclusionSavedBanner(true);
    } finally {
      setSavingConclusion(false);
    }
  };

  // Visual Investigation Timeline entries built strictly from real evidence
  const timelineItems: Array<{
    time: string;
    layer: string;
    title: string;
    detail: string;
    accent: string;
  }> = [];

  if (activeEvent.linkedE04) {
    timelineItems.push({
      time: formatUtcTimestamp(activeEvent.linkedE04.last_used),
      layer: 'E04',
      title: `Approved Integration Profile (${activeEvent.linkedE04.credential_id})`,
      detail: `Owner: ${activeEvent.linkedE04.owner} · Status: ${activeEvent.linkedE04.status} · IP Rule: ${activeEvent.linkedE04.ip_restriction}`,
      accent: 'bg-[#5146E5]',
    });
  } else {
    timelineItems.push({
      time: 'Registration Check',
      layer: 'E04',
      title: `No Registration Record for ${activeEvent.apiKeyId}`,
      detail: 'Credential absent from E04 approved register (+35 risk).',
      accent: 'bg-[#DC2626]',
    });
  }

  if (activeEvent.baselineStats.totalBaselineRequests > 0) {
    timelineItems.push({
      time: `${activeEvent.baselineStats.totalBaselineRequests} prior calls`,
      layer: 'BASELINE',
      title: 'Historical Behavioral Baseline Established',
      detail: `Known IPs: ${activeEvent.baselineStats.knownIps.join(', ')} · Avg Records: ${activeEvent.baselineStats.avgRecords} · Methods: ${activeEvent.baselineStats.knownMethods.join(', ')}`,
      accent: 'bg-[#2563EB]',
    });
  }

  timelineItems.push({
    time: formatUtcTimestamp(activeEvent.tsUtc),
    layer: 'E18',
    title: `Observed API Call: ${activeEvent.method} ${activeEvent.endpoint}`,
    detail: `Request ${activeEvent.requestId} from ${activeEvent.callerIp} (${activeEvent.userAgent || 'unknown UA'}) returned ${activeEvent.recordsReturned.toLocaleString()} records (HTTP ${activeEvent.responseStatus}).`,
    accent: activeEvent.riskScore >= 55 ? 'bg-[#EA580C]' : 'bg-[#2563EB]',
  });

  for (const chg of activeEvent.linkedE19) {
    timelineItems.push({
      time: formatUtcTimestamp(chg.ts_utc),
      layer: 'E19',
      title: `Correlated Vendor Change ${chg.change_id} (${chg.vendor_name})`,
      detail: `Field "${chg.field}" modified: "${chg.old_value}" → "${chg.new_value}" · Approval: ${chg.approval_ref || 'MISSING'} · Matched via request_id ${chg.request_id}`,
      accent: chg.approval_ref ? 'bg-[#0D9488]' : 'bg-[#DC2626]',
    });
  }

  timelineItems.push({
    time: formatUtcTimestamp(state.lastAnalyzedAt),
    layer: 'DETECTION',
    title: `Composite Score ${activeEvent.riskScore}/100 (${activeEvent.severity})`,
    detail: `${activeEvent.signals.length} signal(s) triggered · Isolation Forest score ${activeEvent.isolationForestScore.toFixed(3)} · ${activeEvent.isAlert ? 'Alert Raised' : 'Below Alert Threshold'}`,
    accent: activeEvent.severity === 'CRITICAL' ? 'bg-[#DC2626]' : 'bg-[#9333EA]',
  });

  return (
    <div className="space-y-6">
      <DatasetProvenanceBar
        source={state.datasetSource}
        label={state.datasetLabel}
        lastAnalyzedAt={state.lastAnalyzedAt}
        onOpenUpload={() => onNavigate('upload')}
      />

      {/* Investigation Switcher & Top Header */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#5146E5]">
              Evidence-First Threat Investigation Workspace
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-xl sm:text-2xl font-extrabold text-[#172033]">
                {activeEvent.requestId}
              </h1>
              <SeverityTag severity={activeEvent.severity} size="md" />
              <span className="text-sm font-bold text-[#475569]">
                {activeEvent.integrationName}
              </span>
            </div>
            <p className="text-xs text-[#64748B]">
              Credential <span className="font-mono text-[#172033]">{activeEvent.apiKeyId}</span> ·
              Vendor: {activeEvent.vendor} · Owner: {activeEvent.owner} ·{' '}
              {formatUtcTimestamp(activeEvent.tsUtc)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={activeEvent.requestId}
              onChange={(e) => onSelectRequestId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-2 font-mono text-xs font-semibold text-[#172033] focus:border-[#5146E5] focus:outline-none max-w-[260px]"
              aria-label="Select alert or event to investigate"
            >
              {selectableEvents.slice(0, 30).map((ev) => (
                <option key={ev.requestId} value={ev.requestId}>
                  [{ev.severity} {ev.riskScore}] {ev.requestId} — {ev.integrationName}
                </option>
              ))}
            </select>

            <select
              value={activeEvent.triageStatus}
              onChange={(e) =>
                onUpdateTriage(activeEvent.requestId, e.target.value as TriageStatus)
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#172033] focus:border-[#5146E5] focus:outline-none"
              aria-label="Update triage status"
            >
              <option value="open">Status: Open</option>
              <option value="in_review">Status: In Review</option>
              <option value="reviewed">Status: Reviewed</option>
              <option value="escalated">Status: Escalated</option>
            </select>

            <button
              type="button"
              onClick={() =>
                exportAlertInvestigationPdf(
                  activeEvent,
                  explanation,
                  state.datasetLabel,
                  state.datasetSource
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5146E5] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] whitespace-nowrap cursor-pointer"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export PDF Brief
            </button>
          </div>
        </div>

        {/* Explainable Risk Score Waterfall */}
        <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-[#64748B]">Composite Risk Score</span>
              <span className="font-mono text-xs text-[#64748B]">
                Uncapped sum: {activeEvent.rawUncappedScore} → Capped 100
              </span>
            </div>
            <RiskScoreMeter score={activeEvent.riskScore} severity={activeEvent.severity} />
            <p className="text-[11px] text-[#64748B]">
              Isolation Forest Score:{' '}
              <span className="font-mono font-semibold text-[#172033]">
                {activeEvent.isolationForestScore.toFixed(4)}
              </span>{' '}
              ({activeEvent.isolationForestAtypical ? 'Supporting Outlier +10' : 'Within normal cluster'})
            </p>
          </div>

          <div className="lg:col-span-8 flex flex-wrap gap-2">
            {activeEvent.signals.length === 0 ? (
              <span className="text-xs font-semibold text-[#16A34A]">
                Zero risk signals triggered — request stayed inside approved permissions and baseline.
              </span>
            ) : (
              activeEvent.signals.map((sig) => (
                <div
                  key={sig.code}
                  className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 text-xs"
                >
                  <span className="font-mono font-bold text-[#DC2626] mr-1.5">
                    +{sig.weight}
                  </span>
                  <span className="font-semibold text-[#172033]">{sig.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Three-Layer Evidence Correlation Panel (E04 · E18 · E19) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* E04 Approved Permissions */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5146E5]">
              <KeyRound className="h-4 w-4" />
              E04 Approved Permissions
            </span>
            <span className="font-mono text-[11px] text-[#64748B]">
              {activeEvent.linkedE04 ? activeEvent.linkedE04.credential_id : 'MISSING'}
            </span>
          </div>
          {activeEvent.linkedE04 ? (
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="text-[#64748B]">Approved Scope</dt>
                <dd className="mt-0.5 font-mono text-[11.5px] text-[#172033]">
                  {activeEvent.linkedE04.scope}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <dt className="text-[#64748B]">IP Restriction</dt>
                  <dd className="font-mono font-semibold text-[#172033]">
                    {activeEvent.linkedE04.ip_restriction}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#64748B]">Status</dt>
                  <dd
                    className={`font-bold ${
                      activeEvent.linkedE04.status === 'active'
                        ? 'text-[#16A34A]'
                        : 'text-[#DC2626]'
                    }`}
                  >
                    {activeEvent.linkedE04.status}
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-[#64748B]">Owner & Lifetime</dt>
                <dd className="text-[#172033]">
                  {activeEvent.linkedE04.owner} · {activeEvent.linkedE04.token_lifetime_days}d
                </dd>
              </div>
            </dl>
          ) : (
            <p className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-xs text-[#B91C1C]">
              Credential <span className="font-mono font-bold">{activeEvent.apiKeyId}</span> is NOT registered in the E04 approved register.
            </p>
          )}
        </div>

        {/* E18 Observed Activity */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563EB]">
              <Clock className="h-4 w-4" />
              E18 Observed API Activity
            </span>
            <span className="font-mono text-[11px] text-[#64748B]">{activeEvent.requestId}</span>
          </div>
          <dl className="space-y-2 text-xs">
            <div>
              <dt className="text-[#64748B]">Method & Endpoint</dt>
              <dd className="mt-0.5 font-mono font-semibold text-[#172033] break-all">
                {activeEvent.method} {activeEvent.endpoint}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <dt className="text-[#64748B]">Caller IP</dt>
                <dd
                  className={`font-mono font-semibold ${
                    activeEvent.driftSummary.ipViolation ? 'text-[#DC2626]' : 'text-[#172033]'
                  }`}
                >
                  {activeEvent.callerIp}
                </dd>
              </div>
              <div>
                <dt className="text-[#64748B]">Records / HTTP</dt>
                <dd className="font-mono font-semibold text-[#172033]">
                  {activeEvent.recordsReturned.toLocaleString()} · {activeEvent.responseStatus}
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-[#64748B]">User Agent & UTC Time</dt>
              <dd className="font-mono text-[11px] text-[#475569] truncate">
                {activeEvent.userAgent || '—'} · {formatUtcTimestamp(activeEvent.tsUtc)}
              </dd>
            </div>
          </dl>
        </div>

        {/* E19 Correlated Changes */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D9488]">
              <Database className="h-4 w-4" />
              E19 Correlated Vendor Changes
            </span>
            <span className="font-mono text-[11px] text-[#64748B]">
              {activeEvent.linkedE19.length} linked
            </span>
          </div>
          {activeEvent.linkedE19.length > 0 ? (
            <div className="space-y-2.5 text-xs">
              {activeEvent.linkedE19.map((chg) => (
                <div
                  key={chg.change_id}
                  className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#0D9488]">{chg.change_id}</span>
                    {chg.approval_ref ? (
                      <span className="font-mono text-[11px] font-semibold text-[#16A34A]">
                        {chg.approval_ref}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#DC2626]">
                        <AlertTriangle className="h-3 w-3" />
                        No Approval Ref
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-[#172033]">
                    {chg.vendor_name} · <span className="font-mono">{chg.field}</span>
                  </p>
                  <p className="font-mono text-[11px] text-[#475569] break-all">
                    {chg.old_value} → <strong className="text-[#172033]">{chg.new_value}</strong>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 bg-[#F8FAFC] p-3 text-xs text-[#64748B]">
              No E19 vendor record carries matching request_id <span className="font-mono">{activeEvent.requestId}</span>.
            </p>
          )}
        </div>
      </section>

      {/* Investigation Timeline + AI/Rule Risk Intelligence */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Visual Investigation Timeline */}
        <div className="xl:col-span-5 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
          <h2 className="text-base font-bold text-[#172033]">Visual Investigation Timeline</h2>
          <ol className="relative space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
            {timelineItems.map((item, idx) => (
              <li key={idx} className="relative pl-6">
                <span
                  className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow-xs ${item.accent}`}
                />
                <div className="flex items-center gap-2 text-[11px] text-[#64748B]">
                  <span className="font-mono font-bold text-[#172033]">{item.layer}</span>
                  <span>·</span>
                  <span className="font-mono tabular-nums">{item.time}</span>
                </div>
                <p className="mt-0.5 text-xs font-bold text-[#172033]">{item.title}</p>
                <p className="mt-0.5 text-xs text-[#475569] leading-relaxed">{item.detail}</p>
              </li>
            ))}
          </ol>

          {/* Detection Reasons with Evidence References */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h3 className="text-xs font-bold text-[#172033]">
              Detailed Detection Signal Reasons
            </h3>
            {activeEvent.signals.map((sig) => (
              <div key={sig.code} className="rounded-lg bg-[#F8FAFC] p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#172033]">{sig.label}</span>
                  <span className="font-mono font-bold text-[#DC2626]">+{sig.weight}</span>
                </div>
                <p className="mt-0.5 text-[#475569]">{sig.reason}</p>
                <p className="mt-1 font-mono text-[10.5px] text-[#64748B]">
                  Refs: {sig.evidenceRefs.join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Grounded AI / Rule Explanation Panel */}
        <div className="xl:col-span-7 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-[#5146E5]" />
                <h2 className="text-base font-bold text-[#172033]">
                  Explainable Risk Intelligence
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Toggle between Gemini AI synthesis and the Deterministic Rule Explainer.
              </p>
            </div>
            <div className="flex items-center rounded-lg bg-[#F1F5F9] p-1">
              <button
                type="button"
                onClick={() => setEngineMode('deterministic')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  engineMode === 'deterministic'
                    ? 'bg-white text-[#172033] shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                Deterministic
              </button>
              <button
                type="button"
                onClick={() => setEngineMode('gemini')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  engineMode === 'gemini'
                    ? 'bg-[#5146E5] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Gemini AI
              </button>
            </div>
          </div>

          {explError && (
            <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-3 text-xs text-[#9A3412] flex items-start justify-between gap-2">
              <span>{explError}</span>
              <button
                type="button"
                onClick={() => setEngineMode('deterministic')}
                className="font-bold underline whitespace-nowrap cursor-pointer"
              >
                Use Deterministic
              </button>
            </div>
          )}

          {explLoading ? (
            <div className="space-y-3 py-6 animate-pulse">
              <div className="h-4 w-2/3 rounded bg-slate-100" />
              <div className="h-16 w-full rounded bg-slate-100" />
              <div className="h-24 w-full rounded bg-slate-100" />
            </div>
          ) : explanation ? (
            <div className="space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
                <span>
                  Engine:{' '}
                  <strong className="text-[#172033]">
                    {explanation.engine === 'gemini'
                      ? `Gemini AI (${explanation.model})`
                      : `Deterministic Explainer (${explanation.model})`}
                  </strong>
                </span>
                <span>Evidence: {explanation.evidenceInvolved.join(' + ')}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(
                  [
                    ['FACT', explanation.decisionBreakdown.fact, 'text-[#172033]'],
                    ['OBSERVATION', explanation.decisionBreakdown.observation, 'text-[#2563EB]'],
                    ['CORRELATION', explanation.decisionBreakdown.correlation, 'text-[#0D9488]'],
                    ['INFERENCE', explanation.decisionBreakdown.inference, 'text-[#9333EA]'],
                    ['UNCERTAINTY', explanation.decisionBreakdown.uncertainty, 'text-[#EA580C]'],
                    ['ACTION', explanation.decisionBreakdown.action, 'text-[#16A34A]'],
                  ] as const
                ).map(([heading, content, colorClass]) => (
                  <div
                    key={heading}
                    className="rounded-xl border border-slate-200 bg-[#F8FAFC]/80 p-3.5"
                  >
                    <p className={`font-mono text-[11px] font-bold ${colorClass}`}>{heading}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#334155]">{content}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-[#172033] mb-2">
                  <ShieldCheck className="h-4 w-4 text-[#16A34A]" />
                  Recommended Defensive Response
                </h3>
                <ul className="space-y-1.5 list-disc pl-4 text-xs text-[#475569]">
                  {explanation.recommendedInvestigation.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Investigation Notes & Facts-vs-Hypotheses Conclusion */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Notes */}
        <div className="xl:col-span-5 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#172033] flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#5146E5]" />
              Investigation Notes ({activeEvent.notes.length})
            </h2>
            <span className="text-[11px] text-[#64748B]">Persisted locally</span>
          </div>

          <form onSubmit={handleNoteSubmit} className="space-y-2.5">
            <textarea
              rows={3}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Document owner outreach, gateway log findings, or approval verification..."
              className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 text-xs text-[#172033] focus:border-[#5146E5] focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={!noteInput.trim() || savingNote}
              className="rounded-lg bg-[#5146E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50 cursor-pointer"
            >
              {savingNote ? 'Saving Note...' : 'Append Analyst Note'}
            </button>
          </form>

          <div className="space-y-2.5 max-h-64 overflow-y-auto pt-2 border-t border-slate-100">
            {activeEvent.notes.length === 0 ? (
              <p className="text-xs text-[#64748B] py-4 text-center">
                No investigation notes recorded yet for {activeEvent.requestId}.
              </p>
            ) : (
              activeEvent.notes.map((n) => (
                <div key={n.id} className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                    <span className="font-semibold text-[#172033]">{n.author}</span>
                    <span className="font-mono tabular-nums">{formatUtcTimestamp(n.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 text-[#334155] leading-relaxed">{n.text}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Conclusion separating Confirmed Facts vs Open Hypotheses */}
        <form
          onSubmit={handleConclusionSubmit}
          className="xl:col-span-7 rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#172033]">
                Investigation Conclusion — Confirmed Facts vs. Open Hypotheses
              </h2>
              <p className="text-xs text-[#64748B]">
                Maintains evidentiary discipline by separating verified record facts from unconfirmed hypotheses.
              </p>
            </div>
            <select
              value={disposition}
              onChange={(e) => setDisposition(e.target.value as InvestigationDisposition)}
              className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#172033] focus:border-[#5146E5] focus:outline-none"
            >
              <option value="under_investigation">Disposition: Under Investigation</option>
              <option value="benign_verified">Disposition: Benign / Owner Verified</option>
              <option value="policy_violation">Disposition: Policy / Governance Gap</option>
              <option value="escalated_for_containment">
                Disposition: Escalated for Containment
              </option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#172033] mb-1.5">
                Confirmed Facts (Directly Supported by E04 / E18 / E19)
              </label>
              <textarea
                rows={4}
                value={confirmedFacts}
                onChange={(e) => setConfirmedFacts(e.target.value)}
                placeholder="State only facts directly observed in source records..."
                className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 text-xs text-[#172033] focus:border-[#5146E5] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#172033] mb-1.5">
                Open Hypotheses & Uncertainties (Requires Further Verification)
              </label>
              <textarea
                rows={4}
                value={openHypotheses}
                onChange={(e) => setOpenHypotheses(e.target.value)}
                placeholder="Document working hypotheses, pending owner answers, and unknown downstream impact..."
                className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 text-xs text-[#172033] focus:border-[#5146E5] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {conclusionSavedBanner ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16A34A]">
                <CheckCircle2 className="h-4 w-4" />
                Conclusion persisted to local database
              </span>
            ) : (
              <span className="text-xs text-[#64748B]">
                {activeEvent.conclusion?.updatedAt
                  ? `Last saved ${formatUtcTimestamp(activeEvent.conclusion.updatedAt)}`
                  : 'Not yet saved'}
              </span>
            )}
            <button
              type="submit"
              disabled={savingConclusion}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5146E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {savingConclusion ? 'Saving...' : 'Save Investigation Conclusion'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
