API SENTINEL
Permission-to-Behavior Drift Detection for Third-Party API Integrations
Approved access does not automatically mean approved behavior.
API SENTINEL is a defense-focused security monitoring prototype that identifies when trusted third-party API integrations behave outside their approved permissions or established activity patterns. It correlates approved integration records, observed API activity, and vendor-record changes to generate explainable risk scores and investigation alerts.
Table of Contents
Project Overview
Key Features
Architecture
Technology Stack
Project Structure
Prerequisites
Installation and Setup
Running the Demo
Using Your Own CSV Evidence
API Endpoints
Detection Methodology
Risk Score and Severity
Database
Important Notes and Limitations
Team
Project Overview
Third-party integrations often have legitimate API credentials, but those credentials can still be misused or begin operating beyond their approved purpose. API SENTINEL compares three evidence sources:
E04 — Approved integration register: credential identity, vendor, system, permissions/scope, owner, IP restrictions, and status.
E18 — Observed API activity: request time, credential, caller IP, endpoint, HTTP method, and records returned.
E19 — Vendor-record changes: changed vendor fields, approval references, source IP, and associated request ID.
The application normalizes and correlates these records, builds a behavioral baseline, evaluates deviations, and presents explainable alerts in a web dashboard.
The included demo records are synthetic and intended only for demonstration.
Key Features
Integration and credential inventory.
Comparison of observed API activity against approved scope and IP restrictions.
Per-credential behavioral baselines.
Detection of new IP addresses, endpoints, HTTP methods, and activity-hour patterns.
Detection of unusually high record-return volumes.
Correlation of API requests with sensitive vendor-record changes.
Checks for missing approval references on sensitive changes.
Supporting anomaly scoring with an Isolation Forest model.
Explainable risk scores, severity levels, and evidence references.
Dashboard metrics, risk distribution, integration list, and priority alerts.
CSV ingestion endpoint for analysis of supplied evidence.
PostgreSQL persistence and Docker Compose deployment.
Architecture
       E04: Approved Integrations
                  |
       E18: API Activity Logs
                  |
       E19: Vendor Record Changes
                  |
                  v
          Data Ingestion
                  |
                  v
             PostgreSQL
                  |
                  v
       Normalization and Mapping
                  |
                  v
        Behavioral Baseline
                  |
                  v
       Rule-Based Detection
                  +
       Isolation Forest Signal
                  |
                  v
       Explainable Risk Scoring
                  |
                  v
          FastAPI Backend
                  |
                  v
          React Dashboard
                  |
                  v
       Investigation / Containment
​
Technology Stack
Component
Technology
Frontend
React, Vite
Charts
Recharts
Icons
Lucide React
Backend
Python, FastAPI
Data processing
Pandas, NumPy
Anomaly detection
Scikit-learn Isolation Forest
Database
PostgreSQL 16
API server
Uvicorn
Deployment
Docker, Docker Compose
Project Structure
API_SENTINEL_Full_Project/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   └── services/
│   │       ├── detector.py
│   │       └── ingest.py
│   ├── data/
│   │   ├── E04_demo.csv
│   │   ├── E18_demo.csv
│   │   └── E19_demo.csv
│   ├── Dockerfile
│   └── requirements.txt
├── db/
│   └── schema.sql
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
├── ARCHITECTURE.md
├── DEMO_SCRIPT.md
└── README.md
​
Prerequisites
The recommended setup uses Docker Compose.
Install:
Docker Desktop (includes Docker Compose).
Git, if you plan to clone the repository.
Installation and Setup
1. Clone the repository
git clone <your-repository-url>
cd API_SENTINEL_Full_Project
​
If you downloaded the project as a ZIP file, extract it and open a terminal in the extracted project directory.
2. Start the application
docker compose up --build
​
Docker Compose starts:
PostgreSQL database on port 5432.
FastAPI backend on port 8000.
React/Vite frontend on port 5173.
3. Open the application
Service
URL
Web dashboard
http://localhost:5173
FastAPI API
http://localhost:8000
Interactive API documentation
http://localhost:8000/docs
Health check
http://localhost:8000/health
To stop the containers:
docker compose down
​
To stop the containers and remove the local database volume:
docker compose down -v
​
Warning: docker compose down -v deletes the PostgreSQL data stored in the Compose volume.
Running the Demo
Start the application using Docker Compose.
Open http://localhost:5173.
Select Run Demo Analysis.
Wait for the synthetic evidence to be loaded and analyzed.
Review the dashboard metrics, risk distribution, registered integrations, and priority alerts.
Open the API documentation at http://localhost:8000/docs to explore the backend endpoints.
The demo uses the three CSV files in backend/data/. The API response explicitly identifies the loaded records as synthetic demonstration data, not real organization evidence.
Using Your Own CSV Evidence
The backend provides a multipart upload endpoint:
POST /api/analyze
It expects three CSV files:
e04: approved integration register.
api: observed API activity log.
e19: vendor-record change log.
Example:
curl -X POST <http://localhost:8000/api/analyze> \
  -F "e04=@path/to/E04.csv" \
  -F "api=@path/to/E18.csv" \
  -F "e19=@path/to/E19.csv"
