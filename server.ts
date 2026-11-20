import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { ExplanationEngineMode, TriageStatus } from './src/types/sentinel.ts';
import {
  generateGroundedAiExplanation,
  getDeterministicExplanation,
} from './server/aiExplainer.ts';
import {
  buildQualitySummary,
  validateAndParseE04,
  validateAndParseE18,
  validateAndParseE19,
} from './server/ingest.ts';
import { buildIsolatedDemoBundle, sentinelStore } from './server/store.ts';
import { serializeSyntheticCsv } from './server/syntheticData.ts';

const PORT = Number(process.env.PORT) || 3000;
const VALID_TRIAGE: ReadonlySet<string> = new Set([
  'open',
  'in_review',
  'reviewed',
  'escalated',
]);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Health telemetry
  app.get('/api/health', (_req, res) => {
    const state = sentinelStore.getWorkspaceState();
    res.json({
      ok: true,
      ...state.health,
      datasetSource: state.datasetSource,
      datasetLabel: state.datasetLabel,
    });
  });

  // Full computed dashboard & evidence state
  app.get('/api/state', (_req, res) => {
    res.json(sentinelStore.getWorkspaceState());
  });

  // Isolated 6-stage demonstration bundle (never mixes with uploaded competition CSVs)
  app.get('/api/demo/bundle', (_req, res) => {
    res.json(buildIsolatedDemoBundle());
  });

  // Downloadable synthetic CSV templates matching E04, E18, E19 schemas
  app.get('/api/samples/:layer', (req, res) => {
    const layer = req.params.layer.toLowerCase();
    if (layer !== 'e04' && layer !== 'e18' && layer !== 'e19') {
      res.status(400).json({ error: 'Layer must be e04, e18, or e19.' });
      return;
    }
    const csv = serializeSyntheticCsv(layer);
    const filename = `api_sentinel_synthetic_${layer}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  });

  // Validate CSV payloads before running analysis
  app.post('/api/ingest/validate', (req, res) => {
    const { e04Csv, e18Csv, e19Csv } = req.body as {
      e04Csv?: string;
      e18Csv?: string;
      e19Csv?: string;
    };

    const e04Res = e04Csv ? validateAndParseE04(e04Csv) : null;
    const e18Res = e18Csv ? validateAndParseE18(e18Csv) : null;
    const e19Res = e19Csv ? validateAndParseE19(e19Csv) : null;

    res.json({
      e04: e04Res?.validation ?? null,
      e18: e18Res?.validation ?? null,
      e19: e19Res?.validation ?? null,
      quality: buildQualitySummary(e04Res, e18Res, e19Res),
    });
  });

  // Ingest validated CSVs and execute the full 12-signal + Isolation Forest engine
  app.post('/api/ingest/analyze', (req, res) => {
    const { e04Csv, e18Csv, e19Csv, datasetLabel } = req.body as {
      e04Csv?: string;
      e18Csv?: string;
      e19Csv?: string;
      datasetLabel?: string;
    };

    if (!e18Csv || !e18Csv.trim()) {
      res.status(400).json({
        error: 'E18 (or compatible E01) API Activity CSV is required to run detection analysis.',
      });
      return;
    }

    const e04Res = e04Csv && e04Csv.trim() ? validateAndParseE04(e04Csv) : null;
    const e18Res = validateAndParseE18(e18Csv);
    const e19Res = e19Csv && e19Csv.trim() ? validateAndParseE19(e19Csv) : null;

    if (!e18Res.validation.valid) {
      res.status(400).json({
        error:
          'E18 CSV failed schema validation. Ensure ts_utc, request_id, api_key_id, and endpoint columns are present with valid rows.',
        validation: e18Res.validation,
      });
      return;
    }

    if (e04Res && !e04Res.validation.valid) {
      res.status(400).json({
        error:
          'E04 CSV failed schema validation. Ensure credential_id, integration, scope, and status columns are present.',
        validation: e04Res.validation,
      });
      return;
    }

    if (e19Res && !e19Res.validation.valid) {
      res.status(400).json({
        error:
          'E19 CSV failed schema validation. Ensure change_id, vendor_name, and field columns are present.',
        validation: e19Res.validation,
      });
      return;
    }

    const quality = buildQualitySummary(e04Res, e18Res, e19Res);
    const updatedState = sentinelStore.ingestUploadedDataset({
      e04: e04Res?.records ?? [],
      e18: e18Res.records,
      e19: e19Res?.records ?? [],
      quality,
      label: datasetLabel?.trim() || 'Uploaded Competition Evidence Dataset',
    });

    res.json(updatedState);
  });

  // Load pre-built synthetic dataset cleanly
  app.post('/api/dataset/load-synthetic', (_req, res) => {
    res.json(sentinelStore.loadSyntheticDemo());
  });

  // Reset active analysis to empty state
  app.post('/api/dataset/reset', (_req, res) => {
    res.json(sentinelStore.resetToEmpty());
  });

  // Alert triage status persistence
  app.patch('/api/alerts/:requestId/triage', (req, res) => {
    const { requestId } = req.params;
    const { triageStatus } = req.body as { triageStatus?: string };
    if (!triageStatus || !VALID_TRIAGE.has(triageStatus)) {
      res.status(400).json({ error: 'Invalid triageStatus value.' });
      return;
    }
    res.json(sentinelStore.updateTriageStatus(requestId, triageStatus as TriageStatus));
  });

  // Append persistent investigation note
  app.post('/api/alerts/:requestId/notes', (req, res) => {
    const { requestId } = req.params;
    const { author, text } = req.body as { author?: string; text?: string };
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Investigation note text cannot be empty.' });
      return;
    }
    res.json(
      sentinelStore.addNote(
        requestId,
        author ?? 'Maya Lin (Lead SOC Analyst)',
        text
      )
    );
  });

  // Persist investigation conclusion (Facts vs Hypotheses)
  app.put('/api/alerts/:requestId/conclusion', (req, res) => {
    const { requestId } = req.params;
    const { confirmedFacts, openHypotheses, disposition } = req.body as {
      confirmedFacts?: string;
      openHypotheses?: string;
      disposition?:
        | 'under_investigation'
        | 'benign_verified'
        | 'policy_violation'
        | 'escalated_for_containment';
    };

    res.json(
      sentinelStore.updateConclusion(requestId, {
        confirmedFacts: confirmedFacts ?? '',
        openHypotheses: openHypotheses ?? '',
        disposition: disposition ?? 'under_investigation',
      })
    );
  });

  // Update engine settings (threshold, baseline fraction) & re-run detection
  app.put('/api/settings', (req, res) => {
    const { alertThreshold, baselineFraction } = req.body as {
      alertThreshold?: number;
      baselineFraction?: number;
    };
    res.json(
      sentinelStore.updateSettings({
        alertThreshold,
        baselineFraction,
      })
    );
  });

  // Grounded AI Risk Explanation (Gemini AI or Deterministic Rule Explainer)
  app.post('/api/ai/explain', async (req, res) => {
    const { requestId, mode } = req.body as {
      requestId?: string;
      mode?: ExplanationEngineMode;
    };

    if (!requestId) {
      res.status(400).json({ error: 'requestId is required.' });
      return;
    }

    const state = sentinelStore.getWorkspaceState();
    const event = state.events.find((e) => e.requestId === requestId);
    if (!event) {
      res.status(404).json({ error: `Event "${requestId}" was not found in the active dataset.` });
      return;
    }

    const requestedMode: ExplanationEngineMode =
      mode === 'deterministic' ? 'deterministic' : 'gemini';

    if (requestedMode === 'deterministic') {
      res.json({
        explanation: getDeterministicExplanation(event),
      });
      return;
    }

    try {
      const explanation = await generateGroundedAiExplanation(
        event,
        `${state.datasetSource.toUpperCase()} — ${state.datasetLabel}`
      );
      res.json({ explanation });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gemini API explanation request failed.';
      res.status(502).json({
        error: message,
        fallbackAvailable: true,
        deterministicExplanation: getDeterministicExplanation(event),
      });
    }
  });

  // Mount Vite middleware in development or serve built dist/ in production
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[API SENTINEL] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[API SENTINEL] Fatal startup error:', err);
  process.exit(1);
});
