"""Testes unitários dos guards VoiceCheck (sem FFmpeg)."""

from __future__ import annotations

import os
import time
from pathlib import Path

import pytest

from app.services.voicecheck_media import (
    assert_allowed_filename,
    assert_safe_job_id,
    purge_stale_jobs,
    voicecheck_root,
)


def test_safe_job_id():
    assert assert_safe_job_id("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")
    with pytest.raises(ValueError):
        assert_safe_job_id("../etc/passwd")


def test_allowed_filename():
    assert assert_allowed_filename("ensaio.mp4") == "ensaio.mp4"
    assert assert_allowed_filename("x.MOV") == "x.MOV"
    with pytest.raises(ValueError):
        assert_allowed_filename("../../secret.wav")
    with pytest.raises(ValueError):
        assert_allowed_filename("malware.exe")


def test_purge_stale_jobs_only_removes_old_job_dirs(tmp_path: Path):
    root = voicecheck_root(tmp_path, "user-1")
    old_job = root / "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
    new_job = root / "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"
    other = root / "nao-e-um-job"
    saved = root / "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33"  # diagnóstico salvo (sem meta.json)
    for d in (old_job, new_job, other, saved):
        d.mkdir()
        (d / "prepared.wav").write_bytes(b"RIFF")
        if d is not saved:
            (d / "meta.json").write_text("{}")
    two_days_ago = time.time() - 48 * 3600
    for d in (old_job, other, saved):
        os.utime(d, (two_days_ago, two_days_ago))

    assert purge_stale_jobs(tmp_path, "user-1", max_age_hours=24) == 1
    assert not old_job.exists()
    assert new_job.exists()
    assert other.exists()  # só apaga pastas com nome de job
    assert saved.exists()  # diagnóstico salvo nunca expira


def test_purge_disabled_with_zero_ttl(tmp_path: Path):
    root = voicecheck_root(tmp_path, "user-1")
    job = root / "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
    job.mkdir()
    (job / "meta.json").write_text("{}")
    os.utime(job, (0, 0))
    assert purge_stale_jobs(tmp_path, "user-1", max_age_hours=0) == 0
    assert job.exists()
