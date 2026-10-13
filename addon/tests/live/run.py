#!/usr/bin/env python3
"""PLAF203 live qualification: non-mutating consumers by default.

Uses Python's standard library. Playwright is a separate optional Node process.
All subprocesses are owned, bounded, and cleaned up. No feeder commands are sent.
"""
from __future__ import annotations

import argparse
import contextlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
ARTIFACTS = HERE / "artifacts"
VERDICTS = ("PASS", "FAIL", "REVIEW", "SKIPPED")
ENV_KEYS = {
    "TEST_ADDON_HOST", "TEST_GO2RTC_RTSP_PORT", "TEST_GO2RTC_API_PORT",
    "TEST_STREAM_NAME", "TEST_GO2RTC_BINARY", "TEST_FFMPEG_BINARY",
    "TEST_NODE_BINARY", "TEST_EXPECT_AUDIO", "TEST_AUDIO_STIMULUS_PRESENT",
    "TEST_FEEDER_IP", "TEST_FEEDER_UID", "TEST_NATIVE_HARNESS_DIR",
    "TEST_FRIGATE_RESTREAM_URL", "TEST_ADDON_IMAGE_DIGEST",
    "TEST_BROWSER_HEADLESS", "TEST_STARTUP_SECONDS",
}


def load_env(path: Path) -> dict[str, str]:
    values = {}
    if path.exists():
        for i, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                raise ValueError(f"Invalid .env entry at line {i}; use KEY=value")
            key, val = (s.strip() for s in line.split("=", 1))
            if not re.fullmatch(r"[A-Z_][A-Z_0-9]*", key):
                raise ValueError(f"Invalid environment key on line {i}")
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
            values[key] = val
    # Shell-provided env wins, but only recognized names are imported.
    values.update({k: os.environ[k] for k in ENV_KEYS if k in os.environ})
    return values


def truth(s: str | None) -> bool:
    return (s or "").lower() in ("1", "true", "yes", "on")


def require_config(c: dict[str, str], *keys: str) -> None:
    missing = [k for k in keys if not c.get(k)]
    if missing:
        raise ValueError("Missing configuration: " + ", ".join(missing))


def only_status(graph: dict, name: str) -> dict:
    """Summarize the graph; never persist source URLs, SDP, IPs, or tokens."""
    stream = graph.get(name, {})
    if not isinstance(stream, dict):
        stream = {}
    producers = stream.get("producers") or []
    consumers = stream.get("consumers") or []
    return {
        "configured": name in graph,
        "active_producers": sum(isinstance(p, dict) and p.get("id") is not None for p in producers),
        "configured_producers": len(producers),
        "configured_ffmpeg_sources": sum(
            isinstance(p, dict) and str(p.get("url", "")).startswith("ffmpeg:")
            for p in producers
        ),
        "consumers": len(consumers),
        "consumer_protocols": sorted(str(x.get("format_name", "unknown")) for x in consumers if isinstance(x, dict)),
        "active_ffmpeg_producers": sum(isinstance(p, dict) and p.get("id") is not None and p.get("format_name") == "ffmpeg" for p in producers),
    }


def create_private_dir(base: Path) -> Path:
    base.mkdir(parents=True, exist_ok=True)
    os.chmod(base, 0o700)
    return Path(tempfile.mkdtemp(prefix="run-", dir=base))


def write_private(path: Path, value: str) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(value)


def url_host(host: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9.:-]+", host):
        raise ValueError("TEST_ADDON_HOST must be a hostname or IP, not a URL")
    return f"[{host}]" if ":" in host else host


def fresh_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def terminate(proc: subprocess.Popen | None) -> None:
    if not proc or proc.poll() is not None:
        return
    # Only terminate the process group spawned by this test, never shared services.
    with contextlib.suppress(ProcessLookupError):
        os.killpg(proc.pid, signal.SIGTERM)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(proc.pid, signal.SIGKILL)
        proc.wait(timeout=5)


