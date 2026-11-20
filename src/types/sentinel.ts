export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DatasetSource = 'synthetic' | 'uploaded' | 'empty';
export type TriageStatus = 'open' | 'in_review' | 'reviewed' | 'escalated';
export type ExplanationEngineMode = 'gemini' | 'deterministic';
export type InvestigationDisposition =
  | 'under_investigation'
  | 'benign_verified'
  | 'policy_violation'
  | 'escalated_for_containment';

export interface E04Record {
  integration: string;
  credential_id: string;
  system: string;
  vendor: string;
  scope: string;
  owner: string;
  ip_restriction: string;
  token_lifetime_days: number;
  last_used: string;
  status: string;
  extra?: Record<string, string>;
}

export interface E18Record {
  ts_utc: string;
  request_id: string;
  api_key_id: string;
  caller_ip: string;
  user_agent: string;
  endpoint: string;
  method: string;
  records_returned: number;
  status: number;
  extra?: Record<string, string>;
}

export interface E19Record {
  ts_utc: string;
  change_id: string;
  vendor_id: string;
  vendor_name: string;
  field: string;
  old_value: string;
  new_value: string;
  changed_by: string;
  channel: string;
  approval_ref: string;
  source_ip: string;
  request_id: string;
  extra?: Record<string, string>;
}

export type SignalCode =
  | 'UNREGISTERED_CREDENTIAL'
  | 'CREDENTIAL_STATUS_MISMATCH'
  | 'OUT_OF_SCOPE_ENDPOINT'
  | 'IP_RESTRICTION_VIOLATION'
  | 'NEW_BASELINE_IP'
  | 'NEW_BASELINE_ENDPOINT'
  | 'NEW_BASELINE_METHOD'
  | 'NEW_BASELINE_HOUR'
  | 'HIGH_RECORD_VOLUME'
  | 'SENSITIVE_VENDOR_CHANGE'
  | 'MISSING_APPROVAL_REF'
  | 'ISOLATION_FOREST_ATYPICAL';

export interface SignalHit {
  code: SignalCode;
  label: string;
  category: 'permission' | 'behavior' | 'business_impact' | 'ml_anomaly';
  weight: number;
  reason: string;
  evidenceRefs: string[];
}

export interface BaselineContext {
  totalBaselineRequests: number;
  knownIps: string[];
  knownEndpoints: string[];
  knownMethods: string[];
  knownHours: number[];
  avgRecords: number;
  maxRecords: number;
  p95Records: number;
  stdRecords: number;
}

export interface DriftSummary {
  unregistered: boolean;
  statusViolation: boolean;
  scopeViolation: boolean;
  ipViolation: boolean;
  newBaselineIp: boolean;
  newBaselineEndpoint: boolean;
  newBaselineMethod: boolean;
  newBaselineHour: boolean;
  volumeSpike: boolean;
  sensitiveChange: boolean;
  missingApproval: boolean;
  isolationForestAtypical: boolean;
}

export interface InvestigationNote {
  id: string;
  author: string;
  createdAt: string;
  text: string;
}

export interface InvestigationConclusion {
  confirmedFacts: string;
  openHypotheses: string;
  disposition: InvestigationDisposition;
  updatedAt: string;
}

export interface AnalyzedEvent {
  requestId: string;
  tsUtc: string;
  apiKeyId: string;
  integrationName: string;
  vendor: string;
  system: string;
  owner: string;
  callerIp: string;
  userAgent: string;
  endpoint: string;
  method: string;
  recordsReturned: number;
  responseStatus: number;
  riskScore: number;
  rawUncappedScore: number;
  deterministicScore: number;
  severity: SeverityLevel;
  isAlert: boolean;
  isBaselineWindow: boolean;
  isolationForestScore: number;
  isolationForestAtypical: boolean;
  signals: SignalHit[];
  linkedE04: E04Record | null;
  linkedE19: E19Record[];
  baselineStats: BaselineContext;
  driftSummary: DriftSummary;
  triageStatus: TriageStatus;
  notes: InvestigationNote[];
  conclusion: InvestigationConclusion | null;
}

export interface StructuredRiskExplanation {
  engine: ExplanationEngineMode;
  model: string;
  generatedAt: string;
  riskLevel: SeverityLevel;
  riskScore: number;
  headline: string;
  whatHappened: string;
  whyFlagged: string;
  evidenceInvolved: string[];
  businessImpact: string;
  recommendedInvestigation: string[];
  decisionBreakdown: {
    fact: string;
    observation: string;
    correlation: string;
    inference: string;
    uncertainty: string;
    action: string;
  };
  limitationsNote: string;
}

export interface EngineConfig {
  alertThreshold: number;
  baselineFraction: number;
  modelVersion: string;
  isolationForestContamination: number;
  isolationForestTrees: number;
}

export interface DatasetQualitySummary {
  e04Count: number;
  e18Count: number;
  e19Count: number;
  duplicatesRemoved: {
    e04: number;
    e18: number;
    e19: number;
  };
  warnings: string[];
  missingColumns: {
    e04: string[];
    e18: string[];
    e19: string[];
  };
  extraColumns: {
    e04: string[];
    e18: string[];
    e19: string[];
  };
}

