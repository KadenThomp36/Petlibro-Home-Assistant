import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Activity,
  BookOpenText,
  Boxes,
  ChevronDown,
  ClipboardList,
  FileClock,
  Gauge,
  ListChecks,
  type LucideIcon,
  PawPrint,
  Settings,
  Stethoscope,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '#/components/ui/badge';
import { fetchSystemStatus } from '#/infrastructure/http/system-status-client';
import { cn } from '#/lib/utils';

interface NavigationItem {
  readonly label: string;
  readonly to:
    | '/'
    | '/devices'
    | '/setup'
    | '/actions'
    | '/operations'
    | '/diagnostics'
    | '/logs'
    | '/history'
    | '/settings';
  readonly icon: LucideIcon;
}

interface NavigationGroup {
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

const navigation: readonly NavigationGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Overview', to: '/', icon: Gauge },
      { label: 'Devices', to: '/devices', icon: Boxes },
      { label: 'Setup', to: '/setup', icon: ListChecks },
      { label: 'Actions', to: '/actions', icon: Wrench },
    ],
  },
  {
    label: 'Observe',
    items: [
      { label: 'Operations', to: '/operations', icon: ClipboardList },
      { label: 'Diagnostics', to: '/diagnostics', icon: Stethoscope },
      { label: 'Logs', to: '/logs', icon: BookOpenText },
      { label: 'History', to: '/history', icon: FileClock },
    ],
  },
  {
    label: 'System',
    items: [{ label: 'Settings', to: '/settings', icon: Settings }],
  },
];

export function ApplicationShell({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <aside className="desktop-sidebar" aria-label="Primary navigation">
        <Brand />
        <div className="sidebar-separator" aria-hidden="true" />
        <Navigation />
        <div className="sidebar-foot">
          <Badge className="border-sky-300/20 bg-sky-300/10 text-sky-100">
            Foundation
          </Badge>
          <p>Management process only</p>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="desktop-topbar">
          <div className="topbar-location">
            <span>Petlibro Local</span>
            <strong>Management</strong>
          </div>
          <BackendConnectionStatus />
        </header>

        <header className="mobile-header">
          <Brand compact />
          <details className="mobile-menu">
            <summary>
              Menu <ChevronDown aria-hidden="true" />
            </summary>
            <nav aria-label="Mobile navigation">
              <Navigation />
            </nav>
          </details>
        </header>

        <main id="main-content" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { readonly compact?: boolean }) {
  return (
    <Link className={cn('brand', compact && 'brand-compact')} to="/">
      <span className="brand-mark" aria-hidden="true">
        <PawPrint />
      </span>
      <span>
        <strong>Petlibro Local</strong>
        <small>Management</small>
      </span>
    </Link>
  );
}

function BackendConnectionStatus() {
  const statusQuery = useQuery({
    queryKey: ['system-status'],
    queryFn: ({ signal }) => fetchSystemStatus(signal),
    refetchInterval: 30_000,
    retry: 1,
  });

  const state = statusQuery.isPending
    ? { className: 'connection-checking', label: 'API checking' }
    : statusQuery.isError
      ? { className: 'connection-unavailable', label: 'API unavailable' }
      : { className: 'connection-available', label: 'API available' };

  return (
    <div
      className={cn('backend-connection', state.className)}
      aria-live="polite"
    >
      <span aria-hidden="true" />
      {state.label}
    </div>
  );
}

function Navigation() {
  return (
    <div className="navigation-groups">
      {navigation.map((group) => (
        <section key={group.label} className="navigation-group">
          <h2>{group.label}</h2>
          <div className="navigation-items">
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                className="navigation-link"
                activeProps={{
                  className: 'navigation-link navigation-link-active',
                }}
              >
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {children === undefined ? null : (
        <div className="page-actions">{children}</div>
      )}
    </header>
  );
}

export function ConnectionBanner() {
  return (
    <div className="connection-banner" role="note">
      <Activity aria-hidden="true" />
      <span>
        This foundation observes only its own API. Feeder and service health are
        not connected yet.
      </span>
    </div>
  );
}