def kill_now(proc: subprocess.Popen | None) -> None:
    """Abruptly stop only a process group created by this runner."""
    if not proc or proc.poll() is not None:
        return
    with contextlib.suppress(ProcessLookupError):
        os.killpg(proc.pid, signal.SIGKILL)
    proc.wait(timeout=5)


def read_json(url: str, timeout: float = 5) -> dict:
    with urlopen(url, timeout=timeout) as res:
        value = json.loads(res.read(2_000_000))
    if not isinstance(value, dict):
        raise ValueError("Expected JSON object")
    return value


class ScenarioStatus:
    """Single-line interactive progress, with clean non-TTY output."""

    FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
    SYMBOLS = {"PASS": "✓", "FAIL": "✗", "REVIEW": "!", "SKIPPED": "–"}

    def __init__(self, out=None, animated: bool | None = None):
        self.out = out if out is not None else sys.stdout
        self.animated = (
            self.out.isatty() and os.environ.get("TERM") not in (None, "", "dumb")
            if animated is None else animated
        )
        self.active: str | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    def start(self, name: str) -> None:
        if self.active is not None:
            raise RuntimeError(f"Scenario {self.active} is still running")
        self.active = name
        if not self.animated:
            return
        self._stop.clear()
        self._draw(f"{self.FRAMES[0]} RUNNING {name}")
        self._thread = threading.Thread(target=self._animate, args=(name,), daemon=True)
        self._thread.start()

    def _draw(self, content: str, final: bool = False) -> None:
        with self._lock:
            print("\r\033[2K" + content, end="\n" if final else "", file=self.out, flush=True)

    def _animate(self, name: str) -> None:
        frame = 1
        while not self._stop.wait(0.12):
            self._draw(f"{self.FRAMES[frame % len(self.FRAMES)]} RUNNING {name}")
            frame += 1

    def finish(self, name: str, verdict: str, reason: str) -> None:
        if self.active is not None and self.active != name:
            raise RuntimeError(f"Expected scenario {self.active}, got {name}")
        if self.active is not None:
            self._stop.set()
            if self._thread is not None:
                self._thread.join()
                self._thread = None
            self.active = None
        result = f"{verdict:7s} {name}: {reason or 'complete'}"
        if self.animated:
            self._draw(f"{self.SYMBOLS[verdict]} {result}", final=True)
        else:
            print(result, file=self.out, flush=True)


