"""Capability invocation ownership and bounded replayable worker events."""

from __future__ import annotations

import hashlib
import json
import threading
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Callable

from .state_agent import StateAgentInspectionError, inspect_state_agent_health


CAPABILITY_ID = "state-agent.inspect-health.v1"
MAX_EVENTS_PER_INVOCATION = 128


class InvocationConflict(RuntimeError):
    pass


class InvocationNotFound(KeyError):
    pass


@dataclass
class InvocationRecord:
    invocation_id: str
    operation_id: str
    request_fingerprint: str
    status: str
    stage: str
    accepted_at: str
    updated_at: str
    events: list[dict[str, object]] = field(default_factory=list)
    result: dict[str, object] | None = None
    error: dict[str, str] | None = None


CapabilityFunction = Callable[[str, str, float], Any]


class InvocationManager:
    def __init__(
        self,
        capability: CapabilityFunction = inspect_state_agent_health,
    ) -> None:
        self.instance_id = str(uuid.uuid4())
        self._capability = capability
        self._records: dict[str, InvocationRecord] = {}
        self._lock = threading.Lock()

    def capabilities(self) -> list[dict[str, object]]:
        return [
            {
                "id": CAPABILITY_ID,
                "contractVersion": 1,
                "mode": "read-only",
                "cancellation": "not-supported-after-start",
            }
        ]

    def submit(self, invocation_id: str, request: object) -> tuple[dict[str, object], bool]:
        operation_id, base_url, token, timeout_seconds = _validate_request(
            invocation_id, request
        )
        fingerprint = _fingerprint(request)
        now = _now()
        with self._lock:
            existing = self._records.get(invocation_id)
            if existing is not None:
                if existing.request_fingerprint != fingerprint:
                    raise InvocationConflict(
                        "invocation ID is already bound to a different request"
                    )
                return self._snapshot(existing), False
            record = InvocationRecord(
                invocation_id=invocation_id,
                operation_id=operation_id,
                request_fingerprint=fingerprint,
                status="accepted",
                stage="queued",
                accepted_at=now,
                updated_at=now,
            )
            self._records[invocation_id] = record
            self._append_event(
                record,
                "capability.accepted",
                "info",
                {"capabilityId": CAPABILITY_ID, "stage": "queued"},
            )

        thread = threading.Thread(
            target=self._execute,
            args=(invocation_id, base_url, token, timeout_seconds),
            name=f"capability-{invocation_id}",
            daemon=True,
        )
        thread.start()
        return self.get(invocation_id), True

    def get(self, invocation_id: str) -> dict[str, object]:
        with self._lock:
            record = self._records.get(invocation_id)
            if record is None:
                raise InvocationNotFound(invocation_id)
            return self._snapshot(record)

    def _execute(
        self,
        invocation_id: str,
        base_url: str,
        token: str,
        timeout_seconds: float,
    ) -> None:
        self._transition(
            invocation_id,
            status="running",
            stage="requesting-state-agent-health",
            event_type="capability.started",
            severity="info",
            payload={"stage": "requesting-state-agent-health"},
        )
        try:
            result = self._capability(base_url, token, timeout_seconds)
            wire_result = result.to_wire()
            self._transition(
                invocation_id,
                status="running",
                stage="health-observed",
                event_type="capability.evidence",
                severity="info" if wire_result["healthy"] else "warning",
                payload={
                    "kind": "state-agent-health",
                    "observation": wire_result,
                },
            )
            with self._lock:
                record = self._records[invocation_id]
                record.result = wire_result
            self._transition(
                invocation_id,
                status="succeeded",
                stage="completed",
                event_type="capability.succeeded",
                severity="info",
                payload={"stage": "completed"},
            )
        except StateAgentInspectionError as exc:
            self._fail(invocation_id, exc.code, str(exc))
        except ValueError as exc:
            self._fail(invocation_id, "invalid_capability_input", str(exc))
        except Exception:
            self._fail(
                invocation_id,
                "capability_internal_error",
                "The capability failed unexpectedly.",
            )

    def _fail(self, invocation_id: str, code: str, message: str) -> None:
        with self._lock:
            record = self._records[invocation_id]
            record.error = {"code": code, "message": message}
        self._transition(
            invocation_id,
            status="failed",
            stage="failed",
            event_type="capability.failed",
            severity="error",
            payload={"code": code, "message": message},
        )

    def _transition(
        self,
        invocation_id: str,
        *,
        status: str,
        stage: str,
        event_type: str,
        severity: str,
        payload: dict[str, object],
    ) -> None:
        with self._lock:
            record = self._records[invocation_id]
            record.status = status
            record.stage = stage
            record.updated_at = _now()
            self._append_event(record, event_type, severity, payload)

    def _append_event(
        self,
        record: InvocationRecord,
        event_type: str,
        severity: str,
        payload: dict[str, object],
    ) -> None:
        sequence = record.events[-1]["sequence"] + 1 if record.events else 1
        record.events.append(
            {
                "sequence": sequence,
                "type": event_type,
                "occurredAt": _now(),
                "severity": severity,
                "payload": payload,
            }
        )
        if len(record.events) > MAX_EVENTS_PER_INVOCATION:
            del record.events[: len(record.events) - MAX_EVENTS_PER_INVOCATION]

    def _snapshot(self, record: InvocationRecord) -> dict[str, object]:
        return deepcopy(
            {
                "protocolVersion": 1,
                "workerInstanceId": self.instance_id,
                "invocationId": record.invocation_id,
                "operationId": record.operation_id,
                "capabilityId": CAPABILITY_ID,
                "status": record.status,
                "stage": record.stage,
                "acceptedAt": record.accepted_at,
                "updatedAt": record.updated_at,
                "events": record.events,
                "result": record.result,
                "error": record.error,
            }
        )


