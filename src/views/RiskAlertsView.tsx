import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileDown,
  MessageSquarePlus,
  Search,
  ShieldAlert,
} from 'lucide-react';
import type { NavSection } from '../components/LayoutShell';
import {
  DatasetProvenanceBar,
  EmptyWorkspaceNotice,
  RiskScoreMeter,
  SeverityTag,
  TriageStatusText,
  formatUtcTimestamp,
} from '../components/RiskUI';
import { requestRiskExplanation } from '../services/api';
import type {
  AnalyzedEvent,
  SeverityLevel,
  TriageStatus,
  WorkspaceStateResponse,
} from '../types/sentinel';
import { downloadCsvFile, exportAlertInvestigationPdf } from '../utils/exportReports';

interface RiskAlertsViewProps {
  state: WorkspaceStateResponse;
  onNavigate: (section: NavSection) => void;
  onInvestigate: (requestId: string) => void;
  onUpdateTriage: (requestId: string, status: TriageStatus) => Promise<void>;
  onAddNote: (requestId: string, text: string) => Promise<void>;
  onLoadSynthetic: () => void;
  loadingAction: boolean;
}

export const RiskAlertsView: React.FC<RiskAlertsViewProps> = ({
  state,
  onNavigate,
  onInvestigate,
  onUpdateTriage,
  onAddNote,
  onLoadSynthetic,
  loadingAction,
}) => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | SeverityLevel>('all');
  const [triageFilter, setTriageFilter] = useState<'all' | TriageStatus>('all');
  const [sortBy, setSortBy] = useState<'risk_desc' | 'time_desc'>('risk_desc');
  const [noteTargetId, setNoteTargetId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const filteredAlerts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.alerts
      .filter((al) => {
        if (severityFilter !== 'all' && al.severity !== severityFilter) return false;
        if (triageFilter !== 'all' && al.triageStatus !== triageFilter) return false;
        if (!q) return true;
        return (
          al.requestId.toLowerCase().includes(q) ||
          al.integrationName.toLowerCase().includes(q) ||
          al.apiKeyId.toLowerCase().includes(q) ||
          al.endpoint.toLowerCase().includes(q) ||
          al.callerIp.toLowerCase().includes(q) ||
          al.signals.some((s) => s.label.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'time_desc') return Date.parse(b.tsUtc) - Date.parse(a.tsUtc);
        return b.riskScore - a.riskScore || Date.parse(b.tsUtc) - Date.parse(a.tsUtc);
      });
  }, [state.alerts, search, severityFilter, triageFilter, sortBy]);

  const handleQuickTriage = async (requestId: string, nextStatus: TriageStatus) => {
    setSavingId(requestId);
    try {
      await onUpdateTriage(requestId, nextStatus);
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveNote = async (requestId: string) => {
    if (!noteDraft.trim()) return;
    setSavingId(requestId);
    try {
      await onAddNote(requestId, noteDraft.trim());
      setNoteDraft('');
      setNoteTargetId(null);
    } finally {
      setSavingId(null);
    }
  };

  const handleExportAlertPdf = async (al: AnalyzedEvent) => {
    setExportingId(al.requestId);
    try {
      const { explanation } = await requestRiskExplanation(al.requestId, 'deterministic');
      exportAlertInvestigationPdf(al, explanation, state.datasetLabel, state.datasetSource);
    } finally {
      setExportingId(null);
    }
  };

  const handleExportAllCsv = () => {
    const rows = filteredAlerts.map((al) => ({
      request_id: al.requestId,
      ts_utc: al.tsUtc,
      integration: al.integrationName,
      credential_id: al.apiKeyId,
      risk_score: al.riskScore,
      severity: al.severity,
      triage_status: al.triageStatus,
      method: al.method,
      endpoint: al.endpoint,
      caller_ip: al.callerIp,
      records_returned: al.recordsReturned,
      linked_e19_changes: al.linkedE19.map((c) => `${c.change_id}:${c.field}`).join('; '),
      triggered_signals: al.signals.map((s) => `${s.label} (+${s.weight})`).join('; '),
      notes_count: al.notes.length,
    }));
    downloadCsvFile(`api_sentinel_alerts_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  if (state.datasetSource === 'empty' || state.events.length === 0) {
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#5146E5]">
            Alert Threshold ≥ {state.config.alertThreshold} · Severity Bands: Low 0–34 · Medium 35–54 · High 55–79 · Critical 80–100
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#172033]">Risk Alerts</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Prioritized permission-drift and correlated vendor-change findings with persistent analyst triage and export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportAllCsv}
            disabled={filteredAlerts.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#172033] hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-[#5146E5]" />
            Export Alerts CSV
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-[#64748B]">Raised Alerts</p>
          <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#172033]">
            {state.alerts.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-[#64748B]">Critical (80–100)</p>
          <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#DC2626]">
            {state.alerts.filter((a) => a.severity === 'CRITICAL').length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-[#64748B]">High (55–79)</p>
          <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#EA580C]">
            {state.alerts.filter((a) => a.severity === 'HIGH').length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-[#64748B]">Reviewed</p>
          <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#16A34A]">
            {state.metrics.reviewedAlertsCount} / {state.alerts.length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search alert ID, integration, credential, endpoint, reason..."
            className="w-full rounded-lg border border-slate-200 bg-[#F8FAFC] py-1.5 pl-9 pr-3 text-xs text-[#172033] focus:border-[#5146E5] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg bg-[#F1F5F9] p-1">
            {(['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  severityFilter === sev
                    ? 'bg-white text-[#172033] shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                {sev === 'all' ? 'All' : sev.charAt(0) + sev.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <select
            value={triageFilter}
            onChange={(e) => setTriageFilter(e.target.value as 'all' | TriageStatus)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#172033] focus:border-[#5146E5] focus:outline-none"
            aria-label="Filter by triage status"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_review">In Review</option>
            <option value="reviewed">Reviewed</option>
            <option value="escalated">Escalated</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'risk_desc' | 'time_desc')}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#172033] focus:border-[#5146E5] focus:outline-none"
            aria-label="Sort alerts"
          >
            <option value="risk_desc">Sort: Highest Risk</option>
            <option value="time_desc">Sort: Most Recent</option>
          </select>
        </div>
      </div>

      {/* Alert Cards List */}
      <div className="space-y-3">
        {filteredAlerts.map((al) => (
          <div
            key={al.requestId}
            className="rounded-2xl border border-slate-200/90 bg-white p-5 hover:border-[#5146E5]/40 transition-colors"
          >
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div className="space-y-2 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <SeverityTag severity={al.severity} size="md" />
                  <span className="font-mono text-sm font-bold text-[#172033]">
                    {al.requestId}
                  </span>
                  <span className="text-xs text-[#64748B]">·</span>
                  <span className="text-sm font-bold text-[#172033]">{al.integrationName}</span>
                  <span className="text-xs text-[#64748B]">·</span>
                  <span className="font-mono text-xs text-[#5146E5]">{al.apiKeyId}</span>
                  <span className="text-xs text-[#64748B]">·</span>
                  <TriageStatusText status={al.triageStatus} />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#475569]">
                  <span className="font-mono">
                    <strong className="text-[#172033]">{al.method}</strong> {al.endpoint}
                  </span>
                  <span className="font-mono">IP: {al.callerIp}</span>
                  <span className="font-mono tabular-nums">
                    {al.recordsReturned.toLocaleString()} records
                  </span>
                  <span className="font-mono tabular-nums text-[#64748B]">
                    {formatUtcTimestamp(al.tsUtc)}
                  </span>
                  <span>
                    Evidence:{' '}
                    <strong className="text-[#172033]">
                      {al.linkedE04 ? 'E04 + ' : ''}E18
                      {al.linkedE19.length > 0 ? ` + E19 (${al.linkedE19.length})` : ''}
                    </strong>
                  </span>
                </div>

                {/* Signal reasons */}
                <div className="pt-1 space-y-1">
                  {al.signals.slice(0, 4).map((sig) => (
                    <p key={sig.code} className="text-xs text-[#475569]">
                      <span className="font-mono font-bold text-[#DC2626] mr-1.5">
                        +{sig.weight}
                      </span>
                      <span className="font-semibold text-[#172033]">{sig.label}:</span>{' '}
                      {sig.reason}
                    </p>
                  ))}
                  {al.signals.length > 4 && (
                    <p className="text-[11px] font-semibold text-[#5146E5]">
                      +{al.signals.length - 4} additional signal(s) — open investigation to view all
                    </p>
                  )}
                </div>

                {al.notes.length > 0 && (
                  <p className="pt-1 text-xs text-[#64748B]">
                    Latest note ({al.notes[0].author}):{' '}
                    <span className="text-[#172033]">"{al.notes[0].text}"</span>
                  </p>
                )}
              </div>

              {/* Right Side Score & Action Controls */}
              <div className="flex flex-col items-stretch lg:items-end justify-between gap-3 shrink-0 lg:w-64">
                <div className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] p-3">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[#64748B] font-medium">Risk Score</span>
                    <span className="font-mono text-[11px] text-[#64748B]">
                      Uncapped {al.rawUncappedScore}
                    </span>
                  </div>
                  <RiskScoreMeter score={al.riskScore} severity={al.severity} />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onInvestigate(al.requestId)}
                    className="rounded-lg bg-[#5146E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Investigate
                  </button>
                  <button
                    type="button"
                    disabled={savingId === al.requestId}
                    onClick={() =>
                      handleQuickTriage(
                        al.requestId,
                        al.triageStatus === 'reviewed' ? 'open' : 'reviewed'
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#172033] hover:bg-slate-50 whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" />
                    {al.triageStatus === 'reviewed' ? 'Reopen' : 'Mark Reviewed'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setNoteTargetId((cur) => (cur === al.requestId ? null : al.requestId))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#475569] hover:text-[#172033] whitespace-nowrap cursor-pointer"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Note
                  </button>
                  <button
                    type="button"
                    disabled={exportingId === al.requestId}
                    onClick={() => handleExportAlertPdf(al)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#475569] hover:text-[#5146E5] whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    PDF
                  </button>
                </div>
              </div>
            </div>

            {/* Inline quick note editor */}
            {noteTargetId === al.requestId && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add an investigation note (persisted to local database)..."
                  className="flex-1 rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-xs text-[#172033] focus:border-[#5146E5] focus:bg-white focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!noteDraft.trim() || savingId === al.requestId}
                    onClick={() => handleSaveNote(al.requestId)}
                    className="rounded-lg bg-[#5146E5] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    Save Note
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNoteTargetId(null);
                      setNoteDraft('');
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#64748B] hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {filteredAlerts.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-[#64748B]" />
            <p className="mt-3 text-sm font-bold text-[#172033]">No matching risk alerts</p>
            <p className="mt-1 text-xs text-[#64748B]">
              Adjust your severity/status filter or lower the alert threshold in Settings.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
