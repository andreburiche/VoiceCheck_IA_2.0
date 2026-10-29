"""Reprocessa o projeto pavo com Demucs real."""
from __future__ import annotations

import time
import uuid

import httpx

API = "http://127.0.0.1:8010"
PID = "ceecb7c4-86ed-4529-a490-e285251453a6"
AID = "fd311560-2f0b-4f9f-924b-b1a3b4892f52"


def main() -> None:
    c = httpx.Client(base_url=API, timeout=120.0)
    c.post("/api/v1/auth/login", json={"email": "musico@estudio.local", "password": "senha12345"}).raise_for_status()
    csrf = c.cookies.get("em_csrf")
    st = c.get("/api/v1/system/status").json()
    print(
        "adapter",
        st.get("separation_adapter"),
        "contract",
        st.get("allow_contract_stems"),
        "using_silence",
        st.get("using_contract_silence"),
    )
    sep = c.post(
        f"/api/v1/projects/{PID}/separations",
        headers={"X-CSRF-Token": csrf, "Idempotency-Key": f"demucs-{uuid.uuid4()}"},
        json={"source_asset_id": AID, "model_code": "htdemucs", "params": {}},
    )
    print("sep", sep.status_code, sep.text[:300])
    sep.raise_for_status()
    jid = sep.json()["id"]
    for i in range(600):
        time.sleep(2)
        j = c.get(f"/api/v1/processing-jobs/{jid}").json()
        print("poll", i, j.get("status"), j.get("progress"), j.get("error_code"), (j.get("error_message") or "")[:120])
        if j.get("status") in {"completed", "failed", "cancelled"}:
            print("DONE", j.get("status"), j.get("model_version"))
            return
    raise SystemExit("timeout")


if __name__ == "__main__":
    main()
