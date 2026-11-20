import Papa from 'papaparse';
import type {
  CsvValidationResult,
  DatasetQualitySummary,
  E04Record,
  E18Record,
  E19Record,
} from '../src/types/sentinel.ts';

export const EXPECTED_E04_COLUMNS = [
  'integration',
  'credential_id',
  'system',
  'vendor',
  'scope',
  'owner',
  'ip_restriction',
  'token_lifetime_days',
  'last_used',
  'status',
] as const;

export const EXPECTED_E18_COLUMNS = [
  'ts_utc',
  'request_id',
  'api_key_id',
  'caller_ip',
  'user_agent',
  'endpoint',
  'method',
  'records_returned',
  'status',
] as const;

export const EXPECTED_E19_COLUMNS = [
  'ts_utc',
  'change_id',
  'vendor_id',
  'vendor_name',
  'field',
  'old_value',
  'new_value',
  'changed_by',
  'channel',
  'approval_ref',
  'source_ip',
  'request_id',
] as const;

export function normalizeUtcTimestamp(raw: string | undefined | null): {
  iso: string;
  valid: boolean;
} {
  const cleaned = String(raw ?? '').trim();
  if (!cleaned) {
    return { iso: '', valid: false };
  }
  // Support common SQL / ISO variants such as "2026-11-18 02:14:22" by treating bare timestamps as UTC
  const candidate =
    cleaned.includes('T') || cleaned.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(cleaned)
      ? cleaned
      : `${cleaned.replace(' ', 'T')}Z`;
  const ms = Date.parse(candidate);
  if (Number.isNaN(ms)) {
    return { iso: cleaned, valid: false };
  }
  return { iso: new Date(ms).toISOString(), valid: true };
}

function normalizeHeaderName(header: string): string {
  return header.replace(/^\uFEFF/, '').trim().toLowerCase();
}

function parseRawCsv(csvText: string): {
  headers: string[];
  rows: Record<string, string>[];
  parseErrors: string[];
} {
  const trimmed = csvText.trim();
  if (!trimmed) {
    return { headers: [], rows: [], parseErrors: ['CSV file is empty.'] };
  }

  const parsed = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => normalizeHeaderName(h),
  });

  const parseErrors = parsed.errors
    .slice(0, 5)
    .map((e) => `Row ${e.row ?? '?'}: ${e.message}`);

  const headers = (parsed.meta.fields ?? []).map((h) => normalizeHeaderName(h));
  const rows = parsed.data.filter((row) =>
    Object.values(row).some((val) => String(val ?? '').trim() !== '')
  );

  return { headers, rows, parseErrors };
}

export function validateAndParseE04(csvText: string): {
  validation: CsvValidationResult;
  records: E04Record[];
} {
  const { headers, rows, parseErrors } = parseRawCsv(csvText);
  const expectedSet = new Set<string>(EXPECTED_E04_COLUMNS);
  const missingColumns = EXPECTED_E04_COLUMNS.filter((c) => !headers.includes(c));
  const extraColumns = headers.filter((h) => h && !expectedSet.has(h));
  const warnings = [...parseErrors];

  if (missingColumns.length > 0) {
    warnings.push(`E04 missing expected columns: ${missingColumns.join(', ')}`);
  }
  if (extraColumns.length > 0) {
    warnings.push(
      `E04 contains additional non-standard columns (preserved on records): ${extraColumns.join(', ')}`
    );
  }

  const seenIds = new Set<string>();
  let duplicateCount = 0;
  const records: E04Record[] = [];

  for (const row of rows) {
    const credential_id = String(row.credential_id ?? '').trim();
    if (!credential_id) {
      warnings.push('Skipped an E04 row with an empty credential_id.');
      continue;
    }
    if (seenIds.has(credential_id)) {
      duplicateCount++;
      continue;
    }
    seenIds.add(credential_id);

    const extra: Record<string, string> = {};
    for (const col of extraColumns) {
      if (row[col] !== undefined) extra[col] = String(row[col]);
    }

    const parsedLifetime = Number.parseInt(String(row.token_lifetime_days ?? '0'), 10);
    const tsNorm = normalizeUtcTimestamp(row.last_used);

    records.push({
      integration: String(row.integration ?? 'Unnamed Integration').trim(),
      credential_id,
      system: String(row.system ?? 'Unknown').trim(),
      vendor: String(row.vendor ?? 'Unknown').trim(),
      scope: String(row.scope ?? '').trim(),
      owner: String(row.owner ?? 'Unassigned').trim(),
      ip_restriction: String(row.ip_restriction ?? '').trim(),
      token_lifetime_days: Number.isNaN(parsedLifetime) ? 0 : parsedLifetime,
      last_used: tsNorm.valid ? tsNorm.iso : String(row.last_used ?? '').trim(),
      status: String(row.status ?? 'unknown').trim().toLowerCase(),
      ...(Object.keys(extra).length > 0 ? { extra } : {}),
    });
  }

  if (duplicateCount > 0) {
    warnings.push(`Deduplicated ${duplicateCount} duplicate E04 credential_id row(s).`);
  }

  const criticalMissing = ['credential_id', 'integration', 'scope', 'status'].filter(
    (c) => !headers.includes(c)
  );

  return {
    records,
    validation: {
      valid: criticalMissing.length === 0 && records.length > 0,
      layer: 'e04',
      rowCount: records.length,
      duplicateCount,
      headers,
      missingColumns,
      extraColumns,
      warnings,
      preview: records.slice(0, 5).map((r) => ({
        integration: r.integration,
        credential_id: r.credential_id,
        vendor: r.vendor,
        scope: r.scope,
        ip_restriction: r.ip_restriction,
        status: r.status,
      })),
    },
  };
}

