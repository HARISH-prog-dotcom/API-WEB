import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  KeyRound,
  Pause,
  Play,
  Radar,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { RiskScoreMeter, SeverityTag, formatUtcTimestamp } from '../components/RiskUI';
import { fetchDemoBundle, type DemoBundleResponse } from '../services/api';

interface LiveDemoTheaterProps {
  onClose: () => void;
  onJumpToInvestigation: (requestId: string) => void;
}

const STAGE_TITLES = [
  { num: 1, label: 'Normal Activity', tag: 'Baseline Trust' },
  { num: 2, label: 'Behavioral Deviation', tag: 'Permission Drift' },
  { num: 3, label: 'Business Impact', tag: 'E19 Correlation' },
  { num: 4, label: 'Missing Approval', tag: 'Governance Gap' },
  { num: 5, label: 'Explainable Risk', tag: 'Composite Score' },
  { num: 6, label: 'Defensive Response', tag: 'Action Plan' },
];

export const LiveDemoTheater: React.FC<LiveDemoTheaterProps> = ({
  onClose,
  onJumpToInvestigation,
}) => {
  const [bundle, setBundle] = useState<DemoBundleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState(1);
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    let active = true;
    fetchDemoBundle()
      .then((res) => {
        if (active) setBundle(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setStage((s) => Math.min(6, s + 1));
      if (e.key === 'ArrowLeft') setStage((s) => Math.max(1, s - 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!autoPlay) return;
    const timer = window.setInterval(() => {
      setStage((s) => (s >= 6 ? 1 : s + 1));
    }, 6500);
    return () => window.clearInterval(timer);
  }, [autoPlay]);

  const normalEv = bundle?.normalEvent;
  const critEv = bundle?.criticalEvent;
  const apprEv = bundle?.approvedSensitiveEvent;
  const critE19 = critEv?.linkedE19[0] ?? null;
  const apprE19 = apprEv?.linkedE19[0] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F6F8FC] text-[#172033] overflow-hidden">
      {/* Top Theater Header */}
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3.5 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <BrandLogo />
          <div className="hidden sm:flex items-center gap-2 text-xs text-[#64748B] border-l border-slate-200 pl-4">
            <span className="font-bold text-[#5146E5]">LIVE SECURITY DEMONSTRATION</span>
            <span>·</span>
            <span className="truncate">Synthetic Demonstration Evidence (Isolated)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAutoPlay((a) => !a)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              autoPlay
                ? 'border-[#5146E5] bg-[#5146E5]/10 text-[#5146E5]'
                : 'border-slate-200 bg-white text-[#475569] hover:text-[#172033]'
            }`}
          >
            {autoPlay ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {autoPlay ? 'Pause Auto-Play' : 'Auto-Play'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#172033] hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            <X className="h-4 w-4" />
            Exit Demo
          </button>
        </div>
      </header>

      {/* Interactive 6-Stage Stepper */}
      <div className="border-b border-slate-200 bg-white/80 px-5 py-3 overflow-x-auto shrink-0">
        <div className="mx-auto max-w-6xl grid grid-cols-6 gap-2 min-w-[700px]">
          {STAGE_TITLES.map((item) => {
            const active = stage === item.num;
            const completed = stage > item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => {
                  setAutoPlay(false);
                  setStage(item.num);
                }}
                className={`flex flex-col rounded-xl border px-3 py-2 text-left transition-all cursor-pointer ${
                  active
                    ? 'border-[#5146E5] bg-[#5146E5] text-white shadow-sm'
                    : completed
                      ? 'border-[#5146E5]/30 bg-[#5146E5]/[0.05] text-[#172033]'
                      : 'border-slate-200 bg-white text-[#64748B] hover:border-slate-300'
                }`}
              >
                <span
                  className={`font-mono text-[10.5px] font-bold ${
                    active ? 'text-white/85' : 'text-[#5146E5]'
                  }`}
                >
                  STAGE {item.num}
                </span>
                <span className="mt-0.5 text-xs font-bold truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Presentation Stage Canvas */}
      <main className="flex-1 overflow-y-auto px-5 py-6 sm:py-8">
        <div className="mx-auto max-w-5xl">
          {loading || !normalEv || !critEv ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-[#64748B]">
              Preparing live synthetic demonstration bundle from detection engine...
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
              {/* STAGE 1 — NORMAL ACTIVITY */}
              {stage === 1 && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <p className="font-mono text-xs font-bold text-[#16A34A]">
                        STAGE 1 OF 6 · BASELINE LEGITIMATE ACTIVITY
                      </p>
                      <h2 className="mt-1 text-2xl font-extrabold text-[#172033]">
                        Why Ordinary Authorized API Requests Do Not Trigger Alerts
                      </h2>
                      <p className="mt-1.5 text-sm text-[#64748B] max-w-2xl">
                        API SENTINEL begins by mapping every credential to its approved E04 profile and learning its historical rhythm before flagging anomalies.
                      </p>
                    </div>
                    <SeverityTag severity={normalEv.severity} size="md" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-5 space-y-3 text-xs">
                      <p className="font-bold text-[#5146E5] flex items-center gap-1.5">
                        <KeyRound className="h-4 w-4" />
                        E04 Approved Boundary ({normalEv.apiKeyId})
                      </p>
                      <p className="text-sm font-bold text-[#172033]">
                        {normalEv.integrationName}
                      </p>
                      <dl className="space-y-1.5 text-[#475569]">
                        <div>
                          <span className="text-[#64748B]">Approved Scope: </span>
                          <span className="font-mono text-[#172033]">{normalEv.linkedE04?.scope}</span>
                        </div>
                        <div>
                          <span className="text-[#64748B]">Allowed IP CIDR: </span>
                          <span className="font-mono font-bold text-[#172033]">
                            {normalEv.linkedE04?.ip_restriction}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#64748B]">Owner: </span>
                          <span className="font-semibold text-[#172033]">
                            {normalEv.linkedE04?.owner}
                          </span>
                        </div>
                      </dl>
                    </div>

                    <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4]/60 p-5 space-y-3 text-xs">
                      <p className="font-bold text-[#15803D] flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        Observed E18 Request ({normalEv.requestId})
                      </p>
                      <p className="font-mono text-sm font-bold text-[#172033]">
                        {normalEv.method} {normalEv.endpoint}
                      </p>
                      <dl className="space-y-1.5 text-[#334155]">
                        <div>
                          Caller IP: <span className="font-mono font-bold">{normalEv.callerIp}</span>{' '}
                          (inside 10.42.8.0/24)
                        </div>
                        <div>
                          Time: <span className="font-mono">{formatUtcTimestamp(normalEv.tsUtc)}</span>{' '}
                          (business hours)
                        </div>
                        <div>
                          Volume: <span className="font-mono font-bold">{normalEv.recordsReturned}</span>{' '}
                          records (baseline avg {normalEv.baselineStats.avgRecords})
                        </div>
                      </dl>
                      <div className="pt-2">
                        <RiskScoreMeter score={normalEv.riskScore} severity={normalEv.severity} />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* STAGE 2 — BEHAVIORAL DEVIATION */}
              {stage === 2 && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <p className="font-mono text-xs font-bold text-[#EA580C]">
                        STAGE 2 OF 6 · PERMISSION & BEHAVIORAL DRIFT
                      </p>
                      <h2 className="mt-1 text-2xl font-extrabold text-[#172033]">
                        Same Trusted Credential — Suddenly Outside Scope, IP & Operating Hours
                      </h2>
                      <p className="mt-1.5 text-sm text-[#64748B] max-w-2xl">
                        At 02:14 UTC, the exact same legitimate credential (<span className="font-mono text-[#172033]">{critEv.apiKeyId}</span>) crosses multiple permission and behavioral boundaries simultaneously.
                      </p>
                    </div>
                    <span className="font-mono text-xs font-bold text-[#EA580C]">
                      {critEv.requestId}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {[
                      {
                        dim: 'Endpoint & Method',
                        expected: 'GET /api/v2/invoices, POST /api/v2/invoices/match, GET /api/v2/vendors',
                        observed: `${critEv.method} ${critEv.endpoint}`,
                        weights: 'Out of Scope (+30) · New Endpoint (+20) · New Method (+15)',
                      },
                      {
                        dim: 'Caller IP Address',
                        expected: `Approved CIDR ${critEv.linkedE04?.ip_restriction} (Baseline: ${critEv.baselineStats.knownIps.join(', ')})`,
                        observed: `${critEv.callerIp} (External IP · ${critEv.userAgent})`,
                        weights: 'IP Restriction Violation (+20) · New Baseline IP (+20)',
                      },
                      {
                        dim: 'Time-of-Day Pattern',
                        expected: `Historical business hours (${critEv.baselineStats.knownHours.join('h, ')}h UTC)`,
                        observed: `${formatUtcTimestamp(critEv.tsUtc)} (02:14 UTC)`,
                        weights: 'New Hour-of-Day Pattern (+10)',
                      },
                      {
                        dim: 'Unsupervised Isolation Forest',
                        expected: 'Normal behavioral cluster score < 0.58',
                        observed: `Anomaly Score ${critEv.isolationForestScore.toFixed(4)} (Supporting Outlier)`,
                        weights: 'Supporting Isolation Forest Signal (+10 — never sole trigger)',
                      },
                    ].map((row) => (
                      <div
                        key={row.dim}
                        className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#172033] flex items-center gap-1.5">
                            <Radar className="h-3.5 w-3.5 text-[#5146E5]" />
                            {row.dim}
                          </span>
                        </div>
                        <p className="text-[#64748B]">
                          Expected: <span className="font-mono text-[#172033]">{row.expected}</span>
                        </p>
                        <p className="text-[#DC2626] font-semibold">
                          Observed: <span className="font-mono">{row.observed}</span>
                        </p>
                        <p className="font-mono text-[11px] font-bold text-[#5146E5] pt-1 border-t border-slate-200/70">
                          {row.weights}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* STAGE 3 — BUSINESS IMPACT */}
              {stage === 3 && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <p className="font-mono text-xs font-bold text-[#0D9488]">
                        STAGE 3 OF 6 · THREE-LAYER BUSINESS IMPACT CORRELATION
                      </p>
                      <h2 className="mt-1 text-2xl font-extrabold text-[#172033]">
                        Correlating the API Request to a Sensitive Vendor Bank-Account Edit
                      </h2>
                      <p className="mt-1.5 text-sm text-[#64748B] max-w-2xl">
                        API SENTINEL joins E18 and E19 strictly on verified <span className="font-mono text-[#172033]">request_id</span> — proving the suspicious API call altered a supplier payout IBAN two seconds later.
                      </p>
                    </div>
                  </div>

                  {critE19 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-center text-xs">
                      <div className="rounded-xl border border-[#2563EB]/35 bg-[#2563EB]/[0.04] p-4 space-y-1.5">
                        <p className="font-mono font-bold text-[#2563EB]">E18 API REQUEST</p>
                        <p className="font-mono text-sm font-extrabold text-[#172033]">
                          {critEv.requestId}
                        </p>
                        <p className="font-mono text-[#475569]">
                          {critEv.method} {critEv.endpoint}
                        </p>
                        <p className="font-mono text-[11px] text-[#64748B]">
                          {formatUtcTimestamp(critEv.tsUtc)} · {critEv.callerIp}
                        </p>
                      </div>

                      <div className="flex flex-col items-center justify-center text-center py-2">
                        <span className="rounded-lg bg-[#0D9488]/10 px-3 py-1 font-mono text-xs font-bold text-[#0D9488]">
                          VERIFIED JOIN: request_id
                        </span>
                        <p className="mt-1.5 font-mono text-[11px] text-[#64748B]">
                          +2 seconds delta · exact match
                        </p>
                      </div>

                      <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 space-y-1.5">
                        <p className="font-mono font-bold text-[#DC2626] flex items-center gap-1.5">
                          <Database className="h-3.5 w-3.5" />
                          E19 VENDOR CHANGE ({critE19.change_id})
                        </p>
                        <p className="text-sm font-extrabold text-[#172033]">
                          {critE19.vendor_name}
                        </p>
                        <p className="font-mono text-[#DC2626] font-bold">
                          Field: {critE19.field} (+30 Business Impact)
                        </p>
                        <p className="font-mono text-[11px] text-[#475569] break-all">
                          Old: {critE19.old_value}
                          <br />
                          New: <strong className="text-[#172033]">{critE19.new_value}</strong>
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* STAGE 4 — MISSING APPROVAL */}
              {stage === 4 && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <p className="font-mono text-xs font-bold text-[#DC2626]">
                        STAGE 4 OF 6 · GOVERNANCE & APPROVAL GAP
                      </p>
                      <h2 className="mt-1 text-2xl font-extrabold text-[#172033]">
                        Why a Missing Approval Reference Escalates Risk by +25
                      </h2>
                      <p className="mt-1.5 text-sm text-[#64748B] max-w-2xl">
                        Compare a properly governed vendor bank update with a valid approval ticket against the unapproved off-hours modification.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                    {apprEv && apprE19 && (
                      <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4]/60 p-5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#15803D] flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            Governed Sensitive Change ({apprE19.change_id})
                          </span>
                          <SeverityTag severity={apprEv.severity} />
                        </div>
                        <p className="font-semibold text-[#172033]">
                          {apprEv.integrationName} → {apprE19.vendor_name}
                        </p>
                        <p className="font-mono text-[#475569]">
                          Field: {apprE19.field} · Approval Ref:{' '}
                          <strong className="text-[#15803D]">{apprE19.approval_ref}</strong>
                        </p>
                        <p className="text-[#475569]">
                          Approved scope, approved CIDR IP, and valid approval reference keep score at{' '}
                          <strong className="font-mono text-[#172033]">{apprEv.riskScore}/100</strong>{' '}
                          (no false-positive Critical alert).
                        </p>
                      </div>
                    )}

                    {critE19 && (
                      <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#B91C1C] flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4" />
                            Unapproved Sensitive Change ({critE19.change_id})
                          </span>
                          <SeverityTag severity={critEv.severity} />
                        </div>
                        <p className="font-semibold text-[#172033]">
                          {critEv.integrationName} → {critE19.vendor_name}
                        </p>
                        <p className="font-mono text-[#475569]">
                          Field: {critE19.field} · Approval Ref:{' '}
                          <strong className="text-[#DC2626]">(EMPTY — +25 RISK)</strong>
                        </p>
                        <p className="text-[#991B1B]">
                          Absence of an approval reference on a sensitive IBAN change compounds the permission drift and behavioral anomalies into a Critical investigation priority.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* STAGE 5 — EXPLAINABLE RISK */}
              {stage === 5 && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <p className="font-mono text-xs font-bold text-[#9333EA]">
                        STAGE 5 OF 6 · EXPLAINABLE COMPOSITE RISK SCORE
                      </p>
                      <h2 className="mt-1 text-2xl font-extrabold text-[#172033]">
                        Full Additive Signal Attribution (No Black Box)
                      </h2>
                      <p className="mt-1.5 text-sm text-[#64748B]">
                        Every point traces directly to a documented rule and raw evidence ID, capped at 100.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-3xl font-extrabold text-[#DC2626] tabular-nums">
                        {critEv.riskScore} / 100
                      </p>
                      <p className="font-mono text-xs text-[#64748B]">
                        Uncapped sum {critEv.rawUncappedScore} → CRITICAL
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {critEv.signals.map((sig) => (
                      <div
                        key={sig.code}
                        className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#172033]">{sig.label}</span>
                          <span className="font-mono font-extrabold text-[#DC2626]">
                            +{sig.weight}
                          </span>
                        </div>
                        <p className="mt-1 text-[#475569]">{sig.reason}</p>
                        <p className="mt-1 font-mono text-[10.5px] text-[#5146E5]">
                          Evidence: {sig.evidenceRefs.join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* STAGE 6 — DEFENSIVE RESPONSE */}
              {stage === 6 && (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <p className="font-mono text-xs font-bold text-[#5146E5]">
                        STAGE 6 OF 6 · PROPORTIONATE DEFENSIVE RESPONSE
                      </p>
                      <h2 className="mt-1 text-2xl font-extrabold text-[#172033]">
                        Recommended Investigation & Containment Considerations
                      </h2>
                      <p className="mt-1.5 text-sm text-[#64748B] max-w-2xl">
                        API SENTINEL guides structured verification without claiming unverified fraud or financial loss.
                      </p>
                    </div>
                    <ShieldCheck className="h-8 w-8 text-[#16A34A]" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {[
                      {
                        step: '1. Verify Integration Owner',
                        desc: `Contact ${critEv.owner} to verify whether PUT /api/v2/vendors/bank-accounts from 185.214.68.42 at 02:14 UTC was authorized.`,
                      },
                      {
                        step: '2. Hold Pending Vendor Payouts',
                        desc: 'Confirm the legitimacy of IBAN change CHG-9041 for Nordic Industrial Supply GmbH via out-of-band finance approval before any settlement.',
                      },
                      {
                        step: '3. Audit Gateway Policy Enforcement',
                        desc: 'Determine why an out-of-scope endpoint and external IP outside 10.42.8.0/24 succeeded with HTTP 200.',
                      },
                      {
                        step: '4. Preserve Evidence & Restrict Credential',
                        desc: 'Archive E04, E18, and E19 logs and coordinate with an authorized IAM administrator to restrict or rotate cred_inv_042 if unauthorized.',
                      },
                    ].map((card) => (
                      <div
                        key={card.step}
                        className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4"
                      >
                        <p className="font-bold text-[#172033]">{card.step}</p>
                        <p className="mt-1 text-[#475569] leading-relaxed">{card.desc}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-[#5146E5]/25 bg-[#5146E5]/[0.04] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 text-xs">
                      <ShieldAlert className="h-4 w-4 text-[#5146E5] shrink-0 mt-0.5" />
                      <p className="text-[#334155]">
                        <strong>Evidentiary Transparency:</strong> This walkthrough uses isolated synthetic demonstration evidence. Telemetry alone indicates critical risk requiring review — not confirmed financial loss.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onJumpToInvestigation(critEv.requestId)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#5146E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Open in Investigation Workspace
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Stage Controls Footer */}
      <footer className="border-t border-slate-200 bg-white px-5 py-3.5 shrink-0">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={stage === 1}
            onClick={() => {
              setAutoPlay(false);
              setStage((s) => Math.max(1, s - 1));
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-[#172033] hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Previous Stage
          </button>

          <span className="font-mono text-xs text-[#64748B] tabular-nums">
            Stage {stage} of 6 · Use ← / → keys
          </span>

          {stage < 6 ? (
            <button
              type="button"
              onClick={() => {
                setAutoPlay(false);
                setStage((s) => Math.min(6, s + 1));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5146E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer"
            >
              Next Stage
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => critEv && onJumpToInvestigation(critEv.requestId)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#15803D] cursor-pointer"
            >
              Launch Live Investigation
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
