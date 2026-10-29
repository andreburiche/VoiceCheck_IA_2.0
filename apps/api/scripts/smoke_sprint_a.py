"""Smoke Sprint A: 2-stem + markers CRUD + export MP3."""

from __future__ import annotations

import hashlib
import io
import os
import struct
import time
import uuid
import wave

import httpx

API = os.getenv("PUBLIC_API_URL", "http://host.docker.internal:8010")


def main() -> None:
    c = httpx.Client(base_url=API, timeout=180.0)
    assert c.get("/health").status_code == 200
    email = f"sprint_a_{uuid.uuid4().hex[:8]}@example.com"
    r = c.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "senha12345", "name": "Sprint A"},
    )
    r.raise_for_status()
    csrf = c.cookies.get("em_csrf") or r.json()["csrf_token"]
    h = {"X-CSRF-Token": csrf}
    print("user", email)

    pid = c.post("/api/v1/projects", headers=h, json={"name": "sprint-a-two"}).json()["id"]

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

    init_res = c.post(
        "/api/v1/uploads/initiate",
        headers=h,
        json={
            "project_id": pid,
            "filename": "t.wav",
            "mime_type": "audio/wav",
            "size_bytes": len(data),
            "checksum_sha256": checksum,
            "rights_confirmed": True,
        },
    )
    print("init", init_res.status_code, init_res.text[:300])
    init_res.raise_for_status()
    init = init_res.json()

    # upload_url usa PUBLIC_API_URL do host (127.0.0.1:8010); de dentro do container reescreve.
    upload_url = init["upload_url"].replace("http://127.0.0.1:8010", API.rstrip("/"))
    upload_url = upload_url.replace("http://localhost:8010", API.rstrip("/"))
    put = c.put(upload_url, content=data, headers={"Content-Type": "audio/wav"})
    print("put", put.status_code)
    put.raise_for_status()

    asset = c.post(
        "/api/v1/uploads/complete",
        headers=h,
        json={"asset_id": init["asset_id"], "checksum_sha256": checksum},
    ).json()

    sep = c.post(
        f"/api/v1/projects/{pid}/separations",
        headers={**h, "Idempotency-Key": f"two-{uuid.uuid4()}"},
        json={"source_asset_id": asset["id"], "model_code": "htdemucs_two", "params": {}},
    )
    print("sep", sep.status_code, sep.text[:240])
    sep.raise_for_status()
    jid = sep.json()["id"]

    job = None
    for i in range(90):
        time.sleep(2)
        job = c.get(f"/api/v1/processing-jobs/{jid}").json()
        print("poll", i, job.get("status"), job.get("progress"), job.get("error_code"), job.get("model_version"))
        if job.get("status") in {"completed", "failed", "cancelled"}:
            break
    assert job and job["status"] == "completed", job

    stems = c.get(f"/api/v1/projects/{pid}/stems", params={"job_id": jid}).json()
    types = sorted({s["stem_type"] for s in stems["items"]})
    print("stems", types)
    assert types == ["instrumental", "vocals"], types

    m = c.post(
        f"/api/v1/projects/{pid}/markers",
        headers=h,
        json={"position_ms": 10, "label": "A"},
    ).json()
    assert (
        c.patch(
            f"/api/v1/projects/{pid}/markers/{m['id']}",
            headers=h,
            json={"label": "B"},
        ).json()["label"]
        == "B"
    )
    assert c.delete(f"/api/v1/projects/{pid}/markers/{m['id']}", headers=h).status_code == 204

    loop = c.post(
        f"/api/v1/projects/{pid}/loop-regions",
        headers=h,
        json={"name": "AB", "start_ms": 0, "end_ms": 400},
    ).json()
    assert (
        c.patch(
            f"/api/v1/projects/{pid}/loop-regions/{loop['id']}",
            headers=h,
            json={"end_ms": 500},
        ).json()["end_ms"]
        == 500
    )
    assert c.delete(f"/api/v1/projects/{pid}/loop-regions/{loop['id']}", headers=h).status_code == 204

    exp = c.post(
        f"/api/v1/projects/{pid}/exports",
        headers={**h, "Idempotency-Key": f"mp3-{uuid.uuid4()}"},
        json={"kind": "mixdown", "params": {"format": "mp3"}},
    )
    print("exp", exp.status_code, exp.text[:200])
    exp.raise_for_status()
    eid = exp.json()["id"]
    cur = None
    for i in range(40):
        time.sleep(1)
        cur = c.get(f"/api/v1/export-jobs/{eid}").json()
        print("expoll", i, cur.get("status"), cur.get("error_message"))
        if cur.get("status") in {"completed", "failed"}:
            break
    assert cur and cur["status"] == "completed", cur
    print("SPRINT_A_OK", pid, jid, eid)


if __name__ == "__main__":
    main()
