"""Smoke local: login → upload → separation → poll."""
from __future__ import annotations

import hashlib
import io
import struct
import time
import uuid
import wave

import httpx

API = "http://127.0.0.1:8010"


def main() -> None:
    c = httpx.Client(base_url=API, timeout=90.0)
    r = c.post(
        "/api/v1/auth/login",
        json={"email": "musico@estudio.local", "password": "senha12345"},
    )
    r.raise_for_status()
    print("login", r.status_code, r.json()["user"]["email"])
    csrf = c.cookies.get("em_csrf")
    st = c.get("/api/v1/system/status").json()
    print(
        "adapter",
        st.get("separation_adapter"),
        "contract_stems",
        st.get("allow_contract_stems"),
    )

    pid = c.post(
        "/api/v1/projects",
        headers={"X-CSRF-Token": csrf},
        json={"name": "docker-ok"},
    ).json()["id"]

    buf = io.BytesIO()
    with wave.open(buf, "w") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(44100)
        silence = struct.pack("<h", 0) * 2
        for _ in range(22050):
            wf.writeframesraw(silence)
    data = buf.getvalue()
    checksum = hashlib.sha256(data).hexdigest()

    init = c.post(
        "/api/v1/uploads/initiate",
        headers={"X-CSRF-Token": csrf},
        json={
            "project_id": pid,
            "filename": "t.wav",
            "mime_type": "audio/wav",
            "size_bytes": len(data),
            "checksum_sha256": checksum,
            "rights_confirmed": True,
        },
    ).json()
    put = c.put(init["upload_url"], content=data, headers={"Content-Type": "audio/wav"})
    print("put", put.status_code)
    put.raise_for_status()

    asset = c.post(
        "/api/v1/uploads/complete",
        headers={"X-CSRF-Token": csrf},
        json={"asset_id": init["asset_id"], "checksum_sha256": checksum},
    ).json()

    sep = c.post(
        f"/api/v1/projects/{pid}/separations",
        headers={"X-CSRF-Token": csrf, "Idempotency-Key": f"dock-{uuid.uuid4()}"},
        json={"source_asset_id": asset["id"], "model_code": "htdemucs", "params": {}},
    )
    print("sep", sep.status_code, sep.text[:240])
    sep.raise_for_status()
    jid = sep.json()["id"]

    for i in range(40):
        time.sleep(1)
        j = c.get(f"/api/v1/processing-jobs/{jid}").json()
        print("poll", i, j.get("status"), j.get("error_code"), j.get("model_version"))
        if j.get("status") in {"completed", "failed", "cancelled"}:
            print("DONE", j.get("status"))
            return
    raise SystemExit("timeout")


if __name__ == "__main__":
    main()
