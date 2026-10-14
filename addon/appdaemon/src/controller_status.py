"""Atomic, read-only controller observations for Petlibro Management."""

from __future__ import annotations

import datetime
import json
import os
import tempfile
from pathlib import Path


SCHEMA_VERSION = 1
PUBLIC_SETTING_FIELDS = (
    "camera_switch",
    "camera_resolution",
    "night_vision_mode",
    "video_record_switch",
    "sound_switch",
    "volume",
    "light_switch",
    "bowl_mode",
)


def _timestamp(now: datetime.datetime) -> str:
    return now.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


class ControllerStatusWriter:
    """Publish controller-owned facts without exposing AppDaemon internals."""

    def __init__(self, path, product, serial, logger, now=None):
        self.path = Path(path)
        self.product = str(product)
        self.serial = str(serial)
        self.logger = logger
        self.now = now or (lambda: datetime.datetime.now(datetime.timezone.utc))
        self.last_feeder_activity_at = None
        self.last_home_assistant_birth_at = None
        self.last_verified_at = None
        self.last_verified_revision = None
        self.last_error = None

    def mark_feeder_activity(self):
        self.last_feeder_activity_at = _timestamp(self.now())

    def mark_home_assistant_birth(self):
        self.last_home_assistant_birth_at = _timestamp(self.now())

    def write(self, coordinator, lifecycle="running"):
        now = _timestamp(self.now())
        truth = coordinator.latest_truth()
        verified_state = None
        if truth is not None:
            revision = truth.revisions.core_rev
            if revision != self.last_verified_revision:
                self.last_verified_revision = revision
                self.last_verified_at = now
            verified_state = {
                "verified_at": self.last_verified_at,
                "revisions": truth.revisions.to_dict(),
                "plan_count": truth.plans.count,
                "queue_pending": truth.queue.pending,
                "settings": {
                    field: truth.settings.get(field)
                    for field in PUBLIC_SETTING_FIELDS
                    if field in truth.settings.values
                },
            }
        payload = {
            "schema_version": SCHEMA_VERSION,
            "product": self.product,
            "serial": self.serial,
            "lifecycle": lifecycle,
            "reconciliation_state": coordinator.state.value,
            "feeder_mqtt_connected": coordinator.mqtt_connected,
            "state_agent_healthy": coordinator.state_api_healthy,
            "writes_ready": coordinator.is_ready_for_user_write(),
            "write_pending": coordinator.pending_write is not None,
            "last_feeder_activity_at": self.last_feeder_activity_at,
            "last_home_assistant_birth_at": self.last_home_assistant_birth_at,
            "verified_state": verified_state,
            "last_update": now,
        }
        self._write(payload)

    def _write(self, payload):
        temporary = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            encoded = (json.dumps(payload, sort_keys=True) + "\n").encode()
            with tempfile.NamedTemporaryFile(
                mode="wb", dir=self.path.parent, delete=False
            ) as handle:
                handle.write(encoded)
                handle.flush()
                os.fchmod(handle.fileno(), 0o600)
                temporary = Path(handle.name)
            temporary.replace(self.path)
        except OSError as error:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
            if self.last_error != type(error).__name__:
                self.logger.warning(
                    "management controller status unavailable",
                    error_type=type(error).__name__,
                )
            self.last_error = type(error).__name__
        else:
            self.last_error = None
