import {
  SIGNAL_WEIGHT_CATALOG,
  type AnalyzedEvent,
  type BaselineContext,
  type DashboardMetrics,
  type E04Record,
  type E18Record,
  type E19Record,
  type EngineConfig,
  type IntegrationRiskRollup,
  type InvestigationConclusion,
  type InvestigationNote,
  type SeverityLevel,
  type SignalCode,
  type SignalFrequencyItem,
  type SignalHit,
  type StructuredRiskExplanation,
  type TimelineBucket,
  type TriageStatus,
} from '../src/types/sentinel.ts';
import { runIsolationForest } from './isolationForest.ts';

const SENSITIVE_FIELD_PATTERNS = [
  /bank/i,
  /iban/i,
  /routing/i,
  /swift/i,
  /bic/i,
  /payout/i,
  /payment/i,
  /account/i,
  /beneficiary/i,
  /wire/i,
  /ach/i,
  /settlement/i,
  /sort_code/i,
];

const ACTIVE_CREDENTIAL_STATUSES = new Set(['active', 'approved', 'enabled', 'valid']);

export function classifySeverity(score: number): SeverityLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

export function isSensitiveVendorField(fieldName: string): boolean {
  const cleaned = (fieldName ?? '').trim();
  if (!cleaned) return false;
  return SENSITIVE_FIELD_PATTERNS.some((rx) => rx.test(cleaned));
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    num = (num << 8) | octet;
  }
  return num >>> 0;
}

export function ipMatchesRestriction(callerIp: string, restriction: string): boolean {
  const cleanedRestriction = (restriction ?? '').trim();
  if (
    !cleanedRestriction ||
    cleanedRestriction === '*' ||
    cleanedRestriction.toLowerCase() === 'any' ||
    cleanedRestriction.toLowerCase() === 'none'
  ) {
    return true;
  }

  const callerInt = ipv4ToInt(callerIp);
  const rules = cleanedRestriction
    .split(/[;,]/)
    .map((r) => r.trim())
    .filter(Boolean);

  for (const rule of rules) {
    if (rule === callerIp.trim()) return true;
    if (rule.includes('/') && callerInt !== null) {
      const [baseIp, prefixStr] = rule.split('/');
      const baseInt = ipv4ToInt(baseIp);
      const prefix = Number(prefixStr);
      if (baseInt !== null && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32) {
        const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
        if ((callerInt & mask) === (baseInt & mask)) {
          return true;
        }
      }
    }
  }
  return false;
}

interface ParsedScopeRule {
  method: string | null;
  pathPattern: string;
}

export function parseScopeRules(scopeText: string): ParsedScopeRule[] {
  return (scopeText ?? '')
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(/\s+/);
      if (parts.length >= 2 && /^[A-Z]+$/i.test(parts[0])) {
        return {
          method: parts[0].toUpperCase(),
          pathPattern: parts.slice(1).join(' ').replace(/\/+$/, '') || '/',
        };
      }
      return {
        method: null,
        pathPattern: entry.replace(/\/+$/, '') || '/',
      };
    });
}

function pathMatchesPattern(endpoint: string, pattern: string): boolean {
  const normEp = endpoint.split('?')[0].replace(/\/+$/, '') || '/';
  const normPat = pattern.split('?')[0].replace(/\/+$/, '') || '/';
  if (normPat === '*' || normPat === '/*') return true;
  if (normPat.endsWith('/*')) {
    const prefix = normPat.slice(0, -2);
    return normEp === prefix || normEp.startsWith(`${prefix}/`);
  }
  return normEp.toLowerCase() === normPat.toLowerCase();
}

export function isRequestWithinScope(
  method: string,
  endpoint: string,
  scopeText: string
): boolean {
  const rules = parseScopeRules(scopeText);
  if (rules.length === 0) return false;
  const upperMethod = (method ?? '').trim().toUpperCase();

  for (const rule of rules) {
    if (pathMatchesPattern(endpoint, rule.pathPattern)) {
      if (!rule.method || rule.method === '*' || rule.method === upperMethod) {
        return true;
      }
    }
  }
  return false;
}

function getUtcHour(tsUtc: string): number {
  const ms = Date.parse(tsUtc);
  if (Number.isNaN(ms)) return 0;
  return new Date(ms).getUTCHours();
}

function computePercentile(sortedNums: number[], p: number): number {
  if (sortedNums.length === 0) return 0;
  const idx = Math.min(
    sortedNums.length - 1,
    Math.max(0, Math.floor((sortedNums.length - 1) * p))
  );
  return sortedNums[idx];
}