export function validateAndParseE18(csvText: string): {
  validation: CsvValidationResult;
  records: E18Record[];
} {
  const { headers, rows, parseErrors } = parseRawCsv(csvText);
  const expectedSet = new Set<string>(EXPECTED_E18_COLUMNS);
  const missingColumns = EXPECTED_E18_COLUMNS.filter((c) => !headers.includes(c));
  const extraColumns = headers.filter((h) => h && !expectedSet.has(h));
  const warnings = [...parseErrors];

  if (missingColumns.length > 0) {
    warnings.push(`E18/E01 missing expected columns: ${missingColumns.join(', ')}`);
  }
  if (extraColumns.length > 0) {
    warnings.push(
      `E18/E01 contains additional non-standard columns (preserved on records): ${extraColumns.join(', ')}`
    );
  }

  const seenReqIds = new Set<string>();
  let duplicateCount = 0;
  let invalidTsCount = 0;
  const records: E18Record[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const request_id = String(row.request_id ?? '').trim();
    if (!request_id) {
      warnings.push(`Skipped E18 row ${i + 2} with missing request_id.`);
      continue;
    }
    if (seenReqIds.has(request_id)) {
      duplicateCount++;
      continue;
    }
    seenReqIds.add(request_id);

    const tsNorm = normalizeUtcTimestamp(row.ts_utc);
    if (!tsNorm.valid) {
      invalidTsCount++;
    }

    const extra: Record<string, string> = {};
    for (const col of extraColumns) {
      if (row[col] !== undefined) extra[col] = String(row[col]);
    }

    const recCount = Number.parseInt(String(row.records_returned ?? '0'), 10);
    const statusCode = Number.parseInt(String(row.status ?? '200'), 10);

    records.push({
      ts_utc: tsNorm.valid ? tsNorm.iso : String(row.ts_utc ?? '').trim(),
      request_id,
      api_key_id: String(row.api_key_id ?? '').trim(),
      caller_ip: String(row.caller_ip ?? '').trim(),
      user_agent: String(row.user_agent ?? '').trim(),
      endpoint: String(row.endpoint ?? '').trim(),
      method: String(row.method ?? 'GET').trim().toUpperCase(),
      records_returned: Number.isNaN(recCount) ? 0 : Math.max(0, recCount),
      status: Number.isNaN(statusCode) ? 0 : statusCode,
      ...(Object.keys(extra).length > 0 ? { extra } : {}),
    });
  }

  if (duplicateCount > 0) {
    warnings.push(`Deduplicated ${duplicateCount} duplicate E18 request_id row(s).`);
  }
  if (invalidTsCount > 0) {
    warnings.push(`${invalidTsCount} E18 row(s) had unparseable ts_utc timestamps.`);
  }

  const criticalMissing = ['ts_utc', 'request_id', 'api_key_id', 'endpoint'].filter(
    (c) => !headers.includes(c)
  );

  return {
    records,
    validation: {
      valid: criticalMissing.length === 0 && records.length > 0,
      layer: 'e18',
      rowCount: records.length,
      duplicateCount,
      headers,
      missingColumns,
      extraColumns,
      warnings,
      preview: records.slice(0, 5).map((r) => ({
        ts_utc: r.ts_utc,
        request_id: r.request_id,
        api_key_id: r.api_key_id,
        caller_ip: r.caller_ip,
        method: r.method,
        endpoint: r.endpoint,
        records_returned: r.records_returned,
      })),
    },
  };
}

