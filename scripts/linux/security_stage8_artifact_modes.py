#!/usr/bin/env python3
import fcntl
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys

PRODUCTION_ROOT = "/opt/clover/deployments"
SENSITIVE = re.compile(r"(?:^|/)(?:\.env(?:\.(?:production|local|test))?|[^/]+\.(?:sqlite|db)(?:-(?:wal|shm))?)$")
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC


def fail(message):
    print(f"ERROR|{message}", file=sys.stderr)
    raise SystemExit(2)


def open_absolute_dir(path_value):
    path = Path(path_value)
    if not path.is_absolute() or str(path) != os.path.normpath(str(path)):
        fail(f"noncanonical-directory|{path_value}")
    descriptor = os.open("/", DIR_FLAGS)
    try:
        for component in path.parts[1:]:
            next_descriptor = os.open(component, DIR_FLAGS, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def open_relative_file(root_descriptor, relative, flags=FILE_FLAGS, mode=0o600):
    parts = PurePosixPath(relative).parts
    descriptor = os.dup(root_descriptor)
    try:
        for component in parts[:-1]:
            next_descriptor = os.open(component, DIR_FLAGS, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        result = os.open(parts[-1], flags, mode, dir_fd=descriptor)
        os.close(descriptor)
        return result
    except BaseException:
        os.close(descriptor)
        raise


def load_allowlist(path_value):
    entries = []
    seen = set()
    with open(path_value, "r", encoding="utf-8") as handle:
        for raw in handle:
            relative = raw.rstrip("\r\n")
            if not relative or relative.startswith("#"):
                continue
            parts = PurePosixPath(relative).parts
            if relative.startswith("/") or any(part in ("", ".", "..") for part in parts):
                fail(f"invalid-allowlist-path|{relative}")
            if not SENSITIVE.search(relative):
                fail(f"invalid-allowlist-type|{relative}")
            if relative in seen:
                fail(f"duplicate-allowlist-path|{relative}")
            seen.add(relative)
            entries.append(relative)
    if not entries:
        fail("empty-allowlist")
    return entries


def require_regular(descriptor, label):
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode):
        fail(f"not-regular|{label}")
    return metadata


def close_all(items):
    for item in items:
        try:
            os.close(item[1])
        except OSError:
            pass


def main():
    if len(sys.argv) != 5 or sys.argv[1] != "apply":
        fail("usage|apply root allowlist fixture-flag")
    _operation, root_arg, allowlist_arg, fixture_flag = sys.argv[1:]
    fixture = fixture_flag == "1"
    root = os.path.normpath(root_arg)
    allowlist = os.path.realpath(allowlist_arg)
    repo_root = Path(__file__).resolve().parents[2]
    expected_allowlist = os.path.realpath(repo_root / "ops/security-stage8/package-a/deployment-sensitive-files.allowlist")
    if fixture:
        if not (root.startswith("/tmp/") or root.startswith("/var/tmp/")):
            fail("fixture-root-refused")
        fixture_parent = os.path.dirname(root)
        if os.path.commonpath((fixture_parent, allowlist)) != fixture_parent:
            fail("fixture-allowlist-refused")
    elif root != PRODUCTION_ROOT or allowlist != expected_allowlist:
        fail("production-root-or-allowlist-mismatch")
    entries = load_allowlist(allowlist)
    root_descriptor = open_absolute_dir(root)

    lock_descriptor = open_relative_file(root_descriptor, "deploy.lock", os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
    require_regular(lock_descriptor, "deploy.lock")
    try:
        fcntl.flock(lock_descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        fail("deploy-lock-busy")

    opened = []
    try:
        for relative in entries:
            descriptor = open_relative_file(root_descriptor, relative)
            metadata = require_regular(descriptor, relative)
            opened.append((relative, descriptor, metadata))

        for relative, descriptor, _metadata in opened:
            os.fchmod(descriptor, 0o600)
            if stat.S_IMODE(os.fstat(descriptor).st_mode) != 0o600:
                fail(f"mode-verify-failed|{relative}")
            print(f"APPLIED|{relative}|600")
        print("APPLY_OK|secure-modes-only")
    except FileNotFoundError:
        fail("allowlist-path-missing")
    except OSError as error:
        if error.errno == getattr(os, "ELOOP", 40):
            fail("symlink-refused")
        raise
    finally:
        close_all(opened)
        os.close(lock_descriptor)
        os.close(root_descriptor)


if __name__ == "__main__":
    main()
