"""Devolutiva vocal — sem reexecutar DSP."""

from app.services.voicecheck_student_report import build_student_devolutiva


def test_devolutiva_from_real_events_no_fiction():
    analysis = {
        "analysis_version": "voicecheck_tech_v45",
        "mode": "without_reference",
        "no_reference": True,
        "observed_range": {"median_hz": 220},
        "statistics": {"valid_frame_percent": 70},
        "events": [
            {
                "id": "1",
                "category": "unstable_sustained_pitch",
                "title": "Instabilidade",
                "description": "Variação",
                "confidence": 0.8,
            },
            {
                "id": "2",
                "category": "possible_voice_break",
                "title": "Possível break",
                "description": "Gap",
                "confidence": 0.7,
            },
            {
                "id": "3",
                "category": "pitch_below_reference",
                "title": "Abaixo",
                "description": "Não deve entrar sem referência",
                "confidence": 0.9,
            },
        ],
        "positive_findings": [
            {"title": "Trecho estável", "description": "Pouca variação."},
        ],
        "recommendations": [
            {"key": "stability", "title": "Estabilidade", "exercise": "Sustenido 4s"},
        ],
    }
    d = build_student_devolutiva(analysis, student_name="Ana", teacher_name="Lia")
    assert d["devolutiva_version"] == "voicecheck_devolutiva_v1"
    assert d["status"] == "draft"
    assert d["personal"]["student_name"] == "Ana"
    assert len(d["positives"]) == 1
    assert all("pitch" not in p["name"].lower() or "referência" in p["explanation"].lower() for p in d["priorities"])
    # sem referência: pitch_below não vira prioridade
    assert not any("abaixo da referência" in p["name"].lower() for p in d["priorities"])
    assert "referência musical" in d["how_is_your_voice"].lower()
    assert "desafinação absoluta" in d["disclaimer"].lower() or "desafinação" in d["disclaimer"].lower()
    assert len(d["exercises"]) >= 1
    assert d["closing_message"]


def test_possible_not_stated_as_confirmed_error():
    analysis = {
        "analysis_version": "voicecheck_tech_v45",
        "no_reference": True,
        "mode": "without_reference",
        "events": [
            {
                "category": "possible_audible_breath",
                "title": "Respiração",
                "description": "Heurística",
                "confidence": 0.6,
            }
        ],
        "positive_findings": [],
        "recommendations": [],
    }
    d = build_student_devolutiva(analysis)
    assert d["priorities"]
    assert "possível" in d["priorities"][0]["name"].lower()
    assert "certeza" in d["priorities"][0]["explanation"].lower() or "heurística" in d["priorities"][0]["explanation"].lower()
