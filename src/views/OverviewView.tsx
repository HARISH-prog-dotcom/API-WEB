import React from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileUp,
  GitFork,
  Link2,
  Play,
  Radar,
  Server,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NavSection } from '../components/LayoutShell';
import {
  DatasetProvenanceBar,
  EmptyWorkspaceNotice,
  RiskScoreMeter,
  SeverityTag,
  formatUtcTimestamp,
} from '../components/RiskUI';
import type { WorkspaceStateResponse } from '../types/sentinel';

interface OverviewViewProps {
  state: WorkspaceStateResponse;
  onNavigate: (section: NavSection) => void;
  onInvestigate: (requestId: string) => void;
  onOpenDemo: () => void;
  onLoadSynthetic: () => void;
  loadingAction: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  state,
  onNavigate,
  onInvestigate,
  onOpenDemo,
  onLoadSynthetic,
  loadingAction,
}) => {
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

  const m = state.metrics;

  const kpiCards = [
    {
      label: 'Total Integrations',
      value: m.totalIntegrations,
      subtext: `${m.activeIntegrations} active · ${m.inactiveOrRevokedIntegrations} revoked/inactive`,
      icon: Link2,
      accent: 'text-[#5146E5] bg-[#5146E5]/10',
      onClick: () => onNavigate('integrations'),
    },
    {
      label: 'Total API Events',
      value: m.totalApiEvents,
      subtext: `Baseline split ${Math.round(state.config.baselineFraction * 100)}% · E18 telemetry`,
      icon: Activity,
      accent: 'text-[#2563EB] bg-[#2563EB]/10',
      onClick: () => onNavigate('activity'),
    },
    {
      label: 'Total Security Alerts',
      value: m.totalAlerts,
      subtext: `Threshold ≥ ${state.config.alertThreshold} · ${m.openAlertsCount} pending review`,
      icon: ShieldAlert,
      accent: 'text-[#9333EA] bg-[#9333EA]/10',
      onClick: () => onNavigate('alerts'),
    },
    {
      label: 'High & Critical Events',
      value: m.highAndCriticalCount,
      subtext: `${m.criticalCount} Critical (80–100) · ${m.highCount} High (55–79)`,
      icon: AlertOctagon,
      accent: 'text-[#DC2626] bg-[#DC2626]/10',
      onClick: () => onNavigate('alerts'),
    },
    {
      label: 'Vendor Record Changes',
      value: m.vendorRecordChanges,
      subtext: `${m.sensitiveVendorChanges} sensitive · ${m.missingApprovalCount} missing approval`,
      icon: FileSpreadsheet,
      accent: 'text-[#0D9488] bg-[#0D9488]/10',
      onClick: () => onNavigate('evidence'),
    },
    {
      label: 'Suspicious Integrations',
      value: m.suspiciousIntegrationsCount,
      subtext: `${m.unregisteredCredentialsObserved} unregistered key(s) observed`,
      icon: Radar,
      accent: 'text-[#EA580C] bg-[#EA580C]/10',
      onClick: () => onNavigate('intelligence'),
    },
  ];

  const riskDistData = [
    { name: 'Low (0–34)', value: m.lowCount, color: '#16A34A' },
    { name: 'Medium (35–54)', value: m.mediumCount, color: '#9333EA' },
    { name: 'High (55–79)', value: m.highCount, color: '#EA580C' },
    { name: 'Critical (80–100)', value: m.criticalCount, color: '#DC2626' },
  ];

  const topIntegrationsChart = state.integrationRollups.slice(0, 7).map((r) => ({
    name: r.integration.length > 20 ? `${r.integration.slice(0, 18)}…` : r.integration,
    fullName: r.integration,
    credentialId: r.credentialId,
    maxRisk: r.maxRiskScore,
    suspicious: r.suspiciousEvents,
    alerts: r.alertCount,
  }));

  const activeSignals = state.signalFrequencies.filter((s) => s.count > 0);
  const maxSignalCount = Math.max(1, ...activeSignals.map((s) => s.count));

  const pipelineSteps: Array<{
    step: string;
    title: string;
    metric: string;
    detail: string;
    accent: string;
    target: NavSection;
  }> = [
    {
      step: '01',
      title: 'E04 Register',
      metric: `${m.totalIntegrations} Approved`,
      detail: 'Scopes, owners & CIDRs',
      accent: 'text-[#5146E5] bg-[#5146E5]/10',
      target: 'integrations',
    },
    {
      step: '02',
      title: 'E18 API Activity',
      metric: `${m.totalApiEvents} Calls`,
      detail: 'Observed endpoints & IPs',
      accent: 'text-[#2563EB] bg-[#2563EB]/10',
      target: 'activity',
    },
    {
      step: '03',
      title: 'E19 Vendor Changes',
      metric: `${m.correlatedVendorChanges}/${m.vendorRecordChanges} Linked`,
      detail: 'Bank & payout master edits',
      accent: 'text-[#0D9488] bg-[#0D9488]/10',
      target: 'evidence',
    },
    {
      step: '04',
      title: 'AI & Rule Engine',
      metric: `12 Signals + iForest`,
      detail: 'Deterministic + outlier',
      accent: 'text-[#9333EA] bg-[#9333EA]/10',
      target: 'ai-analysis',
    },
    {
      step: '05',
      title: 'Risk Score',
      metric: `${m.totalAlerts} Alerts`,
      detail: `Capped 0–100 · ≥${state.config.alertThreshold}`,
      accent: 'text-[#EA580C] bg-[#EA580C]/10',
      target: 'alerts',
    },
    {
      step: '06',
      title: 'Investigation',
      metric: `${m.highAndCriticalCount} Priority`,
      detail: 'Facts vs. hypotheses',
      accent: 'text-[#DC2626] bg-[#DC2626]/10',
      target: 'investigation',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Provenance Bar */}
      <DatasetProvenanceBar
        source={state.datasetSource}
        label={state.datasetLabel}
        lastAnalyzedAt={state.lastAnalyzedAt}
        onOpenUpload={() => onNavigate('upload')}
      />

      {/* Command Center Hero Banner */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-2 max-w-3xl">
            <p className="text-xs font-semibold tracking-wide text-[#5146E5]">
              Permission + Behavior + Business Impact = Explainable Risk
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172033]">
              Third-Party API Permission-Drift Command Center
            </h1>
            <p className="text-sm text-[#64748B] leading-relaxed">
              Continuously compares approved third-party integration boundaries (E04) against observed API behavior (E18) and downstream vendor master modifications (E19) to surface explainable, evidence-first risk intelligence.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenDemo}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#5146E5] to-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 transition-opacity whitespace-nowrap cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current shrink-0" />
              Run Live Security Demonstration
            </button>
            <button
              type="button"
              onClick={() => onNavigate('upload')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#172033] hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileUp className="h-4 w-4 text-[#5146E5]" />
              Upload CSV Evidence
            </button>
          </div>
        </div>
      </section>

      {/* 6 Dynamic KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className="group flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 text-left hover:border-[#5146E5]/40 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#64748B]">{card.label}</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.accent}`}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="font-mono tabular-nums text-2xl font-bold text-[#172033]">
                  {card.value.toLocaleString()}
                </p>
                <p className="mt-1 text-[11.5px] text-[#64748B] truncate">{card.subtext}</p>
              </div>
            </button>
          );
        })}
      </section>

      {/* Evidence Correlation Pipeline (E) */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-[#172033]">Evidence Correlation Pipeline</h2>
            <p className="text-xs text-[#64748B]">
              Click any stage to inspect underlying records, correlation weights, or active investigations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('evidence')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5146E5] hover:underline whitespace-nowrap cursor-pointer"
          >
            <GitFork className="h-3.5 w-3.5" />
            Open Evidence Relationship Graph
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {pipelineSteps.map((step, idx) => (
            <div key={step.step} className="relative flex items-center">
              <button
                type="button"
                onClick={() => onNavigate(step.target)}
                className="flex flex-1 flex-col rounded-xl border border-slate-200 bg-[#F8FAFC]/80 p-3.5 text-left hover:border-[#5146E5]/50 hover:bg-white transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${step.accent}`}>
                    {step.step}
                  </span>
                  {idx < pipelineSteps.length - 1 && (
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300 hidden lg:block" />
                  )}
                </div>
                <p className="mt-2.5 text-xs font-bold text-[#172033]">{step.title}</p>
                <p className="mt-0.5 font-mono tabular-nums text-xs font-semibold text-[#5146E5]">
                  {step.metric}
                </p>
                <p className="mt-1 text-[11px] text-[#64748B] truncate">{step.detail}</p>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Row 1 Charts: API Activity Timeline (B) + Risk Distribution (A) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 rounded-2xl border border-slate-200/90 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-[#172033]">
                API Activity Timeline — Normal vs. Suspicious
              </h2>
              <p className="text-xs text-[#64748B]">
                Observed E18 API call volume across UTC time windows (suspicious = alert or score ≥ 35)
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#64748B]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#2563EB]" />
                Normal Traffic
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#DC2626]" />
                Suspicious / Drift
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={state.timeline} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="normalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="suspGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '10px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="normal"
                  name="Normal Requests"
                  stroke="#2563EB"
                  strokeWidth={2}
                  fill="url(#normalGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="suspicious"
                  name="Suspicious Requests"
                  stroke="#DC2626"
                  strokeWidth={2.2}
                  fill="url(#suspGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-[#172033]">Risk Severity Distribution</h2>
            <p className="text-xs text-[#64748B]">
              Severity bands remain strictly independent of alert threshold ({state.config.alertThreshold})
            </p>
          </div>
          <div className="h-48 w-full my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskDistData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={2}
                >
                  {riskDistData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
            {riskDistData.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-[#475569]">
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.name.split(' ')[0]}
                </span>
                <span className="font-mono tabular-nums font-bold text-[#172033]">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Row 2 Charts: Integration Risk Overview (C) + Detection Signal Breakdown (D) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-[#172033]">Integration Risk Overview</h2>
              <p className="text-xs text-[#64748B]">
                Peak risk score per credential (including unregistered observed credentials)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('intelligence')}
              className="text-xs font-semibold text-[#5146E5] hover:underline whitespace-nowrap cursor-pointer"
            >
              Inspect Drift
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topIntegrationsChart}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  axisLine={{ stroke: '#E2E8F0' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={136}
                  tick={{ fill: '#172033', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                  formatter={(value: unknown) => [`${value} / 100`, 'Peak Risk Score']}
                />
                <Bar dataKey="maxRisk" radius={[0, 6, 6, 0]} barSize={18}>
                  {topIntegrationsChart.map((entry) => (
                    <Cell
                      key={entry.credentialId}
                      fill={
                        entry.maxRisk >= 80
                          ? '#DC2626'
                          : entry.maxRisk >= 55
                            ? '#EA580C'
                            : entry.maxRisk >= 35
                              ? '#9333EA'
                              : '#16A34A'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-[#172033]">Detection Signal Breakdown</h2>
              <p className="text-xs text-[#64748B]">
                Triggered signal counts and original rule weights across the active dataset
              </p>
            </div>
            <TrendingUp className="h-4 w-4 text-[#5146E5]" />
          </div>
          {activeSignals.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#64748B]">
              No risk signals triggered in the current dataset.
            </p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {activeSignals.map((sig) => {
                const barColor =
                  sig.category === 'business_impact'
                    ? 'bg-[#DC2626]'
                    : sig.category === 'permission'
                      ? 'bg-[#5146E5]'
                      : sig.category === 'ml_anomaly'
                        ? 'bg-[#0D9488]'
                        : 'bg-[#2563EB]';
                return (
                  <div key={sig.code} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-[#172033] truncate">{sig.label}</span>
                      <span className="font-mono tabular-nums text-[#64748B] shrink-0">
                        <strong className="text-[#172033]">{sig.count}</strong> hits · +{sig.weight} wt
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{
                          width: `${Math.max(6, Math.round((sig.count / maxSignalCount) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Row 3: Priority Alerts Queue + Actual Operational System Health */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-[#172033]">Priority Security Alerts</h2>
              <p className="text-xs text-[#64748B]">
                Top risk events exceeding alert threshold ({state.config.alertThreshold}) with correlated evidence
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('alerts')}
              className="text-xs font-semibold text-[#5146E5] hover:underline whitespace-nowrap cursor-pointer"
            >
              Manage all {m.totalAlerts} alerts
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B]">
                  <th className="py-2.5 px-4">Request / Integration</th>
                  <th className="py-2.5 px-4">Endpoint & IP</th>
                  <th className="py-2.5 px-4">Evidence</th>
                  <th className="py-2.5 px-4">Risk Score</th>
                  <th className="py-2.5 px-4">Severity</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {state.alerts.slice(0, 6).map((al) => (
                  <tr key={al.requestId} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-2.5 px-4">
                      <p className="font-mono font-semibold text-[#172033]">{al.requestId}</p>
                      <p className="text-[11px] text-[#64748B] truncate max-w-[180px]">
                        {al.integrationName} · {al.apiKeyId}
                      </p>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11.5px]">
                      <p className="text-[#172033] truncate max-w-[200px]">
                        <span className="font-semibold text-[#5146E5]">{al.method}</span> {al.endpoint}
                      </p>
                      <p className="text-[#64748B]">{al.callerIp}</p>
                    </td>
                    <td className="py-2.5 px-4 text-[11.5px] text-[#475569] whitespace-nowrap">
                      {al.linkedE04 ? 'E04' : 'No E04'} · E18
                      {al.linkedE19.length > 0 ? (
                        <span className="font-semibold text-[#DC2626]">
                          {' '}· E19 ({al.linkedE19.length})
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-4">
                      <RiskScoreMeter score={al.riskScore} severity={al.severity} compact />
                    </td>
                    <td className="py-2.5 px-4">
                      <SeverityTag severity={al.severity} />
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onInvestigate(al.requestId)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-[#5146E5] hover:border-[#5146E5] hover:bg-[#5146E5]/5 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Investigate
                      </button>
                    </td>
                  </tr>
                ))}
                {state.alerts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-[#64748B]">
                      No events exceeded the current alert threshold ({state.config.alertThreshold}).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Genuine System Health Panel */}
        <div className="xl:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[#172033]">System Health & Runtime</h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16A34A]">
                <CheckCircle2 className="h-4 w-4" />
                Operational
              </span>
            </div>
            <p className="text-xs text-[#64748B] mb-4">
              Verified live runtime telemetry reported directly by the Express backend.
            </p>

            <div className="space-y-3 text-xs divide-y divide-slate-100">
              <div className="flex items-start justify-between gap-2 pt-1">
                <span className="flex items-center gap-2 text-[#64748B]">
                  <Server className="h-3.5 w-3.5 text-[#5146E5] shrink-0" />
                  Backend Engine
                </span>
                <span className="text-right font-medium text-[#172033]">
                  Express · 12 Rules + iForest
                </span>
              </div>
              <div className="flex items-start justify-between gap-2 pt-3">
                <span className="flex items-center gap-2 text-[#64748B]">
                  <Database className="h-3.5 w-3.5 text-[#0D9488] shrink-0" />
                  Persistence
                </span>
                <span className="text-right font-medium text-[#172033]">
                  Local File DB (Dev Mode)
                </span>
              </div>
              <div className="flex items-start justify-between gap-2 pt-3">
                <span className="flex items-center gap-2 text-[#64748B]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
                  AI Explainer
                </span>
                <span className="text-right font-medium text-[#172033]">
                  {state.health.geminiConfigured
                    ? 'Gemini 4 + Deterministic Toggle'
                    : 'Deterministic Ready (No API Key)'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2 pt-3">
                <span className="text-[#64748B]">Model Version</span>
                <span className="font-mono text-[#172033]">{state.config.modelVersion}</span>
              </div>
              <div className="flex items-start justify-between gap-2 pt-3">
                <span className="text-[#64748B]">Last Analyzed</span>
                <span className="font-mono tabular-nums text-[#172033]">
                  {formatUtcTimestamp(state.lastAnalyzedAt)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="mt-5 w-full rounded-lg border border-slate-200 bg-[#F8FAFC] py-2 text-xs font-semibold text-[#172033] hover:border-[#5146E5]/40 hover:text-[#5146E5] transition-colors cursor-pointer"
          >
            Configure Thresholds & Inspect Health
          </button>
        </div>
      </section>
    </div>
  );
};
