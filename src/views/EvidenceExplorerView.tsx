import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  GitFork,
  KeyRound,
  Link2,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { NavSection } from '../components/LayoutShell';
import {
  DatasetProvenanceBar,
  EmptyWorkspaceNotice,
  SeverityTag,
  formatUtcTimestamp,
} from '../components/RiskUI';
import type {
  AnalyzedEvent,
  E04Record,
  E18Record,
  E19Record,
  WorkspaceStateResponse,
} from '../types/sentinel';

interface EvidenceExplorerViewProps {
  state: WorkspaceStateResponse;
  onNavigate: (section: NavSection) => void;
  onInvestigate: (requestId: string) => void;
  onLoadSynthetic: () => void;
  loadingAction: boolean;
}

const SENSITIVE_RX = /bank|iban|routing|swift|bic|payout|payment|account|beneficiary|wire|ach|settlement/i;

export const EvidenceExplorerView: React.FC<EvidenceExplorerViewProps> = ({
  state,
  onNavigate,
  onInvestigate,
  onLoadSynthetic,
  loadingAction,
}) => {
  const [activeLayer, setActiveLayer] = useState<'e04' | 'e18' | 'e19'>('e19');
  const [search, setSearch] = useState('');
  const [onlyMissingApproval, setOnlyMissingApproval] = useState(false);
  const [selectedChainReqId, setSelectedChainReqId] = useState<string>(
    state.alerts[0]?.requestId ?? state.events[0]?.requestId ?? ''
  );
  const [inspectedRecord, setInspectedRecord] = useState<{
    layer: 'E04' | 'E18' | 'E19';
    title: string;
    record: Record<string, unknown>;
  } | null>(null);

  const graphCandidateEvents = useMemo(() => {
    // Prioritize correlated E19 + alert events, then highest risk
    return [...state.events]
      .sort((a, b) => {
        const scoreA = (a.linkedE19.length > 0 ? 200 : 0) + a.riskScore;
        const scoreB = (b.linkedE19.length > 0 ? 200 : 0) + b.riskScore;
        return scoreB - scoreA;
      })
      .slice(0, 20);
  }, [state.events]);

  const activeChain: AnalyzedEvent | null = useMemo(() => {
    const found = state.events.find((e) => e.requestId === selectedChainReqId);
    return found ?? graphCandidateEvents[0] ?? null;
  }, [state.events, selectedChainReqId, graphCandidateEvents]);

  const filteredE04 = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.e04.filter(
      (r) =>
        !q ||
        r.integration.toLowerCase().includes(q) ||
        r.credential_id.toLowerCase().includes(q) ||
        r.vendor.toLowerCase().includes(q) ||
        r.scope.toLowerCase().includes(q)
    );
  }, [state.e04, search]);

  const filteredE18 = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.e18
      .filter(
        (r) =>
          !q ||
          r.request_id.toLowerCase().includes(q) ||
          r.api_key_id.toLowerCase().includes(q) ||
          r.endpoint.toLowerCase().includes(q) ||
          r.caller_ip.toLowerCase().includes(q)
      )
      .slice()
      .reverse();
  }, [state.e18, search]);

  const filteredE19 = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.e19.filter((r) => {
      if (onlyMissingApproval && (r.approval_ref ?? '').trim() !== '') return false;
      if (!q) return true;
      return (
        r.change_id.toLowerCase().includes(q) ||
        r.vendor_name.toLowerCase().includes(q) ||
        r.field.toLowerCase().includes(q) ||
        r.request_id.toLowerCase().includes(q) ||
        r.changed_by.toLowerCase().includes(q)
      );
    });
  }, [state.e19, search, onlyMissingApproval]);

  if (state.datasetSource === 'empty' && state.e18.length === 0) {
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
            Three-Layer Forensic Traceability · Verified Identifiers Only
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#172033]">Evidence Explorer</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Inspect raw E04, E18, and E19 records and trace verified cross-layer relationships without fabricated links.
          </p>
        </div>
      </div>

      {/* Interactive Evidence Relationship Graph */}
      {activeChain && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <GitFork className="h-4 w-4 text-[#5146E5]" />
                <h2 className="text-base font-bold text-[#172033]">
                  Interactive Evidence Relationship Graph
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Links are drawn strictly when exact credential_id or request_id matches exist across supplied records.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="chain-selector" className="text-xs font-semibold text-[#64748B]">
                Trace Request:
              </label>
              <select
                id="chain-selector"
                value={activeChain.requestId}
                onChange={(e) => setSelectedChainReqId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 font-mono text-xs font-semibold text-[#172033] focus:border-[#5146E5] focus:outline-none"
              >
                {graphCandidateEvents.map((ev) => (
                  <option key={ev.requestId} value={ev.requestId}>
                    {ev.requestId} · {ev.integrationName} ({ev.severity} {ev.riskScore})
                    {ev.linkedE19.length > 0 ? ' [E19 Linked]' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onInvestigate(activeChain.requestId)}
                className="rounded-lg bg-[#5146E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] whitespace-nowrap cursor-pointer"
              >
                Open Investigation
              </button>
            </div>
          </div>

          {/* 4-Node Connected Correlation Flow */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch">
            {/* Node 1: E04 Credential */}
            <div className="relative flex flex-col">
              <button
                type="button"
                onClick={() =>
                  activeChain.linkedE04 &&
                  setInspectedRecord({
                    layer: 'E04',
                    title: activeChain.linkedE04.credential_id,
                    record: activeChain.linkedE04 as unknown as Record<string, unknown>,
                  })
                }
                className={`flex-1 rounded-xl border p-4 text-left transition-all ${
                  activeChain.linkedE04
                    ? 'border-[#5146E5]/40 bg-[#5146E5]/[0.03] hover:bg-[#5146E5]/[0.06] cursor-pointer'
                    : 'border-[#FECACA] bg-[#FEF2F2] cursor-default'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-[#5146E5]">LAYER 1 · E04 CREDENTIAL</span>
                  <KeyRound className="h-3.5 w-3.5 text-[#5146E5]" />
                </div>
                {activeChain.linkedE04 ? (
                  <div className="mt-2.5 space-y-1 text-xs">
                    <p className="font-bold text-[#172033]">{activeChain.linkedE04.integration}</p>
                    <p className="font-mono text-[11px] text-[#5146E5]">
                      {activeChain.linkedE04.credential_id}
                    </p>
                    <p className="text-[11px] text-[#64748B]">
                      IP Rule: <span className="font-mono">{activeChain.linkedE04.ip_restriction}</span>
                    </p>
                    <p className="text-[11px] text-[#64748B]">
                      Status:{' '}
                      <strong
                        className={
                          activeChain.linkedE04.status === 'active'
                            ? 'text-[#16A34A]'
                            : 'text-[#DC2626]'
                        }
                      >
                        {activeChain.linkedE04.status}
                      </strong>
                    </p>
                  </div>
                ) : (
                  <div className="mt-2.5 text-xs text-[#B91C1C]">
                    <p className="font-bold">Not Registered in E04</p>
                    <p className="mt-1 font-mono text-[11px]">{activeChain.apiKeyId}</p>
                    <p className="mt-1 text-[11px]">No matching approved credential entry (+35).</p>
                  </div>
                )}
              </button>
              <div className="hidden lg:flex items-center justify-center absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-6 w-6 rounded-full border border-slate-200 bg-white text-[#5146E5]">
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
              <p className="mt-1.5 text-center font-mono text-[10px] text-[#64748B]">
                {activeChain.linkedE04 ? `join: credential_id = ${activeChain.apiKeyId}` : 'unmatched credential_id'}
              </p>
            </div>

            {/* Node 2: E18 API Request */}
            <div className="relative flex flex-col">
              <button
                type="button"
                onClick={() => {
                  const raw = state.e18.find((r) => r.request_id === activeChain.requestId);
                  if (raw) {
                    setInspectedRecord({
                      layer: 'E18',
                      title: raw.request_id,
                      record: raw as unknown as Record<string, unknown>,
                    });
                  }
                }}
                className="flex-1 rounded-xl border border-[#2563EB]/40 bg-[#2563EB]/[0.03] hover:bg-[#2563EB]/[0.06] p-4 text-left transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-[#2563EB]">LAYER 2 · E18 API REQUEST</span>
                  <Link2 className="h-3.5 w-3.5 text-[#2563EB]" />
                </div>
                <div className="mt-2.5 space-y-1 text-xs">
                  <p className="font-mono font-bold text-[#172033]">{activeChain.requestId}</p>
                  <p className="font-mono text-[11px] text-[#172033] break-all">
                    <span className="font-bold text-[#2563EB]">{activeChain.method}</span>{' '}
                    {activeChain.endpoint}
                  </p>
                  <p className="font-mono text-[11px] text-[#64748B]">
                    IP: {activeChain.callerIp} · {activeChain.recordsReturned.toLocaleString()} recs
                  </p>
                  <p className="font-mono text-[10.5px] text-[#64748B]">
                    {formatUtcTimestamp(activeChain.tsUtc)}
                  </p>
                </div>
              </button>
              <div className="hidden lg:flex items-center justify-center absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-6 w-6 rounded-full border border-slate-200 bg-white text-[#0D9488]">
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
              <p className="mt-1.5 text-center font-mono text-[10px] text-[#64748B]">
                {activeChain.linkedE19.length > 0
                  ? `verified request_id = ${activeChain.requestId}`
                  : 'no matching E19 request_id'}
              </p>
            </div>

            {/* Node 3: E19 Vendor Change */}
            <div className="relative flex flex-col">
              <button
                type="button"
                onClick={() => {
                  const chg = activeChain.linkedE19[0];
                  if (chg) {
                    setInspectedRecord({
                      layer: 'E19',
                      title: chg.change_id,
                      record: chg as unknown as Record<string, unknown>,
                    });
                  }
                }}
                className={`flex-1 rounded-xl border p-4 text-left transition-all ${
                  activeChain.linkedE19.length > 0
                    ? 'border-[#0D9488]/45 bg-[#0D9488]/[0.04] hover:bg-[#0D9488]/[0.08] cursor-pointer'
                    : 'border-dashed border-slate-300 bg-[#F8FAFC] cursor-default'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-[#0D9488]">LAYER 3 · E19 VENDOR CHANGE</span>
                  <Database className="h-3.5 w-3.5 text-[#0D9488]" />
                </div>
                {activeChain.linkedE19.length > 0 ? (
                  <div className="mt-2.5 space-y-1 text-xs">
                    {activeChain.linkedE19.map((chg) => (
                      <div key={chg.change_id}>
                        <p className="font-bold text-[#172033]">
                          {chg.change_id} · {chg.vendor_name}
                        </p>
                        <p className="font-mono text-[11px] text-[#0D9488]">{chg.field}</p>
                        <p className="font-mono text-[10.5px] text-[#475569] truncate">
                          {chg.old_value} → {chg.new_value}
                        </p>
                        <p className="mt-1 text-[11px]">
                          Approval:{' '}
                          {chg.approval_ref ? (
                            <span className="font-mono font-semibold text-[#16A34A]">
                              {chg.approval_ref}
                            </span>
                          ) : (
                            <span className="font-bold text-[#DC2626]">MISSING (+25)</span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2.5 text-xs text-[#64748B]">
                    <p className="font-semibold text-[#475569]">No Linked E19 Change</p>
                    <p className="mt-1 text-[11px]">
                      No vendor master record in E19 shares request_id {activeChain.requestId}. No relationship invented.
                    </p>
                  </div>
                )}
              </button>
              <div className="hidden lg:flex items-center justify-center absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-6 w-6 rounded-full border border-slate-200 bg-white text-[#9333EA]">
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
              <p className="mt-1.5 text-center font-mono text-[10px] text-[#64748B]">
                12-signal engine + Isolation Forest
              </p>
            </div>

            {/* Node 4: Detection Result */}
            <div className="flex flex-col">
              <div className="flex-1 rounded-xl border border-[#9333EA]/35 bg-[#FAF5FF] p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-[#9333EA]">DETECTION RESULT</span>
                  <ShieldAlert className="h-3.5 w-3.5 text-[#9333EA]" />
                </div>
                <div className="mt-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono tabular-nums text-2xl font-extrabold text-[#172033]">
                      {activeChain.riskScore}
                      <span className="text-xs font-normal text-[#64748B]">/100</span>
                    </span>
                    <SeverityTag severity={activeChain.severity} />
                  </div>
                  <p className="text-[11px] text-[#475569]">
                    {activeChain.signals.length} signal(s) triggered · iForest{' '}
                    <span className="font-mono">{activeChain.isolationForestScore.toFixed(3)}</span>
                  </p>
                </div>
              </div>
              <p className="mt-1.5 text-center font-mono text-[10px] text-[#64748B]">
                {activeChain.isAlert
                  ? `ALERT RAISED (≥ ${state.config.alertThreshold})`
                  : `Below alert threshold (${state.config.alertThreshold})`}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Three Visually Distinct Evidence Source Tables */}
      <section className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[#F1F5F9] p-1">
            {(
              [
                ['e04', `E04 Approved Register (${state.e04.length})`],
                ['e18', `E18 API Activity (${state.e18.length})`],
                ['e19', `E19 Vendor Changes (${state.e19.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveLayer(key)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  activeLayer === key
                    ? 'bg-white text-[#5146E5] shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeLayer === 'e19' && (
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#172033] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyMissingApproval}
                  onChange={(e) => setOnlyMissingApproval(e.target.checked)}
                  className="rounded border-slate-300 text-[#5146E5] focus:ring-[#5146E5]"
                />
                Missing approval only
              </label>
            )}
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Filter ${activeLayer.toUpperCase()} records...`}
                className="w-full rounded-lg border border-slate-200 bg-[#F8FAFC] py-1.5 pl-8 pr-3 text-xs text-[#172033] focus:border-[#5146E5] focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {activeLayer === 'e04' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B]">
                  <th className="py-2.5 px-4">Credential ID</th>
                  <th className="py-2.5 px-4">Integration & Vendor</th>
                  <th className="py-2.5 px-4">Approved Scope</th>
                  <th className="py-2.5 px-4">IP Restriction</th>
                  <th className="py-2.5 px-4">Owner</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredE04.map((r: E04Record) => (
                  <tr
                    key={r.credential_id}
                    onClick={() =>
                      setInspectedRecord({
                        layer: 'E04',
                        title: r.credential_id,
                        record: r as unknown as Record<string, unknown>,
                      })
                    }
                    className="cursor-pointer hover:bg-[#F8FAFC]"
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-[#5146E5]">
                      {r.credential_id}
                    </td>
                    <td className="py-2.5 px-4">
                      <p className="font-semibold text-[#172033]">{r.integration}</p>
                      <p className="text-[11px] text-[#64748B]">{r.vendor} · {r.system}</p>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-[#475569] max-w-xs truncate">
                      {r.scope}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#172033]">{r.ip_restriction}</td>
                    <td className="py-2.5 px-4 text-[#475569]">{r.owner}</td>
                    <td className="py-2.5 px-4 font-semibold">
                      <span
                        className={
                          r.status === 'active' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeLayer === 'e18' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B]">
                  <th className="py-2.5 px-4">Request ID</th>
                  <th className="py-2.5 px-4">Timestamp (UTC)</th>
                  <th className="py-2.5 px-4">API Key</th>
                  <th className="py-2.5 px-4">Method & Endpoint</th>
                  <th className="py-2.5 px-4">Caller IP</th>
                  <th className="py-2.5 px-4 text-right">Records</th>
                  <th className="py-2.5 px-4 text-right">Graph</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredE18.slice(0, 60).map((r: E18Record) => (
                  <tr
                    key={r.request_id}
                    onClick={() =>
                      setInspectedRecord({
                        layer: 'E18',
                        title: r.request_id,
                        record: r as unknown as Record<string, unknown>,
                      })
                    }
                    className="cursor-pointer hover:bg-[#F8FAFC]"
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-[#2563EB]">
                      {r.request_id}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#64748B] whitespace-nowrap">
                      {formatUtcTimestamp(r.ts_utc)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#172033]">{r.api_key_id}</td>
                    <td className="py-2.5 px-4 font-mono text-[11.5px]">
                      <span className="font-bold text-[#5146E5]">{r.method}</span> {r.endpoint}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#172033]">{r.caller_ip}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {r.records_returned.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedChainReqId(r.request_id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="text-xs font-semibold text-[#5146E5] hover:underline cursor-pointer"
                      >
                        Trace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeLayer === 'e19' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B]">
                  <th className="py-2.5 px-4">Change ID & Time</th>
                  <th className="py-2.5 px-4">Vendor</th>
                  <th className="py-2.5 px-4">Field & Value Diff</th>
                  <th className="py-2.5 px-4">Changed By / Channel</th>
                  <th className="py-2.5 px-4">Approval Ref</th>
                  <th className="py-2.5 px-4">Linked Request ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredE19.map((r: E19Record) => {
                  const sensitive = SENSITIVE_RX.test(r.field);
                  const missingApproval = !(r.approval_ref ?? '').trim();
                  return (
                    <tr
                      key={r.change_id}
                      onClick={() =>
                        setInspectedRecord({
                          layer: 'E19',
                          title: r.change_id,
                          record: r as unknown as Record<string, unknown>,
                        })
                      }
                      className={`cursor-pointer transition-colors ${
                        sensitive && missingApproval
                          ? 'bg-[#FEF2F2]/60 hover:bg-[#FEF2F2]'
                          : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <p className="font-mono font-bold text-[#0D9488]">{r.change_id}</p>
                        <p className="font-mono text-[10.5px] text-[#64748B]">
                          {formatUtcTimestamp(r.ts_utc)}
                        </p>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-[#172033]">{r.vendor_name}</p>
                        <p className="font-mono text-[11px] text-[#64748B]">{r.vendor_id}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-mono font-semibold text-[#172033]">
                          {r.field}
                          {sensitive && (
                            <span className="ml-2 font-sans text-[10.5px] font-bold text-[#EA580C]">
                              SENSITIVE
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-[11px] text-[#64748B]">
                          {r.old_value} → <span className="text-[#172033]">{r.new_value}</span>
                        </p>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-mono text-[#172033]">{r.changed_by}</p>
                        <p className="text-[11px] text-[#64748B]">
                          {r.channel} · {r.source_ip}
                        </p>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {missingApproval ? (
                          <span className="inline-flex items-center gap-1 font-bold text-[#DC2626]">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Missing Approval
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono font-semibold text-[#16A34A]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {r.approval_ref}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {r.request_id ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedChainReqId(r.request_id);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="font-mono font-semibold text-[#5146E5] hover:underline cursor-pointer"
                          >
                            {r.request_id}
                          </button>
                        ) : (
                          <span className="text-[#64748B]">Unlinked (non-API)</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Raw Evidence Record Modal */}
      {inspectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/35 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-xs font-bold text-[#5146E5]">
                  {inspectedRecord.layer} Source Evidence Record
                </p>
                <h3 className="mt-0.5 font-mono text-base font-extrabold text-[#172033]">
                  {inspectedRecord.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedRecord(null)}
                className="rounded-lg p-1 text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto divide-y divide-slate-100 text-xs">
              {Object.entries(inspectedRecord.record).map(([k, v]) => (
                <div key={k} className="py-2 flex items-start justify-between gap-4">
                  <span className="font-mono font-semibold text-[#64748B] shrink-0">{k}</span>
                  <span className="font-mono text-[#172033] text-right break-all">
                    {typeof v === 'object' && v !== null
                      ? JSON.stringify(v)
                      : String(v || '(empty)')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
