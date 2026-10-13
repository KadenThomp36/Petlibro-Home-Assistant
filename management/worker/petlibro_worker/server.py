"""Versioned HTTP/JSON worker transport over a private Unix domain socket."""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import socket
import socketserver
import threading
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

from . import PROTOCOL_VERSION, WORKER_VERSION
from .invocations import (
    InvocationConflict,
    InvocationManager,
    InvocationNotFound,
)


MAX_REQUEST_BYTES = 64 * 1024
INVOCATION_ROUTE = re.compile(r"^/v1/invocations/([0-9a-f-]{36})$")


class WorkerUnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, socket_path: str, manager: InvocationManager):
        self.manager = manager
        super().__init__(socket_path, WorkerRequestHandler)


class WorkerRequestHandler(BaseHTTPRequestHandler):
    server: WorkerUnixServer
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path == "/v1/health":
            self._json(
                200,
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "workerVersion": WORKER_VERSION,
                    "workerInstanceId": self.server.manager.instance_id,
                    "status": "ready",
                },
            )
            return
        if path == "/v1/capabilities":
            self._json(
                200,
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": self.server.manager.capabilities(),
                },
            )
            return
        match = INVOCATION_ROUTE.fullmatch(path)
        if match is None:
            self._json(404, {"error": "not_found"})
            return
        try:
            snapshot = self.server.manager.get(match.group(1))
        except InvocationNotFound:
            self._json(404, {"error": "invocation_not_found"})
            return
        self._json(200, snapshot)

    def do_PUT(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        match = INVOCATION_ROUTE.fullmatch(path)
        if match is None:
            self._json(404, {"error": "not_found"})
            return
        try:
            request = self._read_json()
            snapshot, created = self.server.manager.submit(match.group(1), request)
        except ValueError as exc:
            self._json(400, {"error": "invalid_request", "message": str(exc)})
            return
        except InvocationConflict as exc:
            self._json(409, {"error": "invocation_conflict", "message": str(exc)})
            return
        self._json(202 if created else 200, snapshot)

    def _read_json(self) -> object:
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0]
        if content_type.strip().lower() != "application/json":
            raise ValueError("content type must be application/json")
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            raise ValueError("content length is required") from None
        if length < 2 or length > MAX_REQUEST_BYTES:
            raise ValueError("request body size is invalid")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("request body must be valid JSON") from None

    def _json(self, status: int, document: object) -> None:
        payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, _format: str, *_args: Any) -> None:
        return


def serve(socket_path: Path) -> None:
    socket_path = socket_path.resolve()
    socket_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(socket_path.parent, 0o700)
    if socket_path.exists() or socket_path.is_symlink():
        if not socket_path.is_socket():
            raise RuntimeError(f"worker socket path is not a socket: {socket_path}")
        probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        probe.settimeout(0.2)
        try:
            probe.connect(str(socket_path))
        except OSError:
            pass
        else:
            raise RuntimeError(f"worker socket is already active: {socket_path}")
        finally:
            probe.close()
        socket_path.unlink()
    manager = InvocationManager()
    server = WorkerUnixServer(str(socket_path), manager)
    os.chmod(socket_path, 0o600)

    def stop(_signum: int, _frame: object) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
        socket_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--socket",
        default=os.environ.get("PETLIBRO_WORKER_SOCKET", ".data/worker.sock"),
        type=Path,
    )
    args = parser.parse_args()
    serve(args.socket)


if __name__ == "__main__":
    main()

