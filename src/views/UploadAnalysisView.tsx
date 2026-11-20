import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { NavSection } from '../components/LayoutShell';
import { DatasetProvenanceBar } from '../components/RiskUI';
import { analyzeUploadedCsvs, validateCsvPayloads } from '../services/api';
import type {
  CsvValidationResult,
  DatasetQualitySummary,
  WorkspaceStateResponse,
} from '../types/sentinel';

interface UploadAnalysisViewProps {
  state: WorkspaceStateResponse;
  onStateUpdated: (next: WorkspaceStateResponse, toastMsg: string) => void;
  onNavigate: (section: NavSection) => void;
  onLoadSynthetic: () => Promise<void>;
  onResetDataset: () => Promise<void>;
}

interface UploadedSlot {
  fileName: string;
  fileSize: number;
  content: string;
}

const LAYER_META = {
  e04: {
    code: 'E04',
    title: 'Approved Integration Register',
    requiredNote: 'Recommended — supplies approved scopes, owners, IP restrictions & credential status',
    columns:
      'integration, credential_id, system, vendor, scope, owner, ip_restriction, token_lifetime_days, last_used, status',
    accent: 'text-[#5146E5]',
  },
  e18: {
    code: 'E18 / E01',
    title: 'Observed API Activity Log (Required)',
    requiredNote: 'Required — chronological third-party API requests used for baselines & detection',
    columns:
      'ts_utc, request_id, api_key_id, caller_ip, user_agent, endpoint, method, records_returned, status',
    accent: 'text-[#2563EB]',
  },
  e19: {
    code: 'E19',
    title: 'Vendor Record Change Log',
    requiredNote: 'Recommended — links downstream vendor bank/payment changes via request_id',
    columns:
      'ts_utc, change_id, vendor_id, vendor_name, field, old_value, new_value, changed_by, channel, approval_ref, source_ip, request_id',
    accent: 'text-[#0D9488]',
  },
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const UploadAnalysisView: React.FC<UploadAnalysisViewProps> = ({
  state,
  onStateUpdated,
  onNavigate,
  onLoadSynthetic,
  onResetDataset,
}) => {
  const [slots, setSlots] = useState<{
    e04: UploadedSlot | null;
    e18: UploadedSlot | null;
    e19: UploadedSlot | null;
  }>({ e04: null, e18: null, e19: null });

  const [datasetName, setDatasetName] = useState('Competition Evidence Upload');
  const [validations, setValidations] = useState<{
    e04: CsvValidationResult | null;
    e18: CsvValidationResult | null;
    e19: CsvValidationResult | null;
    quality: DatasetQualitySummary | null;
  }>({ e04: null, e18: null, e19: null, quality: null });

  const [draggingLayer, setDraggingLayer] = useState<'e04' | 'e18' | 'e19' | null>(null);
  const [validating, setValidating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmReplaceSynthetic, setConfirmReplaceSynthetic] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [busySecondary, setBusySecondary] = useState(false);

  const fileInputRefs = {
    e04: useRef<HTMLInputElement>(null),
    e18: useRef<HTMLInputElement>(null),
    e19: useRef<HTMLInputElement>(null),
  };

  const runLiveValidation = async (nextSlots: typeof slots) => {
    setValidating(true);
    setErrorMsg(null);
    try {
      const res = await validateCsvPayloads({
        e04Csv: nextSlots.e04?.content,
        e18Csv: nextSlots.e18?.content,
        e19Csv: nextSlots.e19?.content,
      });
      setValidations({
        e04: res.e04,
        e18: res.e18,
        e19: res.e19,
        quality: res.quality,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const handleFileSelected = (layer: 'e04' | 'e18' | 'e19', file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'text/plain') {
      setErrorMsg(`"${file.name}" does not appear to be a CSV file. Please select a .csv file.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const nextSlots = {
        ...slots,
        [layer]: {
          fileName: file.name,
          fileSize: file.size,
          content,
        },
      };
      setSlots(nextSlots);
      setSuccessMsg(null);
      runLiveValidation(nextSlots);
    };
    reader.onerror = () => {
      setErrorMsg(`Failed to read file "${file.name}".`);
    };
    reader.readAsText(file);
  };

  const handleClearSlot = (layer: 'e04' | 'e18' | 'e19') => {
    const nextSlots = { ...slots, [layer]: null };
    setSlots(nextSlots);
    if (fileInputRefs[layer].current) {
      fileInputRefs[layer].current!.value = '';
    }
    runLiveValidation(nextSlots);
  };

  const executeAnalysis = async () => {
    if (!slots.e18) {
      setErrorMsg('Please upload an E18 (or compatible E01) API Activity CSV before running analysis.');
      return;
    }
    setConfirmReplaceSynthetic(false);
    setAnalyzing(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setProgressPct(25);

    try {
      const stepTimer = window.setInterval(() => {
        setProgressPct((p) => (p < 85 ? p + 15 : p));
      }, 150);
      const updated = await analyzeUploadedCsvs({
        e04Csv: slots.e04?.content,
        e18Csv: slots.e18.content,
        e19Csv: slots.e19?.content,
        datasetLabel: datasetName.trim() || 'Uploaded Competition Evidence Dataset',
      });
      window.clearInterval(stepTimer);
      setProgressPct(100);
      onStateUpdated(
        updated,
        `Analysis complete: ${updated.metrics.totalApiEvents} events scored, ${updated.metrics.totalAlerts} alerts raised.`
      );
      setSuccessMsg(
        `Uploaded dataset analyzed successfully (${updated.metrics.totalApiEvents} API events, ${updated.metrics.totalAlerts} alerts, ${updated.metrics.correlatedVendorChanges} correlated vendor changes).`
      );
    } catch (err) {
      setProgressPct(0);
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRunAnalysisClick = () => {
    if (!slots.e18) {
      setErrorMsg('E18 / E01 API Activity CSV is required to run detection.');
      return;
    }
    if (validations.e18 && !validations.e18.valid) {
      setErrorMsg('Resolve E18 schema validation errors before running analysis.');
      return;
    }
    if (state.datasetSource === 'synthetic') {
      setConfirmReplaceSynthetic(true);
      return;
    }
    executeAnalysis();
  };

  const allWarnings = validations.quality?.warnings ?? [];

  return (
    <div className="space-y-6">
      <DatasetProvenanceBar
        source={state.datasetSource}
        label={state.datasetLabel}
        lastAnalyzedAt={state.lastAnalyzedAt}
        onOpenUpload={() => {}}
      />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#5146E5]">
            CSV Ingestion, Schema Validation & Detection Execution
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#172033]">
            Upload & Analysis Center
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            Upload E04, E18/E01, and E19 CSV files to run the live 12-signal detection engine and Isolation Forest. Synthetic demo evidence is never mixed with uploaded files.
          </p>
        </div>

        {/* Download sample templates */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#64748B]">Sample CSVs:</span>
          {(['e04', 'e18', 'e19'] as const).map((layer) => (
            <a
              key={layer}
              href={`/api/samples/${layer}`}
              download={`api_sentinel_synthetic_${layer}.csv`}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#172033] hover:border-[#5146E5] hover:text-[#5146E5] transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {layer.toUpperCase()}
            </a>
          ))}
        </div>
      </div>

      {/* Dataset Label Input */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1">
          <label htmlFor="dataset-label" className="block text-xs font-bold text-[#172033]">
            Uploaded Dataset Name
          </label>
          <input
            id="dataset-label"
            type="text"
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            placeholder="e.g., Competition Case #04 Evidence Bundle"
            className="mt-1 w-full max-w-md rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 text-sm text-[#172033] focus:border-[#5146E5] focus:bg-white focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busySecondary}
            onClick={async () => {
              setBusySecondary(true);
              try {
                await onLoadSynthetic();
              } finally {
                setBusySecondary(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#172033] hover:bg-slate-50 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#5146E5]" />
            Load Synthetic Demo
          </button>
          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Analysis
          </button>
        </div>
      </div>

      {/* 3 Drag-and-Drop CSV Upload Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(['e04', 'e18', 'e19'] as const).map((layer) => {
          const meta = LAYER_META[layer];
          const slot = slots[layer];
          const val = validations[layer];
          const isDragging = draggingLayer === layer;

          return (
            <div
              key={layer}
              onDragOver={(e) => {
                e.preventDefault();
                setDraggingLayer(layer);
              }}
              onDragLeave={() => setDraggingLayer(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDraggingLayer(null);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelected(layer, file);
              }}
              className={`rounded-2xl border bg-white p-5 flex flex-col justify-between transition-all ${
                isDragging
                  ? 'border-[#5146E5] bg-[#5146E5]/[0.04] ring-2 ring-[#5146E5]/20'
                  : 'border-slate-200/90'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-xs font-extrabold ${meta.accent}`}>
                    {meta.code}
                  </span>
                  {val && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        val.valid ? 'text-[#16A34A]' : 'text-[#DC2626]'
                      }`}
                    >
                      {val.valid ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      )}
                      {val.valid ? `${val.rowCount} valid rows` : 'Schema issue'}
                    </span>
                  )}
                </div>
                <h2 className="mt-1 text-base font-bold text-[#172033]">{meta.title}</h2>
                <p className="mt-1 text-xs text-[#64748B]">{meta.requiredNote}</p>

                <input
                  ref={fileInputRefs[layer]}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(layer, file);
                  }}
                />

                {!slot ? (
                  <button
                    type="button"
                    onClick={() => fileInputRefs[layer].current?.click()}
                    className="mt-4 flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-[#F8FAFC] px-4 py-7 text-center hover:border-[#5146E5] hover:bg-[#5146E5]/[0.03] transition-colors cursor-pointer"
                  >
                    <Upload className="h-6 w-6 text-[#5146E5]" />
                    <p className="mt-2 text-xs font-bold text-[#172033]">
                      Drop {meta.code} CSV here or browse
                    </p>
                    <p className="mt-1 text-[11px] text-[#64748B]">RFC-4180 UTF-8 CSV supported</p>
                  </button>
                ) : (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <FileSpreadsheet className="h-4 w-4 text-[#5146E5] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#172033] truncate">
                            {slot.fileName}
                          </p>
                          <p className="font-mono text-[11px] text-[#64748B]">
                            {formatBytes(slot.fileSize)}
                            {val ? ` · ${val.rowCount} rows` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClearSlot(layer)}
                        className="rounded p-1 text-[#64748B] hover:text-[#DC2626] cursor-pointer"
                        aria-label={`Remove ${meta.code} file`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {val && val.missingColumns.length > 0 && (
                      <p className="text-[11px] font-semibold text-[#EA580C]">
                        Missing columns: {val.missingColumns.join(', ')}
                      </p>
                    )}
                    {val && val.extraColumns.length > 0 && (
                      <p className="text-[11px] text-[#475569]">
                        Extra columns preserved: {val.extraColumns.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-[10.5px] font-semibold text-[#64748B]">Expected Columns</p>
                <p className="mt-0.5 font-mono text-[10.5px] text-[#475569] leading-relaxed">
                  {meta.columns}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Validation & Data Quality Summary + Preview */}
      {(validations.e04 || validations.e18 || validations.e19) && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#172033]">
                Schema Validation & Data Quality Summary
              </h2>
              <p className="text-xs text-[#64748B]">
                {validating
                  ? 'Validating uploaded CSV structure...'
                  : 'Verified headers, deduplicated rows, and preserved extra columns without silent loss.'}
              </p>
            </div>
            {validations.quality && (
              <div className="font-mono text-xs text-[#172033] tabular-nums">
                E04: <strong>{validations.quality.e04Count}</strong> · E18:{' '}
                <strong>{validations.quality.e18Count}</strong> · E19:{' '}
                <strong>{validations.quality.e19Count}</strong>
              </div>
            )}
          </div>

          {allWarnings.length > 0 && (
            <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-3.5 space-y-1 text-xs text-[#9A3412]">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-[#EA580C]" />
                Validation Warnings ({allWarnings.length})
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                {allWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* CSV Preview Snippets */}
          <div className="space-y-4">
            {(['e04', 'e18', 'e19'] as const).map((layer) => {
              const v = validations[layer];
              if (!v || v.preview.length === 0) return null;
              const keys = Object.keys(v.preview[0]);
              return (
                <div key={layer} className="space-y-1.5">
                  <p className="text-xs font-bold text-[#172033]">
                    {layer.toUpperCase()} Preview (first {v.preview.length} rows)
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left border-collapse text-[11px] font-mono">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b border-slate-200 text-[#64748B]">
                          {keys.map((k) => (
                            <th key={k} className="py-2 px-3 font-semibold whitespace-nowrap">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {v.preview.map((row, idx) => (
                          <tr key={idx}>
                            {keys.map((k) => (
                              <td key={k} className="py-1.5 px-3 text-[#172033] whitespace-nowrap max-w-[220px] truncate">
                                {String(row[k] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Analysis Action Bar & Progress */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4">
        {errorMsg && (
          <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3.5 text-xs font-semibold text-[#B91C1C] flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-3.5 text-xs font-semibold text-[#15803D] flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {successMsg}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('overview')}
              className="rounded-lg bg-[#16A34A] px-3 py-1 text-white font-semibold hover:bg-[#15803D] cursor-pointer"
            >
              View Updated Dashboard
            </button>
          </div>
        )}

        {analyzing && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[#5146E5]">
              <span>Running 12-Signal Rules & Unsupervised Isolation Forest...</span>
              <span className="font-mono tabular-nums">{progressPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#5146E5] to-[#2563EB] transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#64748B]">
            Uploads invoke the live backend detection engine and refresh every dashboard metric, chart, alert, and correlation graph.
          </div>
          <button
            type="button"
            disabled={analyzing || !slots.e18}
            onClick={handleRunAnalysisClick}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#5146E5] to-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-45 whitespace-nowrap cursor-pointer"
          >
            <Play className="h-4 w-4 fill-current" />
            {analyzing ? 'Analyzing Evidence...' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Confirmation Modal: Replacing Synthetic Demo Data */}
      {confirmReplaceSynthetic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <FileUp className="h-5 w-5 text-[#5146E5] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-[#172033]">
                  Replace Synthetic Demo Data with Uploaded Evidence?
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">
                  To maintain forensic isolation, synthetic demonstration records and demo notes will be cleanly replaced by your uploaded CSV files (never blended). You can still launch the isolated Live Demo Theater anytime.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmReplaceSynthetic(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-[#475569] hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeAnalysis}
                className="rounded-lg bg-[#5146E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer"
              >
                Confirm & Run Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Reset Analysis */}
      {confirmResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-[#DC2626] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-[#172033]">
                  Reset Active Analysis Workspace?
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">
                  This clears all currently loaded E04, E18, and E19 records, alerts, and investigation notes from local storage, returning the workspace to an unanalyzed empty state.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-[#475569] hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmResetOpen(false);
                  setSlots({ e04: null, e18: null, e19: null });
                  setValidations({ e04: null, e18: null, e19: null, quality: null });
                  await onResetDataset();
                }}
                className="rounded-lg bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C] cursor-pointer"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
