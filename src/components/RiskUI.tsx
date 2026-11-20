import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileUp,
  Info,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { DatasetSource, SeverityLevel, TriageStatus } from '../types/sentinel';

export const SEVERITY_STYLES: Record<
  SeverityLevel,
  {
    text: string;
    bg: string;
    border: string;
    bar: string;
    hex: string;
    label: string;
  }
> = {
  CRITICAL: {
    text: 'text-[#B91C1C]',
    bg: 'bg-[#FEF2F2]',
    border: 'border-[#FECACA]',
    bar: 'bg-[#DC2626]',
    hex: '#DC2626',
    label: 'Critical',
  },
  HIGH: {
    text: 'text-[#C2410C]',
    bg: 'bg-[#FFF7ED]',
    border: 'border-[#FED7AA]',
    bar: 'bg-[#EA580C]',
    hex: '#EA580C',
    label: 'High',
  },
  MEDIUM: {
    text: 'text-[#7E22CE]',
    bg: 'bg-[#FAF5FF]',
    border: 'border-[#E9D5FF]',
    bar: 'bg-[#9333EA]',
    hex: '#9333EA',
    label: 'Medium',
  },
  LOW: {
    text: 'text-[#15803D]',
    bg: 'bg-[#F0FDF4]',
    border: 'border-[#BBF7D0]',
    bar: 'bg-[#16A34A]',
    hex: '#16A34A',
    label: 'Low',
  },
};

export const SeverityTag: React.FC<{
  severity: SeverityLevel;
  size?: 'sm' | 'md';
}> = ({ severity, size = 'sm' }) => {
  const s = SEVERITY_STYLES[severity];
  const Icon =
    severity === 'CRITICAL'
      ? AlertOctagon
      : severity === 'HIGH'
        ? ShieldAlert
        : severity === 'MEDIUM'
          ? AlertTriangle
          : CheckCircle2;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-semibold whitespace-nowrap shrink-0 ${s.bg} ${s.border} ${s.text} ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
      <span>{s.label}</span>
    </span>
  );
};

export const RiskScoreMeter: React.FC<{
  score: number;
  severity: SeverityLevel;
  compact?: boolean;
}> = ({ score, severity, compact = false }) => {
  const s = SEVERITY_STYLES[severity];
  return (
    <div className={`flex items-center gap-2.5 ${compact ? 'min-w-[84px]' : 'min-w-[116px]'}`}>
      <span
        className={`font-mono tabular-nums font-bold ${
          compact ? 'text-xs w-7 text-right' : 'text-sm w-8 text-right'
        } ${s.text}`}
      >
        {score}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ${s.bar}`}
          style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
};

export const TriageStatusText: React.FC<{ status: TriageStatus }> = ({ status }) => {
  const map: Record<TriageStatus, { label: string; color: string }> = {
    open: { label: 'Open', color: 'text-[#DC2626]' },
    in_review: { label: 'In Review', color: 'text-[#2563EB]' },
    reviewed: { label: 'Reviewed', color: 'text-[#16A34A]' },
    escalated: { label: 'Escalated', color: 'text-[#9333EA]' },
  };
  const cfg = map[status];
  return (
    <span className={`text-xs font-semibold whitespace-nowrap ${cfg.color}`}>
      {cfg.label}
    </span>
  );
};

export function formatUtcTimestamp(ts: string | null | undefined): string {
  if (!ts) return '—';
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return ts;
  return new Date(ms).toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC');
}

export const DatasetProvenanceBar: React.FC<{
  source: DatasetSource;
  label: string;
  lastAnalyzedAt: string | null;
  onOpenUpload: () => void;
}> = ({ source, label, lastAnalyzedAt, onOpenUpload }) => {
  const isSynthetic = source === 'synthetic';
  const isEmpty = source === 'empty';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-[#64748B]">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 font-semibold ${
            isSynthetic
              ? 'text-[#5146E5]'
              : isEmpty
                ? 'text-[#EA580C]'
                : 'text-[#0D9488]'
          }`}
        >
          <Database className="h-3.5 w-3.5 shrink-0" />
          {isSynthetic
            ? 'Synthetic Demonstration Data'
            : isEmpty
              ? 'Empty Workspace (Unanalyzed)'
              : 'Uploaded Competition Evidence'}
        </span>
        <span aria-hidden="true">·</span>
        <span className="text-[#172033] font-medium">{label}</span>
        {lastAnalyzedAt && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-[11px]">
              Analyzed {formatUtcTimestamp(lastAnalyzedAt)}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        {isSynthetic && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#64748B]">
            <Info className="h-3.5 w-3.5 text-[#5146E5]" />
            Isolated from competition CSV uploads
          </span>
        )}
        <button
          type="button"
          onClick={onOpenUpload}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-[#F8FAFC] px-2.5 py-1 text-xs font-semibold text-[#172033] hover:border-[#5146E5]/40 hover:text-[#5146E5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <FileUp className="h-3.5 w-3.5" />
          Upload Evidence CSVs
        </button>
      </div>
    </div>
  );
};

export const EmptyWorkspaceNotice: React.FC<{
  title?: string;
  description?: string;
  onUploadClick: () => void;
  onLoadSynthetic: () => void;
  loading?: boolean;
}> = ({
  title = 'No evidence dataset loaded',
  description = 'Upload your E04 approved integration register, E18/E01 API activity logs, and E19 vendor record changes to run the 12-signal detection engine, or load the labeled synthetic demonstration dataset.',
  onUploadClick,
  onLoadSynthetic,
  loading = false,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#5146E5]/10 text-[#5146E5]">
        <Database className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-[#172033]">{title}</h3>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#64748B]">{description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onUploadClick}
          className="inline-flex items-center gap-2 rounded-lg bg-[#5146E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4338CA] transition-colors whitespace-nowrap cursor-pointer"
        >
          <FileUp className="h-4 w-4" />
          Open CSV Upload Center
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onLoadSynthetic}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#172033] hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="h-4 w-4 text-[#5146E5]" />
          {loading ? 'Loading Synthetic Data...' : 'Load Synthetic Demo Data'}
        </button>
      </div>
    </div>
  );
};
