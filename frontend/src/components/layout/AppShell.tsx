import { NavLink } from "react-router-dom";
import type { PropsWithChildren, ReactNode } from "react";
import type { Organization } from "../../types/api";

type AppShellProps = PropsWithChildren<{
  organizations: Organization[];
  selectedOrganizationId?: number;
  onOrganizationChange: (id: number) => void;
  onSeed: () => void;
  seeding: boolean;
}>;

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconServer() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

const navItems: Array<{ to: string; label: string; icon: ReactNode; end?: boolean }> = [
  { to: "/", label: "Overview", icon: <IconGrid />, end: true },
  { to: "/alerts", label: "Alerts", icon: <IconBell /> },
  { to: "/resources", label: "Resources", icon: <IconServer /> },
  { to: "/investigate", label: "Investigate", icon: <IconSearch /> },
  { to: "/audit", label: "Audit & Reports", icon: <IconClipboard /> },
];

export function AppShell({
  organizations,
  selectedOrganizationId,
  onOrganizationChange,
  onSeed,
  seeding,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">CP</div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">CostPulse AI</span>
            <span className="sidebar-logo-sub">Cost Intelligence</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Main Menu</span>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
            >
              <span className="nav-link-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer: workspace + seed */}
        <div className="sidebar-footer">
          <div className="workspace-selector">
            <span className="workspace-label">Workspace</span>
            <select
              className="workspace-select"
              value={selectedOrganizationId ?? ""}
              onChange={(e) => onOrganizationChange(Number(e.target.value))}
              disabled={!organizations.length}
            >
              {organizations.length === 0 && (
                <option value="">No workspaces yet</option>
              )}
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <button className="seed-button" onClick={onSeed} disabled={seeding}>
            <IconPlus />
            {seeding ? "Bootstrapping..." : "Bootstrap Dataset"}
          </button>
        </div>
      </aside>

      <main className="workspace">{children}</main>
    </div>
  );
}