def _validate_request(
    invocation_id: str, request: object
) -> tuple[str, str, str, float]:
    _validate_uuid(invocation_id, "invocation ID")
    if not isinstance(request, dict):
        raise ValueError("request must be an object")
    allowed = {"protocolVersion", "invocationId", "operationId", "capabilityId", "input"}
    unknown = set(request) - allowed
    if unknown:
        raise ValueError(f"unknown request fields: {', '.join(sorted(unknown))}")
    if request.get("protocolVersion") != 1:
        raise ValueError("unsupported worker protocol version")
    if request.get("invocationId") != invocation_id:
        raise ValueError("request invocation ID does not match route")
    if request.get("capabilityId") != CAPABILITY_ID:
        raise ValueError("unsupported capability")
    operation_id = request.get("operationId")
    if not isinstance(operation_id, str):
        raise ValueError("operation ID must be a string")
    _validate_uuid(operation_id, "operation ID")
    inputs = request.get("input")
    if not isinstance(inputs, dict):
        raise ValueError("capability input must be an object")
    input_unknown = set(inputs) - {"baseUrl", "token", "timeoutSeconds"}
    if input_unknown:
        raise ValueError(
            f"unknown capability input fields: {', '.join(sorted(input_unknown))}"
        )
    base_url = inputs.get("baseUrl")
    token = inputs.get("token")
    timeout_seconds = inputs.get("timeoutSeconds")
    if not isinstance(base_url, str) or not isinstance(token, str):
        raise ValueError("baseUrl and token must be strings")
    if not isinstance(timeout_seconds, (int, float)) or isinstance(
        timeout_seconds, bool
    ):
        raise ValueError("timeoutSeconds must be numeric")
    return operation_id, base_url, token, float(timeout_seconds)


def _validate_uuid(value: str, name: str) -> None:
    try:
        parsed = uuid.UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise ValueError(f"{name} must be a UUID") from None
    if str(parsed) != value:
        raise ValueError(f"{name} must use canonical UUID form")


def _fingerprint(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")

