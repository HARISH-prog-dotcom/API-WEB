import fs from 'node:fs';
import path from 'node:path';
import type {
  DatasetQualitySummary,
  DatasetSource,
  E04Record,
  E18Record,
  E19Record,
  EngineConfig,
  InvestigationConclusion,
  InvestigationNote,
  TriageStatus,
  WorkspaceStateResponse,
} from '../src/types/sentinel.ts';
import { isGeminiConfigured } from './aiExplainer.ts';
import { runDetectionEngine, type PersistedAnnotation } from './detector.ts';
import { buildSyntheticDataset } from './syntheticData.ts';

interface PersistedDatabase {
  version: number;
  datasetSource: DatasetSource;
  datasetLabel: string;
  lastAnalyzedAt: string | null;
  config: EngineConfig;
  quality: DatasetQualitySummary;
  e04: E04Record[];
  e18: E18Record[];
  e19: E19Record[];
  annotations: Record<string, PersistedAnnotation>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'sentinel-store.json');
const SERVER_START_MS = Date.now();

const DEFAULT_CONFIG: EngineConfig = {
  alertThreshold: 50,
  baselineFraction: 0.6,
  modelVersion: 'api-sentinel-iforest-v1.4',
  isolationForestContamination: 0.08,
  isolationForestTrees: 100,
};

function createSyntheticInitialDb(): PersistedDatabase {
  const { e04, e18, e19 } = buildSyntheticDataset();
  return {
    version: 1,
    datasetSource: 'synthetic',
    datasetLabel: 'Synthetic Demonstration Dataset (Fintech/ERP Third-Party Integrations)',
    lastAnalyzedAt: new Date().toISOString(),
    config: { ...DEFAULT_CONFIG },
    quality: {
      e04Count: e04.length,
      e18Count: e18.length,
      e19Count: e19.length,
      duplicatesRemoved: { e04: 0, e18: 0, e19: 0 },
      warnings: [],
      missingColumns: { e04: [], e18: [], e19: [] },
      extraColumns: { e04: [], e18: [], e19: [] },
    },
    e04,
    e18,
    e19,
    annotations: {
      'REQ-2026-0118': {
        triageStatus: 'in_review',
        notes: [
          {
            id: 'note-seed-1',
            author: 'Maya Lin (Lead SOC Analyst)',
            createdAt: '2026-11-18T02:45:00Z',
            text: 'Correlated E18 request REQ-2026-0118 directly to E19 change CHG-9041 (IBAN modification for Nordic Industrial Supply GmbH). Pending confirmation from Elena Vance (AP Operations) on whether an off-hours change was authorized.',
          },
        ],
        conclusion: {
          confirmedFacts:
            'Credential cred_inv_042 called PUT /api/v2/vendors/bank-accounts from 185.214.68.42 at 02:14:22 UTC, outside E04 scope and 10.42.8.0/24 CIDR restriction. Linked E19 record CHG-9041 updated IBAN with blank approval_ref.',
          openHypotheses:
            'API key may have been exposed outside the InvoiceFlow connector host or misconfigured during an undocumented vendor deployment. Financial settlement impact cannot be determined from supplied logs alone.',
          disposition: 'under_investigation',
          updatedAt: '2026-11-18T02:50:00Z',
        },
      },
    },
  };
}

class LocalSentinelStore {
  private db: PersistedDatabase;

  constructor() {
    this.db = this.loadFromDisk();
  }