class Runner:
    def __init__(self, config: dict[str, str], args: argparse.Namespace):
        self.c = config
        self.args = args
        self.directory = create_private_dir(Path(args.artifacts))
        self.results: list[dict] = []
        self.status = ScenarioStatus()
        self.host = url_host(config.get("TEST_ADDON_HOST", ""))
        self.stream = config.get("TEST_STREAM_NAME", "")
        self.rtsp = f"rtsp://{self.host}:{config.get('TEST_GO2RTC_RTSP_PORT','8554')}/{quote(self.stream, safe='')}"
        self.api = f"http://{self.host}:{config.get('TEST_GO2RTC_API_PORT','1984')}"
        self.ffmpeg = config.get("TEST_FFMPEG_BINARY", "ffmpeg")
        self.node = config.get("TEST_NODE_BINARY", "node")
        self.go2rtc = config.get("TEST_GO2RTC_BINARY", "")
        self.started = datetime.now(timezone.utc).isoformat()
        self.baseline: dict | None = None

    def graph(self) -> dict:
        return only_status(read_json(f"{self.api}/api/streams"), self.stream)

    def record(self, name: str, verdict: str, details: dict | None = None, reason: str = "") -> None:
        assert verdict in VERDICTS
        item = {"scenario": name, "verdict": verdict, "reason": reason, "evidence": details or {}}
        self.results.append(item)
        self.status.finish(name, verdict, reason)
        self.save()

    @contextlib.contextmanager
    def scenario(self, name: str):
        self.status.start(name)
        try:
            yield
        except BaseException:
            if self.status.active == name:
                self.record(name, "FAIL", reason="scenario raised before reporting a verdict")
            raise
        else:
            if self.status.active == name:
                self.record(name, "FAIL", reason="scenario returned without reporting a verdict")

    def save(self) -> None:
        report = {
            "schema_version": 1,
            "started_utc": self.started,
            "finished_utc": datetime.now(timezone.utc).isoformat(),
            "suite": self.args.suite,
            "target": {"addon_host": self.c.get("TEST_ADDON_HOST"), "stream_name": self.stream,
                       "operator_asserted_image_digest": self.c.get("TEST_ADDON_IMAGE_DIGEST") or None},
            "results": self.results,
            "overall": "FAIL" if any(x["verdict"] == "FAIL" for x in self.results)
                       else "INCOMPLETE" if any(x["verdict"] in ("REVIEW", "SKIPPED") for x in self.results)
                       else "PASS",
        }
        (self.directory / "results.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        rows = [f"# Live qualification: {report['overall']}", "", f"Suite: {self.args.suite}",
                f"Started (UTC): {self.started}", "", "| Scenario | Verdict | Note |", "|---|---|---|"]
        for item in self.results:
            note = item["reason"].replace("|", "\\|").replace("\n", " ")
            rows.append(f"| {item['scenario']} | {item['verdict']} | {note} |")
        (self.directory / "report.md").write_text("\n".join(rows) + "\n", encoding="utf-8")

    def preflight(self) -> bool:
        for name, binary in (("ffmpeg", self.ffmpeg), ("node", self.node)):
            if name == "node" and self.args.suite == "smoke" and self.args.skip_browser:
                continue
            if not (shutil.which(binary) or (Path(binary).is_file() if "/" in binary else False)):
                self.record("preflight", "FAIL", reason=f"{name} binary unavailable")
                return False
        try:
            self.baseline = self.graph()
            if not self.baseline["configured"]:
                self.record("preflight", "FAIL", self.baseline, "stream not configured in go2rtc")
                return False
            configured_audio = self.baseline["configured_ffmpeg_sources"] > 0
            if (
                self.args.suite in ("release", "stress")
                and configured_audio != truth(self.c.get("TEST_EXPECT_AUDIO"))
            ):
                self.record(
                    "preflight",
                    "FAIL",
                    self.baseline,
                    "TEST_EXPECT_AUDIO does not match the configured FFmpeg audio source",
                )
                return False
            self.record("preflight", "PASS", self.baseline)
            return True
        except Exception as e:
            self.record("preflight", "FAIL", reason=f"Cannot read go2rtc API: {type(e).__name__}")
            return False

    def evidence_file(self, name: str, suffix: str = ".stderr") -> Path:
        return self.directory / (name + suffix)

    def ffmpeg_cmd(self, url: str, seconds: int, audio: bool = False) -> list[str]:
        cmd = [self.ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "info", "-xerror", "-progress", "pipe:1", "-stats_period", "1",
               "-rtsp_transport", "tcp", "-i", url, "-t", str(seconds), "-map", "0:v:0"]
        if audio:
            cmd += ["-map", "0:a:0"]
        else:
            cmd += ["-an"]
        return cmd + ["-f", "null", "-"]

    def spawn(self, cmd: list[str], name: str, cwd: Path | None = None) -> tuple[subprocess.Popen, object, object]:
        # Private logs; never print commands, which may contain LAN identifiers.
        out = self.evidence_file(name, ".progress").open("w", encoding="utf-8")
        err = self.evidence_file(name, ".stderr").open("w", encoding="utf-8")
        os.chmod(out.name, 0o600)
        os.chmod(err.name, 0o600)
        try:
            proc = subprocess.Popen(cmd, stdout=out, stderr=err, stdin=subprocess.DEVNULL,
                                    start_new_session=True, cwd=cwd)
        except Exception:
            out.close()
            err.close()
            raise
        return proc, out, err

    def finish_ffmpeg(self, proc: subprocess.Popen, out, err, name: str, seconds: int,
                      audio: bool = False, timeout: float | None = None) -> tuple[str, dict, str]:
        timed_out = False
        try:
            proc.wait(timeout=timeout if timeout is not None else seconds + float(self.c.get("TEST_STARTUP_SECONDS", "40")))
        except subprocess.TimeoutExpired:
            timed_out = True
        finally:
            terminate(proc)
            out.close()
            err.close()
        progress = self.evidence_file(name, ".progress").read_text(encoding="utf-8", errors="replace")
        stderr = self.evidence_file(name, ".stderr").read_text(encoding="utf-8", errors="replace")
        matches = re.findall(r"^frame=(\d+)\s*$", progress, re.MULTILINE)
        frames = max((int(s) for s in matches), default=0)
        times = re.findall(r"^out_time_ms=(\d+)", progress, re.MULTILINE)
        # ffmpeg calls the key 'out_time_ms' but its numeric unit is microseconds.
        media_sec = (max(int(s) for s in times) / 1_000_000) if times else 0
        widths = re.findall(r"(?:,|\s)(\d{3,4})x(\d{3,4})(?:,|\s)", stderr)
        video_codec = bool(re.search(r"Video: h264\b", stderr, re.I))
        audio_codec = bool(re.search(r"Audio: (?:aac|opus)\b", stderr, re.I))
        errors = bool(re.search(r"(?:Invalid data found|error while decoding|corrupt decoded frame|concealing \d+ errors)", stderr, re.I))
        ev = {"frames_decoded": frames, "media_seconds": round(media_sec, 2),
              "decoder_reported_h264": video_codec, "audio_track_reported": audio_codec,
              "observed_dimensions": sorted(set("x".join(x) for x in widths)),
              "exit_code": proc.returncode, "timeout": timed_out, "decoder_diagnostics": errors}
        if timed_out or proc.returncode != 0:
            return "FAIL", ev, "decoder exited unsuccessfully or timed out"
        if frames < max(10, int(seconds * 0.70 * 25)) or media_sec < seconds * 0.85:
            return "FAIL", ev, "insufficient decoded video or media time"
        if not video_codec or errors:
            return "FAIL", ev, "missing H.264 or decoder diagnostics"
        if audio and not audio_codec:
            return "FAIL", ev, "audio track missing"
        return "PASS", ev, "decoded media progressed"

    def ffmpeg_case(self, name: str, url: str, seconds: int = 20, audio: bool = False) -> None:
        try:
            p, out, err = self.spawn(self.ffmpeg_cmd(url, seconds, audio), name)
            verdict, evidence, reason = self.finish_ffmpeg(p, out, err, name, seconds, audio)
            self.record(name, verdict, evidence, reason)
        except Exception as e:
            self.record(name, "FAIL", reason=f"Unable to run FFmpeg: {type(e).__name__}")

    def browser(self, audio: bool = False) -> None:
        name = "browser_av" if audio else "browser_video"
        if self.args.skip_browser:
            self.record(name, "SKIPPED", reason="--skip-browser requested")
            return
        script = HERE / "browser.cjs"
        if not (HERE / "node_modules/playwright").exists():
            self.record(name, "FAIL", reason="Playwright not installed in addon/tests/live (npm install)")
            return
        url = f"{self.api}/webrtc.html?src={quote(self.stream, safe='')}&media={'video%2Baudio' if audio else 'video'}"
        payload = {"url": url, "audio": audio,
                   "stimulus": truth(self.c.get("TEST_AUDIO_STIMULUS_PRESENT")),
                   "headless": not self.c.get("TEST_BROWSER_HEADLESS", "1").lower() in ("0", "false", "no")}
        cfg = self.directory / f"{name}.json"
        write_private(cfg, json.dumps(payload))
        output = self.directory / f"{name}.result.json"
        p = None
        try:
            p, out, err = self.spawn([self.node, str(script), str(cfg), str(output)], name)
            try:
                p.wait(timeout=85)
            except subprocess.TimeoutExpired:
                terminate(p)
            finally:
                terminate(p)
                out.close()
                err.close()
            if not output.exists():
                self.record(name, "FAIL", reason=f"Browser test exited without result (exit {p.returncode})")
                return
            ev = json.loads(output.read_text(encoding="utf-8"))
            verdict = ev.get("verdict", "FAIL")
            if p.returncode != 0 and verdict != "FAIL":
                verdict = "FAIL"
            self.record(name, verdict, ev.get("evidence", {}), ev.get("reason", ""))
        except Exception as e:
            if p:
                terminate(p)
            self.record(name, "FAIL", reason=f"Browser test error: {type(e).__name__}")
        finally:
            with contextlib.suppress(FileNotFoundError):
                cfg.unlink()

    @contextlib.contextmanager
    def intermediary(self, name: str, protocol: str):
        if not self.go2rtc:
            raise RuntimeError("TEST_GO2RTC_BINARY is missing")
        api_port, rtsp_port = fresh_port(), fresh_port()
        while rtsp_port == api_port:
            rtsp_port = fresh_port()
        source = self.rtsp if protocol == "rtsp" else f"webrtc:{self.api}/api/webrtc?src={quote(self.stream, safe='')}"
        # JSON is a valid YAML subset. No YAML parser dependency.
        config = {"api": {"listen": f"127.0.0.1:{api_port}"},
                  "rtsp": {"listen": f"127.0.0.1:{rtsp_port}"},
                  "webrtc": {"listen": ""}, "log": {"level": "info"},
                  "streams": {"qualification": source}}
        cfg = self.directory / f"{name}.yaml"
        write_private(cfg, json.dumps(config, indent=2))
        proc, out, err = self.spawn([self.go2rtc, "-config", str(cfg)], name + "-go2rtc")
        try:
            for _ in range(40):
                if proc.poll() is not None:
                    raise RuntimeError("intermediary go2rtc exited")
                try:
                    read_json(f"http://127.0.0.1:{api_port}/api/streams", timeout=1)
                    break
                except (URLError, HTTPError, OSError):
                    time.sleep(0.25)
            else:
                raise RuntimeError("intermediary go2rtc not ready")
            yield f"rtsp://127.0.0.1:{rtsp_port}/qualification"
        finally:
            terminate(proc)
            out.close()
            err.close()
            with contextlib.suppress(FileNotFoundError):
                cfg.unlink()

    def chain(self, protocol: str) -> None:
        name = f"chain_{protocol}"
        if not self.go2rtc:
            self.record(name, "SKIPPED", reason="TEST_GO2RTC_BINARY not configured")
            return
        try:
            with self.intermediary(name, protocol) as url:
                self.ffmpeg_case(name, url, 25, audio=(protocol == "whep" and truth(self.c.get("TEST_EXPECT_AUDIO"))))
        except Exception as e:
            self.record(name, "FAIL", reason=f"Intermediary failed: {type(e).__name__}: {e}")

    def multi(self, count: int = 2, seconds: int = 25, abrupt: bool = False) -> None:
        name = "multi_abrupt" if abrupt else "multi_consumer"
        handles = []
        before_abrupt = None
        after_abrupt = None
        try:
            for i in range(count):
                handles.append((f"{name}_{i}", *self.spawn(self.ffmpeg_cmd(self.rtsp, seconds, False), f"{name}_{i}")))
            if abrupt:
                # Wait for evidence of actual media before killing one viewer.
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline:
                    prog = self.evidence_file(f"{name}_0", ".progress")
                    if prog.exists() and re.search(r"^frame=[1-9]\d*", prog.read_text(errors="replace"), re.M):
                        break
                    time.sleep(0.3)
                before_abrupt = self.graph()
                kill_now(handles[0][1])
                for _ in range(20):
                    current = self.graph()
                    if (
                        current["consumers"] < before_abrupt["consumers"]
                        and current["active_producers"] > 0
                    ):
                        after_abrupt = current
                        break
                    time.sleep(0.25)
            details = []
            for n, p, out, err in handles:
                if abrupt and n.endswith("_0"):
                    out.close()
                    err.close()
                    continue
                verdict, ev, reason = self.finish_ffmpeg(p, out, err, n, seconds, timeout=seconds + 45)
                details.append({"viewer": n, "verdict": verdict, **ev})
            graph_isolated = not abrupt or after_abrupt is not None
            passed = (
                graph_isolated
                and len(details) == count - int(abrupt)
                and all(x["verdict"] == "PASS" for x in details)
            )
            evidence = {"survivors": details}
            if abrupt:
                evidence.update(
                    graph_before_abrupt=before_abrupt,
                    graph_after_abrupt=after_abrupt,
                )
            self.record(
                name,
                "PASS" if passed else "FAIL",
                evidence,
                "failed consumer detached and surviving viewer decoded"
                if passed and abrupt
                else "all surviving viewers decoded"
                if passed
                else "viewer or consumer-detachment failure",
            )
        except Exception as e:
            self.record(name, "FAIL", reason=f"Concurrent viewers: {type(e).__name__}")
        finally:
            for _, p, out, err in handles:
                terminate(p)
                if not out.closed:
                    out.close()
                if not err.closed:
                    err.close()

    def native(self) -> None:
        name = "native_direct"
        source: Path | None = None
        if not self.args.allow_direct_session:
            self.record(name, "SKIPPED", reason="requires --allow-direct-session")
            return
        try:
            require_config(self.c, "TEST_NATIVE_HARNESS_DIR", "TEST_FEEDER_IP", "TEST_FEEDER_UID")
            directory = Path(self.c["TEST_NATIVE_HARNESS_DIR"]).expanduser().resolve()
            if not (directory / "main.go").exists():
                raise ValueError("native Go harness main.go missing")
            source = self.directory / "native-source.txt"
            if not re.fullmatch(r"[\w.:-]+", self.c["TEST_FEEDER_IP"]):
                raise ValueError("invalid feeder address")
            write_private(source, "petlibro://" + self.c["TEST_FEEDER_IP"] + "?uid=" + quote(self.c["TEST_FEEDER_UID"], safe="") + "&quality=hd")
            cmd = ["go", "run", "main.go", "--source-file", str(source), "--duration", "20s",
                   "--events", str(self.directory / "native-events.jsonl"),
                   "--logs", str(self.directory / "native-harness.log")]
            proc, out, err = self.spawn(cmd, name, cwd=directory)
            try:
                proc.wait(timeout=90)
            except subprocess.TimeoutExpired:
                terminate(proc)
            finally:
                terminate(proc)
                out.close()
                err.close()
            events = []
            evfile = self.directory / "native-events.jsonl"
            if evfile.exists():
                for line in evfile.read_text(encoding="utf-8").splitlines():
                    events.append(json.loads(line))
            summaries = [x for x in events if x.get("event") == "summary"]
            failures = [x for x in events if x.get("event", "").endswith("failed")]
            has_closed = any(x.get("event") == "closed" for x in events)
            valid = proc.returncode == 0 and not failures and has_closed and summaries and summaries[-1].get("video_units", 0) >= 200
            self.record(name, "PASS" if valid else "FAIL",
                        {"exit_code": proc.returncode, "closed": has_closed,
                         "summary": summaries[-1] if summaries else None, "failure_count": len(failures)},
                        "native video and teardown" if valid else "native error or incomplete media")
        except Exception as e:
            self.record(name, "FAIL", reason=f"Native harness: {type(e).__name__}")
        finally:
            if source is not None:
                with contextlib.suppress(FileNotFoundError):
                    source.unlink()

    def cleanup_check(self) -> None:
        # Configured stream definitions remain after shutdown. Compare active states.
        if not self.baseline:
            return
        try:
            for _ in range(20):
                current = self.graph()
                if current["consumers"] <= self.baseline["consumers"] and current["active_producers"] <= self.baseline["active_producers"]:
                    break
                time.sleep(1)
            else:
                self.record("cleanup", "FAIL", current, "consumers/producers did not return to baseline")
                return
            if self.baseline["consumers"] != 0:
                self.record("cleanup", "REVIEW", current, "pre-existing viewers; idle teardown not independently proven")
            else:
                self.record("cleanup", "PASS", current, "active graph returned to baseline")
        except Exception as e:
            self.record("cleanup", "FAIL", reason=f"Graph recheck failed: {type(e).__name__}")

    def execute(self) -> None:
        with self.scenario("preflight"):
            ready = self.preflight()
        if not ready:
            return
        try:
            with self.scenario("rtsp_video"):
                self.ffmpeg_case("rtsp_video", self.rtsp, seconds=20)
            with self.scenario("browser_video"):
                self.browser(audio=False)
            if self.args.suite in ("release", "stress"):
                with self.scenario("rtsp_native_audio"):
                    if truth(self.c.get("TEST_EXPECT_AUDIO")):
                        self.ffmpeg_case("rtsp_native_audio", self.rtsp, seconds=20, audio=True)
                    else:
                        self.record("rtsp_native_audio", "SKIPPED", reason="TEST_EXPECT_AUDIO is false")
                with self.scenario("browser_av"):
                    if truth(self.c.get("TEST_EXPECT_AUDIO")):
                        self.browser(audio=True)
                    else:
                        self.record("browser_av", "SKIPPED", reason="TEST_EXPECT_AUDIO is false")
                with self.scenario("chain_rtsp"):
                    self.chain("rtsp")
                with self.scenario("chain_whep"):
                    self.chain("whep")
                with self.scenario("multi_consumer"):
                    self.multi()
                with self.scenario("multi_abrupt"):
                    self.multi(abrupt=True)
                with self.scenario("soak"):
                    self.ffmpeg_case("soak", self.rtsp, seconds=self.args.soak_seconds)
                with self.scenario("frigate_restream_decode"):
                    if self.c.get("TEST_FRIGATE_RESTREAM_URL"):
                        self.ffmpeg_case("frigate_restream_decode", self.c["TEST_FRIGATE_RESTREAM_URL"], seconds=25)
                    else:
                        self.record("frigate_restream_decode", "SKIPPED", reason="TEST_FRIGATE_RESTREAM_URL unset; no Frigate pipeline verification")
            if self.args.suite == "stress":
                with self.scenario("native_direct"):
                    self.native()
                with self.scenario("in_session_resolution_change"):
                    self.record("in_session_resolution_change", "REVIEW", reason="no deliberate transition induced; not validated by stable decoder smoke")
        finally:
            with self.scenario("cleanup"):
                self.cleanup_check()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=("smoke", "release", "stress"), default="smoke")
    parser.add_argument("--env", type=Path, default=HERE / ".env")
    parser.add_argument("--artifacts", type=Path, default=ARTIFACTS)
    parser.add_argument("--soak-seconds", type=int, default=300)
    parser.add_argument("--skip-browser", action="store_true")
    parser.add_argument("--allow-direct-session", action="store_true")
    parser.add_argument("--list", action="store_true", help="List scenarios, no hardware access")
    args = parser.parse_args()
    if args.list:
        print("smoke: preflight, rtsp_video, browser_video, cleanup")
        print("release: smoke + rtsp_native_audio*, browser_av*, chain_rtsp*, chain_whep*, multi_consumer, multi_abrupt, soak, frigate_restream_decode*, cleanup")
        print("stress: release + native_direct* (opt-in), in_session_resolution_change (review only)")
        print("* configuration or explicit permission required")
        return 0
    if args.soak_seconds < 15 or args.soak_seconds > 7200:
        parser.error("--soak-seconds must be between 15 and 7200")
    try:
        c = load_env(args.env)
        require_config(c, "TEST_ADDON_HOST", "TEST_STREAM_NAME")
        r = Runner(c, args)
        print("Private artifacts:", r.directory)
        r.execute()
        r.save()
        overall = json.loads((r.directory / "results.json").read_text())["overall"]
        print("Overall:", overall)
        return 0 if overall == "PASS" else 1 if overall == "FAIL" else 2
    except (ValueError, OSError) as e:
        print(f"Configuration failure: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
