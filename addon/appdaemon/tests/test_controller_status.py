import datetime
import json

from controller_status import ControllerStatusWriter
from state_agent import FeederTruth
from state_coordinator import FeederState
from test_state_agent import core_payload


class Logger:
    def warning(self, *_args, **_kwargs):
        pass


class Coordinator:
    state = FeederState.READY
    mqtt_connected = True
    state_api_healthy = True
    pending_write = None

    def __init__(self, truth):
        self.truth = truth

    def latest_truth(self):
        return self.truth

    def is_ready_for_user_write(self):
        return True


def test_controller_status_exports_verified_summary_atomically(tmp_path):
    now = datetime.datetime(2026, 10, 14, 12, 0, tzinfo=datetime.timezone.utc)
    payload = core_payload()
    payload["settings"].update(camera_switch="enabled", audio_url="secret-value")
    truth = FeederTruth.from_dict(payload)
    target = tmp_path / "controller.json"
    writer = ControllerStatusWriter(
        target, "PLAF203", "SERIAL1", Logger(), now=lambda: now
    )

    writer.mark_feeder_activity()
    writer.mark_home_assistant_birth()
    writer.write(Coordinator(truth))

    status = json.loads(target.read_text())
    assert status["reconciliation_state"] == "READY"
    assert status["feeder_mqtt_connected"] is True
    assert status["writes_ready"] is True
    assert status["verified_state"]["revisions"]["core_rev"]
    assert status["verified_state"]["settings"]["camera_switch"] == "enabled"
    assert "audio_url" not in status["verified_state"]["settings"]
    assert target.stat().st_mode & 0o777 == 0o600


def test_controller_status_represents_missing_verified_truth(tmp_path):
    target = tmp_path / "controller.json"
    writer = ControllerStatusWriter(target, "PLAF203", "SERIAL1", Logger())
    coordinator = Coordinator(None)
    coordinator.state = FeederState.DISCONNECTED
    coordinator.mqtt_connected = False
    coordinator.state_api_healthy = False

    writer.write(coordinator)

    status = json.loads(target.read_text())
    assert status["verified_state"] is None
    assert status["reconciliation_state"] == "DISCONNECTED"
