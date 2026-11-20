import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AnalyzedEvent,
  StructuredRiskExplanation,
} from '../src/types/sentinel.ts';
import { generateDeterministicExplanation } from './detector.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';

export function isGeminiConfigured(): boolean {
  const key = (process.env.GEMINI_API_KEY ?? '').trim();
  return key.length > 0 && key !== 'MY_GEMINI_API_KEY';
}

const explanationCache = new Map<string, StructuredRiskExplanation>();

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      timeout: 25000,
    },
  });
}

export async function generateGroundedAiExplanation(
  event: AnalyzedEvent,
  datasetLabel: string
): Promise<StructuredRiskExplanation> {
  if (!isGeminiConfigured()) {
    throw new Error(
      'Gemini API key is not configured on the server. Switch to the Deterministic Rule Explainer or configure GEMINI_API_KEY in Settings > Secrets.'
    );
  }

  const cacheKey = `${datasetLabel}|${event.requestId}|${event.riskScore}|${event.signals.map((s) => s.code).join(',')}`;
  const cached = explanationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Build strict structured evidence payload — LLM sees ONLY verified source fields
  const evidencePayload = {
    datasetContext: datasetLabel,
    e18ObservedActivity: {
      request_id: event.requestId,
      ts_utc: event.tsUtc,
      api_key_id: event.apiKeyId,
      caller_ip: event.callerIp,
      user_agent: event.userAgent,
      endpoint: event.endpoint,
      method: event.method,
      records_returned: event.recordsReturned,
      response_status: event.responseStatus,
    },
    e04ApprovedProfile: event.linkedE04
      ? {
          integration: event.linkedE04.integration,
          credential_id: event.linkedE04.credential_id,
          vendor: event.linkedE04.vendor,
          system: event.linkedE04.system,
          scope: event.linkedE04.scope,
          owner: event.linkedE04.owner,
          ip_restriction: event.linkedE04.ip_restriction,
          status: event.linkedE04.status,
          token_lifetime_days: event.linkedE04.token_lifetime_days,
        }
      : null,
    e19CorrelatedVendorChanges: event.linkedE19.map((c) => ({
      change_id: c.change_id,
      ts_utc: c.ts_utc,
      vendor_id: c.vendor_id,
      vendor_name: c.vendor_name,
      field: c.field,
      old_value: c.old_value,
      new_value: c.new_value,
      changed_by: c.changed_by,
      channel: c.channel,
      approval_ref: c.approval_ref || '(missing)',
      source_ip: c.source_ip,
      request_id: c.request_id,
    })),
    historicalBaseline: {
      baselineRequestsCount: event.baselineStats.totalBaselineRequests,
      knownIps: event.baselineStats.knownIps,
      knownEndpoints: event.baselineStats.knownEndpoints,
      knownMethods: event.baselineStats.knownMethods,
      knownHoursUtc: event.baselineStats.knownHours,
      avgRecordsReturned: event.baselineStats.avgRecords,
      maxRecordsReturned: event.baselineStats.maxRecords,
    },
    detectionResult: {
      riskScore: event.riskScore,
      rawUncappedScore: event.rawUncappedScore,
      severity: event.severity,
      isAlert: event.isAlert,
      isolationForestScore: event.isolationForestScore,
      isolationForestAtypical: event.isolationForestAtypical,
      triggeredSignals: event.signals.map((s) => ({
        code: s.code,
        label: s.label,
        weight: s.weight,
        reason: s.reason,
        evidenceRefs: s.evidenceRefs,
      })),
    },
  };

  const systemInstruction = [
    'You are API SENTINEL Risk Intelligence, an enterprise cybersecurity and fraud investigation analyst.',
    'You MUST base every single statement strictly on the supplied JSON evidence (E04, E18, E19, baseline, and triggered detection signals).',
    'STRICT PROHIBITIONS:',
    '- NEVER invent attackers, threat actor groups, malware, financial losses, approvals, IP owners, or E19 changes that do not appear in the JSON.',
    '- NEVER claim that an anomaly proves confirmed fraud or compromise.',
    '- If e19CorrelatedVendorChanges is empty, state clearly that no correlated E19 business-record change exists for this request_id.',
    'REQUIRED EPISTEMIC PRECISION:',
    '- FACT: State only exact observed values from E04, E18, and E19.',
    '- OBSERVATION: State exact deviations from approved permissions or historical baseline.',
    '- CORRELATION: State only verified links by credential_id or request_id.',
    '- INFERENCE: Offer cautious, bounded risk interpretation without declaring confirmed compromise.',
    '- UNCERTAINTY: Explicitly list what cannot be established from the supplied records alone.',
    '- ACTION: Recommend proportionate verification, evidence preservation, and authorized containment steps.',
    'Keep prose concise, executive-ready, crisp, and scannable.',
  ].join('\n');

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `Analyze this structured API SENTINEL detection event and produce a grounded investigation brief:\n\n${JSON.stringify(evidencePayload, null, 2)}`,
    config: {
      systemInstruction,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.LOW,
      },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          whatHappened: { type: Type.STRING },
          whyFlagged: { type: Type.STRING },
          businessImpact: { type: Type.STRING },
          recommendedInvestigation: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          decisionBreakdown: {
            type: Type.OBJECT,
            properties: {
              fact: { type: Type.STRING },
              observation: { type: Type.STRING },
              correlation: { type: Type.STRING },
              inference: { type: Type.STRING },
              uncertainty: { type: Type.STRING },
              action: { type: Type.STRING },
            },
            required: ['fact', 'observation', 'correlation', 'inference', 'uncertainty', 'action'],
          },
          limitationsNote: { type: Type.STRING },
        },
        required: [
          'headline',
          'whatHappened',
          'whyFlagged',
          'businessImpact',
          'recommendedInvestigation',
          'decisionBreakdown',
          'limitationsNote',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty explanation response.');
  }

  const parsed = JSON.parse(rawText) as {
    headline: string;
    whatHappened: string;
    whyFlagged: string;
    businessImpact: string;
    recommendedInvestigation: string[];
    decisionBreakdown: StructuredRiskExplanation['decisionBreakdown'];
    limitationsNote: string;
  };

  const evidenceInvolved = ['E18'];
  if (event.linkedE04) evidenceInvolved.unshift('E04');
  if (event.linkedE19.length > 0) evidenceInvolved.push('E19');

  const result: StructuredRiskExplanation = {
    engine: 'gemini',
    model: GEMINI_MODEL,
    generatedAt: new Date().toISOString(),
    riskLevel: event.severity,
    riskScore: event.riskScore,
    headline: parsed.headline,
    whatHappened: parsed.whatHappened,
    whyFlagged: parsed.whyFlagged,
    evidenceInvolved,
    businessImpact: parsed.businessImpact,
    recommendedInvestigation: parsed.recommendedInvestigation,
    decisionBreakdown: parsed.decisionBreakdown,
    limitationsNote: parsed.limitationsNote,
  };

  explanationCache.set(cacheKey, result);
  return result;
}

export function getDeterministicExplanation(
  event: AnalyzedEvent
): StructuredRiskExplanation {
  return generateDeterministicExplanation(event);
}
