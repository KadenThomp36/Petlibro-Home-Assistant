from __future__ import annotations

import http.server
import json
import threading
import time
import uuid
from contextlib import contextmanager

import pytest

from petlibro_worker.invocations import (
    CAPABILITY_ID,
    InvocationConflict,
    InvocationManager,
)
from petlibro_worker.state_agent import (
    StateAgentBadResponse,
    StateAgentHealthResult,
    StateAgentUnauthorized,
    inspect_state_agent_health,
)


TOKEN = "synthetic-worker-token"


class StateAgentHandler(http.server.BaseHTTPRequestHandler):
    response_status = 200
    response_document: object = {
        "ok": True,
        "agent": {"name": "plaf203-state-agent", "version": "0.3.0", "uptime_ms": 42},
        "device": {"root": "/mnt/UDISK"},
        "state_decode": {"ok": True, "expected_size": 236, "actual_size": 236},
    }
    observed_authorization: str | None = None

    def do_GET(self) -> None:  # noqa: N802
        type(self).observed_authorization = self.headers.get("Authorization")
        if self.path != "/health":
            self.send_error(404)
            return
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_error(401)
            return
        body = json.dumps(type(self).response_document).encode()
        self.send_response(type(self).response_status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        return


@contextmanager
def state_agent_server():
    StateAgentHandler.response_status = 200
    StateAgentHandler.response_document = {
        "ok": True,
        "agent": {"name": "plaf203-state-agent", "version": "0.3.0", "uptime_ms": 42},
        "device": {"root": "/mnt/UDISK"},
        "state_decode": {"ok": True, "expected_size": 236, "actual_size": 236},
    }
    StateAgentHandler.observed_authorization = None
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), StateAgentHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_state_agent_health_is_authenticated_bounded_and_redacted():
    with state_agent_server() as base_url:
        result = inspect_state_agent_health(base_url, TOKEN, 1)

    assert result.to_wire() == {
        "healthy": True,
        "agent": {
            "name": "plaf203-state-agent",
            "version": "0.3.0",
            "uptimeMs": 42,
        },
        "stateDecode": {"ok": True, "expectedBytes": 236, "actualBytes": 236},
    }
    assert StateAgentHandler.observed_authorization == f"Bearer {TOKEN}"
    assert TOKEN not in json.dumps(result.to_wire())


def test_state_agent_inspection_distinguishes_unhealthy_observation_from_failure():
    with state_agent_server() as base_url:
        StateAgentHandler.response_document = {
            "ok": False,
            "agent": {"name": "plaf203-state-agent", "version": "0.3.0", "uptime_ms": 12},
            "device": {"root": "/mnt/UDISK"},
            "state_decode": {"ok": False, "expected_size": 236, "actual_size": 235},
        }
        result = inspect_state_agent_health(base_url, TOKEN, 1)

    assert result.healthy is False
    assert result.actual_state_bytes == 235


def test_state_agent_inspection_classifies_authentication_and_bad_shape():
    with state_agent_server() as base_url:
        with pytest.raises(StateAgentUnauthorized):
            inspect_state_agent_health(base_url, "wrong-token", 1)

        StateAgentHandler.response_document = {"ok": True}
        with pytest.raises(StateAgentBadResponse):
            inspect_state_agent_health(base_url, TOKEN, 1)


def test_invocation_is_deduplicated_and_replayable_after_client_disconnect():
    release = threading.Event()
    calls = 0

    def capability(_url: str, _token: str, _timeout: float):
        nonlocal calls
        calls += 1
        release.wait(timeout=2)
        return StateAgentHealthResult(True, "agent", "1.0.0", 1, True, 236, 236)

    manager = InvocationManager(capability)
    invocation_id = str(uuid.uuid4())
    request = request_document(invocation_id)
    accepted, created = manager.submit(invocation_id, request)
    duplicate, duplicate_created = manager.submit(invocation_id, request)

    assert created is True
    assert duplicate_created is False
    assert accepted["status"] in {"accepted", "running"}
    assert duplicate["invocationId"] == invocation_id

    release.set()
    terminal = wait_for_terminal(manager, invocation_id)
    assert terminal["status"] == "succeeded"
    assert calls == 1
    assert [event["sequence"] for event in terminal["events"]] == [1, 2, 3, 4]


def test_invocation_id_cannot_be_rebound_to_different_input():
    manager = InvocationManager(
        lambda *_args: StateAgentHealthResult(
            True, "agent", "1.0.0", 1, True, 236, 236
        )
    )
    invocation_id = str(uuid.uuid4())
    manager.submit(invocation_id, request_document(invocation_id))
    conflicting = request_document(invocation_id)
    conflicting["input"]["baseUrl"] = "http://192.0.2.2:8765"

    with pytest.raises(InvocationConflict):
        manager.submit(invocation_id, conflicting)


def request_document(invocation_id: str) -> dict:
    return {
        "protocolVersion": 1,
        "invocationId": invocation_id,
        "operationId": str(uuid.uuid4()),
        "capabilityId": CAPABILITY_ID,
        "input": {
            "baseUrl": "http://192.0.2.1:8765",
            "token": TOKEN,
            "timeoutSeconds": 1,
        },
    }


def wait_for_terminal(manager: InvocationManager, invocation_id: str) -> dict:
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        snapshot = manager.get(invocation_id)
        if snapshot["status"] in {"succeeded", "failed"}:
            return snapshot
        time.sleep(0.01)
    raise AssertionError("invocation did not finish")

