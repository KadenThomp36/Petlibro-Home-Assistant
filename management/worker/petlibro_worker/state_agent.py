"""Read-only State Agent inspection capability."""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


MAX_RESPONSE_BYTES = 64 * 1024


class StateAgentInspectionError(RuntimeError):
    """A safe, categorized capability failure."""

    code = "state_agent_error"


class StateAgentUnauthorized(StateAgentInspectionError):
    code = "state_agent_unauthorized"


class StateAgentUnavailable(StateAgentInspectionError):
    code = "state_agent_unavailable"


class StateAgentTimeout(StateAgentInspectionError):
    code = "state_agent_timeout"


class StateAgentBadResponse(StateAgentInspectionError):
    code = "state_agent_bad_response"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


DIRECT_OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    _NoRedirect(),
)


@dataclass(frozen=True)
class StateAgentHealthResult:
    healthy: bool
    agent_name: str
    agent_version: str
    uptime_ms: int
    state_decode_ok: bool
    expected_state_bytes: int
    actual_state_bytes: int

    def to_wire(self) -> dict[str, object]:
        return {
            "healthy": self.healthy,
            "agent": {
                "name": self.agent_name,
                "version": self.agent_version,
                "uptimeMs": self.uptime_ms,
            },
            "stateDecode": {
                "ok": self.state_decode_ok,
                "expectedBytes": self.expected_state_bytes,
                "actualBytes": self.actual_state_bytes,
            },
        }


def inspect_state_agent_health(
    base_url: str,
    token: str,
    timeout_seconds: float,
) -> StateAgentHealthResult:
    endpoint = _validated_endpoint(base_url)
    if not isinstance(token, str) or not token or len(token) > 4096:
        raise ValueError("state-agent token must be a non-empty bounded string")
    if not isinstance(timeout_seconds, (int, float)) or isinstance(
        timeout_seconds, bool
    ):
        raise ValueError("state-agent timeout must be numeric")
    if not 0.1 <= float(timeout_seconds) <= 30:
        raise ValueError("state-agent timeout must be between 0.1 and 30 seconds")

    request = urllib.request.Request(
        endpoint + "/health",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Connection": "close",
        },
        method="GET",
    )
    try:
        with DIRECT_OPENER.open(request, timeout=float(timeout_seconds)) as response:
            payload = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            raise StateAgentUnauthorized(
                "State Agent rejected authentication."
            ) from None
        raise StateAgentUnavailable(
            f"State Agent returned HTTP status {exc.code}."
        ) from None
    except (TimeoutError, socket.timeout):
        raise StateAgentTimeout("State Agent request timed out.") from None
    except (urllib.error.URLError, OSError):
        raise StateAgentUnavailable("State Agent is unavailable.") from None

    if len(payload) > MAX_RESPONSE_BYTES:
        raise StateAgentBadResponse("State Agent response exceeds the size limit.")
    try:
        document = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise StateAgentBadResponse("State Agent returned invalid JSON.") from None
    return _parse_health(document)


def _validated_endpoint(base_url: str) -> str:
    if not isinstance(base_url, str):
        raise ValueError("state-agent URL must be a string")
    parsed = urllib.parse.urlsplit(base_url.rstrip("/"))
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("state-agent URL must be an HTTP(S) URL with a host")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError(
            "state-agent URL must not contain credentials, query, or fragment"
        )
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", "")
    )


def _parse_health(value: object) -> StateAgentHealthResult:
    document = _object(value, "health response")
    agent = _object(document.get("agent"), "health response agent")
    state_decode = _object(
        document.get("state_decode"), "health response state_decode"
    )
    healthy = _boolean(document.get("ok"), "health response ok")
    state_decode_ok = _boolean(state_decode.get("ok"), "state_decode ok")
    if healthy != state_decode_ok:
        raise StateAgentBadResponse(
            "State Agent health and state-decode status disagree."
        )
    return StateAgentHealthResult(
        healthy=healthy,
        agent_name=_string(agent.get("name"), "agent name"),
        agent_version=_string(agent.get("version"), "agent version"),
        uptime_ms=_integer(agent.get("uptime_ms"), "agent uptime_ms"),
        state_decode_ok=state_decode_ok,
        expected_state_bytes=_integer(
            state_decode.get("expected_size"), "state_decode expected_size"
        ),
        actual_state_bytes=_integer(
            state_decode.get("actual_size"), "state_decode actual_size"
        ),
    )


def _object(value: object, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise StateAgentBadResponse(f"{name} must be an object.")
    return value


def _string(value: object, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise StateAgentBadResponse(f"{name} must be a non-empty string.")
    return value


def _boolean(value: object, name: str) -> bool:
    if not isinstance(value, bool):
        raise StateAgentBadResponse(f"{name} must be a boolean.")
    return value


def _integer(value: object, name: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise StateAgentBadResponse(f"{name} must be a non-negative integer.")
    return value

