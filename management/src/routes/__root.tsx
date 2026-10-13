import { TanStackDevtools } from '@tanstack/react-devtools';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Scripts,
} from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { ApplicationShell } from '#/components/layout/application-shell';
import { Button } from '#/components/ui/button';
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools';
import appCss from '../styles.css?url';

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Petlibro Management',
      },
      {
        name: 'description',
        content: 'Local management for the Petlibro PLAF203 integration.',
      },
      {
        name: 'theme-color',
        content: '#0f1f2d',
      },
    ],
    links: [
      {
        rel: 'icon',
        href: `${import.meta.env.BASE_URL}favicon.svg`,
        type: 'image/svg+xml',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ApplicationShell>{children}</ApplicationShell>
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'TanStack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundPage() {
  return (
    <div className="not-found-page">
      <p className="eyebrow">404 · Route not found</p>
      <h1>This management view does not exist.</h1>
      <p>
        Return to the overview to inspect the currently implemented foundation.
      </p>
      <Button asChild>
        <Link to="/">Open overview</Link>
      </Button>
    </div>
  );
}
