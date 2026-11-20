import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { LayoutShell, type NavSection } from './components/LayoutShell';
import {
  addAlertNote,
  fetchWorkspaceState,
  loadSyntheticDataset,
  resetWorkspaceDataset,
  saveInvestigationConclusion,
  updateAlertTriage,
  updateEngineSettings,
} from './services/api';
import type {
  InvestigationDisposition,
  TriageStatus,
  WorkspaceStateResponse,
} from './types/sentinel';
import { AiRiskAnalysisView } from './views/AiRiskAnalysisView';
import { ApiActivityView } from './views/ApiActivityView';
import { EvidenceExplorerView } from './views/EvidenceExplorerView';
import { IntegrationsView } from './views/IntegrationsView';
import { LiveDemoTheater } from './views/LiveDemoTheater';
import { OverviewView } from './views/OverviewView';
import { ReportsView } from './views/ReportsView';
import { RiskAlertsView } from './views/RiskAlertsView';
import { SecurityIntelligenceView } from './views/SecurityIntelligenceView';
import { SettingsView } from './views/SettingsView';
import { ThreatInvestigationView } from './views/ThreatInvestigationView';
import { UploadAnalysisView } from './views/UploadAnalysisView';

export default function App() {
  const [state, setState] = useState<WorkspaceStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadState = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchWorkspaceState();
      setState(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to connect to the API SENTINEL backend.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleInvestigate = useCallback((requestId: string) => {
    setSelectedRequestId(requestId);
    setActiveSection('investigation');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleUpdateTriage = useCallback(
    async (requestId: string, status: TriageStatus) => {
      try {
        const updated = await updateAlertTriage(requestId, status);
        setState(updated);
        showToast('success', `Alert ${requestId} updated to ${status.replace('_', ' ')}.`);
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to update status.');
      }
    },
    [showToast]
  );

  const handleAddNote = useCallback(
    async (requestId: string, text: string) => {
      try {
        const updated = await addAlertNote(requestId, text);
        setState(updated);
        showToast('success', `Investigation note saved for ${requestId}.`);
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to save note.');
      }
    },
    [showToast]
  );

  const handleSaveConclusion = useCallback(
    async (
      requestId: string,
      payload: {
        confirmedFacts: string;
        openHypotheses: string;
        disposition: InvestigationDisposition;
      }
    ) => {
      try {
        const updated = await saveInvestigationConclusion(requestId, payload);
        setState(updated);
        showToast('success', `Investigation conclusion saved for ${requestId}.`);
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to save conclusion.');
      }
    },
    [showToast]
  );

  const handleSaveSettings = useCallback(
    async (payload: { alertThreshold: number; baselineFraction: number }) => {
      try {
        const updated = await updateEngineSettings(payload);
        setState(updated);
        showToast(
          'success',
          `Settings applied: threshold ≥ ${updated.config.alertThreshold}, baseline ${Math.round(updated.config.baselineFraction * 100)}%.`
        );
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to update settings.');
      }
    },
    [showToast]
  );

  const handleLoadSynthetic = useCallback(async () => {
    setBusyAction(true);
    try {
      const updated = await loadSyntheticDataset();
      setState(updated);
      setSelectedRequestId(updated.alerts[0]?.requestId ?? null);
      showToast('success', 'Loaded labeled synthetic E04/E18/E19 demonstration dataset.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load synthetic dataset.');
    } finally {
      setBusyAction(false);
    }
  }, [showToast]);

  const handleResetDataset = useCallback(async () => {
    setBusyAction(true);
    try {
      const updated = await resetWorkspaceDataset();
      setState(updated);
      setSelectedRequestId(null);
      showToast('success', 'Active analysis workspace cleared to empty state.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to reset dataset.');
    } finally {
      setBusyAction(false);
    }
  }, [showToast]);

  const handleJumpFromDemo = useCallback(
    async (requestId: string) => {
      setDemoOpen(false);
      if (state && state.datasetSource !== 'synthetic') {
        // If user currently has empty workspace, load synthetic so the request exists
        if (state.datasetSource === 'empty') {
          await handleLoadSynthetic();
        }
      }
      setSelectedRequestId(requestId);
      setActiveSection('investigation');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [state, handleLoadSynthetic]
  );

  if (loading && !state) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4">
          <div className="mx-auto h-10 w-10 rounded-xl bg-[#5146E5]/10 flex items-center justify-center text-[#5146E5]">
            <RefreshCw className="h-5 w-5 animate-spin" />
          </div>
          <div>
            <p className="text-base font-extrabold text-[#172033]">Loading API SENTINEL</p>
            <p className="mt-1 text-xs text-[#64748B]">
              Initializing E04/E18/E19 correlation engine and Isolation Forest telemetry...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !state) {
    return (
      <div className="min-h-screen bg-[#F6F8FC] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#FECACA] bg-white p-8 text-center space-y-4">
          <AlertTriangle className="mx-auto h-8 w-8 text-[#DC2626]" />
          <div>
            <p className="text-base font-extrabold text-[#172033]">Backend Connection Unavailable</p>
            <p className="mt-1 text-xs text-[#64748B]">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={loadState}
            className="rounded-lg bg-[#5146E5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4338CA] cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <LayoutShell
        activeSection={activeSection}
        onNavigate={(sec) => {
          setActiveSection(sec);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        state={state}
        onSelectEventForInvestigation={handleInvestigate}
        onOpenDemoMode={() => setDemoOpen(true)}
      >
        {activeSection === 'overview' && (
          <OverviewView
            state={state}
            onNavigate={setActiveSection}
            onInvestigate={handleInvestigate}
            onOpenDemo={() => setDemoOpen(true)}
            onLoadSynthetic={handleLoadSynthetic}
            loadingAction={busyAction}
          />
        )}

        {activeSection === 'intelligence' && (
          <SecurityIntelligenceView
            state={state}
            onNavigate={setActiveSection}
            onInvestigate={handleInvestigate}
            onLoadSynthetic={handleLoadSynthetic}
            loadingAction={busyAction}
          />
        )}

        {activeSection === 'integrations' && (
          <IntegrationsView
            state={state}
            onNavigate={setActiveSection}
            onInvestigate={handleInvestigate}
            onLoadSynthetic={handleLoadSynthetic}
            loadingAction={busyAction}
          />
        )}

        {activeSection === 'activity' && (
          <ApiActivityView
            state={state}
            onNavigate={setActiveSection}
            onInvestigate={handleInvestigate}
            onLoadSynthetic={handleLoadSynthetic}
            loadingAction={busyAction}
          />
        )}

        {activeSection === 'alerts' && (
          <RiskAlertsView
            state={state}
            onNavigate={setActiveSection}
            onInvestigate={handleInvestigate}
            onUpdateTriage={handleUpdateTriage}
            onAddNote={handleAddNote}
            onLoadSynthetic={handleLoadSynthetic}
            loadingAction={busyAction}
          />
        )}

        {activeSection === 'evidence' && (
          <EvidenceExplorerView
            state={state}
            onNavigate={setActiveSection}
            onInvestigate={handleInvestigate}
            onLoadSynthetic={handleLoadSynthetic}
            loadingAction={busyAction}
          />
        )}

        {activeSection === 'investigation' && (
          <ThreatInvestigationView
            state={state}
            selectedRequestId={selectedRequestId}
            onSelectRequestId={setSelectedRequestId}
            onNavigate={setActiveSection}
            onUpdateTriage={handleUpdateTriage}
            onAddNote={handleAddNote}
            onSaveConclusion={handleSaveConclusion}
            onLoadSynthetic={handleLoadSynthetic}
            loadingAction={busyAction}
          />
        )}

        {activeSection === 'ai-analysis' && (
          <AiRiskAnalysisView
            state={state}
            selectedRequestId={selectedRequestId}
            onSelectRequestId={setSelectedRequestId}
            onNavigate={setActiveSection}
            onInvestigate={handleInvestigate}
            onLoadSynthetic={handleLoadSynthetic}
            loadingAction={busyAction}
          />
        )}

        {activeSection === 'reports' && (
          <ReportsView
            state={state}
            onNavigate={setActiveSection}
            onLoadSynthetic={handleLoadSynthetic}
            loadingAction={busyAction}
          />
        )}

        {activeSection === 'settings' && (
          <SettingsView state={state} onSaveSettings={handleSaveSettings} />
        )}

        {activeSection === 'upload' && (
          <UploadAnalysisView
            state={state}
            onStateUpdated={(next, msg) => {
              setState(next);
              setSelectedRequestId(next.alerts[0]?.requestId ?? null);
              showToast('success', msg);
            }}
            onNavigate={setActiveSection}
            onLoadSynthetic={handleLoadSynthetic}
            onResetDataset={handleResetDataset}
          />
        )}
      </LayoutShell>

      {demoOpen && (
        <LiveDemoTheater
          onClose={() => setDemoOpen(false)}
          onJumpToInvestigation={handleJumpFromDemo}
        />
      )}

      {/* Non-intrusive bottom-right toast feedback */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg flex items-center gap-2.5 text-xs">
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-[#DC2626] shrink-0" />
          )}
          <span className="font-medium text-[#172033]">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-1 text-[#64748B] hover:text-[#172033] cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
