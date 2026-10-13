import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
VALIDATE = ROOT / "scripts" / "validate.sh"


def test_strict_validation_reports_missing_optional_dependencies(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "dirname").symlink_to("/usr/bin/dirname")

    result = subprocess.run(
        ["/bin/bash", str(VALIDATE), "--strict"],
        check=False,
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "PATH": str(bin_dir),
            "PYTHON_BIN": sys.executable,
        },
    )

    assert result.returncode == 2
    assert "Strict validation requires:" in result.stderr
    assert "arm-linux-gnueabihf-gcc" in result.stderr
    assert "shellcheck" in result.stderr
    assert "State Agent" not in result.stdout
