import Papa from 'papaparse';
import type { E04Record, E18Record, E19Record } from '../src/types/sentinel.ts';

/**
 * Synthetic Demonstration Dataset (Clearly labeled as Synthetic Evidence)
 * Models an enterprise Fintech / ERP environment with 8 registered integrations (E04),
 * 5 days of chronological API activity (E18) establishing real baselines before drift events,
 * and 18 downstream vendor master changes (E19) including correlated unapproved bank edits.
 */
export function buildSyntheticDataset(): {
  e04: E04Record[];
  e18: E18Record[];
  e19: E19Record[];
} {
  const e04: E04Record[] = [
    {
      integration: 'InvoiceFlow AP Automation',
      credential_id: 'cred_inv_042',
      system: 'ERP-Finance',
      vendor: 'InvoiceFlow Systems Inc.',
      scope: 'GET /api/v2/invoices, POST /api/v2/invoices/match, GET /api/v2/vendors',
      owner: 'Elena Vance (AP Operations)',
      ip_restriction: '10.42.8.0/24',
      token_lifetime_days: 90,
      last_used: '2026-11-18T14:22:00Z',
      status: 'active',
    },
    {
      integration: 'PayrollConnect Sync',
      credential_id: 'cred_pay_108',
      system: 'HRIS-Core',
      vendor: 'NorthStar Payroll Ltd.',
      scope: 'GET /api/v2/employees/payroll, POST /api/v2/payroll/batches',
      owner: 'Marcus Chen (People Ops)',
      ip_restriction: '10.42.14.0/24',
      token_lifetime_days: 60,
      last_used: '2026-11-18T16:05:00Z',
      status: 'active',
    },
    {
      integration: 'ERP VendorMaster Bridge',
      credential_id: 'cred_vm_205',
      system: 'Vendor-Master',
      vendor: 'Meridian ERP Cloud',
      scope: 'GET /api/v2/vendors, PATCH /api/v2/vendors/profile, PATCH /api/v2/vendors/bank-accounts',
      owner: 'Priya Nair (Global Procurement)',
      ip_restriction: '10.42.22.0/24',
      token_lifetime_days: 90,
      last_used: '2026-11-18T15:40:00Z',
      status: 'active',
    },
    {
      integration: 'TreasuryBatch Settlement',
      credential_id: 'cred_trs_311',
      system: 'Payment-Rails',
      vendor: 'ClearLedger Treasury',
      scope: 'GET /api/v2/payouts/schedule, POST /api/v2/payouts/reconcile',
      owner: 'David Okafor (Treasury Desk)',
      ip_restriction: '10.42.30.10/32',
      token_lifetime_days: 30,
      last_used: '2026-11-18T11:30:00Z',
      status: 'active',
    },
    {
      integration: 'AuditReadOnly BI Feed',
      credential_id: 'cred_bi_409',
      system: 'Data-Warehouse',
      vendor: 'Vantage Analytics Corp.',
      scope: 'GET /api/v2/reports/spend, GET /api/v2/invoices/summary',
      owner: 'Hannah Lindqvist (Finance BI)',
      ip_restriction: '10.42.45.0/24',
      token_lifetime_days: 180,
      last_used: '2026-11-18T12:15:00Z',
      status: 'active',
    },
    {
      integration: 'TaxCompliance Gateway',
      credential_id: 'cred_tax_512',
      system: 'Tax-Engine',
      vendor: 'Avalon TaxTech',
      scope: 'GET /api/v2/tax/filings, POST /api/v2/tax/validate',
      owner: 'Lucas Almeida (Tax Operations)',
      ip_restriction: '10.42.51.0/24',
      token_lifetime_days: 90,
      last_used: '2026-11-18T13:10:00Z',
      status: 'active',
    },
    {
      integration: 'LogisticsEDI Fulfillment',
      credential_id: 'cred_edi_604',
      system: 'Supply-Chain',
      vendor: 'FreightGrid EDI',
      scope: 'GET /api/v2/shipments, POST /api/v2/shipments/receipts',
      owner: 'Nadia Kowalski (Supply Chain)',
      ip_restriction: '10.42.60.0/24',
      token_lifetime_days: 120,
      last_used: '2026-11-18T10:48:00Z',
      status: 'active',
    },
    {
      integration: 'LegacyPartner Sync',
      credential_id: 'cred_leg_009',
      system: 'ERP-Finance',
      vendor: 'BridgeWorks Legacy',
      scope: 'GET /api/v2/invoices',
      owner: 'Unassigned (Decommissioned Q3)',
      ip_restriction: '10.42.90.0/24',
      token_lifetime_days: 365,
      last_used: '2026-08-11T09:15:00Z',
      status: 'revoked',
    },
  ];

  const e18: E18Record[] = [];
  let seq = 1001;

  const pushEvent = (
    ts_utc: string,
    api_key_id: string,
    caller_ip: string,
    user_agent: string,
    endpoint: string,
    method: string,
    records_returned: number,
    status: number,
    customRequestId?: string
  ) => {
    const request_id = customRequestId ?? `REQ-2026-${String(seq++).padStart(4, '0')}`;
    e18.push({
      ts_utc,
      request_id,
      api_key_id,
      caller_ip,
      user_agent,
      endpoint,
      method,
      records_returned,
      status,
    });
  };

  // Generate 4 days of clean normal baseline traffic (Nov 14 – Nov 17) + normal Nov 18 traffic
  const baselineProfiles = [
    {
      key: 'cred_inv_042',
      ips: ['10.42.8.14', '10.42.8.15'],
      ua: 'InvoiceFlow-Connector/4.2.1',
      calls: [
        { endpoint: '/api/v2/invoices', method: 'GET', baseRec: 32 },
        { endpoint: '/api/v2/invoices/match', method: 'POST', baseRec: 14 },
        { endpoint: '/api/v2/vendors', method: 'GET', baseRec: 22 },
      ],
      hours: [9, 10, 11, 13, 14, 15, 16],
    },
    {
      key: 'cred_pay_108',
      ips: ['10.42.14.21'],
      ua: 'NorthStar-PayrollSync/2.8',
      calls: [
        { endpoint: '/api/v2/employees/payroll', method: 'GET', baseRec: 48 },
        { endpoint: '/api/v2/payroll/batches', method: 'POST', baseRec: 6 },
      ],
      hours: [8, 10, 14, 16],
    },
    {
      key: 'cred_vm_205',
      ips: ['10.42.22.14', '10.42.22.18'],
      ua: 'Meridian-VendorBridge/5.1',
      calls: [
        { endpoint: '/api/v2/vendors', method: 'GET', baseRec: 35 },
        { endpoint: '/api/v2/vendors/profile', method: 'PATCH', baseRec: 2 },
        { endpoint: '/api/v2/vendors/bank-accounts', method: 'PATCH', baseRec: 1 },
      ],
      hours: [9, 11, 13, 15],
    },
    {
      key: 'cred_trs_311',
      ips: ['10.42.30.10'],
      ua: 'ClearLedger-SettlementAgent/3.0',
      calls: [
        { endpoint: '/api/v2/payouts/schedule', method: 'GET', baseRec: 24 },
        { endpoint: '/api/v2/payouts/reconcile', method: 'POST', baseRec: 18 },
      ],
      hours: [9, 11, 14, 16],
    },
    {
      key: 'cred_bi_409',
      ips: ['10.42.45.12'],
      ua: 'Vantage-BI-Extractor/6.4',
      calls: [
        { endpoint: '/api/v2/reports/spend', method: 'GET', baseRec: 52 },
        { endpoint: '/api/v2/invoices/summary', method: 'GET', baseRec: 41 },
      ],
      hours: [8, 12, 16],
    },
    {
      key: 'cred_tax_512',
      ips: ['10.42.51.9'],
      ua: 'Avalon-TaxClient/1.9',
      calls: [
        { endpoint: '/api/v2/tax/filings', method: 'GET', baseRec: 19 },
        { endpoint: '/api/v2/tax/validate', method: 'POST', baseRec: 8 },
      ],
      hours: [10, 13, 15],
    },
    {
      key: 'cred_edi_604',
      ips: ['10.42.60.31'],
      ua: 'FreightGrid-EDI/3.5',
      calls: [
        { endpoint: '/api/v2/shipments', method: 'GET', baseRec: 44 },
        { endpoint: '/api/v2/shipments/receipts', method: 'POST', baseRec: 15 },
      ],
      hours: [9, 12, 15, 17],
    },
  ];

  const days = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];
  days.forEach((day, dayIdx) => {
    baselineProfiles.forEach((prof, pIdx) => {
      // 3-4 clean calls per integration per day during business hours
      const callsPerDay = dayIdx < 4 ? 4 : 3;
      for (let i = 0; i < callsPerDay; i++) {
        const hour = prof.hours[(dayIdx + i) % prof.hours.length];
        const minute = (pIdx * 7 + i * 13 + dayIdx * 5) % 58;
        const second = (pIdx * 11 + i * 17) % 59;
        const call = prof.calls[(dayIdx + i) % prof.calls.length];
        const ip = prof.ips[(dayIdx + i) % prof.ips.length];
        const jitter = ((dayIdx * 3 + i * 5 + pIdx) % 9) - 4;
        const rec = Math.max(1, call.baseRec + jitter);
        const ts = `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}Z`;
        pushEvent(ts, prof.key, ip, prof.ua, call.endpoint, call.method, rec, 200);
      }
    });
  });

  // Explicit clean reference request for Live Demo Stage 1 (Normal Activity)
  pushEvent(
    '2026-11-18T10:15:12Z',
    'cred_inv_042',
    '10.42.8.14',
    'InvoiceFlow-Connector/4.2.1',
    '/api/v2/invoices',
    'GET',
    34,
    200,
    'REQ-2026-DEMO-NORMAL'
  );

  // Explicit authorized sensitive vendor update WITH approval reference (shows governance working cleanly)
  pushEvent(
    '2026-11-18T11:22:40Z',
    'cred_vm_205',
    '10.42.22.14',
    'Meridian-VendorBridge/5.1',
    '/api/v2/vendors/bank-accounts',
    'PATCH',
    1,
    200,
    'REQ-2026-APPR-0109'
  );

  // Explicit routine approved vendor profile update (contact_email)
  pushEvent(
    '2026-11-17T13:45:10Z',
    'cred_vm_205',
    '10.42.22.18',
    'Meridian-VendorBridge/5.1',
    '/api/v2/vendors/profile',
    'PATCH',
    1,
    200,
    'REQ-2026-PROF-0104'
  );

  // --- ANOMALOUS / PERMISSION-DRIFT SCENARIOS (Nov 18 evaluation window) ---

  // 1. FLAGSHIP CRITICAL INCIDENT (Stages 2–6 of Live Demo):
  // InvoiceFlow AP Automation (approved only for invoices + GET vendors inside 10.42.8.0/24)
  // executes PUT /api/v2/vendors/bank-accounts from external IP 185.214.68.42 at 02:14 UTC
  // Correlates via REQ-2026-0118 to unapproved E19 IBAN bank account modification!
  pushEvent(
    '2026-11-18T02:14:22Z',
    'cred_inv_042',
    '185.214.68.42',
    'python-requests/2.31.0',
    '/api/v2/vendors/bank-accounts',
    'PUT',
    1,
    200,
    'REQ-2026-0118'
  );

  // 2. SECOND CRITICAL CORRELATED EVENT (14 minutes later, same external IP & credential)
  pushEvent(
    '2026-11-18T02:28:09Z',
    'cred_inv_042',
    '185.214.68.42',
    'python-requests/2.31.0',
    '/api/v2/vendors/bank-accounts',
    'PUT',
    1,
    200,
    'REQ-2026-0124'
  );

  // 3. CRITICAL REVOKED CREDENTIAL REUSE + UNAPPROVED PAYOUT OVERRIDE
  pushEvent(
    '2026-11-18T03:06:51Z',
    'cred_leg_009',
    '198.51.100.77',
    'curl/8.4.0',
    '/api/v2/vendors/payout-override',
    'POST',
    340,
    200,
    'REQ-2026-0129'
  );

  // 4. HIGH-RISK BULK EXFILTRATION / SCOPE DRIFT ON BI FEED
  // AuditReadOnly BI Feed calls out-of-scope bank-accounts endpoint returning 4,820 records
  pushEvent(
    '2026-11-18T04:19:33Z',
    'cred_bi_409',
    '10.42.45.199',
    'Vantage-BI-Extractor/6.4',
    '/api/v2/vendors/bank-accounts',
    'GET',
    4820,
    200,
    'REQ-2026-0115'
  );

  // 5. HIGH-RISK UNREGISTERED SHADOW CREDENTIAL
  pushEvent(
    '2026-11-18T03:41:17Z',
    'cred_shadow_999',
    '203.0.113.84',
    'Go-http-client/2.0',
    '/api/v2/vendors/bank-accounts',
    'GET',
    1280,
    200,
    'REQ-2026-0131'
  );

  // 6. HIGH-RISK TREASURY STRICT /32 IP RESTRICTION VIOLATION OFF-HOURS
  pushEvent(
    '2026-11-18T23:44:05Z',
    'cred_trs_311',
    '10.42.30.99',
    'ClearLedger-SettlementAgent/3.0',
    '/api/v2/payouts/reconcile',
    'POST',
    195,
    200,
    'REQ-2026-0121'
  );

  // 7. MEDIUM-RISK LOGISTICS SCOPE PROBING (New out-of-scope endpoint from valid CIDR)
  pushEvent(
    '2026-11-18T14:52:44Z',
    'cred_edi_604',
    '10.42.60.31',
    'FreightGrid-EDI/3.5',
    '/api/v2/invoices',
    'GET',
    42,
    200,
    'REQ-2026-0127'
  );

  // 8. MEDIUM-RISK PAYROLL OFF-HOURS NEW IP INSIDE CIDR + VOLUME BUMP
  pushEvent(
    '2026-11-18T01:18:19Z',
    'cred_pay_108',
    '10.42.14.88',
    'NorthStar-PayrollSync/2.8',
    '/api/v2/employees/payroll',
    'GET',
    620,
    200,
    'REQ-2026-0134'
  );

  // Sort E18 chronologically by UTC timestamp
  e18.sort((a, b) => Date.parse(a.ts_utc) - Date.parse(b.ts_utc));

  const e19: E19Record[] = [
    {
      ts_utc: '2026-11-14T11:08:14Z',
      change_id: 'CHG-9021',
      vendor_id: 'VND-1042',
      vendor_name: 'Helios Cloud Packaging',
      field: 'contact_email',
      old_value: 'billing@heliospack.example',
      new_value: 'ap-desk@heliospack.example',
      changed_by: 'svc_meridian_bridge',
      channel: 'VendorMaster-API',
      approval_ref: 'APR-2026-4102',
      source_ip: '10.42.22.14',
      request_id: '',
    },
    {
      ts_utc: '2026-11-15T09:42:03Z',
      change_id: 'CHG-9025',
      vendor_id: 'VND-1088',
      vendor_name: 'Kestrel Industrial Logistics',
      field: 'billing_address',
      old_value: '410 Harbor Blvd, Rotterdam',
      new_value: '820 Maasvlakte Way, Rotterdam',
      changed_by: 'p.nair@enterprise.internal',
      channel: 'ERP-Admin-Portal',
      approval_ref: 'APR-2026-4188',
      source_ip: '10.12.4.55',
      request_id: '',
    },
    {
      ts_utc: '2026-11-16T14:15:30Z',
      change_id: 'CHG-9029',
      vendor_id: 'VND-1114',
      vendor_name: 'Solstice Microelectronics',
      field: 'payment_terms',
      old_value: 'NET-45',
      new_value: 'NET-30',
      changed_by: 'e.vance@enterprise.internal',
      channel: 'ERP-Admin-Portal',
      approval_ref: 'APR-2026-4290',
      source_ip: '10.12.4.29',
      request_id: '',
    },
    {
      ts_utc: '2026-11-17T13:45:12Z',
      change_id: 'CHG-9034',
      vendor_id: 'VND-1160',
      vendor_name: 'Vanguard Steel & Alloys',
      field: 'contact_email',
      old_value: 'ar@vanguardsteel.example',
      new_value: 'finance@vanguardsteel.example',
      changed_by: 'cred_vm_205',
      channel: 'VendorMaster-API',
      approval_ref: 'APR-2026-4355',
      source_ip: '10.42.22.18',
      request_id: 'REQ-2026-PROF-0104',
    },
    {
      ts_utc: '2026-11-18T11:22:42Z',
      change_id: 'CHG-9038',
      vendor_id: 'VND-1201',
      vendor_name: 'Boreal Medical Instruments',
      field: 'bank_account_iban',
      old_value: 'DE89370400440532013000',
      new_value: 'DE44500105175407324931',
      changed_by: 'cred_vm_205',
      channel: 'VendorMaster-API',
      approval_ref: 'APR-2026-4412',
      source_ip: '10.42.22.14',
      request_id: 'REQ-2026-APPR-0109',
    },
    // CORRELATED CRITICAL CHANGE #1 — Linked to REQ-2026-0118, MISSING APPROVAL REF!
    {
      ts_utc: '2026-11-18T02:14:24Z',
      change_id: 'CHG-9041',
      vendor_id: 'VND-1007',
      vendor_name: 'Nordic Industrial Supply GmbH',
      field: 'bank_account_iban',
      old_value: 'DE75512108001245126199',
      new_value: 'CY17002001280000001200527600',
      changed_by: 'cred_inv_042',
      channel: 'REST-API-Gateway',
      approval_ref: '',
      source_ip: '185.214.68.42',
      request_id: 'REQ-2026-0118',
    },
    // CORRELATED CRITICAL CHANGE #2 — Linked to REQ-2026-0124, MISSING APPROVAL REF!
    {
      ts_utc: '2026-11-18T02:28:11Z',
      change_id: 'CHG-9042',
      vendor_id: 'VND-1029',
      vendor_name: 'Apex Precision Components',
      field: 'routing_number',
      old_value: '021000021',
      new_value: '084009519',
      changed_by: 'cred_inv_042',
      channel: 'REST-API-Gateway',
      approval_ref: '',
      source_ip: '185.214.68.42',
      request_id: 'REQ-2026-0124',
    },
    // CORRELATED CRITICAL CHANGE #3 — Linked to REQ-2026-0129 (Revoked Legacy Credential), MISSING APPROVAL REF!
    {
      ts_utc: '2026-11-18T03:06:53Z',
      change_id: 'CHG-9045',
      vendor_id: 'VND-1095',
      vendor_name: 'Stratos Robotics Manufacturing',
      field: 'payout_destination',
      old_value: 'ACH-US-CHASE-8812',
      new_value: 'WIRE-OFFSHORE-9941',
      changed_by: 'cred_leg_009',
      channel: 'REST-API-Gateway',
      approval_ref: '',
      source_ip: '198.51.100.77',
      request_id: 'REQ-2026-0129',
    },
    {
      ts_utc: '2026-11-18T09:12:18Z',
      change_id: 'CHG-9048',
      vendor_id: 'VND-1133',
      vendor_name: 'Redwood Cloud Infrastructure',
      field: 'tax_id_status',
      old_value: 'pending_review',
      new_value: 'verified_w9',
      changed_by: 'l.almeida@enterprise.internal',
      channel: 'Tax-Compliance-UI',
      approval_ref: 'APR-2026-4418',
      source_ip: '10.12.9.40',
      request_id: '',
    },
    {
      ts_utc: '2026-11-18T13:30:05Z',
      change_id: 'CHG-9051',
      vendor_id: 'VND-1182',
      vendor_name: 'Cascade Freight Partners',
      field: 'remittance_email',
      old_value: 'remit@cascadefreight.example',
      new_value: 'settlements@cascadefreight.example',
      changed_by: 'n.kowalski@enterprise.internal',
      channel: 'ERP-Admin-Portal',
      approval_ref: 'APR-2026-4425',
      source_ip: '10.12.7.12',
      request_id: '',
    },
    // Standalone sensitive portal change without request_id (unlinked to API E18 — proves we never fabricate edges)
    {
      ts_utc: '2026-11-18T15:04:49Z',
      change_id: 'CHG-9054',
      vendor_id: 'VND-1219',
      vendor_name: 'Atlas Industrial Coatings',
      field: 'bank_account_holder',
      old_value: 'Atlas Industrial Coatings LLC',
      new_value: 'Atlas Coatings Holding Group',
      changed_by: 'manual_ops_temp',
      channel: 'ERP-Admin-Portal',
      approval_ref: '',
      source_ip: '10.12.14.83',
      request_id: '',
    },
    {
      ts_utc: '2026-11-18T16:18:22Z',
      change_id: 'CHG-9057',
      vendor_id: 'VND-1244',
      vendor_name: 'Orion Packaging Supplies',
      field: 'billing_phone',
      old_value: '+1-415-555-0142',
      new_value: '+1-415-555-0198',
      changed_by: 'p.nair@enterprise.internal',
      channel: 'ERP-Admin-Portal',
      approval_ref: 'APR-2026-4431',
      source_ip: '10.12.4.55',
      request_id: '',
    },
  ];

  e19.sort((a, b) => Date.parse(a.ts_utc) - Date.parse(b.ts_utc));

  return { e04, e18, e19 };
}

export function serializeSyntheticCsv(layer: 'e04' | 'e18' | 'e19'): string {
  const data = buildSyntheticDataset();
  if (layer === 'e04') {
    return Papa.unparse(data.e04);
  }
  if (layer === 'e18') {
    return Papa.unparse(data.e18);
  }
  return Papa.unparse(data.e19);
}