export interface PersistedAnnotation {
  triageStatus: TriageStatus;
  notes: InvestigationNote[];
  conclusion: InvestigationConclusion | null;
}

export interface DetectionOutput {
  events: AnalyzedEvent[];
  alerts: AnalyzedEvent[];
  metrics: DashboardMetrics;
  timeline: TimelineBucket[];
  integrationRollups: IntegrationRiskRollup[];
  signalFrequencies: SignalFrequencyItem[];
}

export function runDetectionEngine(
  e04Records: E04Record[],
  e18Records: E18Record[],
  e19Records: E19Record[],
  config: EngineConfig,
  annotations: Record<string, PersistedAnnotation> = {}
): DetectionOutput {
  // Index E04 by credential_id
  const e04Map = new Map<string, E04Record>();
  for (const rec of e04Records) {
    e04Map.set(rec.credential_id.trim(), rec);
  }

  // Index E19 strictly by matching non-empty request_id (NEVER fabricate links!)
  const e19ByRequest = new Map<string, E19Record[]>();
  for (const chg of e19Records) {
    const reqId = (chg.request_id ?? '').trim();
    if (!reqId) continue;
    const list = e19ByRequest.get(reqId) ?? [];
    list.push(chg);
    e19ByRequest.set(reqId, list);
  }

  // Sort E18 chronologically
  const sortedE18 = [...e18Records].sort((a, b) => {
    const ta = Date.parse(a.ts_utc) || 0;
    const tb = Date.parse(b.ts_utc) || 0;
    return ta - tb;
  });

  // Group events chronologically per api_key_id to build per-credential historical baselines
  const eventsByKey = new Map<string, E18Record[]>();
  for (const ev of sortedE18) {
    const list = eventsByKey.get(ev.api_key_id) ?? [];
    list.push(ev);
    eventsByKey.set(ev.api_key_id, list);
  }

  const baselineByKey = new Map<string, BaselineContext>();
  const baselineRequestIds = new Set<string>();

  for (const [key, keyEvents] of eventsByKey.entries()) {
    const n = keyEvents.length;
    const splitCount =
      n >= 3
        ? Math.max(2, Math.min(n - 1, Math.floor(n * config.baselineFraction)))
        : 0;
    const baselineSlice = keyEvents.slice(0, splitCount);
    for (const b of baselineSlice) {
      baselineRequestIds.add(b.request_id);
    }

    const knownIps = Array.from(new Set(baselineSlice.map((e) => e.caller_ip)));
    const knownEndpoints = Array.from(new Set(baselineSlice.map((e) => e.endpoint)));
    const knownMethods = Array.from(new Set(baselineSlice.map((e) => e.method.toUpperCase())));
    const knownHours = Array.from(new Set(baselineSlice.map((e) => getUtcHour(e.ts_utc)))).sort(
      (a, b) => a - b
    );
    const recVals = baselineSlice.map((e) => e.records_returned).sort((a, b) => a - b);
    const avgRecords =
      recVals.length > 0 ? recVals.reduce((s, v) => s + v, 0) / recVals.length : 0;
    const variance =
      recVals.length > 1
        ? recVals.reduce((s, v) => s + Math.pow(v - avgRecords, 2), 0) / recVals.length
        : 0;

    baselineByKey.set(key, {
      totalBaselineRequests: baselineSlice.length,
      knownIps,
      knownEndpoints,
      knownMethods,
      knownHours,
      avgRecords: Number(avgRecords.toFixed(1)),
      maxRecords: recVals.length > 0 ? recVals[recVals.length - 1] : 0,
      p95Records: computePercentile(recVals, 0.95),
      stdRecords: Number(Math.sqrt(variance).toFixed(2)),
    });
  }

  // Compute frequency statistics across all E18 records for unsupervised Isolation Forest feature vector
  const ipCounts = new Map<string, number>();
  const endpointCounts = new Map<string, number>();
  const methodCounts = new Map<string, number>();
  const uaCounts = new Map<string, number>();
  const totalCount = Math.max(1, sortedE18.length);

  for (const ev of sortedE18) {
    ipCounts.set(ev.caller_ip, (ipCounts.get(ev.caller_ip) ?? 0) + 1);
    endpointCounts.set(ev.endpoint, (endpointCounts.get(ev.endpoint) ?? 0) + 1);
    methodCounts.set(ev.method, (methodCounts.get(ev.method) ?? 0) + 1);
    uaCounts.set(ev.user_agent, (uaCounts.get(ev.user_agent) ?? 0) + 1);
  }

  const methodNumeric: Record<string, number> = {
    GET: 0,
    HEAD: 0.1,
    POST: 0.4,
    PATCH: 0.7,
    PUT: 0.85,
    DELETE: 1.0,
  };

  const featureMatrix = sortedE18.map((ev) => {
    const hour = getUtcHour(ev.ts_utc);
    // Encode cyclic hour distance from business midday (12 UTC)
    const hourDist = Math.abs(hour - 12) / 12;
    const logRecords = Math.log1p(Math.max(0, ev.records_returned));
    const ipRarity = 1 - (ipCounts.get(ev.caller_ip) ?? 1) / totalCount;
    const epRarity = 1 - (endpointCounts.get(ev.endpoint) ?? 1) / totalCount;
    const uaRarity = 1 - (uaCounts.get(ev.user_agent) ?? 1) / totalCount;
    const methodRisk = methodNumeric[ev.method.toUpperCase()] ?? 0.6;
    const statusErr = ev.status >= 400 ? 1 : 0;
    return [hourDist, logRecords, ipRarity, epRarity, uaRarity, methodRisk, statusErr];
  });

  const isoResult = runIsolationForest(featureMatrix, {
    numTrees: config.isolationForestTrees,
    contamination: config.isolationForestContamination,
    seed: 42071,
  });

  // Evaluate all 12 detection rules per E18 event
  const analyzedEvents: AnalyzedEvent[] = sortedE18.map((ev, index) => {
    const e04 = e04Map.get(ev.api_key_id.trim()) ?? null;
    const linkedE19 = e19ByRequest.get(ev.request_id.trim()) ?? [];
    const baseline = baselineByKey.get(ev.api_key_id) ?? {
      totalBaselineRequests: 0,
      knownIps: [],
      knownEndpoints: [],
      knownMethods: [],
      knownHours: [],
      avgRecords: 0,
      maxRecords: 0,
      p95Records: 0,
      stdRecords: 0,
    };
    const isBaselineWindow = baselineRequestIds.has(ev.request_id);
    const hasBaseline = baseline.totalBaselineRequests >= 2 && !isBaselineWindow;

    const signals: SignalHit[] = [];
    const driftSummary = {
      unregistered: false,
      statusViolation: false,
      scopeViolation: false,
      ipViolation: false,
      newBaselineIp: false,
      newBaselineEndpoint: false,
      newBaselineMethod: false,
      newBaselineHour: false,
      volumeSpike: false,
      sensitiveChange: false,
      missingApproval: false,
      isolationForestAtypical: false,
    };

    // 1. Credential not registered in E04 (+35)
    if (!e04) {
      driftSummary.unregistered = true;
      signals.push({
        code: 'UNREGISTERED_CREDENTIAL',
        label: 'Credential not registered in E04',
        category: 'permission',
        weight: 35,
        reason: `Credential "${ev.api_key_id}" issued ${ev.method} ${ev.endpoint} but does not exist in the approved E04 integration register.`,
        evidenceRefs: [`E18:${ev.request_id}`],
      });
    } else {
      // 2. Credential status mismatch (+30)
      if (!ACTIVE_CREDENTIAL_STATUSES.has(e04.status.toLowerCase())) {
        driftSummary.statusViolation = true;
        signals.push({
          code: 'CREDENTIAL_STATUS_MISMATCH',
          label: 'Credential status mismatch',
          category: 'permission',
          weight: 30,
          reason: `E04 lists credential "${e04.credential_id}" (${e04.integration}) with status "${e04.status}", yet it actively executed ${ev.method} ${ev.endpoint}.`,
          evidenceRefs: [`E04:${e04.credential_id}`, `E18:${ev.request_id}`],
        });
      }

      // 3. Endpoint outside registered scope (+30)
      if (!isRequestWithinScope(ev.method, ev.endpoint, e04.scope)) {
        driftSummary.scopeViolation = true;
        signals.push({
          code: 'OUT_OF_SCOPE_ENDPOINT',
          label: 'Endpoint outside registered scope',
          category: 'permission',
          weight: 30,
          reason: `Observed "${ev.method} ${ev.endpoint}" falls outside E04 approved scope (${e04.scope}).`,
          evidenceRefs: [`E04:${e04.credential_id}`, `E18:${ev.request_id}`],
        });
      }

      // 4. Caller IP violates registered IP restriction (+20)
      if (!ipMatchesRestriction(ev.caller_ip, e04.ip_restriction)) {
        driftSummary.ipViolation = true;
        signals.push({
          code: 'IP_RESTRICTION_VIOLATION',
          label: 'Caller IP violates registered IP restriction',
          category: 'permission',
          weight: 20,
          reason: `Caller IP ${ev.caller_ip} falls outside approved E04 IP restriction "${e04.ip_restriction}".`,
          evidenceRefs: [`E04:${e04.credential_id}`, `E18:${ev.request_id}`],
        });
      }
    }

    // Baseline behavioral comparisons (applied after credential establishes historical baseline)
    if (hasBaseline) {
      // 5. New caller IP compared with baseline (+20)
      if (!baseline.knownIps.includes(ev.caller_ip)) {
        driftSummary.newBaselineIp = true;
        signals.push({
          code: 'NEW_BASELINE_IP',
          label: 'New caller IP compared with baseline',
          category: 'behavior',
          weight: 20,
          reason: `Caller IP ${ev.caller_ip} was not seen in the ${baseline.totalBaselineRequests}-event baseline (${baseline.knownIps.join(', ')}).`,
          evidenceRefs: [`E18:${ev.request_id}`],
        });
      }

      // 6. New endpoint compared with baseline (+20)
      if (!baseline.knownEndpoints.includes(ev.endpoint)) {
        driftSummary.newBaselineEndpoint = true;
        signals.push({
          code: 'NEW_BASELINE_ENDPOINT',
          label: 'New endpoint compared with baseline',
          category: 'behavior',
          weight: 20,
          reason: `Endpoint "${ev.endpoint}" was never invoked in historical baseline (${baseline.knownEndpoints.join(', ')}).`,
          evidenceRefs: [`E18:${ev.request_id}`],
        });
      }

      // 7. New HTTP method (+15)
      if (!baseline.knownMethods.includes(ev.method.toUpperCase())) {
        driftSummary.newBaselineMethod = true;
        signals.push({
          code: 'NEW_BASELINE_METHOD',
          label: 'New HTTP method compared with baseline',
          category: 'behavior',
          weight: 15,
          reason: `HTTP method ${ev.method} differs from baseline methods (${baseline.knownMethods.join(', ')}).`,
          evidenceRefs: [`E18:${ev.request_id}`],
        });
      }

      // 8. New hour-of-day pattern (+10)
      const evHour = getUtcHour(ev.ts_utc);
      const minHourDistance = baseline.knownHours.reduce((minD, h) => {
        const diff = Math.abs(evHour - h);
        const circular = Math.min(diff, 24 - diff);
        return Math.min(minD, circular);
      }, 24);
      if (minHourDistance >= 2) {
        driftSummary.newBaselineHour = true;
        signals.push({
          code: 'NEW_BASELINE_HOUR',
          label: 'New hour-of-day pattern',
          category: 'behavior',
          weight: 10,
          reason: `Request timestamp hour (${String(evHour).padStart(2, '0')}:00 UTC) deviates from baseline active hours (${baseline.knownHours.map((h) => `${String(h).padStart(2, '0')}h`).join(', ')} UTC).`,
          evidenceRefs: [`E18:${ev.request_id}`],
        });
      }

      // 9. Unusually high returned-record volume (+15)
      const volumeThreshold = Math.max(
        baseline.maxRecords * 2.5,
        baseline.avgRecords + Math.max(50, baseline.stdRecords * 4),
        100
      );
      if (ev.records_returned >= volumeThreshold) {
        driftSummary.volumeSpike = true;
        signals.push({
          code: 'HIGH_RECORD_VOLUME',
          label: 'Unusually high returned-record volume',
          category: 'behavior',
          weight: 15,
          reason: `Returned ${ev.records_returned.toLocaleString()} records vs baseline average ${baseline.avgRecords} (max ${baseline.maxRecords}).`,
          evidenceRefs: [`E18:${ev.request_id}`],
        });
      }
    } else if (ev.records_returned >= 500) {
      // Unregistered or no-baseline bulk dump protection
      driftSummary.volumeSpike = true;
      signals.push({
        code: 'HIGH_RECORD_VOLUME',
        label: 'Unusually high returned-record volume',
        category: 'behavior',
        weight: 15,
        reason: `Returned ${ev.records_returned.toLocaleString()} records without an established high-volume baseline.`,
        evidenceRefs: [`E18:${ev.request_id}`],
      });
    }

    // 10 & 11. Correlated E19 sensitive vendor-record change (+30) & missing approval reference (+25)
    const sensitiveChanges = linkedE19.filter((c) => isSensitiveVendorField(c.field));
    if (sensitiveChanges.length > 0) {
      driftSummary.sensitiveChange = true;
      const changeList = sensitiveChanges
        .map((c) => `${c.change_id} (${c.vendor_name}: ${c.field})`)
        .join('; ');
      signals.push({
        code: 'SENSITIVE_VENDOR_CHANGE',
        label: 'Sensitive vendor-record change',
        category: 'business_impact',
        weight: 30,
        reason: `Correlated via request_id ${ev.request_id} to sensitive vendor master change: ${changeList}.`,
        evidenceRefs: [
          `E18:${ev.request_id}`,
          ...sensitiveChanges.map((c) => `E19:${c.change_id}`),
        ],
      });

      const unapprovedSensitive = sensitiveChanges.filter(
        (c) => !(c.approval_ref ?? '').trim()
      );
      if (unapprovedSensitive.length > 0) {
        driftSummary.missingApproval = true;
        signals.push({
          code: 'MISSING_APPROVAL_REF',
          label: 'Missing approval reference on sensitive change',
          category: 'business_impact',
          weight: 25,
          reason: `Sensitive vendor modification (${unapprovedSensitive.map((c) => c.change_id).join(', ')}) has no recorded approval_ref.`,
          evidenceRefs: unapprovedSensitive.map((c) => `E19:${c.change_id}`),
        });
      }
    }

    const deterministicScore = signals.reduce((sum, s) => sum + s.weight, 0);

    // 12. Highly atypical Isolation Forest signal (+10) — strictly supporting signal, never sole trigger
    const isoScore = isoResult.scores[index] ?? 0;
    const isoFlag = isoResult.atypicalFlags[index] ?? false;
    if (isoFlag && deterministicScore > 0) {
      driftSummary.isolationForestAtypical = true;
      signals.push({
        code: 'ISOLATION_FOREST_ATYPICAL',
        label: 'Highly atypical Isolation Forest signal',
        category: 'ml_anomaly',
        weight: 10,
        reason: `Unsupervised Isolation Forest anomaly score ${isoScore.toFixed(3)} exceeded outlier cutoff ${isoResult.thresholdScore.toFixed(3)} (supporting signal only).`,
        evidenceRefs: [`E18:${ev.request_id}`],
      });
    }

    const rawUncappedScore = signals.reduce((sum, s) => sum + s.weight, 0);
    const riskScore = Math.min(100, rawUncappedScore);
    const severity = classifySeverity(riskScore);

    // Enforce invariant: Isolation Forest can NEVER be the sole cause of an alert
    const isAlert = deterministicScore > 0 && riskScore >= config.alertThreshold;

    const saved = annotations[ev.request_id];

    return {
      requestId: ev.request_id,
      tsUtc: ev.ts_utc,
      apiKeyId: ev.api_key_id,
      integrationName: e04 ? e04.integration : 'Unregistered Credential',
      vendor: e04 ? e04.vendor : 'Unregistered / Unknown',
      system: e04 ? e04.system : 'Unmapped',
      owner: e04 ? e04.owner : 'Unassigned',
      callerIp: ev.caller_ip,
      userAgent: ev.user_agent,
      endpoint: ev.endpoint,
      method: ev.method,
      recordsReturned: ev.records_returned,
      responseStatus: ev.status,
      riskScore,
      rawUncappedScore,
      deterministicScore,
      severity,
      isAlert,
      isBaselineWindow,
      isolationForestScore: isoScore,
      isolationForestAtypical: isoFlag,
      signals,
      linkedE04: e04,
      linkedE19,
      baselineStats: baseline,
      driftSummary,
      triageStatus: saved?.triageStatus ?? 'open',
      notes: saved?.notes ?? [],
      conclusion: saved?.conclusion ?? null,
    };
  });

  // Sort alerts by highest risk score, then newest timestamp
  const alerts = analyzedEvents
    .filter((e) => e.isAlert)
    .sort((a, b) => b.riskScore - a.riskScore || Date.parse(b.tsUtc) - Date.parse(a.tsUtc));

  // Build dynamic Dashboard KPIs
  const observedUnregisteredKeys = new Set(
    analyzedEvents.filter((e) => !e.linkedE04).map((e) => e.apiKeyId)
  );
  const suspiciousCredSet = new Set(
    analyzedEvents.filter((e) => e.isAlert || e.riskScore >= 35).map((e) => e.apiKeyId)
  );

  const sensitiveE19Count = e19Records.filter((c) => isSensitiveVendorField(c.field)).length;
  const missingApprovalE19Count = e19Records.filter(
    (c) => isSensitiveVendorField(c.field) && !(c.approval_ref ?? '').trim()
  ).length;
  const e18RequestSet = new Set(e18Records.map((e) => e.request_id.trim()));
  const correlatedE19Count = e19Records.filter(
    (c) => (c.request_id ?? '').trim() !== '' && e18RequestSet.has(c.request_id.trim())
  ).length;

  const metrics: DashboardMetrics = {
    totalIntegrations: e04Records.length,
    activeIntegrations: e04Records.filter((r) =>
      ACTIVE_CREDENTIAL_STATUSES.has(r.status.toLowerCase())
    ).length,
    inactiveOrRevokedIntegrations: e04Records.filter(
      (r) => !ACTIVE_CREDENTIAL_STATUSES.has(r.status.toLowerCase())
    ).length,
    unregisteredCredentialsObserved: observedUnregisteredKeys.size,
    totalApiEvents: analyzedEvents.length,
    totalAlerts: alerts.length,
    highAndCriticalCount: analyzedEvents.filter(
      (e) => e.severity === 'HIGH' || e.severity === 'CRITICAL'
    ).length,
    criticalCount: analyzedEvents.filter((e) => e.severity === 'CRITICAL').length,
    highCount: analyzedEvents.filter((e) => e.severity === 'HIGH').length,
    mediumCount: analyzedEvents.filter((e) => e.severity === 'MEDIUM').length,
    lowCount: analyzedEvents.filter((e) => e.severity === 'LOW').length,
    vendorRecordChanges: e19Records.length,
    sensitiveVendorChanges: sensitiveE19Count,
    missingApprovalCount: missingApprovalE19Count,
    correlatedVendorChanges: correlatedE19Count,
    suspiciousIntegrationsCount: suspiciousCredSet.size,
    reviewedAlertsCount: alerts.filter((a) => a.triageStatus === 'reviewed').length,
    openAlertsCount: alerts.filter((a) => a.triageStatus !== 'reviewed').length,
  };

  // Timeline buckets (6-hour slices for crisp multi-day trend visualization)
  const bucketMap = new Map<string, TimelineBucket>();
  for (const ev of analyzedEvents) {
    const ms = Date.parse(ev.tsUtc);
    const d = Number.isNaN(ms) ? new Date(0) : new Date(ms);
    const dayStr = d.toISOString().slice(0, 10);
    const sliceHour = Math.floor(d.getUTCHours() / 6) * 6;
    const key = `${dayStr}T${String(sliceHour).padStart(2, '0')}`;
    const monthDay = dayStr.slice(5);
    const label = `${monthDay} ${String(sliceHour).padStart(2, '0')}h`;
    const existing = bucketMap.get(key) ?? {
      bucket: key,
      label,
      normal: 0,
      suspicious: 0,
      total: 0,
      maxRisk: 0,
    };
    const isSuspicious = ev.isAlert || ev.riskScore >= 35;
    if (isSuspicious) existing.suspicious += 1;
    else existing.normal += 1;
    existing.total += 1;
    existing.maxRisk = Math.max(existing.maxRisk, ev.riskScore);
    bucketMap.set(key, existing);
  }
  const timeline = Array.from(bucketMap.values()).sort((a, b) =>
    a.bucket.localeCompare(b.bucket)
  );

  // Integration risk rollups (covers all E04 credentials + any observed unregistered credentials)
  const rollupKeys = new Set<string>([
    ...e04Records.map((r) => r.credential_id),
    ...analyzedEvents.map((e) => e.apiKeyId),
  ]);

  const integrationRollups: IntegrationRiskRollup[] = Array.from(rollupKeys)
    .map((credId) => {
      const reg = e04Map.get(credId) ?? null;
      const credEvents = analyzedEvents.filter((e) => e.apiKeyId === credId);
      const alertCount = credEvents.filter((e) => e.isAlert).length;
      const suspiciousEvents = credEvents.filter(
        (e) => e.isAlert || e.riskScore >= 35
      ).length;
      const maxRiskScore = credEvents.reduce((m, e) => Math.max(m, e.riskScore), 0);
      const avgRiskScore =
        credEvents.length > 0
          ? Number(
              (
                credEvents.reduce((s, e) => s + e.riskScore, 0) / credEvents.length
              ).toFixed(1)
            )
          : 0;
      const correlatedChanges = credEvents.reduce(
        (sum, e) => sum + e.linkedE19.length,
        0
      );
      const driftSignals = Array.from(
        new Set(credEvents.flatMap((e) => e.signals.map((s) => s.label)))
      );

      return {
        integration: reg ? reg.integration : `Unregistered (${credId})`,
        credentialId: credId,
        vendor: reg ? reg.vendor : 'Unregistered',
        system: reg ? reg.system : 'Unmapped',
        status: reg ? reg.status : 'unregistered',
        registered: reg !== null,
        totalEvents: credEvents.length,
        suspiciousEvents,
        alertCount,
        maxRiskScore,
        avgRiskScore,
        correlatedChanges,
        driftSignals,
      };
    })
    .sort((a, b) => b.maxRiskScore - a.maxRiskScore || b.alertCount - a.alertCount);

  // Signal frequencies across all 12 rules
  const sigCountMap = new Map<SignalCode, number>();
  for (const ev of analyzedEvents) {
    for (const sig of ev.signals) {
      sigCountMap.set(sig.code, (sigCountMap.get(sig.code) ?? 0) + 1);
    }
  }
  const signalFrequencies: SignalFrequencyItem[] = SIGNAL_WEIGHT_CATALOG.map((item) => ({
    code: item.code,
    label: item.label,
    category: item.category,
    weight: item.weight,
    count: sigCountMap.get(item.code) ?? 0,
  })).sort((a, b) => b.count - a.count || b.weight - a.weight);

  return {
    events: analyzedEvents,
    alerts,
    metrics,
    timeline,
    integrationRollups,
    signalFrequencies,
  };
}

