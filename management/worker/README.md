# Petlibro Management capability worker

The worker is an independently executable Python service for allowlisted device
capabilities. It is not a browser API or application workflow coordinator. Its
initial capability, `state-agent.inspect-health.v1`, performs one authenticated,
read-only State Agent `/health` request.

## Private transport

The worker serves versioned HTTP/JSON on a Unix domain socket. Its parent
directory is mode `0700` and the socket is mode `0600`. It never opens a TCP
listener.

Current endpoints:

| Method and route | Meaning |
| --- | --- |
| `GET /v1/health` | Worker instance, implementation version and protocol compatibility |
| `GET /v1/capabilities` | Exact allowlisted capability IDs and execution characteristics |
| `PUT /v1/invocations/{uuid}` | Idempotently accept one typed capability invocation |
| `GET /v1/invocations/{uuid}` | Reconcile invocation state, result, error and replayable events |

`PUT` requires matching canonical invocation and operation UUIDs, protocol and
capability IDs, and an exact input shape. Reusing an invocation ID with different
input returns a conflict. There is no arbitrary method, import, command, path or
shell-execution endpoint.

The State Agent bearer token is used only inside the worker request and is not
included in invocation snapshots, events, errors, application records or browser
responses. Ambient HTTP proxies and redirects are disabled so the credential is
not forwarded away from the configured endpoint.

## Lifecycle

Invocation state and a bounded event replay are retained while the worker
process remains alive. The TypeScript operation manager copies lifecycle facts
and evidence into its durable SQLite journal. If the worker restarts, its
in-memory invocation/session state is explicitly lost; the coordinator records
an interruption and does not silently submit the old invocation again.

That behavior is sufficient for this read-only foundation capability. Before a
device-changing capability is added, worker-side acceptance and irreversible
transaction evidence will require a capability-appropriate durable design.

Run from `management/`:

```bash
npm run worker
```

The socket defaults to `.data/worker.sock` and can be changed with
`PETLIBRO_WORKER_SOCKET` or `--socket`.

## Provenance and authority

The health capability preserves the direct authenticated request behavior from
`installer/bootstrap.py::_probe_state_agent` and the bounded error categories
and URL validation used by `addon/appdaemon/src/state_agent.py`, at repository
revision `9f8899c1529feb98865c4dee9828b0dd1223ed01`.

It deliberately returns only the safe health fields defined by the State Agent:
agent identity/version/uptime and state-decode status/size. It does not read
`/v1/core`, perform persistent writes, submit updates, or assume AppDaemon's
reconciliation authority.

