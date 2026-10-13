"""Offline regression checks; these tests never connect to feeder or add-on."""
from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch
import signal

import run


class ConfigTests(unittest.TestCase):
    def test_env_and_override(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / '.env'
            f.write_text('# doc\nTEST_STREAM_NAME="camera 1"\nTEST_ADDON_HOST=localhost\n')
            with patch.dict('os.environ', {'TEST_STREAM_NAME': 'override'}):
                c = run.load_env(f)
            self.assertEqual(c['TEST_STREAM_NAME'], 'override')
            self.assertEqual(c['TEST_ADDON_HOST'], 'localhost')

    def test_env_errors(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / '.env'
            f.write_text('broken line\n')
            with self.assertRaisesRegex(ValueError, 'line 1'):
                run.load_env(f)

    def test_source_url_rejects_url_scheme(self):
        with self.assertRaises(ValueError):
            run.url_host('http://localhost:1984')


class GraphTests(unittest.TestCase):
    def test_inactive_definition_not_an_active_producer(self):
        g = {'feed': {'producers': [{'url': 'petlibro://private'},
                                    {'url': 'ffmpeg:feed#audio=opus'}], 'consumers': []}}
        s = run.only_status(g, 'feed')
        self.assertEqual(s['configured_producers'], 2)
        self.assertEqual(s['configured_ffmpeg_sources'], 1)
        self.assertEqual(s['active_producers'], 0)
        self.assertEqual(s['consumers'], 0)
        self.assertNotIn('url', json.dumps(s))

    def test_active_with_consumer(self):
        g = {'feed': {'producers': [{'id': 2, 'format_name': 'petlibro'},
                                    {'id': 7, 'format_name': 'ffmpeg'}],
                      'consumers': [{'format_name': 'webrtc'}]}}
        s = run.only_status(g, 'feed')
        self.assertEqual(s['active_producers'], 2)
        self.assertEqual(s['active_ffmpeg_producers'], 1)
        self.assertEqual(s['consumer_protocols'], ['webrtc'])

    def test_preflight_rejects_audio_expectation_mismatch(self):
        fake = object.__new__(run.Runner)
        fake.ffmpeg = "ffmpeg"
        fake.node = "node"
        fake.args = type("Args", (), {"suite": "release", "skip_browser": False})()
        fake.c = {"TEST_EXPECT_AUDIO": "0"}
        fake.baseline = None
        fake.graph = lambda: {
            "configured": True,
            "configured_ffmpeg_sources": 1,
        }
        recorded = []
        fake.record = lambda *args, **kwargs: recorded.append((args, kwargs))

        with patch("run.shutil.which", return_value="/usr/bin/tool"):
            self.assertFalse(fake.preflight())

        self.assertIn("does not match", recorded[0][0][3])


class FFmpegVerdictTests(unittest.TestCase):
    def test_command_decodes_not_remuxes(self):
        class Config: pass
        fake = object.__new__(run.Runner)
        fake.ffmpeg = 'ffmpeg'
        c = fake.ffmpeg_cmd('rtsp://127.0.0.1:8554/camera', 15)
        self.assertIn('-progress', c)
        self.assertIn('pipe:1', c)
        self.assertNotIn('copy', c)
        self.assertEqual(c[-3:], ['-f', 'null', '-'])


class TerminalStatusTests(unittest.TestCase):
    def test_non_tty_output_remains_one_final_line(self):
        import io
        out = io.StringIO()
        status = run.ScenarioStatus(out=out, animated=False)
        status.start("rtsp_video")
        status.finish("rtsp_video", "PASS", "decoded media progressed")
        self.assertEqual(out.getvalue(), "PASS    rtsp_video: decoded media progressed\n")

    def test_tty_spinner_rewrites_running_line_and_shows_symbol(self):
        import io
        out = io.StringIO()
        status = run.ScenarioStatus(out=out, animated=True)
        status.start("rtsp_video")
        status.finish("rtsp_video", "FAIL", "decoder timed out")
        self.assertIn("RUNNING rtsp_video", out.getvalue())
        self.assertIn("\r\033[2K✗ FAIL", out.getvalue())
        self.assertTrue(out.getvalue().endswith("decoder timed out\n"))

    def test_scenario_does_not_silently_succeed_without_verdict(self):
        import io
        fake = object.__new__(run.Runner)
        fake.status = run.ScenarioStatus(out=io.StringIO(), animated=False)
        fake.results = []
        fake.directory = Path(tempfile.mkdtemp())
        fake.args = type('A', (), {'suite': 'smoke'})()
        fake.c = {'TEST_ADDON_HOST': 'localhost'}
        fake.stream = 'camera'
        fake.started = 'test'
        try:
            with fake.scenario("rtsp_video"):
                pass
            self.assertEqual(fake.results[0]['verdict'], 'FAIL')
            self.assertIn('without reporting', fake.results[0]['reason'])
        finally:
            import shutil
            shutil.rmtree(fake.directory)


class ProcessLifecycleTests(unittest.TestCase):
    def test_kill_now_uses_sigkill_for_owned_process_group(self):
        class Process:
            pid = 123

            @staticmethod
            def poll():
                return None

            @staticmethod
            def wait(timeout):
                self.assertEqual(timeout, 5)

        with patch("run.os.killpg") as killpg:
            run.kill_now(Process())

        killpg.assert_called_once_with(123, signal.SIGKILL)


if __name__ == '__main__':
    unittest.main()