export function validateAndParseE19(csvText: string): {
  validation: CsvValidationResult;
  records: E19Record[];
} {
  const { headers, rows, parseErrors } = parseRawCsv(csvText);
  const expectedSet = new Set<string>(EXPECTED_E19_COLUMNS);
  const missingColumns = EXPECTED_E19_COLUMNS.filter((c) => !headers.includes(c));
  const extraColumns = headers.filter((h) => h && !expectedSet.has(h));
  const warnings = [...parseErrors];

  if (missingColumns.length > 0) {
    warnings.push(`E19 missing expected columns: ${missingColumns.join(', ')}`);
  }
  if (extraColumns.length > 0) {
    warnings.push(
      `E19 contains additional non-standard columns (preserved on records): ${extraColumns.join(', ')}`
    );
  }

  const seenChangeIds = new Set<string>();
  let duplicateCount = 0;
  let invalidTsCount = 0;
  const records: E19Record[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const change_id = String(row.change_id ?? '').trim() || `E19-ROW-${i + 1}`;
    if (seenChangeIds.has(change_id)) {
      duplicateCount++;
      continue;
    }
    seenChangeIds.add(change_id);

    const tsNorm = normalizeUtcTimestamp(row.ts_utc);
    if (!tsNorm.valid) {
      invalidTsCount++;
    }

    const extra: Record<string, string> = {};
    for (const col of extraColumns) {
      if (row[col] !== undefined) extra[col] = String(row[col]);
    }

    records.push({
      ts_utc: tsNorm.valid ? tsNorm.iso : String(row.ts_utc ?? '').trim(),
      change_id,
      vendor_id: String(row.vendor_id ?? '').trim(),
      vendor_name: String(row.vendor_name ?? '').trim(),
      field: String(row.field ?? '').trim(),
      old_value: String(row.old_value ?? '').trim(),
      new_value: String(row.new_value ?? '').trim(),
      changed_by: String(row.changed_by ?? '').trim(),
      channel: String(row.channel ?? '').trim(),
      approval_ref: String(row.approval_ref ?? '').trim(),
      source_ip: String(row.source_ip ?? '').trim(),
      request_id: String(row.request_id ?? '').trim(),
      ...(Object.keys(extra).length > 0 ? { extra } : {}),
    });
  }

  if (duplicateCount > 0) {
    warnings.push(`Deduplicated ${duplicateCount} duplicate E19 change_id row(s).`);
  }
  if (invalidTsCount > 0) {
    warnings.push(`${invalidTsCount} E19 row(s) had unparseable ts_utc timestamps.`);
  }

  const criticalMissing = ['change_id', 'vendor_name', 'field'].filter(
    (c) => !headers.includes(c)
  );

  return {
    records,
    validation: {
      valid: criticalMissing.length === 0,
      layer: 'e19',
      rowCount: records.length,
      duplicateCount,
      headers,
      missingColumns,
      extraColumns,
      warnings,
      preview: records.slice(0, 5).map((r) => ({
        change_id: r.change_id,
        vendor_name: r.vendor_name,
        field: r.field,
        approval_ref: r.approval_ref || '(missing)',
        request_id: r.request_id || '(unlinked)',
      })),
    },
  };
}

export function buildQualitySummary(
  e04Res: { validation: CsvValidationResult; records: E04Record[] } | null,
  e18Res: { validation: CsvValidationResult; records: E18Record[] } | null,
  e19Res: { validation: CsvValidationResult; records: E19Record[] } | null
): DatasetQualitySummary {
  return {
    e04Count: e04Res?.records.length ?? 0,
    e18Count: e18Res?.records.length ?? 0,
    e19Count: e19Res?.records.length ?? 0,
    duplicatesRemoved: {
      e04: e04Res?.validation.duplicateCount ?? 0,
      e18: e18Res?.validation.duplicateCount ?? 0,
      e19: e19Res?.validation.duplicateCount ?? 0,
    },
    warnings: [
      ...(e04Res?.validation.warnings ?? []),
      ...(e18Res?.validation.warnings ?? []),
      ...(e19Res?.validation.warnings ?? []),
    ],
    missingColumns: {
      e04: e04Res?.validation.missingColumns ?? [],
      e18: e18Res?.validation.missingColumns ?? [],
      e19: e19Res?.validation.missingColumns ?? [],
    },
    extraColumns: {
      e04: e04Res?.validation.extraColumns ?? [],
      e18: e18Res?.validation.extraColumns ?? [],
      e19: e19Res?.validation.extraColumns ?? [],
    },
  };
}
