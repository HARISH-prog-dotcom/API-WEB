import React, { useMemo, useState } from 'react';
import { Download, FileDown, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NavSection } from '../components/LayoutShell';
import { DatasetProvenanceBar, EmptyWorkspaceNotice } from '../components/RiskUI';
import type { SeverityLevel, WorkspaceStateResponse } from '../types/sentinel';
import { downloadCsvFile, exportExecutivePosturePdf } from '../utils/exportReports';

interface ReportsViewProps {
  state: WorkspaceStateResponse;
  onNavigate: (section: NavSection) => void;
  onLoadSynthetic: () => void;
  loadingAction: boolean;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  state,
  onNavigate,
  onLoadSynthetic,
  loadingAction,
}) => {
  const [integrationFilter, setIntegrationFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | SeverityLevel>('all');
  const [dateFilter, setDateFilter] = useState('all');

  const uniqueDates = useMemo(
    () =>
      Array.from(
        new Set(state.events.map((e) => e.tsUtc.slice(0, 10)).filter(Boolean))
      ).sort(),
    [state.events]
  );

  const uniqueIntegrations = useMemo(
    () => Array.from(new Set(state.events.map((e) => e.integrationName))).sort(),
    [state.events]
  );

  const filteredEvents = useMemo(() => {
    return state.events.filter((ev) => {
      if (integrationFilter !== 'all' && ev.integrationName !== integrationFilter) return false;
      if (severityFilter !== 'all' && ev.severity !== severityFilter) return false;
      if (dateFilter !== 'all' && !ev.tsUtc.startsWith(dateFilter)) return false;
      return true;
    });
  }, [state.events, integrationFilter, severityFilter, dateFilter]);

  const filteredAlerts = useMemo(
    () =>
      filteredEvents
        .filter((e) => e.isAlert)
        .sort((a, b) => b.riskScore - a.riskScore),
    [filteredEvents]
  );

  const dailyTrends = useMemo(() => {
    const map = new Map<string, { date: string; events: number; alerts: number; highCrit: number }>();
    for (const ev of filteredEvents) {
      const date = ev.tsUtc.slice(0, 10) || 'Unknown';
      const entry = map.get(date) ?? { date, events: 0, alerts: 0, highCrit: 0 };
      entry.events += 1;
      if (ev.isAlert) entry.alerts += 1;
      if (ev.severity === 'HIGH' || ev.severity === 'CRITICAL') entry.highCrit += 1;
      map.set(date, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredEvents]);

  const filteredSignalData = useMemo(() => {
    const counts = new Map<string, { label: string; count: number; weight: number }>();
    for (const ev of filteredEvents) {
      for (const s of ev.signals) {
        const cur = counts.get(s.code) ?? { label: s.label, count: 0, weight: s.weight };
        cur.count += 1;
        counts.set(s.code, cur);
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filteredEvents]);

  const filterSummary = `Date: ${dateFilter === 'all' ? 'All' : dateFilter} | Integration: ${integrationFilter === 'all' ? 'All' : integrationFilter} | Severity: ${severityFilter === 'all' ? 'All' : severityFilter}`;

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

  const handleExportFilteredAlertsCsv = () => {
    downloadCsvFile(
      `api_sentinel_report_alerts_${new Date().toISOString().slice(0, 10)}.csv`,
      filteredAlerts.map((a) => ({
        request_id: a.requestId,
        ts_utc: a.tsUtc,
        integration: a.integrationName,
        credential_id: a.apiKeyId,
        method: a.method,
        endpoint: a.endpoint,
        caller_ip: a.callerIp,
        records_returned: a.recordsReturned,
        risk_score: a.riskScore,
        severity: a.severity,
        triage_status: a.triageStatus,
        linked_e19_ids: a.linkedE19.map((c) => c.change_id).join('; '),
        signals: a.signals.map((s) => `${s.label} (+${s.weight})`).join('; '),
      }))
    );
  };

  const handleExportEvidenceCorrelationCsv = () => {
    downloadCsvFile(
      `api_sentinel_e19_correlation_${new Date().toISOString().slice(0, 10)}.csv`,
      state.e19.map((c) => ({
        change_id: c.change_id,
        ts_utc: c.ts_utc,
        vendor_id: c.vendor_id,
        vendor_name: c.vendor_name,
        field: c.field,
        old_value: c.old_value,
        new_value: c.new_value,
        approval_ref: c.approval_ref || 'MISSING',
        request_id: c.request_id || 'UNLINKED',
        channel: c.channel,
        changed_by: c.changed_by,
      }))
    );
  };

  const correlationRate =
    state.metrics.vendorRecordChanges > 0
      ? Math.round(
          (state.metrics.correlatedVendorChanges / state.metrics.vendorRecordChanges) * 100
        )
      : 0;

  return (
    <div className="space-y-6">
      <DatasetProvenanceBar
        source={state.datasetSource}
        label={state.datasetLabel}
        lastAnalyzedAt={state.lastAnalyzedAt}
        onOpenUpload={() => onNavigate('upload')}
      />

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#5146E5]">
            Executive Analytics, Governance Metrics & Evidence Exports
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#172033]">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Filter posture statistics across dates, integrations, and severities, and generate audit-ready CSV or branded PDF reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportExecutivePosturePdf(state, filteredAlerts, filterSummary)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#5146E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] whitespace-nowrap cursor-pointer"
          >
            <FileDown className="h-4 w-4" />
            Download Executive PDF Report
          </button>
          <button
            type="button"
            onClick={handleExportFilteredAlertsCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#172033] hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-[#2563EB]" />
            Export Alerts CSV
          </button>
          <button
            type="button"
            onClick={handleExportEvidenceCorrelationCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#172033] hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#0D9488]" />
            Export E19 CSV
          </button>
        </div>
      </div>

      {/* Report Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 text-xs">
        <span className="font-bold text-[#172033]">Report Filters:</span>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 font-semibold text-[#172033]"
        >
          <option value="all">All Dates</option>
          {uniqueDates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={integrationFilter}
          onChange={(e) => setIntegrationFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 font-semibold text-[#172033]"
        >
          <option value="all">All Integrations</option>
          {uniqueIntegrations.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as 'all' | SeverityLevel)}
          className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 font-semibold text-[#172033]"
        >
          <option value="all">All Severities</option>
          <option value="CRITICAL">Critical (80–100)</option>
          <option value="HIGH">High (55–79)</option>
          <option value="MEDIUM">Medium (35–54)</option>
          <option value="LOW">Low (0–34)</option>
        </select>

        <span className="ml-auto font-mono tabular-nums text-[#64748B]">
          Matched {filteredEvents.length} events · {filteredAlerts.length} alerts
        </span>
      </div>

      {/* Governance & Correlation KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-[#64748B]">Filtered Security Posture</p>
          <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#172033]">
            {filteredAlerts.length} Alerts
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            Out of {filteredEvents.length} filtered API calls
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-[#64748B]">Sensitive Vendor Changes</p>
          <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#0D9488]">
            {state.metrics.sensitiveVendorChanges} / {state.metrics.vendorRecordChanges}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            Bank, IBAN, routing & payout fields (E19)
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-[#64748B]">Missing Approval References</p>
          <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#DC2626]">
            {state.metrics.missingApprovalCount}
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            Sensitive E19 changes lacking approval_ref
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-[#64748B]">Evidence Correlation Rate</p>
          <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-[#5146E5]">
            {correlationRate}%
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            {state.metrics.correlatedVendorChanges} E19 changes matched via request_id
          </p>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5">
          <h2 className="text-base font-bold text-[#172033]">Daily API Volume & Alert Trends</h2>
          <p className="text-xs text-[#64748B] mb-4">
            Total API events vs raised alerts and high/critical findings per UTC date
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrends} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E2E8F0',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="events"
                  name="Total Events"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="alerts"
                  name="Raised Alerts"
                  stroke="#9333EA"
                  strokeWidth={2.2}
                  dot={{ r: 3.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="highCrit"
                  name="High & Critical"
                  stroke="#DC2626"
                  strokeWidth={2.2}
                  dot={{ r: 3.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5">
          <h2 className="text-base font-bold text-[#172033]">Detection Signal Frequency</h2>
          <p className="text-xs text-[#64748B] mb-4">
            Most frequent contributing risk signals across the filtered scope
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredSignalData}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={185}
                  tick={{ fill: '#172033', fontSize: 10.5 }}
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
                />
                <Bar dataKey="count" name="Trigger Count" radius={[0, 6, 6, 0]} barSize={16}>
                  {filteredSignalData.map((item, idx) => (
                    <Cell
                      key={item.label}
                      fill={idx === 0 ? '#5146E5' : idx === 1 ? '#2563EB' : '#0D9488'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Evidentiary Disclosure Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3 text-xs text-[#475569]">
        <ShieldCheck className="h-5 w-5 text-[#5146E5] shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-[#172033]">Reporting Integrity & Uncertainty Disclosure</p>
          <p className="mt-0.5 leading-relaxed">
            All downloaded PDF and CSV reports explicitly record dataset provenance ({state.datasetSource.toUpperCase()}), verified evidence references, and limitations. Reports never claim confirmed financial loss or compromise unless established by external investigation.
          </p>
        </div>
      </div>
    </div>
  );
};
