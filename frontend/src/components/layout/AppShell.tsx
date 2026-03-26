import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { PropsWithChildren, ReactNode } from "react";
import type { Organization } from "../../types/api";

type AppShellProps = PropsWithChildren<{
  organizations: Organization[];
  selectedOrganizationId?: number;
  onOrganizationChange: (id: number) => void;
  onSeed: () => void;
  seeding: boolean;
}>;

function IconChevron(): ReactNode {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconHome(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconSearch(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconPlus(): ReactNode {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconChart(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-6 4 2 6-8" />
    </svg>
  );
}

function IconActivity(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconRadar(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconBook(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconZap(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconDatabase(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconFileUp(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <polyline points="9 15 12 12 15 15" />
    </svg>
  );
}

function IconList(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

type NavItem = {
  to: string;
  label: string;
  sublabel?: string;
  icon: ReactNode;
  end?: boolean;
};

const dataItems: NavItem[] = [
  {
    to: "/data-sources",
    label: "Connect data",
    sublabel: "Lakes, uploads, schema & freshness",
    icon: <IconDatabase />,
    end: true,
  },
  {
    to: "/impact",
    label: "Anomalies dashboard",
    sublabel: "Money at risk, trends, funnel",
    icon: <IconChart />,
    end: true,
  },
  {
    to: "/detectors",
    label: "Anomaly queries",
    sublabel: "Review, edit, add rules or prompts",
    icon: <IconRadar />,
    end: true,
  },
  {
    to: "/copilot",
    label: "Chat with data",
    sublabel: "Natural language → read-only SQL",
    icon: <IconSearch />,
    end: true,
  },
];

const slaItems: NavItem[] = [
  {
    to: "/sla-rulebook?tab=extraction",
    label: "Extract SLA",
    sublabel: "Import PDFs, docs, text, images",
    icon: <IconFileUp />,
    end: true,
  },
  {
    to: "/sla-rulebook?tab=active",
    label: "View SLAs",
    sublabel: "Active rulebook & search",
    icon: <IconList />,
    end: true,
  },
];

const workflowItems: NavItem[] = [
  {
    to: "/live-ops",
    label: "Tickets",
    sublabel: "Queue by deadline & SLA risk",
    icon: <IconActivity />,
    end: true,
  },
  {
    to: "/action-center",
    label: "Approvals",
    sublabel: "Pending, executed, auto mode",
    icon: <IconZap />,
    end: true,
  },
];

/** Match nav item `to` (path + optional ?query) against current location. */
function itemMatches(pathname: string, search: string, to: string, end?: boolean): boolean {
  const qIdx = to.indexOf("?");
  const rawPath = qIdx >= 0 ? to.slice(0, qIdx) : to;
  const rawQs = qIdx >= 0 ? to.slice(qIdx + 1) : "";
  if (end) {
    if (pathname !== rawPath) return false;
  } else if (pathname !== rawPath && !pathname.startsWith(`${rawPath}/`)) {
    return false;
  }
  if (!rawQs) return true;
  const need = new URLSearchParams(rawQs);
  const have = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [k, v] of need.entries()) {
    if (k === "tab" && v === "extraction") {
      const h = have.get("tab");
      if (h === null || h === "extraction") continue;
      return false;
    }
    if (have.get(k) !== v) return false;
  }
  return true;
}

function groupActive(pathname: string, search: string, items: NavItem[]): boolean {
  return items.some((item) => itemMatches(pathname, search, item.to, item.end));
}

const DROPDOWN_CLOSE_DELAY_MS = 160;

type NavDropdownProps = {
  label: string;
  items: NavItem[];
};

function NavDropdown({ label, items }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const [noHover, setNoHover] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const active = groupActive(location.pathname, location.search, items);

  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const sync = () => setNoHover(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  const openMenu = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), DROPDOWN_CLOSE_DELAY_MS);
  };

  return (
    <div
      className="topnav-dropdown"
      onMouseEnter={noHover ? undefined : openMenu}
      onMouseLeave={noHover ? undefined : scheduleClose}
    >
      <button
        type="button"
        className={`topnav-dropdown-trigger${active ? " topnav-dropdown-trigger-active" : ""}${open ? " topnav-dropdown-trigger-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={
          noHover
            ? () => {
                clearCloseTimer();
                setOpen((v) => !v);
              }
            : undefined
        }
      >
        {label}
        <span className={`topnav-chevron${open ? " topnav-chevron-open" : ""}`}>
          <IconChevron />
        </span>
      </button>
      {open ? (
        <ul className="topnav-dropdown-menu" role="menu">
          {items.map((item) => {
            const isActive = itemMatches(location.pathname, location.search, item.to, item.end);
            return (
              <li key={item.label} role="none">
                <NavLink
                  role="menuitem"
                  to={item.to}
                  end={item.end ?? false}
                  className={isActive ? "topnav-dropdown-link topnav-dropdown-link-active" : "topnav-dropdown-link"}
                  onClick={() => {
                    clearCloseTimer();
                    setOpen(false);
                  }}
                >
                  <span className="topnav-dropdown-icon">{item.icon}</span>
                  <span className="topnav-dropdown-link-body">
                    <span className="topnav-dropdown-link-title">{item.label}</span>
                    {item.sublabel ? <span className="topnav-dropdown-sublabel">{item.sublabel}</span> : null}
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

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
      <header className="app-topnav">
        <div className="app-topnav-inner">
          <div className="app-topnav-brand">
            <Link to="/" className="app-topnav-logo-link">
              <span className="app-topnav-mark">BS</span>
              <span className="app-topnav-brand-text">
                <span className="app-topnav-name">Business Sentry</span>
              </span>
            </Link>
          </div>

          <nav className="app-topnav-links" aria-label="Main">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? "topnav-link topnav-link-active" : "topnav-link")}
            >
              <span className="topnav-link-icon">
                <IconHome />
              </span>
              Home
            </NavLink>

            <NavDropdown label="Data" items={dataItems} />

            <NavDropdown label="SLA" items={slaItems} />

            <NavDropdown label="Workflow" items={workflowItems} />
          </nav>

          <div className="app-topnav-actions">
            <label className="topnav-workspace">
              <span className="topnav-workspace-label">Workspace</span>
              <select
                className="topnav-workspace-select"
                value={selectedOrganizationId ?? ""}
                onChange={(e) => onOrganizationChange(Number(e.target.value))}
                disabled={!organizations.length}
              >
                {organizations.length === 0 ? <option value="">None</option> : null}
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="topnav-seed-btn" onClick={onSeed} disabled={seeding}>
              <IconPlus />
              {seeding ? "…" : "Seed"}
            </button>
          </div>
        </div>
      </header>

      <main className="workspace">{children}</main>
    </div>
  );
}