  private loadFromDisk(): PersistedDatabase {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedDatabase;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.e18)) {
          return parsed;
        }
      }
    } catch {
      // Fallback cleanly to fresh synthetic seed if store file is unreadable
    }
    const seeded = createSyntheticInitialDb();
    this.persistToDisk(seeded);
    return seeded;
  }

  private persistToDisk(data: PersistedDatabase): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpPath = `${STORE_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, STORE_PATH);
    } catch (err) {
      console.error('[API SENTINEL] Failed to persist local store:', err);
    }
  }

  public getWorkspaceState(): WorkspaceStateResponse {
    const detection = runDetectionEngine(
      this.db.e04,
      this.db.e18,
      this.db.e19,
      this.db.config,
      this.db.annotations
    );

    return {
      datasetSource: this.db.datasetSource,
      datasetLabel: this.db.datasetLabel,
      lastAnalyzedAt: this.db.lastAnalyzedAt,
      config: this.db.config,
      quality: this.db.quality,
      health: {
        apiStatus: 'healthy',
        storageMode: 'local_file_persistence',
        storageLabel: 'Local Persistent File Store (Development Mode — PostgreSQL DDL Reference Included)',
        storageConnected: fs.existsSync(STORE_PATH),
        postgresConfigured: Boolean(process.env.DATABASE_URL),
        geminiConfigured: isGeminiConfigured(),
        uptimeSeconds: Math.floor((Date.now() - SERVER_START_MS) / 1000),
        lastAnalyzedAt: this.db.lastAnalyzedAt,
        engineRuntime: 'Node.js Express · 12-Signal Rule Engine + Native Isolation Forest',
      },
      metrics: detection.metrics,
      timeline: detection.timeline,
      integrationRollups: detection.integrationRollups,
      signalFrequencies: detection.signalFrequencies,
      e04: this.db.e04,
      e18: this.db.e18,
      e19: this.db.e19,
      events: detection.events,
      alerts: detection.alerts,
    };
  }

  public getEventById(requestId: string) {
    const state = this.getWorkspaceState();
    return state.events.find((e) => e.requestId === requestId) ?? null;
  }

  public ingestUploadedDataset(params: {
    e04: E04Record[];
    e18: E18Record[];
    e19: E19Record[];
    quality: DatasetQualitySummary;
    label: string;
  }): WorkspaceStateResponse {
    this.db = {
      ...this.db,
      datasetSource: 'uploaded',
      datasetLabel: params.label || 'Uploaded Competition Evidence Dataset',
      lastAnalyzedAt: new Date().toISOString(),
      quality: params.quality,
      e04: params.e04,
      e18: params.e18,
      e19: params.e19,
      // Cleanly isolate annotations so synthetic notes never leak into competition evidence
      annotations: {},
    };
    this.persistToDisk(this.db);
    return this.getWorkspaceState();
  }

  public loadSyntheticDemo(): WorkspaceStateResponse {
    const seeded = createSyntheticInitialDb();
    seeded.config = { ...this.db.config };
    this.db = seeded;
    this.persistToDisk(this.db);
    return this.getWorkspaceState();
  }

  public resetToEmpty(): WorkspaceStateResponse {
    this.db = {
      ...this.db,
      datasetSource: 'empty',
      datasetLabel: 'No Active Dataset Loaded',
      lastAnalyzedAt: null,
      quality: {
        e04Count: 0,
        e18Count: 0,
        e19Count: 0,
        duplicatesRemoved: { e04: 0, e18: 0, e19: 0 },
        warnings: [],
        missingColumns: { e04: [], e18: [], e19: [] },
        extraColumns: { e04: [], e18: [], e19: [] },
      },
      e04: [],
      e18: [],
      e19: [],
      annotations: {},
    };
    this.persistToDisk(this.db);
    return this.getWorkspaceState();
  }

  public updateTriageStatus(requestId: string, triageStatus: TriageStatus): WorkspaceStateResponse {
    const existing = this.db.annotations[requestId] ?? {
      triageStatus: 'open',
      notes: [],
      conclusion: null,
    };
    this.db.annotations[requestId] = {
      ...existing,
      triageStatus,
    };
    this.persistToDisk(this.db);
    return this.getWorkspaceState();
  }

  public addNote(
    requestId: string,
    author: string,
    text: string
  ): WorkspaceStateResponse {
    const existing = this.db.annotations[requestId] ?? {
      triageStatus: 'in_review',
      notes: [],
      conclusion: null,
    };
    const newNote: InvestigationNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      author: author.trim() || 'Maya Lin (Lead SOC Analyst)',
      createdAt: new Date().toISOString(),
      text: text.trim(),
    };
    this.db.annotations[requestId] = {
      ...existing,
      notes: [newNote, ...existing.notes],
    };
    this.persistToDisk(this.db);
    return this.getWorkspaceState();
  }

  public updateConclusion(
    requestId: string,
    conclusion: Omit<InvestigationConclusion, 'updatedAt'>
  ): WorkspaceStateResponse {
    const existing = this.db.annotations[requestId] ?? {
      triageStatus: 'in_review',
      notes: [],
      conclusion: null,
    };
    this.db.annotations[requestId] = {
      ...existing,
      conclusion: {
        ...conclusion,
        updatedAt: new Date().toISOString(),
      },
    };
    this.persistToDisk(this.db);
    return this.getWorkspaceState();
  }

  public updateSettings(partial: Partial<EngineConfig>): WorkspaceStateResponse {
    const nextThreshold =
      partial.alertThreshold !== undefined
        ? Math.max(10, Math.min(95, Math.round(Number(partial.alertThreshold))))
        : this.db.config.alertThreshold;
    const nextBaseline =
      partial.baselineFraction !== undefined
        ? Math.max(0.2, Math.min(0.85, Number(partial.baselineFraction)))
        : this.db.config.baselineFraction;

    this.db.config = {
      ...this.db.config,
      alertThreshold: Number.isNaN(nextThreshold) ? this.db.config.alertThreshold : nextThreshold,
      baselineFraction: Number.isNaN(nextBaseline) ? this.db.config.baselineFraction : Number(nextBaseline.toFixed(2)),
    };
    if (this.db.e18.length > 0) {
      this.db.lastAnalyzedAt = new Date().toISOString();
    }
    this.persistToDisk(this.db);
    return this.getWorkspaceState();
  }
}

export const sentinelStore = new LocalSentinelStore();

/**
 * Generates an isolated synthetic demonstration bundle for the 6-Stage Hackathon Theater
 * so running the demo never alters or mixes with uploaded competition evidence.
 */
export function buildIsolatedDemoBundle() {
  const { e04, e18, e19 } = buildSyntheticDataset();
  const detection = runDetectionEngine(e04, e18, e19, DEFAULT_CONFIG, {});
  const normalEvent =
    detection.events.find((e) => e.requestId === 'REQ-2026-DEMO-NORMAL') ??
    detection.events.find((e) => e.riskScore === 0) ??
    detection.events[0];
  const criticalEvent =
    detection.events.find((e) => e.requestId === 'REQ-2026-0118') ??
    detection.alerts[0];
  const approvedSensitiveEvent =
    detection.events.find((e) => e.requestId === 'REQ-2026-APPR-0109') ?? null;

  return {
    datasetLabel: 'Synthetic Demonstration Evidence (Isolated Live Demo)',
    e04Count: e04.length,
    e18Count: e18.length,
    e19Count: e19.length,
    normalEvent,
    criticalEvent,
    approvedSensitiveEvent,
    totalAlerts: detection.alerts.length,
    metrics: detection.metrics,
  };
}
