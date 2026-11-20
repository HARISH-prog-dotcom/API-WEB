import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Radar,
  ShieldAlert,
  ShieldOff,
} from 'lucide-react';
import type { NavSection } from '../components/LayoutShell';
import {
  DatasetProvenanceBar,
  EmptyWorkspaceNotice,
  RiskScoreMeter,
  SeverityTag,
} from '../components/RiskUI';
import type { WorkspaceStateResponse } from '../types/sentinel';

interface SecurityIntelligenceViewProps {
  state: WorkspaceStateResponse;
  onNavigate: (section: NavSection) => void;
  onInvestigate: (requestId: string) => void;
  onLoadSynthetic: () => void;
  loadingAction: boolean;
}

export const SecurityIntelligenceView: React.FC<SecurityIntelligenceViewProps> = ({
  state,
  onNavigate,
  onInvestigate,
  onLoadSynthetic,
  loadingAction,
}) => {
  const [selectedCredId, setSelectedCredId] = useState<string>(
    state.integrationRollups[0]?.credentialId ?? ''
  );

  const activeCredId =
    state.integrationRollups.some((r) => r.credentialId === selectedCredId)
      ? selectedCredId
      : (state.integrationRollups[0]?.credentialId ?? '');

  const selectedRollup = useMemo(
    () => state.integrationRollups.find((r) => r.credentialId === activeCredId) ?? null,
    [state.integrationRollups, activeCredId]
  );

  const selectedE04 = useMemo(
    () => state.e04.find((e) => e.credential_id === activeCredId) ?? null,
    [state.e04, activeCredId]
  );

  const selectedEvents = useMemo(
    () =>
      state.events
        .filter((e) => e.apiKeyId === activeCredId)
        .sort((a, b) => b.riskScore - a.riskScore),
    [state.events, activeCredId]
  );

  const observedEndpoints = useMemo(() => {
    const map = new Map<string, { count: number; outOfScope: boolean }>();
    for (const ev of selectedEvents) {
      const key = `${ev.method} ${ev.endpoint}`;
      const prev = map.get(key) ?? { count: 0, outOfScope: false };
      prev.count += 1;
      if (ev.driftSummary.scopeViolation || ev.driftSummary.unregistered) {
        prev.outOfScope = true;
      }
      map.set(key, prev);
    }
    return Array.from(map.entries());
  }, [selectedEvents]);

  const observedIps = useMemo(() => {
    const map = new Map<string, { count: number; violated: boolean }>();
    for (const ev of selectedEvents) {
      const prev = map.get(ev.callerIp) ?? { count: 0, violated: false };
      prev.count += 1;
      if (ev.driftSummary.ipViolation || ev.driftSummary.unregistered) {
        prev.violated = true;
      }
      map.set(ev.callerIp, prev);
    }
    return Array.from(map.entries());
  }, [selectedEvents]);

  const correlatedSensitiveEvents = useMemo(
    () => state.events.filter((e) => e.driftSummary.sensitiveChange),
    [state.events]
  );

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
            Permission Drift Intelligence & Trust Boundary Verification
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#172033]">
            Security Intelligence
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Side-by-side comparison of approved E04 integration permissions against observed E18 runtime activity and E19 vendor impact.
          </p>
        </div>
      </div>

      {/* Trust Boundary Matrix */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-[#172033]">
              Trust Boundary Matrix — Select Integration to Inspect Drift
            </h2>
            <p className="text-xs text-[#64748B]">
              Evaluates every credential across approved trust boundaries: Registration, Scope, IP Allowlist, Baseline Behavior, and Business Impact.
            </p>
          </div>
          <span className="text-xs text-[#64748B]">
            {state.integrationRollups.filter((r) => r.maxRiskScore >= 55).length} of{' '}
            {state.integrationRollups.length} credentials breached trust boundaries
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {state.integrationRollups.map((rollup) => {
            const selected = rollup.credentialId === activeCredId;
            const breached = rollup.maxRiskScore >= 55 || !rollup.registered;
            return (
              <button
                key={rollup.credentialId}
                type="button"
                onClick={() => setSelectedCredId(rollup.credentialId)}
                className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer ${
                  selected
                    ? 'border-[#5146E5] bg-[#5146E5]/[0.04] ring-2 ring-[#5146E5]/15'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#172033] truncate">
                      {rollup.integration}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#64748B]">
                      {rollup.credentialId} · {rollup.status}
                    </p>
                  </div>
                  {breached ? (
                    <ShieldAlert className="h-4 w-4 text-[#DC2626] shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" />
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                  <RiskScoreMeter
                    score={rollup.maxRiskScore}
                    severity={
                      rollup.maxRiskScore >= 80
                        ? 'CRITICAL'
                        : rollup.maxRiskScore >= 55
                          ? 'HIGH'
                          : rollup.maxRiskScore >= 35
                            ? 'MEDIUM'
                            : 'LOW'
                    }
                    compact
                  />
                  <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                    <span>{rollup.totalEvents} events</span>
                    <span className={rollup.alertCount > 0 ? 'font-semibold text-[#DC2626]' : ''}>
                      {rollup.alertCount} alert{rollup.alertCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Permission Drift Side-by-Side Comparison */}
      {selectedRollup && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <Radar className="h-4 w-4 text-[#5146E5]" />
                <h2 className="text-lg font-bold text-[#172033]">
                  Permission vs. Behavior Drift — {selectedRollup.integration}
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-[#64748B]">
                Credential <span className="font-mono text-[#172033]">{selectedRollup.credentialId}</span> · Vendor: {selectedRollup.vendor} · System: {selectedRollup.system}
              </p>
            </div>
            {selectedEvents[0] && (
              <button
                type="button"
                onClick={() => onInvestigate(selectedEvents[0].requestId)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#5146E5] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] transition-colors whitespace-nowrap cursor-pointer"
              >
                Investigate Peak Event ({selectedEvents[0].requestId})
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: E04 Approved Boundary */}
            <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-[#172033]">
                  <Lock className="h-4 w-4 text-[#0D9488]" />
                  E04 Approved Trust Boundary
                </span>
                <span className="text-xs font-semibold text-[#0D9488]">
                  {selectedE04 ? `Status: ${selectedE04.status}` : 'NOT REGISTERED'}
                </span>
              </div>

              {!selectedE04 ? (
                <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4 text-xs text-[#B91C1C] flex items-start gap-2.5">
                  <ShieldOff className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Unregistered Shadow Credential (+35 Risk)</p>
                    <p className="mt-1">
                      Credential <span className="font-mono">{selectedRollup.credentialId}</span> appears in E18 API logs but has zero matching approval records in the E04 register.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div>
                    <p className="font-semibold text-[#64748B] mb-1.5">Approved API Scope</p>
                    <div className="space-y-1.5">
                      {selectedE04.scope.split(',').map((rule) => (
                        <div
                          key={rule.trim()}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[12px] text-[#172033]"
                        >
                          {rule.trim()}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/70">
                    <div>
                      <p className="text-[#64748B]">IP Restriction</p>
                      <p className="mt-0.5 font-mono font-semibold text-[#172033]">
                        {selectedE04.ip_restriction || 'None specified'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#64748B]">Integration Owner</p>
                      <p className="mt-0.5 font-semibold text-[#172033]">{selectedE04.owner}</p>
                    </div>
                    <div>
                      <p className="text-[#64748B]">Token Lifetime</p>
                      <p className="mt-0.5 font-mono font-semibold text-[#172033]">
                        {selectedE04.token_lifetime_days} days
                      </p>
                    </div>
                    <div>
                      <p className="text-[#64748B]">Credential Status</p>
                      <p
                        className={`mt-0.5 font-semibold ${
                          selectedE04.status === 'active' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {selectedE04.status}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: E18 Observed Activity */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-[#172033]">
                  <Radar className="h-4 w-4 text-[#5146E5]" />
                  E18 Observed Runtime Behavior
                </span>
                <span className="font-mono text-xs text-[#64748B]">
                  {selectedEvents.length} observed calls
                </span>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <p className="font-semibold text-[#64748B] mb-1.5">Observed Method & Endpoints</p>
                  <div className="space-y-1.5">
                    {observedEndpoints.map(([ep, info]) => (
                      <div
                        key={ep}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 font-mono text-[12px] ${
                          info.outOfScope
                            ? 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
                            : 'border-slate-200 bg-[#F8FAFC] text-[#172033]'
                        }`}
                      >
                        <span className="truncate">{ep}</span>
                        <span className="shrink-0 font-sans text-[11px] font-semibold">
                          {info.count}× · {info.outOfScope ? 'DRIFT' : 'Approved'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-[#64748B] mb-1.5">Observed Caller IPs</p>
                  <div className="space-y-1.5">
                    {observedIps.map(([ip, info]) => (
                      <div
                        key={ip}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 font-mono text-[12px] ${
                          info.violated
                            ? 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
                            : 'border-slate-200 bg-[#F8FAFC] text-[#172033]'
                        }`}
                      >
                        <span>{ip}</span>
                        <span className="font-sans text-[11px] font-semibold">
                          {info.count} calls · {info.violated ? 'OUTSIDE CIDR' : 'Allowlisted'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Business Impact Awareness Spotlight */}
      <section className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#172033]">
              Business Impact Awareness — Correlated Sensitive Vendor Changes
            </h2>
            <p className="text-xs text-[#64748B]">
              API requests linked via verified request_id to bank, IBAN, routing, or payout master record edits in E19.
            </p>
          </div>
          <span className="text-xs font-semibold text-[#DC2626]">
            {correlatedSensitiveEvents.filter((e) => e.driftSummary.missingApproval).length} missing approval reference
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B]">
                <th className="py-2.5 px-4">Request ID</th>
                <th className="py-2.5 px-4">Integration</th>
                <th className="py-2.5 px-4">Vendor & Field Modified (E19)</th>
                <th className="py-2.5 px-4">Approval Ref</th>
                <th className="py-2.5 px-4">Risk</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {correlatedSensitiveEvents.map((ev) =>
                ev.linkedE19.map((chg) => (
                  <tr key={`${ev.requestId}-${chg.change_id}`} className="hover:bg-[#F8FAFC]">
                    <td className="py-3 px-4 font-mono font-semibold text-[#172033]">
                      {ev.requestId}
                      <span className="block font-normal text-[11px] text-[#64748B]">
                        {chg.change_id}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-[#172033]">{ev.integrationName}</p>
                      <p className="font-mono text-[11px] text-[#64748B]">{ev.apiKeyId}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-[#172033]">
                        {chg.vendor_name} · <span className="font-mono text-[#5146E5]">{chg.field}</span>
                      </p>
                      <p className="font-mono text-[11px] text-[#64748B]">
                        {chg.old_value} → <span className="text-[#172033] font-medium">{chg.new_value}</span>
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      {chg.approval_ref ? (
                        <span className="inline-flex items-center gap-1 font-mono font-semibold text-[#16A34A]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {chg.approval_ref}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#DC2626]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Missing (+25)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <SeverityTag severity={ev.severity} />
                        <span className="font-mono font-bold tabular-nums text-[#172033]">
                          {ev.riskScore}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onInvestigate(ev.requestId)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-[#5146E5] hover:border-[#5146E5] cursor-pointer"
                      >
                        Investigate
                      </button>
                    </td>
                  </tr>
                ))
              )}
              {correlatedSensitiveEvents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#64748B]">
                    No E18 API requests are correlated to sensitive E19 vendor changes in this dataset.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
