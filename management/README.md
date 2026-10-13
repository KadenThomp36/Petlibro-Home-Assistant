# Petlibro Management application

This directory contains the initial browser and TypeScript server foundation for
the planned Petlibro Management application. It is independently runnable and
packaged into the Home Assistant add-on. Existing AppDaemon and go2rtc services
remain the production operational authorities.

The foundation implements two vertical paths:

```text
Overview page
  -> TanStack Query browser client
  -> GET /api/v1/system/status
  -> HTTP route adapter
  -> SystemStatusService
  -> source-aware management status contract

Operations page
  -> accepted State Agent inspection action
  -> durable TypeScript OperationManager + SQLite journal
  -> versioned HTTP/JSON over a private Unix socket
  -> independent Python worker
  -> authenticated, read-only State Agent /health request
  -> structured result/evidence
  -> HTTP snapshot/history + reconnectable browser WebSocket notification
```

The system endpoint reports management readiness and separately probes worker
transport readiness. AppDaemon and go2rtc adapters remain unconfigured. Neither
management nor worker readiness is presented as feeder, broker, controller,
State Agent, or camera health.

## Technology baseline

- Node.js 24, pinned through the repository's `mise.toml`;
- npm with a committed lockfile;
- strict TypeScript and React 19;
- TanStack Start in SPA mode, Router, and Query;
- Vite, Tailwind CSS 4, shadcn/ui source components, and Lucide icons;
- Nitro's Node server preset for the current standalone production build;
- Node 24's built-in SQLite API for the durable operation journal;
- Biome for formatting and linting;
- Vitest, jsdom, and Testing Library for deterministic tests.

The packaged Nitro runtime listens on a private Unix socket behind Nginx. The
Python capability worker uses a separate mode-`0600` Unix socket.

## Source organization

```text
src/
  application/       # Framework-independent application services
  components/        # React layout, page, shared, and shadcn UI components
  domain/             # Shared semantic contracts and boundary validation
  infrastructure/    # Browser/transport adapters
  routes/             # Thin TanStack page and HTTP route adapters
  server/             # Explicit server composition root
  test/               # Shared test setup
worker/
  petlibro_worker/    # Independent Python capability process
  tests/              # Worker and capability contract tests
server/routes/        # Nitro WebSocket delivery route
```

These are responsibility boundaries rather than a requirement to add a folder
or interface for every planned subsystem. The operation journal, worker IPC and
event delivery exist because the State Agent capability exercises them; there is
no speculative general workflow or plugin framework.

## Development

From the repository root:

```bash
mise install
cd management
npm ci
npm run dev
```

The development server defaults to `http://localhost:3000`. The shell still runs
without the worker, add-on image, feeder, AppDaemon, go2rtc, Mosquitto, or State
Agent. In that state, worker and action availability are explicitly unavailable.

To exercise the capability locally, use two terminals from `management/` and
provide a real protected token only through the environment:

```bash
# Terminal 1
PETLIBRO_WORKER_SOCKET=.data/worker.sock npm run worker

# Terminal 2
export PETLIBRO_MANAGEMENT_DATA_DIR=.data
export PETLIBRO_WORKER_SOCKET=.data/worker.sock
export PETLIBRO_STATE_AGENT_URL=http://FEEDER_IP:8765
export PETLIBRO_STATE_AGENT_TOKEN='replace-with-protected-token'
npm run dev
```

Do not copy `.env.example` to a tracked file containing real values. The worker
socket and SQLite database are under ignored `.data/` by default.

Available checks:

```bash
npm run format:check
npm run lint
npm run check
npm run typecheck
npm test
npm run test:worker
npm run build
```

`npm run format` updates files in place. `npm run generate-routes` regenerates
`src/routeTree.gen.ts`; the Start/Vite plugin also maintains that generated file
during development and builds.

## Production build

```bash
npm run build
npm start
```

The Node build is emitted under `.output/`. `PETLIBRO_MANAGEMENT_VERSION` may be
set at runtime to expose packaged version metadata through the status endpoint.

Set `PETLIBRO_MANAGEMENT_BASE_PATH` at build time to prepare route and asset URLs
for a prefixed browser path, for example:

```bash
PETLIBRO_MANAGEMENT_BASE_PATH=/petlibro/ npm run build
```

Root-path and runtime-variable prefix support is implemented. Browser WebSocket
reconnect uses a durable event cursor and HTTP snapshot/history as the recovery
source. Container tests cover direct and simulated Ingress HTTP, deep links,
assets, API calls, and WebSocket upgrades. Installation in a real Home Assistant
Supervisor remains to be qualified.

## Implemented and deferred boundaries

Implemented now:

- responsive application shell and the planned top-level route inventory;
- accessible loading, API-error, not-found, and reduced-motion behavior;
- source-aware status contract and response validation;
- thin versioned HTTP adapter and explicit application-service composition;
- private versioned Python worker with typed invocation deduplication;
- real authenticated State Agent health inspection with bounded safe results;
- durable operation snapshots and globally sequenced events in SQLite;
- restart reconciliation without blind capability replay;
- HTTP operation snapshot/history and reconnectable WebSocket notifications;
- source-aware Operations UI with success, failure and interruption states;
- root and configurable-prefix build configuration;
- add-on image packaging and independent s6 supervision;
- Supervisor-source-restricted Ingress gateway and opt-in CIDR-restricted
  direct gateway over the same HTTP/WebSocket backend;
- unit, contract, and representative UI tests.

Intentionally not implemented:

- installer capability extraction beyond the isolated State Agent health probe;
- device-changing capabilities, worker-owned durable transaction recovery, or cancellation;
- operator checkpoints or full action catalog/schema forms;
- AppDaemon, go2rtc, State Agent, Mosquitto, or Supervisor adapters;
- device state, controls, setup execution, or fabricated demo data;
- application authentication or TLS;
- live Home Assistant Supervisor/Ingress qualification.

Authentication is intentionally outside this application's scope. Ingress is
isolated to the Supervisor proxy. Direct access is disabled by default and must
be restricted to a trusted LAN or an externally authenticated reverse proxy;
the app must never be published directly to the Internet. The worker socket is
never proxied to a browser.

See [worker/README.md](worker/README.md) for the current wire contract,
credential handling, lifecycle semantics, and migration provenance.

See the maintained [architecture coverage map](../docs/petlibro-management-architecture-coverage-map.md),
[migration sequence](../docs/petlibro-management-migration-implementation-sequence.md),
[implementation guide](../docs/petlibro-management-implementation-guide.md),
and proposed [UI concept plan](../docs/petlibro-management-ui-concept-plan.md)
for target responsibilities, visual direction, and subsequent work. The UI
concept is design guidance rather than evidence that its illustrated runtime
states or controls are implemented.
