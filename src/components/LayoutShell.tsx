import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Activity,
  Bell,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  FileBarChart2,
  FileUp,
  GitFork,
  LayoutDashboard,
  Link2,
  Menu,
  Play,
  Radar,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import type { AnalyzedEvent, WorkspaceStateResponse } from '../types/sentinel';
import { BrandLogo } from './BrandLogo';
import { SeverityTag, formatUtcTimestamp } from './RiskUI';

export type NavSection =
  | 'overview'
  | 'intelligence'
  | 'integrations'
  | 'activity'
  | 'alerts'
  | 'evidence'
  | 'investigation'
  | 'ai-analysis'
  | 'reports'
  | 'settings'
  | 'upload';

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface LayoutShellProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  state: WorkspaceStateResponse;
  onSelectEventForInvestigation: (requestId: string) => void;
  onOpenDemoMode: () => void;
  children: React.ReactNode;
}

const ANALYST_AVATAR_URL = '/src/assets/images/avatar_security_analyst_1795122506129.jpg';

export const LayoutShell: React.FC<LayoutShellProps> = ({
  activeSection,
  onNavigate,
  state,
  onSelectEventForInvestigation,
  onOpenDemoMode,
  children,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const primaryNav: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'intelligence', label: 'Security Intelligence', icon: Radar },
    { id: 'integrations', label: 'Integrations', icon: Link2, badge: state.metrics.totalIntegrations },
    { id: 'activity', label: 'API Activity', icon: Activity },
    { id: 'alerts', label: 'Risk Alerts', icon: ShieldAlert, badge: state.metrics.totalAlerts },
    { id: 'evidence', label: 'Evidence Explorer', icon: GitFork },
    { id: 'investigation', label: 'Threat Investigation', icon: ShieldCheck },
    { id: 'ai-analysis', label: 'AI Risk Analysis', icon: BrainCircuit },
    { id: 'reports', label: 'Reports', icon: FileBarChart2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const openPriorityAlerts = useMemo(
    () =>
      state.alerts
        .filter((a) => a.triageStatus !== 'reviewed')
        .slice(0, 6),
    [state.alerts]
  );

  const searchMatches = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return { events: [] as AnalyzedEvent[], integrations: [] as typeof state.e04 };
    const matchedEvents = state.events
      .filter(
        (e) =>
          e.requestId.toLowerCase().includes(q) ||
          e.apiKeyId.toLowerCase().includes(q) ||
          e.integrationName.toLowerCase().includes(q) ||
          e.endpoint.toLowerCase().includes(q) ||
          e.callerIp.toLowerCase().includes(q) ||
          e.linkedE19.some(
            (c) =>
              c.change_id.toLowerCase().includes(q) ||
              c.vendor_name.toLowerCase().includes(q)
          )
      )
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5);
    const matchedInts = state.e04
      .filter(
        (i) =>
          i.integration.toLowerCase().includes(q) ||
          i.credential_id.toLowerCase().includes(q) ||
          i.vendor.toLowerCase().includes(q)
      )
      .slice(0, 3);
    return { events: matchedEvents, integrations: matchedInts };
  }, [globalQuery, state.events, state.e04]);

  const sectionLabelMap: Record<NavSection, string> = {
    overview: 'Overview',
    intelligence: 'Security Intelligence',
    integrations: 'Integrations',
    activity: 'API Activity Monitor',
    alerts: 'Risk Alerts',
    evidence: 'Evidence Explorer',
    investigation: 'Threat Investigation',
    'ai-analysis': 'AI Risk Analysis',
    reports: 'Analytics & Reports',
    settings: 'Settings & Health',
    upload: 'Upload & Analysis Center',
  };

  const renderSidebarInner = (isMobile = false) => {
    const compact = !isMobile && sidebarCollapsed;
    return (
      <div className="flex h-full flex-col bg-white border-r border-slate-200/90">
        {/* Brand lockup */}
        <div
          className={`flex h-16 items-center border-b border-slate-200/80 ${
            compact ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onNavigate('overview');
              setMobileMenuOpen(false);
            }}
            className="text-left focus:outline-none cursor-pointer"
          >
            <BrandLogo compact={compact} showTagline={!compact} />
          </button>
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg p-1.5 text-[#64748B] hover:bg-slate-100 hover:text-[#172033] cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5" aria-label="Primary navigation">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={compact ? item.label : undefined}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`group flex w-full items-center rounded-lg transition-colors duration-150 cursor-pointer ${
                  compact ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2'
                } ${
                  active
                    ? 'bg-[#5146E5]/10 text-[#5146E5] font-semibold'
                    : 'text-[#475569] hover:bg-slate-100/80 hover:text-[#172033] font-medium'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? 'text-[#5146E5]' : 'text-[#64748B] group-hover:text-[#172033]'
                    }`}
                  />
                  {!compact && <span className="truncate text-[13.5px]">{item.label}</span>}
                </span>
                {!compact && item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`font-mono tabular-nums text-[11px] font-semibold ${
                      item.id === 'alerts'
                        ? 'text-[#DC2626]'
                        : active
                          ? 'text-[#5146E5]'
                          : 'text-[#64748B]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="my-3 border-t border-slate-200/80" />

          {/* Upload & Analysis Center entry */}
          <button
            type="button"
            title={compact ? 'CSV Upload Center' : undefined}
            onClick={() => {
              onNavigate('upload');
              setMobileMenuOpen(false);
            }}
            className={`group flex w-full items-center rounded-lg transition-colors duration-150 cursor-pointer ${
              compact ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2'
            } ${
              activeSection === 'upload'
                ? 'bg-[#2563EB]/10 text-[#2563EB] font-semibold'
                : 'text-[#475569] hover:bg-slate-100/80 hover:text-[#172033] font-medium'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <FileUp
                className={`h-4 w-4 shrink-0 ${
                  activeSection === 'upload'
                    ? 'text-[#2563EB]'
                    : 'text-[#64748B] group-hover:text-[#172033]'
                }`}
              />
              {!compact && <span className="truncate text-[13.5px]">Upload & Analysis</span>}
            </span>
          </button>
        </nav>

        {/* Bottom Demo CTA + Collapse Toggle */}
        <div className="border-t border-slate-200/80 p-3 space-y-2">
          {!compact ? (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenDemoMode();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#5146E5] to-[#2563EB] px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:opacity-95 transition-opacity whitespace-nowrap cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current shrink-0" />
              Run Live Security Demo
            </button>
          ) : (
            <button
              type="button"
              title="Run Live Security Demonstration"
              onClick={onOpenDemoMode}
              className="flex w-full items-center justify-center rounded-lg bg-[#5146E5] p-2.5 text-white hover:bg-[#4338CA] transition-colors cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" />
            </button>
          )}

          {!isMobile && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-[#64748B] hover:bg-slate-50 hover:text-[#172033] transition-colors cursor-pointer"
              aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {compact ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Collapse Sidebar</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] text-[#172033] flex">
      {/* Desktop fixed collapsible sidebar */}
      <aside
        className={`hidden lg:block fixed inset-y-0 left-0 z-30 transition-all duration-200 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[256px]'
        }`}
      >
        {renderSidebarInner(false)}
      </aside>

      {/* Mobile slide-over sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#172033]/35 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-[272px] max-w-[85vw] h-full shadow-xl">
            {renderSidebarInner(true)}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div
        className={`flex min-h-screen flex-1 flex-col transition-all duration-200 min-w-0 ${
          sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[256px]'
        }`}
      >
        {/* Top Navigation Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200/90 bg-white/95 backdrop-blur px-4 sm:px-6">
          {/* Left: Mobile toggle + current context */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg p-2 text-[#475569] hover:bg-slate-100 cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">
              <BrandLogo compact />
            </div>
            <div className="hidden sm:flex items-center gap-2 text-sm min-w-0">
              <span className="font-semibold text-[#64748B] whitespace-nowrap">API SENTINEL</span>
              <span className="text-slate-300">/</span>
              <span className="font-bold text-[#172033] truncate">
                {sectionLabelMap[activeSection]}
              </span>
            </div>
          </div>

          {/* Center: Working Global Search */}
          <div ref={searchRef} className="relative flex-1 max-w-md hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={globalQuery}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                setGlobalQuery(e.target.value);
                setSearchFocused(true);
              }}
              placeholder="Search request ID, credential, vendor, IP, endpoint..."
              className="w-full rounded-lg border border-slate-200 bg-[#F6F8FC] py-1.5 pl-9 pr-8 text-sm text-[#172033] placeholder:text-[#64748B] focus:border-[#5146E5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5146E5]/15 transition-all"
            />
            {globalQuery && (
              <button
                type="button"
                onClick={() => setGlobalQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#172033] cursor-pointer"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {searchFocused && globalQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-40">
                {searchMatches.events.length === 0 && searchMatches.integrations.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-[#64748B]">
                    No matching API requests, alerts, or integrations found.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {searchMatches.events.length > 0 && (
                      <div>
                        <p className="px-2.5 py-1 text-[11px] font-semibold text-[#64748B]">
                          API Events & Alerts
                        </p>
                        {searchMatches.events.map((ev) => (
                          <button
                            key={ev.requestId}
                            type="button"
                            onClick={() => {
                              setSearchFocused(false);
                              setGlobalQuery('');
                              onSelectEventForInvestigation(ev.requestId);
                            }}
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[#F6F8FC] transition-colors cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-semibold text-[#172033] truncate">
                                {ev.requestId}{' '}
                                <span className="font-sans font-normal text-[#64748B]">
                                  · {ev.integrationName}
                                </span>
                              </p>
                              <p className="font-mono text-[11px] text-[#64748B] truncate">
                                {ev.method} {ev.endpoint} · {ev.callerIp}
                              </p>
                            </div>
                            <SeverityTag severity={ev.severity} />
                          </button>
                        ))}
                      </div>
                    )}
                    {searchMatches.integrations.length > 0 && (
                      <div className="border-t border-slate-100 pt-2">
                        <p className="px-2.5 py-1 text-[11px] font-semibold text-[#64748B]">
                          E04 Integrations
                        </p>
                        {searchMatches.integrations.map((intg) => (
                          <button
                            key={intg.credential_id}
                            type="button"
                            onClick={() => {
                              setSearchFocused(false);
                              setGlobalQuery('');
                              onNavigate('integrations');
                            }}
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[#F6F8FC] transition-colors cursor-pointer"
                          >
                            <span className="text-xs font-semibold text-[#172033] truncate">
                              {intg.integration}
                            </span>
                            <span className="font-mono text-[11px] text-[#64748B] shrink-0">
                              {intg.credential_id}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Health Status, Light Indicator, Notifications, Profile */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
            {/* Real backend & analysis status */}
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="hidden xl:flex items-center gap-2 rounded-lg border border-slate-200 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-[#475569] hover:border-slate-300 transition-colors whitespace-nowrap cursor-pointer"
              title="View backend health and persistence details"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A] shrink-0" />
              <span className="font-semibold text-[#172033]">Engine Ready</span>
              <span className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-[11px] text-[#64748B]">
                {state.datasetSource === 'synthetic'
                  ? 'Synthetic'
                  : state.datasetSource === 'uploaded'
                    ? 'Uploaded CSV'
                    : 'Empty'}
              </span>
            </button>

            {/* Light theme indicator */}
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[#64748B] whitespace-nowrap"
              title="Light Enterprise Theme active"
            >
              <Sun className="h-3.5 w-3.5 text-[#EA580C]" />
              <span className="hidden xl:inline">Light</span>
            </div>

            {/* Notification Bell Popover */}
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#475569] hover:bg-slate-50 hover:text-[#172033] transition-colors cursor-pointer"
                aria-label="Open security notifications"
              >
                <Bell className="h-4 w-4" />
                {openPriorityAlerts.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#DC2626] px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                    {openPriorityAlerts.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-xl z-40 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-[#172033]">Unreviewed Security Alerts</p>
                      <p className="text-xs text-[#64748B]">
                        Threshold ≥ {state.config.alertThreshold} · {openPriorityAlerts.length} pending
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        onNavigate('alerts');
                      }}
                      className="text-xs font-semibold text-[#5146E5] hover:underline cursor-pointer"
                    >
                      View all
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {openPriorityAlerts.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-[#64748B]">
                        All raised alerts have been marked reviewed.
                      </p>
                    ) : (
                      openPriorityAlerts.map((al) => (
                        <button
                          key={al.requestId}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onSelectEventForInvestigation(al.requestId);
                          }}
                          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-[#F6F8FC] transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#172033] truncate">
                              {al.integrationName}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-[#64748B] truncate">
                              {al.requestId} · {al.method} {al.endpoint}
                            </p>
                            <p className="mt-1 text-[11px] text-[#64748B]">
                              {formatUtcTimestamp(al.tsUtc)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <SeverityTag severity={al.severity} />
                            <span className="font-mono text-xs font-bold text-[#172033] tabular-nums">
                              {al.riskScore}/100
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Analyst Profile */}
            <div className="flex items-center gap-2.5 pl-1 border-l border-slate-200">
              {!avatarFailed ? (
                <img
                  src={ANALYST_AVATAR_URL}
                  alt="Maya Lin, Lead SOC Analyst"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5146E5]/10 text-xs font-bold text-[#5146E5] shrink-0">
                  ML
                </div>
              )}
              <div className="hidden sm:block leading-tight">
                <p className="text-xs font-bold text-[#172033] whitespace-nowrap">Maya Lin</p>
                <p className="text-[11px] text-[#64748B] whitespace-nowrap">Lead SOC Analyst</p>
              </div>
            </div>
          </div>
        </header>

        {/* Workspace Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
