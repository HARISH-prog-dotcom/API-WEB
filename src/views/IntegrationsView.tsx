import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  Search,
  ShieldAlert,
  ShieldOff,
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
import type { E04Record, WorkspaceStateResponse } from '../types/sentinel';

interface IntegrationsViewProps {
  state: WorkspaceStateResponse;
  onNavigate: (section: NavSection) => void;
  onInvestigate: (requestId: string) => void;
  onLoadSynthetic: () => void;
  loadingAction: boolean;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  state,
  onNavigate,
  onInvestigate,
  onLoadSynthetic,
  loadingAction,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'flagged'>('all');
  const [sortBy, setSortBy] = useState<'risk' | 'integration' | 'vendor'>('risk');
  const [selectedIntegration, setSelectedIntegration] = useState<E04Record | null>(null);

  const rollupMap = useMemo(() => {
    const map = new Map(state.integrationRollups.map((r) => [r.credentialId, r]));
    return map;
  }, [state.integrationRollups]);

  const unregisteredRollups = useMemo(
    () => state.integrationRollups.filter((r) => !r.registered),
    [state.integrationRollups]
  );

  const filteredIntegrations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.e04
      .filter((item) => {
        const rollup = rollupMap.get(item.credential_id);
        const isActive = ['active', 'approved', 'enabled', 'valid'].includes(
          item.status.toLowerCase()
        );
        if (statusFilter === 'active' && !isActive) return false;
        if (statusFilter === 'inactive' && isActive) return false;
        if (statusFilter === 'flagged' && (!rollup || rollup.alertCount === 0)) return false;
        if (!q) return true;
        return (
          item.integration.toLowerCase().includes(q) ||
          item.credential_id.toLowerCase().includes(q) ||
          item.vendor.toLowerCase().includes(q) ||
          item.system.toLowerCase().includes(q) ||
          item.owner.toLowerCase().includes(q) ||
          item.scope.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'integration') return a.integration.localeCompare(b.integration);
        if (sortBy === 'vendor') return a.vendor.localeCompare(b.vendor);
        const ra = rollupMap.get(a.credential_id)?.maxRiskScore ?? 0;
        const rb = rollupMap.get(b.credential_id)?.maxRiskScore ?? 0;
        return rb - ra || a.integration.localeCompare(b.integration);
      });
  }, [state.e04, rollupMap, search, statusFilter, sortBy]);

  const associatedEvents = useMemo(() => {
    if (!selectedIntegration) return [];
    return state.events
      .filter((e) => e.apiKeyId === selectedIntegration.credential_id)
      .sort((a, b) => b.riskScore - a.riskScore || Date.parse(b.tsUtc) - Date.parse(a.tsUtc));
  }, [selectedIntegration, state.events]);

  if (state.datasetSource === 'empty' && state.e04.length === 0) {
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
            E04 Approved Integration Register
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#172033]">
            Third-Party Integrations
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Authorized scopes, IP allowlists, owners, and token lifetimes. Credential secrets are never stored or displayed.
          </p>
        </div>
        <div className="text-xs text-[#64748B] font-mono tabular-nums">
          {state.e04.length} registered · {unregisteredRollups.length} unregistered observed
        </div>
      </div>

      {/* Unregistered Shadow Credentials Alert Banner */}
      {unregisteredRollups.length > 0 && (
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldOff className="h-5 w-5 text-[#DC2626] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[#991B1B]">
                {unregisteredRollups.length} Unregistered Credential(s) Detected in E18 Traffic
              </p>
              <p className="mt-0.5 text-xs text-[#B91C1C]">
                {unregisteredRollups
                  .map(
                    (u) =>
                      `${u.credentialId} (${u.totalEvents} call${u.totalEvents === 1 ? '' : 's'}, peak score ${u.maxRiskScore})`
                  )
                  .join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const ev = state.events.find(
                (e) => e.apiKeyId === unregisteredRollups[0].credentialId
              );
              if (ev) onInvestigate(ev.requestId);
            }}
            className="rounded-lg bg-[#DC2626] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] whitespace-nowrap cursor-pointer"
          >
            Investigate Unregistered Key
          </button>
        </div>
      )}

      {/* Search, Filter & Sort Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integration, credential ID, vendor, owner, scope..."
            className="w-full rounded-lg border border-slate-200 bg-[#F8FAFC] py-1.5 pl-9 pr-3 text-sm text-[#172033] placeholder:text-[#64748B] focus:border-[#5146E5] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg bg-[#F1F5F9] p-1">
            {(
              [
                ['all', 'All'],
                ['active', 'Active'],
                ['inactive', 'Inactive / Revoked'],
                ['flagged', 'With Alerts'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === val
                    ? 'bg-white text-[#172033] shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'risk' | 'integration' | 'vendor')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#172033] focus:border-[#5146E5] focus:outline-none"
            aria-label="Sort integrations"
          >
            <option value="risk">Sort: Peak Risk</option>
            <option value="integration">Sort: Integration A–Z</option>
            <option value="vendor">Sort: Vendor A–Z</option>
          </select>
        </div>
      </div>

      {/* Main E04 Register Table */}
      <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B]">
                <th className="py-3 px-4">Integration & Credential ID</th>
                <th className="py-3 px-4">Vendor / System</th>
                <th className="py-3 px-4">Approved Scope</th>
                <th className="py-3 px-4">Owner & IP Allowlist</th>
                <th className="py-3 px-4">Token / Last Used</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Peak Risk</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIntegrations.map((item) => {
                const rollup = rollupMap.get(item.credential_id);
                const isActive = ['active', 'approved', 'enabled', 'valid'].includes(
                  item.status.toLowerCase()
                );
                const peak = rollup?.maxRiskScore ?? 0;
                return (
                  <tr
                    key={item.credential_id}
                    onClick={() => setSelectedIntegration(item)}
                    className={`cursor-pointer transition-colors ${
                      !isActive ? 'bg-[#FFF7ED]/40 hover:bg-[#FFF7ED]' : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <p className="font-bold text-[#172033]">{item.integration}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-[#5146E5]">
                        {item.credential_id}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-[#172033]">{item.vendor}</p>
                      <p className="text-[11px] text-[#64748B]">{item.system}</p>
                    </td>
                    <td className="py-3 px-4 max-w-[260px]">
                      <p className="font-mono text-[11px] text-[#475569] truncate" title={item.scope}>
                        {item.scope}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-[#172033] font-medium truncate max-w-[160px]">
                        {item.owner}
                      </p>
                      <p className="font-mono text-[11px] text-[#64748B]">
                        {item.ip_restriction || 'Unrestricted'}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[11px]">
                      <p className="text-[#172033]">{item.token_lifetime_days}d lifetime</p>
                      <p className="text-[#64748B]">{formatUtcTimestamp(item.last_used)}</p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#16A34A]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {item.status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#DC2626]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {item.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <RiskScoreMeter
                        score={peak}
                        severity={
                          peak >= 80
                            ? 'CRITICAL'
                            : peak >= 55
                              ? 'HIGH'
                              : peak >= 35
                                ? 'MEDIUM'
                                : 'LOW'
                        }
                        compact
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedIntegration(item);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-[#172033] hover:border-[#5146E5] hover:text-[#5146E5] cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredIntegrations.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#64748B]">
                    No registered integrations match your current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-Over Integration Permission Card & Associated Events */}
      {selectedIntegration && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#172033]/30 backdrop-blur-[1px]">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl border-l border-slate-200 p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-[#5146E5]">E04 Integration Profile</p>
                <h2 className="mt-1 text-xl font-extrabold text-[#172033]">
                  {selectedIntegration.integration}
                </h2>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  {selectedIntegration.vendor} · {selectedIntegration.system} · Owner:{' '}
                  <span className="text-[#172033] font-medium">{selectedIntegration.owner}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIntegration(null)}
                className="rounded-lg p-1.5 text-[#64748B] hover:bg-slate-100 cursor-pointer"
                aria-label="Close integration details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Visual Permission Card */}
            <div className="rounded-xl border border-[#5146E5]/25 bg-[#F6F8FC] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-[#172033]">
                  <Lock className="h-4 w-4 text-[#5146E5]" />
                  Approved Permission Contract
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-xs text-[#64748B]">
                  <KeyRound className="h-3.5 w-3.5" />
                  {selectedIntegration.credential_id} (secret masked)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-[#64748B]">Credential Status</p>
                  <p
                    className={`mt-1 font-bold ${
                      selectedIntegration.status === 'active'
                        ? 'text-[#16A34A]'
                        : 'text-[#DC2626]'
                    }`}
                  >
                    {selectedIntegration.status.toUpperCase()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-[#64748B]">IP Allowlist / CIDR</p>
                  <p className="mt-1 font-mono font-bold text-[#172033]">
                    {selectedIntegration.ip_restriction || 'Not restricted'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-[#64748B]">Token Lifetime</p>
                  <p className="mt-1 font-mono font-bold text-[#172033]">
                    {selectedIntegration.token_lifetime_days} days
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#475569] mb-2">
                  Approved Endpoints & HTTP Verbs
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {selectedIntegration.scope.split(',').map((rule) => (
                    <div
                      key={rule.trim()}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-[#172033]"
                    >
                      <span>{rule.trim()}</span>
                      <span className="font-sans text-[11px] font-semibold text-[#16A34A]">
                        Permitted
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Associated E18 API Events */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#172033]">
                  Observed E18 API Events ({associatedEvents.length})
                </h3>
                <span className="text-xs text-[#64748B]">Sorted by highest risk</span>
              </div>

              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                {associatedEvents.slice(0, 18).map((ev) => (
                  <div
                    key={ev.requestId}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-xs hover:bg-[#F8FAFC]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#172033]">{ev.requestId}</span>
                        {ev.isAlert && <ShieldAlert className="h-3.5 w-3.5 text-[#DC2626]" />}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-[#475569] truncate">
                        {ev.method} {ev.endpoint} · {ev.callerIp} · {ev.recordsReturned} recs
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#64748B]">
                        {formatUtcTimestamp(ev.tsUtc)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <SeverityTag severity={ev.severity} />
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIntegration(null);
                          onInvestigate(ev.requestId);
                        }}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-[#5146E5] hover:border-[#5146E5] cursor-pointer"
                      >
                        Investigate
                      </button>
                    </div>
                  </div>
                ))}
                {associatedEvents.length === 0 && (
                  <p className="py-8 text-center text-xs text-[#64748B]">
                    No E18 API calls recorded for this credential in the active dataset.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
