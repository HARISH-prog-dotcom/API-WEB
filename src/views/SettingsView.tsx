import React, { useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Database,
  Save,
  Server,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { formatUtcTimestamp } from '../components/RiskUI';
import { SIGNAL_WEIGHT_CATALOG, type WorkspaceStateResponse } from '../types/sentinel';

interface SettingsViewProps {
  state: WorkspaceStateResponse;
  onSaveSettings: (payload: {
    alertThreshold: number;
    baselineFraction: number;
  }) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ state, onSaveSettings }) => {
  const [alertThreshold, setAlertThreshold] = useState(state.config.alertThreshold);
  const [baselineFraction, setBaselineFraction] = useState(state.config.baselineFraction);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedToast(false);
    try {
      await onSaveSettings({ alertThreshold, baselineFraction });
      setSavedToast(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#5146E5]">
          Detection Parameters & Operational Health
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-[#172033]">Settings & System Health</h1>
        <p className="mt-1 text-sm text-[#64748B]">
          Tune alert alerting thresholds and chronological baseline windows independently of fixed severity bands. Secrets and database credentials are never exposed.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Detection Configuration Form */}
        <form
          onSubmit={handleSubmit}
          className="xl:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-6 space-y-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="h-4 w-4 text-[#5146E5]" />
            <h2 className="text-base font-bold text-[#172033]">Detection Engine Configuration</h2>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="alert-threshold" className="font-bold text-[#172033]">
                Configurable Alert Threshold
              </label>
              <span className="font-mono tabular-nums text-sm font-extrabold text-[#5146E5]">
                ≥ {alertThreshold} / 100
              </span>
            </div>
            <input
              id="alert-threshold"
              type="range"
              min={15}
              max={90}
              step={5}
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(Number(e.target.value))}
              className="w-full accent-[#5146E5] cursor-pointer"
            />
            <p className="text-xs text-[#64748B]">
              Controls when scored events raise a formal Security Alert. Kept strictly independent of fixed severity bands (Low 0–34, Medium 35–54, High 55–79, Critical 80–100).
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="baseline-fraction" className="font-bold text-[#172033]">
                Historical Baseline Training Fraction
              </label>
              <span className="font-mono tabular-nums text-sm font-extrabold text-[#2563EB]">
                {Math.round(baselineFraction * 100)}%
              </span>
            </div>
            <input
              id="baseline-fraction"
              type="range"
              min={0.3}
              max={0.8}
              step={0.05}
              value={baselineFraction}
              onChange={(e) => setBaselineFraction(Number(e.target.value))}
              className="w-full accent-[#2563EB] cursor-pointer"
            />
            <p className="text-xs text-[#64748B]">
              Portion of earliest chronological E18 events per credential used to learn normal IPs, endpoints, HTTP methods, active UTC hours, and returned-record volume before drift scoring.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="rounded-lg bg-[#F8FAFC] border border-slate-200 p-3">
              <p className="text-[#64748B]">Model Version</p>
              <p className="mt-0.5 font-mono font-bold text-[#172033]">
                {state.config.modelVersion}
              </p>
            </div>
            <div className="rounded-lg bg-[#F8FAFC] border border-slate-200 p-3">
              <p className="text-[#64748B]">Isolation Forest Trees</p>
              <p className="mt-0.5 font-mono font-bold text-[#172033]">
                {state.config.isolationForestTrees} trees · {(state.config.isolationForestContamination * 100).toFixed(0)}% tail
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {savedToast ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16A34A]">
                <CheckCircle2 className="h-4 w-4" />
                Configuration saved & dataset re-analyzed
              </span>
            ) : (
              <span className="text-xs text-[#64748B]">
                Saving immediately re-scores active evidence
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5146E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Applying...' : 'Save & Re-Analyze'}
            </button>
          </div>
        </form>

        {/* System Health & Operational Status */}
        <div className="xl:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-[#0D9488]" />
              <h2 className="text-base font-bold text-[#172033]">Operational System Health</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#16A34A]">
              <CheckCircle2 className="h-4 w-4" />
              API Healthy
            </span>
          </div>

          <dl className="divide-y divide-slate-100 text-xs">
            <div className="py-3 flex items-start justify-between gap-4">
              <dt className="flex items-center gap-2 text-[#64748B]">
                <Cpu className="h-4 w-4 text-[#5146E5]" />
                Detection Runtime
              </dt>
              <dd className="text-right font-semibold text-[#172033]">
                {state.health.engineRuntime}
              </dd>
            </div>
            <div className="py-3 flex items-start justify-between gap-4">
              <dt className="flex items-center gap-2 text-[#64748B]">
                <Database className="h-4 w-4 text-[#0D9488]" />
                Database Connection
              </dt>
              <dd className="text-right">
                <p className="font-semibold text-[#172033]">
                  {state.health.storageConnected ? 'Connected — Local File Persistence' : 'Initializing'}
                </p>
                <p className="text-[11px] text-[#64748B]">
                  Development fallback active; production PostgreSQL DDL provided in db/schema.sql
                </p>
              </dd>
            </div>
            <div className="py-3 flex items-start justify-between gap-4">
              <dt className="flex items-center gap-2 text-[#64748B]">
                <ShieldCheck className="h-4 w-4 text-[#2563EB]" />
                AI Explanation Service
              </dt>
              <dd className="text-right">
                <p className="font-semibold text-[#172033]">
                  {state.health.geminiConfigured
                    ? 'Gemini 4 Hydrogen (Server-Side) + Deterministic Toggle'
                    : 'Deterministic Engine Active (Server Gemini key not configured)'}
                </p>
              </dd>
            </div>
            <div className="py-3 flex items-start justify-between gap-4">
              <dt className="text-[#64748B]">Active Data Source</dt>
              <dd className="text-right font-semibold text-[#172033]">
                {state.datasetSource.toUpperCase()} — {state.datasetLabel}
              </dd>
            </div>
            <div className="py-3 flex items-start justify-between gap-4">
              <dt className="text-[#64748B]">Last Analysis Timestamp</dt>
              <dd className="text-right font-mono tabular-nums text-[#172033]">
                {formatUtcTimestamp(state.lastAnalyzedAt)}
              </dd>
            </div>
            <div className="py-3 flex items-start justify-between gap-4">
              <dt className="text-[#64748B]">Backend Uptime</dt>
              <dd className="text-right font-mono tabular-nums text-[#172033]">
                {Math.floor(state.health.uptimeSeconds / 60)}m {state.health.uptimeSeconds % 60}s
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Preserved 12-Signal Detection Weights Reference */}
      <section className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-[#172033]">
            Preserved 12-Signal Explainable Detection Weights (Capped at 100)
          </h2>
          <p className="text-xs text-[#64748B]">
            Deterministic permission, baseline, and business-impact rules combined with a supporting-only Isolation Forest outlier signal.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-[#F8FAFC] text-[11px] font-semibold text-[#64748B]">
                <th className="py-2.5 px-4">#</th>
                <th className="py-2.5 px-4">Detection Signal</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4 text-right">Weight</th>
                <th className="py-2.5 px-4">Rule Specification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SIGNAL_WEIGHT_CATALOG.map((rule, idx) => (
                <tr key={rule.code} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-4 font-mono text-[#64748B]">{idx + 1}</td>
                  <td className="py-2.5 px-4 font-bold text-[#172033]">{rule.label}</td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-[#5146E5]">
                    {rule.category}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-extrabold text-[#DC2626] tabular-nums">
                    +{rule.weight}
                  </td>
                  <td className="py-2.5 px-4 text-[#475569]">{rule.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
