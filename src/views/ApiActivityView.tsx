import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpDown,
  CheckCircle2,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { NavSection } from '../components/LayoutShell';
import {
  DatasetProvenanceBar,
  EmptyWorkspaceNotice,
  RiskScoreMeter,
  SeverityTag,
  formatUtcTimestamp,
} from '../components/RiskUI';
import type { AnalyzedEvent, SeverityLevel, WorkspaceStateResponse } from '../types/sentinel';

interface ApiActivityViewProps {
  state: WorkspaceStateResponse;
  onNavigate: (section: NavSection) => void;
  onInvestigate: (requestId: string) => void;
  onLoadSynthetic: () => void;
  loadingAction: boolean;
}

export const ApiActivityView: React.FC<ApiActivityViewProps> = ({
  state,
  onNavigate,
  onInvestigate,
  onLoadSynthetic,
  loadingAction,
}) => {
  const [search, setSearch] = useState('');
  const [endpointFilter, setEndpointFilter] = useState('all');
  const [credFilter, setCredFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | SeverityLevel>('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [activityMode, setActivityMode] = useState<'all' | 'suspicious' | 'normal'>('all');
  const [sortBy, setSortBy] = useState<'risk_desc' | 'time_desc' | 'records_desc'>('risk_desc');
  const [selectedEvent, setSelectedEvent] = useState<AnalyzedEvent | null>(null);

  const uniqueEndpoints = useMemo(
    () => Array.from(new Set(state.events.map((e) => e.endpoint))).sort(),
    [state.events]
  );
  const uniqueCreds = useMemo(
    () => Array.from(new Set(state.events.map((e) => e.apiKeyId))).sort(),
    [state.events]
  );
  const uniqueDates = useMemo(
    () =>
      Array.from(
        new Set(
          state.events
            .map((e) => (e.tsUtc ? e.tsUtc.slice(0, 10) : ''))
            .filter(Boolean)
        )
      ).sort(),
    [state.events]
  );

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.events
      .filter((ev) => {
        const isSusp = ev.isAlert || ev.riskScore >= 35;
        if (activityMode === 'suspicious' && !isSusp) return false;
        if (activityMode === 'normal' && isSusp) return false;
        if (endpointFilter !== 'all' && ev.endpoint !== endpointFilter) return false;
        if (credFilter !== 'all' && ev.apiKeyId !== credFilter) return false;
        if (severityFilter !== 'all' && ev.severity !== severityFilter) return false;
        if (dateFilter !== 'all' && !ev.tsUtc.startsWith(dateFilter)) return false;
        if (!q) return true;
        return (
          ev.requestId.toLowerCase().includes(q) ||
          ev.apiKeyId.toLowerCase().includes(q) ||
          ev.callerIp.toLowerCase().includes(q) ||
          ev.endpoint.toLowerCase().includes(q) ||
          ev.userAgent.toLowerCase().includes(q) ||
          ev.integrationName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'time_desc') return Date.parse(b.tsUtc) - Date.parse(a.tsUtc);
        if (sortBy === 'records_desc') return b.recordsReturned - a.recordsReturned;
        return b.riskScore - a.riskScore || Date.parse(b.tsUtc) - Date.parse(a.tsUtc);
      });
  }, [
    state.events,
    search,
    endpointFilter,
    credFilter,
    severityFilter,
    dateFilter,
    activityMode,
    sortBy,
  ]);

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

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#5146E5]">E18 / E01 Telemetry Monitor</p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#172033]">API Activity Monitor</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Inspect all observed third-party API requests with real-time permission and baseline drift highlights.
          </p>
        </div>
        <div className="flex items-center rounded-lg bg-white border border-slate-200 p-1">
          {(
            [
              ['all', `All (${state.events.length})`],
              [
                'suspicious',
                `Suspicious (${state.events.filter((e) => e.isAlert || e.riskScore >= 35).length})`,
              ],
              [
                'normal',
                `Normal (${state.events.filter((e) => !e.isAlert && e.riskScore < 35).length})`,
              ],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setActivityMode(val)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activityMode === val
                  ? 'bg-[#5146E5] text-white'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 rounded-xl border border-slate-200/90 bg-white p-3.5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search request ID, IP, user agent..."
            className="w-full rounded-lg border border-slate-200 bg-[#F8FAFC] py-1.5 pl-9 pr-3 text-xs text-[#172033] focus:border-[#5146E5] focus:bg-white focus:outline-none"
          />
        </div>

        <select
          value={credFilter}
          onChange={(e) => setCredFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#172033] focus:border-[#5146E5] focus:outline-none"
          aria-label="Filter by credential"
        >
          <option value="all">All Credentials</option>
          {uniqueCreds.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={endpointFilter}
          onChange={(e) => setEndpointFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#172033] focus:border-[#5146E5] focus:outline-none"
          aria-label="Filter by endpoint"
        >
          <option value="all">All Endpoints</option>
          {uniqueEndpoints.map((ep) => (
            <option key={ep} value={ep}>
              {ep}
            </option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as 'all' | SeverityLevel)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#172033] focus:border-[#5146E5] focus:outline-none"
          aria-label="Filter by severity"
        >
          <option value="all">All Severities</option>
          <option value="CRITICAL">Critical (80–100)</option>
          <option value="HIGH">High (55–79)</option>
          <option value="MEDIUM">Medium (35–54)</option>
          <option value="LOW">Low (0–34)</option>
        </select>

        <div className="flex gap-2">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-[#172033] focus:border-[#5146E5] focus:outline-none"
            aria-label="Filter by UTC date"
          >
            <option value="all">All Dates</option>
            {uniqueDates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              setSortBy((s) =>
                s === 'risk_desc'
                  ? 'time_desc'
                  : s === 'time_desc'
                    ? 'records_desc'
                    : 'risk_desc'
              )
            }
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-[#F8FAFC] px-2.5 py-1.5 text-xs font-semibold text-[#172033] hover:border-[#5146E5] whitespace-nowrap cursor-pointer"
            title="Toggle sort order"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortBy === 'risk_desc' ? 'Risk' : sortBy === 'time_desc' ? 'Time' : 'Vol'}
          </button>
        </div>
      </div>

      {/* Activity Table */}
      <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-xs text-[#64748B]">
          <span>
            Showing <strong className="font-mono text-[#172033]">{filteredEvents.length}</strong> of{' '}
            <strong className="font-mono text-[#172033]">{state.events.length}</strong> API events
          </span>
          <span>Click any row to inspect full telemetry and drift breakdown</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B]">
                <th className="py-2.5 px-3.5">Request ID</th>
                <th className="py-2.5 px-3.5">Credential</th>
                <th className="py-2.5 px-3.5">Timestamp (UTC)</th>
                <th className="py-2.5 px-3.5">Caller IP & Agent</th>
                <th className="py-2.5 px-3.5">Method & Endpoint</th>
                <th className="py-2.5 px-3.5 text-right">Records</th>
                <th className="py-2.5 px-3.5 text-right">HTTP</th>
                <th className="py-2.5 px-3.5">Risk Score</th>
                <th className="py-2.5 px-3.5">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvents.map((ev) => {
                const isSusp = ev.isAlert || ev.riskScore >= 35;
                return (
                  <tr
                    key={ev.requestId}
                    onClick={() => setSelectedEvent(ev)}
                    className={`cursor-pointer transition-colors ${
                      ev.severity === 'CRITICAL'
                        ? 'bg-[#FEF2F2]/50 hover:bg-[#FEF2F2]'
                        : isSusp
                          ? 'bg-[#FFF7ED]/35 hover:bg-[#FFF7ED]/70'
                          : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <td className="py-2.5 px-3.5 font-mono font-semibold text-[#172033] whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {isSusp ? (
                          <ShieldAlert className="h-3.5 w-3.5 text-[#DC2626] shrink-0" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A] shrink-0" />
                        )}
                        {ev.requestId}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <p className="font-mono text-[#172033] font-medium">{ev.apiKeyId}</p>
                      <p className="text-[11px] text-[#64748B] truncate max-w-[140px]">
                        {ev.integrationName}
                      </p>
                    </td>
                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-[11px] text-[#475569] whitespace-nowrap">
                      {formatUtcTimestamp(ev.tsUtc)}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <p
                        className={`font-mono text-[11.5px] ${
                          ev.driftSummary.ipViolation
                            ? 'font-bold text-[#DC2626]'
                            : 'text-[#172033]'
                        }`}
                      >
                        {ev.callerIp}
                      </p>
                      <p className="text-[11px] text-[#64748B] truncate max-w-[150px]">
                        {ev.userAgent || '—'}
                      </p>
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-[11.5px]">
                      <span
                        className={`font-bold ${
                          ev.driftSummary.scopeViolation ? 'text-[#DC2626]' : 'text-[#5146E5]'
                        }`}
                      >
                        {ev.method}
                      </span>{' '}
                      <span className="text-[#172033]">{ev.endpoint}</span>
                      {ev.signals.length > 0 && (
                        <p className="font-sans text-[10.5px] text-[#64748B] truncate max-w-[230px]">
                          {ev.signals.map((s) => s.label).join(' · ')}
                        </p>
                      )}
                    </td>
                    <td
                      className={`py-2.5 px-3.5 text-right font-mono tabular-nums ${
                        ev.driftSummary.volumeSpike
                          ? 'font-bold text-[#EA580C]'
                          : 'text-[#172033]'
                      }`}
                    >
                      {ev.recordsReturned.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-[#475569]">
                      {ev.responseStatus}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <RiskScoreMeter score={ev.riskScore} severity={ev.severity} compact />
                    </td>
                    <td className="py-2.5 px-3.5">
                      <SeverityTag severity={ev.severity} />
                    </td>
                  </tr>
                );
              })}
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[#64748B]">
                    No API activity events match your selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Complete Event Detail Slide-Over */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#172033]/30 backdrop-blur-[1px]">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl border-l border-slate-200 p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-[#5146E5]">Observed E18 API Event</p>
                <h2 className="mt-1 font-mono text-lg font-extrabold text-[#172033]">
                  {selectedEvent.requestId}
                </h2>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  {selectedEvent.integrationName} · {selectedEvent.apiKeyId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="rounded-lg p-1.5 text-[#64748B] hover:bg-slate-100 cursor-pointer"
                aria-label="Close event details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
              <div>
                <p className="text-xs text-[#64748B]">Composite Risk Score</p>
                <p className="mt-0.5 font-mono tabular-nums text-2xl font-extrabold text-[#172033]">
                  {selectedEvent.riskScore}
                  <span className="text-sm font-normal text-[#64748B]"> / 100</span>
                </p>
                <p className="text-[11px] text-[#64748B]">
                  Uncapped total: {selectedEvent.rawUncappedScore} · iForest score:{' '}
                  {selectedEvent.isolationForestScore.toFixed(3)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <SeverityTag severity={selectedEvent.severity} size="md" />
                <button
                  type="button"
                  onClick={() => {
                    const id = selectedEvent.requestId;
                    setSelectedEvent(null);
                    onInvestigate(id);
                  }}
                  className="rounded-lg bg-[#5146E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer"
                >
                  Open Full Investigation
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[#64748B]">Timestamp (UTC)</p>
                <p className="mt-1 font-mono font-semibold text-[#172033]">
                  {formatUtcTimestamp(selectedEvent.tsUtc)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[#64748B]">Caller IP</p>
                <p className="mt-1 font-mono font-semibold text-[#172033]">
                  {selectedEvent.callerIp}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 col-span-2">
                <p className="text-[#64748B]">Method & Endpoint</p>
                <p className="mt-1 font-mono font-semibold text-[#172033]">
                  {selectedEvent.method} {selectedEvent.endpoint}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[#64748B]">Records Returned</p>
                <p className="mt-1 font-mono font-semibold text-[#172033]">
                  {selectedEvent.recordsReturned.toLocaleString()} (Baseline avg:{' '}
                  {selectedEvent.baselineStats.avgRecords})
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-[#64748B]">User Agent</p>
                <p className="mt-1 font-mono text-[#172033] truncate">
                  {selectedEvent.userAgent || '—'}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-[#172033] mb-2.5 flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-[#5146E5]" />
                Triggered Risk Signals ({selectedEvent.signals.length})
              </h3>
              {selectedEvent.signals.length === 0 ? (
                <p className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-3 text-xs text-[#15803D]">
                  No permission, baseline, or business-impact deviations triggered. Behavior matches approved profile.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedEvent.signals.map((sig) => (
                    <div
                      key={sig.code}
                      className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#172033]">{sig.label}</span>
                        <span className="font-mono font-bold text-[#DC2626]">+{sig.weight}</span>
                      </div>
                      <p className="mt-1 text-[#475569]">{sig.reason}</p>
                      <p className="mt-1 font-mono text-[11px] text-[#64748B]">
                        Evidence: {sig.evidenceRefs.join(' · ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