/**
 * Deterministic Rule-Based Explanation Engine
 * Always available offline / without LLM dependency, strictly separating
 * FACT, OBSERVATION, CORRELATION, INFERENCE, UNCERTAINTY, and ACTION.
 */
export function generateDeterministicExplanation(
  event: AnalyzedEvent
): StructuredRiskExplanation {
  const evidenceLayers = new Set<string>(['E18']);
  if (event.linkedE04) evidenceLayers.add('E04');
  if (event.linkedE19.length > 0) evidenceLayers.add('E19');

  const signalSummary =
    event.signals.length > 0
      ? event.signals.map((s) => `${s.label} (+${s.weight})`).join('; ')
      : 'No permission, behavioral, or business-impact deviations triggered.';

  const whatHappened = event.linkedE04
    ? `API request ${event.requestId} used credential ${event.apiKeyId} (${event.linkedE04.integration}) from caller IP ${event.callerIp} to invoke ${event.method} ${event.endpoint}, returning ${event.recordsReturned.toLocaleString()} record(s) with HTTP ${event.responseStatus} at ${event.tsUtc}.`
    : `API request ${event.requestId} used unregistered credential ${event.apiKeyId} from caller IP ${event.callerIp} to invoke ${event.method} ${event.endpoint}, returning ${event.recordsReturned.toLocaleString()} record(s) with HTTP ${event.responseStatus} at ${event.tsUtc}.`;

  const whyFlagged =
    event.signals.length > 0
      ? `The event accumulated a risk score of ${event.riskScore}/100 (${event.severity}, uncapped total ${event.rawUncappedScore}) from ${event.signals.length} signal(s): ${signalSummary}.`
      : `The request matched approved E04 permissions and historical baseline activity, yielding a score of 0/100 (LOW).`;

  const businessImpact =
    event.linkedE19.length > 0
      ? event.linkedE19
          .map((c) => {
            const appr = c.approval_ref
              ? `approval_ref ${c.approval_ref} recorded`
              : 'NO approval_ref recorded';
            return `Correlated E19 change ${c.change_id} modified "${c.field}" on vendor ${c.vendor_name} (${c.vendor_id}) from "${c.old_value}" to "${c.new_value}" (${appr}).`;
          })
          .join(' ')
      : 'No matching E19 vendor-record modification is linked to this request_id in the supplied evidence.';

  const factParts: string[] = [
    `E18:${event.requestId} records ${event.method} ${event.endpoint} by ${event.apiKeyId} from ${event.callerIp} at ${event.tsUtc} (${event.recordsReturned} records, HTTP ${event.responseStatus}).`,
  ];
  if (event.linkedE04) {
    factParts.push(
      `E04:${event.linkedE04.credential_id} registers ${event.linkedE04.integration} (status: ${event.linkedE04.status}, IP restriction: ${event.linkedE04.ip_restriction || 'none'}, scope: ${event.linkedE04.scope}).`
    );
  } else {
    factParts.push(`E04 contains no registration entry for credential_id "${event.apiKeyId}".`);
  }
  if (event.linkedE19.length > 0) {
    factParts.push(
      `E19 contains ${event.linkedE19.length} change record(s) referencing request_id ${event.requestId}: ${event.linkedE19.map((c) => `${c.change_id} (${c.vendor_name} · ${c.field})`).join(', ')}.`
    );
  }

  const observation =
    event.signals.length > 0
      ? event.signals.map((s) => s.reason).join(' ')
      : 'Observed IP, endpoint, method, UTC hour, and returned record count align with approved E04 policy and historical baseline.';

  const correlation =
    event.linkedE19.length > 0
      ? `Verified identifier match links E18:${event.requestId} to ${event.linkedE19.map((c) => `E19:${c.change_id}`).join(', ')} via exact request_id${event.linkedE04 ? ` and to E04:${event.linkedE04.credential_id} via credential_id` : ''}.`
      : event.linkedE04
        ? `Verified credential_id link connects E18:${event.requestId} to E04:${event.linkedE04.credential_id}. No E19 vendor record carries request_id ${event.requestId}.`
        : `E18:${event.requestId} has no matching E04 registration and no linked E19 vendor modification.`;

  const inference =
    event.riskScore >= 80
      ? 'The combination of permission-boundary drift, behavioral deviation, and correlated unapproved sensitive vendor modifications indicates a high-priority integrity risk warranting immediate investigation; however, telemetry alone does not prove unauthorized compromise or financial loss.'
      : event.riskScore >= 55
        ? 'Multiple permission and/or behavioral deviations suggest credential misuse, undocumented integration reconfiguration, or unauthorized endpoint probing that requires owner verification.'
        : event.riskScore >= 35
          ? 'Moderate deviation from baseline or approved scope may reflect an unannounced vendor workflow update or policy gap and should be verified with the integration owner.'
          : 'Signals remain consistent with routine authorized behavior or properly approved workflows.';

  const uncertainty =
    'Supplied logs do not establish actor identity behind the caller IP, whether an out-of-band change ticket exists outside E19, or whether downstream financial settlement occurred.';

  const recommendedInvestigation: string[] = [];
  if (event.linkedE04) {
    recommendedInvestigation.push(
      `Contact integration owner ${event.linkedE04.owner} to confirm whether ${event.method} ${event.endpoint} from ${event.callerIp} was authorized.`
    );
  } else {
    recommendedInvestigation.push(
      `Identify who provisioned unregistered credential ${event.apiKeyId} and audit API gateway key-issuance logs.`
    );
  }
  if (event.driftSummary.ipViolation || event.driftSummary.scopeViolation) {
    recommendedInvestigation.push(
      'Compare API gateway enforcement rules against the E04 register to determine why out-of-scope or non-allowlisted traffic succeeded.'
    );
  }
  if (event.linkedE19.length > 0) {
    recommendedInvestigation.push(
      `Validate vendor master modification (${event.linkedE19.map((c) => `${c.change_id} on ${c.vendor_name}`).join(', ')}) directly with Finance/Procurement and verify out-of-band approval documentation.`
    );
  }
  if (event.driftSummary.missingApproval) {
    recommendedInvestigation.push(
      'Place a temporary verification hold on pending payouts to affected vendor(s) until approval authorization is confirmed.'
    );
  }
  recommendedInvestigation.push(
    'Preserve raw E04, E18, and E19 records and coordinate with an authorized IAM administrator to restrict or rotate the credential if unauthorized activity is confirmed.'
  );

  return {
    engine: 'deterministic',
    model: 'API-SENTINEL-Rule-Explainer-v1.4',
    generatedAt: new Date().toISOString(),
    riskLevel: event.severity,
    riskScore: event.riskScore,
    headline:
      event.signals.length > 0
        ? `${event.severity} Risk Finding: ${event.signals[0].label} on ${event.integrationName}`
        : `Normal Activity Verified on ${event.integrationName}`,
    whatHappened,
    whyFlagged,
    evidenceInvolved: Array.from(evidenceLayers),
    businessImpact,
    recommendedInvestigation,
    decisionBreakdown: {
      fact: factParts.join(' '),
      observation,
      correlation,
      inference,
      uncertainty,
      action: recommendedInvestigation[0],
    },
    limitationsNote:
      'Generated by the deterministic rule-based explanation engine directly from E04/E18/E19 evidence and detection weights. Anomalies indicate risk requiring verification, not confirmed fraud.',
  };
}
