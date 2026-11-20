import { jsPDF } from 'jspdf';
import Papa from 'papaparse';
import type {
  AnalyzedEvent,
  StructuredRiskExplanation,
  WorkspaceStateResponse,
} from '../types/sentinel';

export function downloadCsvFile(
  filename: string,
  rows: Record<string, string | number | boolean | null | undefined>[]
): void {
  const csv = Papa.unparse(rows);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function addWrappedSection(
  doc: jsPDF,
  title: string,
  body: string,
  yRef: { y: number },
  accentRgb: [number, number, number] = [81, 70, 229]
) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;

  if (yRef.y > pageHeight - 32) {
    doc.addPage();
    yRef.y = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.text(title, margin, yRef.y);
  yRef.y += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(23, 32, 51);
  const lines = doc.splitTextToSize(body, maxWidth) as string[];
  for (const line of lines) {
    if (yRef.y > pageHeight - 18) {
      doc.addPage();
      yRef.y = 20;
    }
    doc.text(line, margin, yRef.y);
    yRef.y += 4.6;
  }
  yRef.y += 4;
}

export function exportAlertInvestigationPdf(
  event: AnalyzedEvent,
  explanation: StructuredRiskExplanation | null,
  datasetLabel: string,
  datasetSource: string
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 16;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Branded Header Banner
  doc.setFillColor(81, 70, 229);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('API SENTINEL', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Detect the Drift. Protect the Trust. — Alert Investigation Report', margin, 18.5);
  doc.setFontSize(8.5);
  doc.text(`Generated UTC: ${new Date().toISOString()}`, pageWidth - margin, 12, {
    align: 'right',
  });
  doc.text(`Dataset: ${datasetSource.toUpperCase()}`, pageWidth - margin, 18.5, {
    align: 'right',
  });

  const yRef = { y: 38 };

  addWrappedSection(
    doc,
    '1. Incident & Alert Summary',
    [
      `Request ID: ${event.requestId}`,
      `Integration: ${event.integrationName} (${event.vendor})`,
      `Credential ID: ${event.apiKeyId} | System: ${event.system} | Owner: ${event.owner}`,
      `Timestamp (UTC): ${event.tsUtc}`,
      `Observed Call: ${event.method} ${event.endpoint} | Caller IP: ${event.callerIp} | Returned: ${event.recordsReturned} records | HTTP ${event.responseStatus}`,
      `Risk Score: ${event.riskScore}/100 (Uncapped: ${event.rawUncappedScore}) | Severity: ${event.severity} | Triage Status: ${event.triageStatus.toUpperCase()}`,
      `Dataset Provenance: ${datasetLabel}`,
    ].join('\n'),
    yRef
  );

  const signalLines =
    event.signals.length > 0
      ? event.signals
          .map(
            (s, i) =>
              `${i + 1}. [+${s.weight}] ${s.label} — ${s.reason} (Refs: ${s.evidenceRefs.join(', ')})`
          )
          .join('\n')
      : 'No risk signals triggered.';

  addWrappedSection(doc, '2. Detection Signal Breakdown', signalLines, yRef, [37, 99, 235]);

  const evidenceSummary: string[] = [];
  if (event.linkedE04) {
    evidenceSummary.push(
      `E04 (${event.linkedE04.credential_id}): Approved Scope = ${event.linkedE04.scope} | IP Restriction = ${event.linkedE04.ip_restriction} | Status = ${event.linkedE04.status}`
    );
  } else {
    evidenceSummary.push(
      `E04: Credential "${event.apiKeyId}" is NOT present in the approved E04 integration register.`
    );
  }
  evidenceSummary.push(
    `E18 (${event.requestId}): ${event.method} ${event.endpoint} from ${event.callerIp} (${event.userAgent}) at ${event.tsUtc}.`
  );
  if (event.linkedE19.length > 0) {
    for (const c of event.linkedE19) {
      evidenceSummary.push(
        `E19 (${c.change_id}): Vendor ${c.vendor_name} (${c.vendor_id}) field "${c.field}" changed "${c.old_value}" -> "${c.new_value}" | approval_ref: ${c.approval_ref || 'MISSING'}`
      );
    }
  } else {
    evidenceSummary.push('E19: No correlated vendor-record change linked to this request_id.');
  }

  addWrappedSection(
    doc,
    '3. Correlated Evidence References (E04 / E18 / E19)',
    evidenceSummary.join('\n'),
    yRef,
    [13, 148, 136]
  );

  if (explanation) {
    addWrappedSection(
      doc,
      `4. Explainable Intelligence (${explanation.engine === 'gemini' ? `Gemini AI · ${explanation.model}` : 'Deterministic Rule Engine'})`,
      [
        `FACT: ${explanation.decisionBreakdown.fact}`,
        `OBSERVATION: ${explanation.decisionBreakdown.observation}`,
        `CORRELATION: ${explanation.decisionBreakdown.correlation}`,
        `INFERENCE: ${explanation.decisionBreakdown.inference}`,
        `UNCERTAINTY: ${explanation.decisionBreakdown.uncertainty}`,
        `ACTION: ${explanation.decisionBreakdown.action}`,
      ].join('\n\n'),
      yRef,
      [147, 51, 234]
    );

    addWrappedSection(
      doc,
      '5. Recommended Defensive Actions',
      explanation.recommendedInvestigation.map((item, idx) => `${idx + 1}. ${item}`).join('\n'),
      yRef,
      [22, 163, 74]
    );
  }

  if (event.conclusion) {
    addWrappedSection(
      doc,
      '6. Analyst Conclusion (Facts vs. Hypotheses)',
      [
        `Disposition: ${event.conclusion.disposition}`,
        `Confirmed Facts: ${event.conclusion.confirmedFacts}`,
        `Open Hypotheses: ${event.conclusion.openHypotheses}`,
      ].join('\n'),
      yRef
    );
  }

  if (event.notes.length > 0) {
    addWrappedSection(
      doc,
      '7. Investigation Notes',
      event.notes.map((n) => `[${n.createdAt}] ${n.author}: ${n.text}`).join('\n'),
      yRef
    );
  }

  addWrappedSection(
    doc,
    'Important Limitations & Uncertainty Notice',
    'API SENTINEL risk scores indicate permission-to-behavior drift and missing governance artifacts requiring analyst verification. An elevated score or anomaly does NOT independently confirm fraud, compromise, or financial loss unless corroborated by external investigation.',
    yRef,
    [220, 38, 38]
  );

  doc.save(`API_SENTINEL_Alert_${event.requestId}.pdf`);
}

export function exportExecutivePosturePdf(
  state: WorkspaceStateResponse,
  filteredAlerts: AnalyzedEvent[],
  filterSummary: string
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 16;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(81, 70, 229);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('API SENTINEL', margin, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Executive API Security Posture & Evidence Correlation Report', margin, 18.5);
  doc.setFontSize(8.5);
  doc.text(`Generated UTC: ${new Date().toISOString()}`, pageWidth - margin, 12, {
    align: 'right',
  });
  doc.text(`Provenance: ${state.datasetSource.toUpperCase()}`, pageWidth - margin, 18.5, {
    align: 'right',
  });

  const yRef = { y: 38 };

  addWrappedSection(
    doc,
    '1. Analysis Summary & Dataset Provenance',
    [
      `Dataset: ${state.datasetLabel} (${state.datasetSource.toUpperCase()})`,
      `Applied Report Filters: ${filterSummary}`,
      `Engine Configuration: Alert Threshold >= ${state.config.alertThreshold} | Baseline Split = ${Math.round(state.config.baselineFraction * 100)}% | Model = ${state.config.modelVersion}`,
      `Last Analyzed: ${state.lastAnalyzedAt ?? 'Not yet analyzed'}`,
    ].join('\n'),
    yRef
  );

  const m = state.metrics;
  addWrappedSection(
    doc,
    '2. Risk Overview & Key Indicators',
    [
      `Registered Integrations (E04): ${m.totalIntegrations} (${m.activeIntegrations} active, ${m.inactiveOrRevokedIntegrations} inactive/revoked, ${m.unregisteredCredentialsObserved} unregistered observed)`,
      `Total Observed API Events (E18): ${m.totalApiEvents}`,
      `Alerts Above Threshold: ${m.totalAlerts} (Critical: ${m.criticalCount} | High: ${m.highCount} | Medium: ${m.mediumCount} | Low: ${m.lowCount})`,
      `Vendor Master Changes (E19): ${m.vendorRecordChanges} total | ${m.sensitiveVendorChanges} sensitive | ${m.missingApprovalCount} missing approval_ref | ${m.correlatedVendorChanges} verified E18 links`,
      `Suspicious Integrations Flagged: ${m.suspiciousIntegrationsCount}`,
    ].join('\n'),
    yRef,
    [37, 99, 235]
  );

  const topSignals = state.signalFrequencies
    .filter((s) => s.count > 0)
    .map((s) => `- ${s.label} (+${s.weight}): ${s.count} event(s)`)
    .join('\n');

  addWrappedSection(
    doc,
    '3. Detection Signal Frequency',
    topSignals || 'No risk signals triggered in current dataset.',
    yRef,
    [13, 148, 136]
  );

  const alertLines =
    filteredAlerts.length > 0
      ? filteredAlerts
          .slice(0, 15)
          .map(
            (a, idx) =>
              `${idx + 1}. [${a.severity} ${a.riskScore}/100] ${a.requestId} | ${a.integrationName} (${a.apiKeyId}) | ${a.method} ${a.endpoint} from ${a.callerIp} | Reasons: ${a.signals.map((s) => `${s.label} (+${s.weight})`).join('; ')}${a.linkedE19.length > 0 ? ` | Linked E19: ${a.linkedE19.map((c) => `${c.change_id} [${c.field}]`).join(', ')}` : ''}`
          )
          .join('\n\n')
      : 'No alerts matched the selected filter criteria.';

  addWrappedSection(doc, '4. Prioritized Alert Findings & Evidence References', alertLines, yRef, [147, 51, 234]);

  addWrappedSection(
    doc,
    '5. Recommended Defensive Priorities',
    [
      '1. Verify all CRITICAL and HIGH alerts with their registered E04 integration owners before clearing pending vendor master updates.',
      '2. Enforce API gateway IP allowlists and method/endpoint scoping directly aligned with the E04 register.',
      '3. Decommission or immediately rotate credentials marked revoked/inactive or observed as unregistered shadow keys.',
      '4. Require immutable approval_ref identifiers for all bank, IBAN, routing, and payout modifications in E19.',
    ].join('\n'),
    yRef,
    [22, 163, 74]
  );

  addWrappedSection(
    doc,
    '6. Important Limitations & Uncertainty',
    'This report reflects only the supplied E04, E18, and E19 source records. Correlation is strictly limited to exact matching identifiers (credential_id and request_id). Elevated risk scores highlight behavioral and permission drift requiring human review and do not establish confirmed fraud or financial loss.',
    yRef,
    [220, 38, 38]
  );

  doc.save(`API_SENTINEL_Security_Posture_${new Date().toISOString().slice(0, 10)}.pdf`);
}
