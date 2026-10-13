#!/usr/bin/env python3
"""Validate add-on release channels and emit their exact image tags."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


STABLE_VERSION_RE = re.compile(
    r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$"
)
DEVELOPMENT_VERSION_RE = re.compile(
    r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-beta\.([1-9][0-9]*)$"
)
MANAGEMENT_VERSION_RE = re.compile(
    r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-mgmt\.([1-9][0-9]*)$"
)
MANAGEMENT_RELEASE_BRANCH = "feature/management-app-foundation"


class ReleaseValidationError(ValueError):
    """Raised when a branch and version do not form a valid release channel."""


ABSENT_MANIFEST_RE = re.compile(
    r"(?:^|:\s)(?:not found|manifest unknown(?::.*)?)$", re.IGNORECASE
)


@dataclass(frozen=True)
class ReleaseMetadata:
    """Validated release metadata consumed by the image workflow."""

    branch: str
    channel: str
    version: str
    image_tags: tuple[str, ...]

    @property
    def publishes_latest(self) -> bool:
        return "latest" in self.image_tags


def release_metadata(branch: str, version: str) -> ReleaseMetadata:
    """Return fail-closed release metadata for a supported branch."""
    if branch == "main":
        if STABLE_VERSION_RE.fullmatch(version) is None:
            raise ReleaseValidationError(
                "main requires a stable x.y.z version without a prerelease suffix"
            )
        return ReleaseMetadata(branch, "stable", version, (version, "latest"))

    if branch == "develop":
        if DEVELOPMENT_VERSION_RE.fullmatch(version) is None:
            raise ReleaseValidationError(
                "develop requires a prerelease version in the form x.y.z-beta.N"
            )
        return ReleaseMetadata(branch, "development", version, (version,))

    if branch == MANAGEMENT_RELEASE_BRANCH:
        if MANAGEMENT_VERSION_RE.fullmatch(version) is None:
            raise ReleaseValidationError(
                "feature/management-app-foundation requires a prerelease version "
                "in the form x.y.z-mgmt.N"
            )
        return ReleaseMetadata(branch, "management-test", version, (version,))

    raise ReleaseValidationError(
        f"unsupported release branch {branch!r}; expected 'main', 'develop', or "
        f"{MANAGEMENT_RELEASE_BRANCH!r}"
    )


def write_github_output(path: Path, metadata: ReleaseMetadata) -> None:
    """Write validated values using GitHub Actions' output-file format."""
    with path.open("a", encoding="utf-8") as output:
        output.write(f"channel={metadata.channel}\n")
        output.write(
            f"publish_latest={'true' if metadata.publishes_latest else 'false'}\n"
        )
        output.write("image_tags<<PETLIBRO_IMAGE_TAGS\n")
        output.write("\n".join(metadata.image_tags))
        output.write("\nPETLIBRO_IMAGE_TAGS\n")


def ensure_image_tag_available(
    reference: str,
    *,
    run: object = subprocess.run,
) -> None:
    """Fail unless a registry lookup definitively reports an absent manifest."""
    if not reference or ":" not in reference.rsplit("/", 1)[-1]:
        raise ReleaseValidationError("image tag reference must include a non-empty tag")
    try:
        result = run(
            ["docker", "buildx", "imagetools", "inspect", reference],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as error:
        raise ReleaseValidationError(f"image tag lookup could not start: {error}") from error

    if result.returncode == 0:
        raise ReleaseValidationError(
            f"image tag {reference} already exists; increment addon/config.yaml instead "
            "of overwriting a release"
        )

    detail = (result.stderr or result.stdout or "").strip()
    last_line = detail.splitlines()[-1] if detail else ""
    if ABSENT_MANIFEST_RE.search(last_line):
        return
    raise ReleaseValidationError(
        f"image tag lookup for {reference} was indeterminate"
        + (f": {last_line}" if last_line else "")
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--branch")
    parser.add_argument("--version")
    parser.add_argument("--github-output", type=Path)
    parser.add_argument("--check-image-tag")
    args = parser.parse_args(argv)
    release_args = (args.branch, args.version, args.github_output)
    if args.check_image_tag:
        if any(value is not None for value in release_args):
            parser.error("--check-image-tag cannot be combined with release metadata options")
    elif any(value is None for value in release_args):
        parser.error("--branch, --version, and --github-output are required together")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.check_image_tag:
        try:
            ensure_image_tag_available(args.check_image_tag)
        except ReleaseValidationError as error:
            print(f"release validation failed: {error}", file=sys.stderr)
            return 2
        print(f"Confirmed image tag is absent: {args.check_image_tag}")
        return 0

    try:
        metadata = release_metadata(args.branch, args.version)
    except ReleaseValidationError as error:
        print(f"release validation failed: {error}", file=sys.stderr)
        return 2

    write_github_output(args.github_output, metadata)
    print(
        f"Validated {metadata.channel} release {metadata.version} on "
        f"{metadata.branch}; tags: {', '.join(metadata.image_tags)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
