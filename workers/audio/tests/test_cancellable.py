"""Cancelamento e timeout do processo de inferência (sem Demucs/DB)."""

from __future__ import annotations

import sys
import time

import pytest

from worker.adapters.base import SeparationCancelled
from worker.adapters.demucs_adapter import run_cancellable

SLEEP_30 = [sys.executable, "-c", "import time; time.sleep(30)"]


def test_completes_normally() -> None:
    code, out = run_cancellable([sys.executable, "-c", "print('ok')"], timeout=20, poll_seconds=0.1)
    assert code == 0
    assert "ok" in out


def test_cancel_kills_process_quickly() -> None:
    calls = {"n": 0}

    def should_cancel() -> bool:
        calls["n"] += 1
        return calls["n"] >= 2

    t0 = time.monotonic()
    with pytest.raises(SeparationCancelled):
        run_cancellable(SLEEP_30, timeout=60, should_cancel=should_cancel, poll_seconds=0.1)
    assert time.monotonic() - t0 < 10


def test_timeout_kills_process() -> None:
    t0 = time.monotonic()
    with pytest.raises(RuntimeError, match="tempo limite"):
        run_cancellable(SLEEP_30, timeout=0.5, poll_seconds=0.1)
    assert time.monotonic() - t0 < 10


def test_large_output_does_not_block() -> None:
    # Saída maior que o buffer do pipe (64 KB) não pode travar o processo.
    code, out = run_cancellable(
        [sys.executable, "-c", "print('x' * 500_000)"], timeout=20, poll_seconds=0.1
    )
    assert code == 0
    assert len(out) <= 2000