export interface DashboardMetrics {
  totalIntegrations: number;
  activeIntegrations: number;
  inactiveOrRevokedIntegrations: number;
  unregisteredCredentialsObserved: number;
  totalApiEvents: number;
  totalAlerts: number;
  highAndCriticalCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  vendorRecordChanges: number;
  sensitiveVendorChanges: number;
  missingApprovalCount: number;
  correlatedVendorChanges: number;
  suspiciousIntegrationsCount: number;
  reviewedAlertsCount: number;
  openAlertsCount: number;
}

export interface TimelineBucket {
  bucket: string;
  label: string;
  normal: number;
  suspicious: number;
  total: number;
  maxRisk: number;
}

export interface IntegrationRiskRollup {
  integration: string;
  credentialId: string;
  vendor: string;
  system: string;
  status: string;
  registered: boolean;
  totalEvents: number;
  suspiciousEvents: number;
  alertCount: number;
  maxRiskScore: number;
  avgRiskScore: number;
  correlatedChanges: number;
  driftSignals: string[];
}

export interface SignalFrequencyItem {
  code: SignalCode;
  label: string;
  category: SignalHit['category'];
  weight: number;
  count: number;
}

export interface SystemHealthInfo {
  apiStatus: 'healthy';
  storageMode: 'local_file_persistence';
  storageLabel: string;
  storageConnected: boolean;
  postgresConfigured: boolean;
  geminiConfigured: boolean;
  uptimeSeconds: number;
  lastAnalyzedAt: string | null;
  engineRuntime: string;
}

export interface WorkspaceStateResponse {
  datasetSource: DatasetSource;
  datasetLabel: string;
  lastAnalyzedAt: string | null;
  config: EngineConfig;
  quality: DatasetQualitySummary;
  health: SystemHealthInfo;
  metrics: DashboardMetrics;
  timeline: TimelineBucket[];
  integrationRollups: IntegrationRiskRollup[];
  signalFrequencies: SignalFrequencyItem[];
  e04: E04Record[];
  e18: E18Record[];
  e19: E19Record[];
  events: AnalyzedEvent[];
  alerts: AnalyzedEvent[];
}

export interface CsvValidationResult {
  valid: boolean;
  layer: 'e04' | 'e18' | 'e19';
  rowCount: number;
  duplicateCount: number;
  headers: string[];
  missingColumns: string[];
  extraColumns: string[];
  warnings: string[];
  preview: Record<string, string | number>[];
}

export const SIGNAL_WEIGHT_CATALOG: ReadonlyArray<{
  code: SignalCode;
  label: string;
  weight: number;
  category: SignalHit['category'];
  description: string;
}> = [
  {
    code: 'UNREGISTERED_CREDENTIAL',
    label: 'Credential not registered in E04',
    weight: 35,
    category: 'permission',
    description: 'Observed API key does not appear in the approved E04 integration register.',
  },
  {
    code: 'CREDENTIAL_STATUS_MISMATCH',
    label: 'Credential status mismatch',
    weight: 30,
    category: 'permission',
    description: 'Credential is marked inactive, revoked, expired, or suspended in E04 yet issued API calls.',
  },
  {
    code: 'OUT_OF_SCOPE_ENDPOINT',
    label: 'Endpoint outside registered scope',
    weight: 30,
    category: 'permission',
    description: 'Called API endpoint or HTTP verb falls outside the integration approved scope in E04.',
  },
  {
    code: 'IP_RESTRICTION_VIOLATION',
    label: 'Caller IP violates registered IP restriction',
    weight: 20,
    category: 'permission',
    description: 'Request originated from an IP outside the approved E04 IP/CIDR allowlist.',
  },
  {
    code: 'NEW_BASELINE_IP',
    label: 'New caller IP compared with baseline',
    weight: 20,
    category: 'behavior',
    description: 'Caller IP was never seen during the credential historical baseline window.',
  },
  {
    code: 'NEW_BASELINE_ENDPOINT',
    label: 'New endpoint compared with baseline',
    weight: 20,
    category: 'behavior',
    description: 'API endpoint was never invoked during the credential historical baseline window.',
  },
  {
    code: 'NEW_BASELINE_METHOD',
    label: 'New HTTP method compared with baseline',
    weight: 15,
    category: 'behavior',
    description: 'HTTP method differs from methods established in the credential historical baseline.',
  },
  {
    code: 'NEW_BASELINE_HOUR',
    label: 'New hour-of-day pattern',
    weight: 10,
    category: 'behavior',
    description: 'UTC request hour falls outside the historical operating hours observed in baseline.',
  },
  {
    code: 'HIGH_RECORD_VOLUME',
    label: 'Unusually high returned-record volume',
    weight: 15,
    category: 'behavior',
    description: 'Returned record count significantly exceeds the credential baseline distribution.',
  },
  {
    code: 'SENSITIVE_VENDOR_CHANGE',
    label: 'Sensitive vendor-record change',
    weight: 30,
    category: 'business_impact',
    description: 'Correlated E19 record modifies bank account, IBAN, routing, payment, or payout fields.',
  },
  {
    code: 'MISSING_APPROVAL_REF',
    label: 'Missing approval reference on sensitive change',
    weight: 25,
    category: 'business_impact',
    description: 'Sensitive E19 vendor modification lacks a valid approval reference identifier.',
  },
  {
    code: 'ISOLATION_FOREST_ATYPICAL',
    label: 'Highly atypical Isolation Forest signal',
    weight: 10,
    category: 'ml_anomaly',
    description: 'Supporting unsupervised behavioral outlier score (never sole trigger for an alert).',
  },
];
