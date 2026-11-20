import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  FileDown,
  RefreshCw,
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
  StructuredRiskExplanation,
  WorkspaceStateResponse,
} from '../types/sentinel';
import { exportAlertInvestigationPdf } from '../utils/exportReports';

interface AiRiskAnalysisViewProps {
  state: WorkspaceStateResponse;
  selectedRequestId: string | null;
  onSelectRequestId: (id: string) => void;
  onNavigate: (section: NavSection) => void;
  onInvestigate: (requestId: string) => void;
  onLoadSynthetic: () => void;
  loadingAction: boolean;
}

export const AiRiskAnalysisView: React.FC<AiRiskAnalysisViewProps> = ({
  state,
  selectedRequestId,
  onSelectRequestId,
  onNavigate,
  onInvestigate,
  onLoadSynthetic,
  loadingAction,
}) => {
  const candidates = useMemo(
    () =>
      [...state.events]
        .sort((a, b) => b.riskScore - a.riskScore || Date.parse(b.tsUtc) - Date.parse(a.tsUtc))
        .slice(0, 25),
    [state.events]
  );

  const activeEvent = useMemo(() => {
    if (selectedRequestId) {
      const m = state.events.find((e) => e.requestId === selectedRequestId);
      if (m) return m;
    }
    return state.alerts[0] ?? candidates[0] ?? null;
  }, [selectedRequestId, state.events, state.alerts, candidates]);

  const [mode, setMode] = useState<ExplanationEngineMode>('deterministic');
  const [explanation, setExplanation] = useState<StructuredRiskExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runExplanation = async (reqId: string, engine: ExplanationEngineMode) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await requestRiskExplanation(reqId, engine);
      setExplanation(res.explanation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Explanation request failed.';
      setErrorMsg(msg);
      const payload = (
        err as Error & { payload?: { deterministicExplanation?: StructuredRiskExplanation } }
      ).payload;
      if (payload?.deterministicExplanation) {
        setExplanation(payload.deterministicExplanation);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeEvent) return;
    runExplanation(activeEvent.requestId, mode);
  }, [activeEvent?.requestId, mode]);

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

  return (
    <div className="space-y-6">
      <DatasetProvenanceBar
        source={state.datasetSource}
        label={state.datasetLabel}
        lastAnalyzedAt={state.lastAnalyzedAt}
        onOpenUpload={() => onNavigate('upload')}
      />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#5146E5]">
            Evidence-Grounded Explanation Studio · Zero Fabricated Claims
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#172033]">AI Risk Analysis</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Generates structured security briefs strictly grounded in verified E04, E18, E19 records and 12-signal detection weights.
          </p>
        </div>

        {/* Engine Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setMode('gemini')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'gemini'
                  ? 'bg-[#5146E5] text-white'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Gemini AI Synthesis
            </button>
            <button
              type="button"
              onClick={() => setMode('deterministic')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'deterministic'
                  ? 'bg-[#172033] text-white'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              Deterministic Engine
            </button>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => runExplanation(activeEvent.requestId, mode)}
            className="rounded-lg border border-slate-200 bg-white p-2 text-[#475569] hover:text-[#5146E5] disabled:opacity-50 cursor-pointer"
            title="Regenerate explanation"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: Event Selector List */}
        <div className="xl:col-span-4 rounded-2xl border border-slate-200/90 bg-white overflow-hidden flex flex-col max-h-[760px]">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-[#172033]">Select Event to Explain</h2>
            <p className="text-[11px] text-[#64748B]">
              Ranked by risk score · includes both flagged alerts and normal baseline events
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {candidates.map((ev) => {
              const selected = ev.requestId === activeEvent.requestId;
              return (
                <button
                  key={ev.requestId}
                  type="button"
                  onClick={() => onSelectRequestId(ev.requestId)}
                  className={`w-full px-4 py-3 text-left transition-colors cursor-pointer ${
                    selected ? 'bg-[#5146E5]/[0.06]' : 'hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#172033]">
                      {ev.requestId}
                    </span>
                    <SeverityTag severity={ev.severity} />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[#475569] truncate">
                    {ev.integrationName} · {ev.apiKeyId}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-[#64748B] truncate">
                    {ev.method} {ev.endpoint}
                  </p>
                  <div className="mt-2">
                    <RiskScoreMeter score={ev.riskScore} severity={ev.severity} compact />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Structured Security Finding Brief */}
        <div className="xl:col-span-8 space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-4 flex items-start justify-between gap-3 text-xs text-[#9A3412]">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#EA580C]" />
                <div>
                  <p className="font-bold">Gemini AI Unavailable — Honest Fallback Active</p>
                  <p className="mt-0.5">{errorMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMode('deterministic')}
                className="rounded-lg bg-white border border-[#FED7AA] px-3 py-1.5 font-semibold text-[#9A3412] hover:bg-[#FFEDD5] whitespace-nowrap cursor-pointer"
              >
                Switch to Deterministic
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 space-y-5">
            {loading ? (
              <div className="py-12 space-y-4 animate-pulse">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#5146E5]">
                  <BrainCircuit className="h-4 w-4" />
                  Synthesizing evidence-grounded risk explanation for {activeEvent.requestId}...
                </div>
                <div className="h-6 w-3/4 rounded bg-slate-100" />
                <div className="h-24 w-full rounded-xl bg-slate-100" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-28 rounded-xl bg-slate-100" />
                  <div className="h-28 rounded-xl bg-slate-100" />
                </div>
              </div>
            ) : explanation ? (
              <>
                {/* Finding Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#5146E5]">SECURITY FINDING</span>
                      <span className="text-slate-300">·</span>
                      <SeverityTag severity={explanation.riskLevel} />
                      <span className="text-slate-300">·</span>
                      <span className="font-mono font-bold text-[#172033]">
                        Score {explanation.riskScore}/100
                      </span>
                    </div>
                    <h2 className="text-lg font-extrabold text-[#172033]">
                      {explanation.headline}
                    </h2>
                    <p className="text-xs text-[#64748B]">
                      Engine:{' '}
                      <strong className="text-[#172033]">
                        {explanation.engine === 'gemini'
                          ? `Gemini AI (${explanation.model})`
                          : `Deterministic Rule Engine (${explanation.model})`}
                      </strong>{' '}
                      · Generated {formatUtcTimestamp(explanation.generatedAt)} · Evidence:{' '}
                      <strong className="font-mono text-[#172033]">
                        {explanation.evidenceInvolved.join(' + ')}
                      </strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#172033] hover:bg-slate-50 cursor-pointer"
                    >
                      <FileDown className="h-3.5 w-3.5 text-[#5146E5]" />
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => onInvestigate(activeEvent.requestId)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#5146E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer"
                    >
                      Investigate
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Narrative Summary Blocks */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
                    <p className="font-bold text-[#172033]">What Happened?</p>
                    <p className="mt-1.5 leading-relaxed text-[#475569]">
                      {explanation.whatHappened}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
                    <p className="font-bold text-[#172033]">Why Was It Flagged?</p>
                    <p className="mt-1.5 leading-relaxed text-[#475569]">
                      {explanation.whyFlagged}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
                    <p className="font-bold text-[#172033]">Business Impact (E19)</p>
                    <p className="mt-1.5 leading-relaxed text-[#475569]">
                      {explanation.businessImpact}
                    </p>
                  </div>
                </div>

                {/* 6-Part Epistemic Decision Language Breakdown */}
                <div>
                  <h3 className="text-sm font-bold text-[#172033] mb-3">
                    Epistemic Evidence & Decision Breakdown
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {(
                      [
                        ['FACT', 'What the source records actually contain', explanation.decisionBreakdown.fact, 'text-[#172033]'],
                        ['OBSERVATION', 'What differs from approved or normal behavior', explanation.decisionBreakdown.observation, 'text-[#2563EB]'],
                        ['CORRELATION', 'Verified identifier linkage across layers', explanation.decisionBreakdown.correlation, 'text-[#0D9488]'],
                        ['INFERENCE', 'Bounded risk interpretation of combined signals', explanation.decisionBreakdown.inference, 'text-[#9333EA]'],
                        ['UNCERTAINTY', 'What cannot be established from supplied logs', explanation.decisionBreakdown.uncertainty, 'text-[#EA580C]'],
                        ['ACTION', 'Immediate recommended verification step', explanation.decisionBreakdown.action, 'text-[#16A34A]'],
                      ] as const
                    ).map(([label, sub, body, tone]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`font-mono text-xs font-extrabold ${tone}`}>
                            {label}
                          </span>
                          <span className="text-[11px] text-[#64748B] truncate">{sub}</span>
                        </div>
                        <p className="mt-2 leading-relaxed text-[#334155]">{body}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended Investigation Checklist */}
                <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4]/60 p-4">
                  <h3 className="flex items-center gap-2 text-xs font-bold text-[#15803D] mb-2">
                    <ShieldCheck className="h-4 w-4" />
                    Recommended Investigation & Containment Considerations
                  </h3>
                  <ul className="space-y-1.5 text-xs text-[#172033]">
                    {explanation.recommendedInvestigation.map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A] shrink-0 mt-0.5" />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Explicit Limitations Notice */}
                <p className="text-[11.5px] text-[#64748B] border-t border-slate-100 pt-3">
                  <strong className="text-[#475569]">Evidentiary Limitation:</strong>{' '}
                  {explanation.limitationsNote}
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
