import importlib.util
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts" / "addon_release.py"
SPEC = importlib.util.spec_from_file_location("addon_release", MODULE_PATH)
addon_release = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = addon_release
SPEC.loader.exec_module(addon_release)


def test_main_accepts_stable_version_and_publishes_latest():
    metadata = addon_release.release_metadata("main", "0.3.10")

    assert metadata.channel == "stable"
    assert metadata.image_tags == ("0.3.10", "latest")
    assert metadata.publishes_latest is True


@pytest.mark.parametrize(
    "version",
    ["0.3.10-beta.1", "0.3.10-rc.1", "0.3.10+build.1", "00.3.10"],
)
def test_main_rejects_nonstable_versions(version):
    with pytest.raises(addon_release.ReleaseValidationError):
        addon_release.release_metadata("main", version)


def test_develop_accepts_beta_version_without_latest():
    metadata = addon_release.release_metadata("develop", "0.3.10-beta.1")

    assert metadata.channel == "development"
    assert metadata.image_tags == ("0.3.10-beta.1",)
    assert metadata.publishes_latest is False


@pytest.mark.parametrize(
    "version",
    ["0.3.10", "0.3.10-beta.0", "0.3.10-beta.01", "0.3.10-rc.1"],
)
def test_develop_rejects_versions_outside_beta_convention(version):
    with pytest.raises(addon_release.ReleaseValidationError):
        addon_release.release_metadata("develop", version)


def test_management_branch_accepts_mgmt_version_without_latest():
    metadata = addon_release.release_metadata(
        "feature/management-app-foundation", "0.3.13-mgmt.1"
    )

    assert metadata.channel == "management-test"
    assert metadata.image_tags == ("0.3.13-mgmt.1",)
    assert metadata.publishes_latest is False


@pytest.mark.parametrize(
    "branch,version",
    [
        ("feature/management-app-foundation", "0.3.13"),
        ("feature/management-app-foundation", "0.3.13-mgmt.0"),
        ("feature/management-app-foundation", "0.3.13-mgmt.01"),
        ("feature/management-app-foundation", "0.3.13-beta.1"),
        ("feature/example", "0.3.13-mgmt.1"),
        ("main", "0.3.13-mgmt.1"),
        ("develop", "0.3.13-mgmt.1"),
    ],
)
def test_management_version_is_restricted_to_exact_feature_branch(branch, version):
    with pytest.raises(addon_release.ReleaseValidationError):
        addon_release.release_metadata(branch, version)


def test_unknown_branch_is_rejected():
    with pytest.raises(addon_release.ReleaseValidationError):
        addon_release.release_metadata("feature/example", "0.3.10-beta.1")


def inspect_result(returncode, *, stderr="", stdout=""):
    return SimpleNamespace(returncode=returncode, stderr=stderr, stdout=stdout)


def test_image_tag_lookup_accepts_only_definite_absence():
    calls = []

    def run(command, **kwargs):
        calls.append((command, kwargs))
        return inspect_result(1, stderr="ERROR: ghcr.io/example/addon:1.2.3: not found\n")

    addon_release.ensure_image_tag_available("ghcr.io/example/addon:1.2.3", run=run)

    assert calls[0][0] == [
        "docker", "buildx", "imagetools", "inspect", "ghcr.io/example/addon:1.2.3"
    ]
    assert calls[0][1] == {"capture_output": True, "text": True, "check": False}


def test_image_tag_lookup_rejects_existing_tag():
    with pytest.raises(addon_release.ReleaseValidationError, match="already exists"):
        addon_release.ensure_image_tag_available(
            "ghcr.io/example/addon:1.2.3",
            run=lambda *_args, **_kwargs: inspect_result(0),
        )


@pytest.mark.parametrize(
    "detail",
    [
        "ERROR: denied: denied",
        "ERROR: failed to do request: dial tcp: network is unreachable",
        "ERROR: unexpected status from HEAD request: 429 Too Many Requests",
        "",
    ],
)
def test_image_tag_lookup_fails_closed_on_indeterminate_errors(detail):
    with pytest.raises(addon_release.ReleaseValidationError, match="indeterminate"):
        addon_release.ensure_image_tag_available(
            "ghcr.io/example/addon:1.2.3",
            run=lambda *_args, **_kwargs: inspect_result(1, stderr=detail),
        )


def test_cli_writes_only_the_development_version_tag(tmp_path):
    output = tmp_path / "github-output"

    result = subprocess.run(
        [
            sys.executable,
            str(MODULE_PATH),
            "--branch",
            "develop",
            "--version",
            "0.3.10-beta.2",
            "--github-output",
            str(output),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert output.read_text(encoding="utf-8") == (
        "channel=development\n"
        "publish_latest=false\n"
        "image_tags<<PETLIBRO_IMAGE_TAGS\n"
        "0.3.10-beta.2\n"
        "PETLIBRO_IMAGE_TAGS\n"
    )


def test_cli_fails_before_emitting_outputs_for_invalid_pairing(tmp_path):
    output = tmp_path / "github-output"

    result = subprocess.run(
        [
            sys.executable,
            str(MODULE_PATH),
            "--branch",
            "develop",
            "--version",
            "0.3.10",
            "--github-output",
            str(output),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 2
    assert "develop requires" in result.stderr
    assert not output.exists()


def test_cli_writes_only_the_management_version_tag(tmp_path):
    output = tmp_path / "github-output"

    result = subprocess.run(
        [
            sys.executable,
            str(MODULE_PATH),
            "--branch",
            "feature/management-app-foundation",
            "--version",
            "0.3.13-mgmt.1",
            "--github-output",
            str(output),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert output.read_text(encoding="utf-8") == (
        "channel=management-test\n"
        "publish_latest=false\n"
        "image_tags<<PETLIBRO_IMAGE_TAGS\n"
        "0.3.13-mgmt.1\n"
        "PETLIBRO_IMAGE_TAGS\n"
    )


def test_workflow_uses_validated_tags_for_both_publish_steps():
    workflow = (ROOT / ".github" / "workflows" / "publish-addon-image.yml").read_text(
        encoding="utf-8"
    )

    assert "      - main\n      - develop\n" in workflow
    assert "github.repository == 'tannerln7/Petlibro-Home-Assistant'" in workflow
    assert workflow.count("${{ needs.prepare.outputs.image_tags }}") == 2
    assert "${{ needs.prepare.outputs.version }}\n            latest" not in workflow
    assert 'scripts/addon_release.py --check-image-tag "${IMAGE}:${VERSION}"' in workflow
    assert "    needs: validate\n" in workflow
    assert "PYTHON_BIN=.venv/bin/python ./scripts/validate.sh --strict" in workflow
    assert "release_target:" in workflow
    assert "management-test" in workflow
    assert '[[ "$RELEASE_BRANCH" != feature/management-app-foundation ]]' in workflow