​
Expected CSV columns
E04 — Integration register
The ingestion service reads these fields:
integration, credential_id, system, vendor, scope, owner,
ip_restriction, token_lifetime_days, last_used, status
​
E18 — API activity
request_id, api_key_id, ts_utc, caller_ip, user_agent,
endpoint, method, records_returned, status
​
E19 — Vendor changes
change_id, ts_utc, vendor_id, vendor_name, field,
old_value, new_value, changed_by, channel, approval_ref,
source_ip, request_id
​
Use the supplied demo CSV files as examples of the expected format. Timestamps should be parseable by Pandas; UTC timestamps with an offset are used in the demo. The request_id field is important for correlating API activity with vendor changes.
The endpoint returns the number of analyzed events and generated alerts. It returns an HTTP 400 response when processing fails.
Note: The current frontend does not include a CSV upload form. Upload evidence using the API endpoint or the interactive API documentation.
API Endpoints
Method
Endpoint
Description
GET
/health
Check backend health and model version
GET
/api/summary
Return dashboard summary metrics
GET
/api/integrations
List registered integrations
GET
/api/alerts
List alert events, ordered by risk score
GET
/api/events
List analyzed events
POST
/api/demo/load
Load and analyze synthetic demo evidence
POST
/api/analyze
Upload and analyze three CSV evidence files
The limit query parameter can be used with /api/alerts and /api/events.
Example:
curl <http://localhost:8000/api/summary>
curl <http://localhost:8000/api/alerts?limit=20>
curl <http://localhost:8000/api/events?limit=50>
curl <http://localhost:8000/api/integrations>
​
Interactive request and response schemas are available at /docs.
Detection Methodology
API SENTINEL combines explainable rules with a supporting behavioral anomaly signal.
1. Approved-state checks (E04)
Credential is not present in the approved integration register.
Credential status is not active, enabled, or approved.
Requested endpoint is outside the registered scope.
Caller IP does not match the registered IP restriction.
2. Behavioral drift checks (E18)
A baseline is built per API credential using the earlier portion of the chronologically sorted API activity data. The detector compares events against baseline characteristics, including:
Previously observed caller IP addresses.
Previously observed endpoints.
Previously observed HTTP methods.
Previously observed hours of activity.
Average and standard deviation of records returned.
The detector flags new patterns and unusually high record-return volumes.
3. Business-impact correlation (E19)
The detector joins vendor changes to API events using request_id. Sensitive fields include bank-account, bank-details, and payment-instruction fields. A sensitive change without an approval reference receives an additional risk contribution.
4. Supporting machine-learning signal
An Isolation Forest model evaluates event features such as hour, records returned, endpoint length, and HTTP method. The normalized anomaly score can add a supporting contribution to the overall score. It is not intended to be the sole reason for an alert.
Risk Score and Severity
The detector adds rule contributions and a supporting anomaly contribution, then caps the score at 100. The default alert threshold is 55.
Score
Severity
0–34
LOW
35–54
MEDIUM
55–79
HIGH
80–100
CRITICAL
The alert threshold and baseline training fraction can be configured through backend environment settings:
Setting
Default
Purpose
ALERT_THRESHOLD
55
Minimum score that creates an alert
BASELINE_TRAIN_FRACTION
0.70
Fraction of chronologically sorted events used to build the baseline
MODEL_VERSION
api-sentinel-v1.0
Model version label
DATABASE_URL
Compose PostgreSQL URL
Database connection
CORS_ORIGINS
http://localhost:5173
Allowed frontend origin
These are prototype scoring rules and weights. They should be validated and tuned against representative, authorized data before operational use.
Database
PostgreSQL stores the following main tables:
integrations — approved integration and credential information.
api_events — ingested API activity.
vendor_changes — vendor-record changes.
detection_results — event scores, severity, alert status, reasons, and evidence references.
The schema and indexes are defined in db/schema.sql. On first database initialization, Docker Compose mounts this schema into the PostgreSQL initialization directory.
Important Notes and Limitations
This is a prototype for security analysis and demonstration, not a production-ready security platform.
The included competition/demo data is fictional or synthetic. It is not evidence from a real organization.
A risk score is an investigation signal, not proof of compromise, fraud, or attacker intent.
Detection weights and thresholds require validation against representative data.
The Isolation Forest component is a supporting signal and should not be treated as a standalone security verdict.
The demo and analysis endpoints write to the configured database. The analysis endpoint replaces the existing detection-results set after a successful analysis.
The supplied Docker Compose credentials are development defaults. Do not use them in a public or production deployment.
Before real deployment, add authentication and authorization, secrets management, TLS, audit logging, input validation, retention controls, monitoring, and production deployment hardening.
Only use data and systems you are authorized to access.
Team
Team: Quantum Crew
Competition: CRIMEATHON’26
Case: CR-26-047 — Harbor & Finch Freight Pvt. Ltd.
Approach: Defense
API SENTINEL — Permission-to-Behavior Drift Detection for Third-Party Integrations.
