import assert from 'node:assert/strict';
import {
  classifySeverity,
  generateDeterministicExplanation,
  ipMatchesRestriction,
  isRequestWithinScope,
  runDetectionEngine,
} from './detector.ts';
import { validateAndParseE04, validateAndParseE18, validateAndParseE19 } from './ingest.ts';
import { buildSyntheticDataset, serializeSyntheticCsv } from './syntheticData.ts';

function runTests() {
  console.log('Running API SENTINEL detection & ingestion verification tests...');

  // 1. Severity classification boundaries (independent of alert threshold)
  assert.equal(classifySeverity(0), 'LOW');
  assert.equal(classifySeverity(34), 'LOW');
  assert.equal(classifySeverity(35), 'MEDIUM');
  assert.equal(classifySeverity(54), 'MEDIUM');
  assert.equal(classifySeverity(55), 'HIGH');
  assert.equal(classifySeverity(79), 'HIGH');
  assert.equal(classifySeverity(80), 'CRITICAL');
  assert.equal(classifySeverity(100), 'CRITICAL');

  // 2. CIDR & IP allowlist matching
  assert.equal(ipMatchesRestriction('10.42.8.14', '10.42.8.0/24'), true);
  assert.equal(ipMatchesRestriction('185.214.68.42', '10.42.8.0/24'), false);
  assert.equal(ipMatchesRestriction('10.42.30.10', '10.42.30.10/32'), true);
  assert.equal(ipMatchesRestriction('10.42.30.99', '10.42.30.10/32'), false);

  // 3. Scope matching
  const scope = 'GET /api/v2/invoices, POST /api/v2/invoices/match, GET /api/v2/vendors';
  assert.equal(isRequestWithinScope('GET', '/api/v2/invoices', scope), true);
  assert.equal(isRequestWithinScope('POST', '/api/v2/invoices/match', scope), true);
  assert.equal(isRequestWithinScope('PUT', '/api/v2/vendors/bank-accounts', scope), false);
  assert.equal(isRequestWithinScope('DELETE', '/api/v2/invoices', scope), false);

  // 4. Full synthetic dataset run
  const { e04, e18, e19 } = buildSyntheticDataset();
  const config = {
    alertThreshold: 50,
    baselineFraction: 0.6,
    modelVersion: 'api-sentinel-iforest-v1.4',
    isolationForestContamination: 0.08,
    isolationForestTrees: 100,
  };
  const result = runDetectionEngine(e04, e18, e19, config);

  // Normal request stays score 0 / LOW / not alert
  const normalEv = result.events.find((e) => e.requestId === 'REQ-2026-DEMO-NORMAL');
  assert.ok(normalEv, 'Demo normal event must exist');
  assert.equal(normalEv.riskScore, 0);
  assert.equal(normalEv.severity, 'LOW');
  assert.equal(normalEv.isAlert, false);

  // Flagship critical event triggers multiple permission, behavior, E19 sensitive & missing approval signals and caps at 100
  const critEv = result.events.find((e) => e.requestId === 'REQ-2026-0118');
  assert.ok(critEv, 'Flagship critical event REQ-2026-0118 must exist');
  assert.equal(critEv.riskScore, 100, 'Final risk score must cap at 100');
  assert.equal(critEv.severity, 'CRITICAL');
  assert.equal(critEv.isAlert, true);
  assert.equal(critEv.linkedE19.length, 1);
  assert.equal(critEv.linkedE19[0].change_id, 'CHG-9041');
  const critCodes = new Set(critEv.signals.map((s) => s.code));
  assert.ok(critCodes.has('OUT_OF_SCOPE_ENDPOINT'));
  assert.ok(critCodes.has('IP_RESTRICTION_VIOLATION'));
  assert.ok(critCodes.has('NEW_BASELINE_IP'));
  assert.ok(critCodes.has('NEW_BASELINE_ENDPOINT'));
  assert.ok(critCodes.has('NEW_BASELINE_METHOD'));
  assert.ok(critCodes.has('NEW_BASELINE_HOUR'));
  assert.ok(critCodes.has('SENSITIVE_VENDOR_CHANGE'));
  assert.ok(critCodes.has('MISSING_APPROVAL_REF'));

  // Approved sensitive vendor change (REQ-2026-APPR-0109) gets +30 sensitive change ONLY (no missing approval!) -> LOW (30)
  const apprEv = result.events.find((e) => e.requestId === 'REQ-2026-APPR-0109');
  assert.ok(apprEv, 'Approved sensitive event must exist');
  assert.equal(apprEv.driftSummary.sensitiveChange, true);
  assert.equal(apprEv.driftSummary.missingApproval, false);
  assert.equal(apprEv.severity, 'LOW');
  assert.equal(apprEv.isAlert, false);

  // Unregistered credential receives +35
  const shadowEv = result.events.find((e) => e.requestId === 'REQ-2026-0131');
  assert.ok(shadowEv, 'Shadow credential event must exist');
  assert.ok(shadowEv.signals.some((s) => s.code === 'UNREGISTERED_CREDENTIAL' && s.weight === 35));

  // Revoked credential receives +30 status mismatch
  const revokedEv = result.events.find((e) => e.requestId === 'REQ-2026-0129');
  assert.ok(revokedEv, 'Revoked credential event must exist');
  assert.ok(revokedEv.signals.some((s) => s.code === 'CREDENTIAL_STATUS_MISMATCH' && s.weight === 30));

  // Isolation Forest invariant: NEVER sole cause of an alert even if threshold is 10
  const lowThreshResult = runDetectionEngine(e04, e18, e19, {
    ...config,
    alertThreshold: 10,
  });
  for (const ev of lowThreshResult.alerts) {
    assert.ok(
      ev.deterministicScore > 0,
      `Event ${ev.requestId} alerted without deterministic evidence`
    );
  }

  // Deterministic explainer contains all 6 epistemic fields
  const expl = generateDeterministicExplanation(critEv);
  assert.equal(expl.engine, 'deterministic');
  assert.ok(expl.decisionBreakdown.fact.includes('REQ-2026-0118'));
  assert.ok(expl.decisionBreakdown.correlation.includes('CHG-9041'));
  assert.ok(expl.decisionBreakdown.uncertainty.length > 20);

  // CSV round-trip validation
  const e04Parsed = validateAndParseE04(serializeSyntheticCsv('e04'));
  const e18Parsed = validateAndParseE18(serializeSyntheticCsv('e18'));
  const e19Parsed = validateAndParseE19(serializeSyntheticCsv('e19'));
  assert.equal(e04Parsed.validation.valid, true);
  assert.equal(e18Parsed.validation.valid, true);
  assert.equal(e19Parsed.validation.valid, true);
  assert.equal(e04Parsed.records.length, e04.length);
  assert.equal(e18Parsed.records.length, e18.length);
  assert.equal(e19Parsed.records.length, e19.length);

  console.log(
    `All tests passed! (${result.events.length} events analyzed, ${result.alerts.length} alerts raised, ${result.metrics.criticalCount} critical, ${result.metrics.highCount} high)`
  );
}

runTests();
