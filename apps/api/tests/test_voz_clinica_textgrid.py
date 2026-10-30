"""O TextGrid gerado pelo editor da tela (lib/voz-clinica-editor.ts › textGrid) abre no Praat.

O arquivo de exemplo foi gerado pela própria função da tela; aqui o Praat (Parselmouth) o lê.
"""

from pathlib import Path

import pytest

parselmouth = pytest.importorskip("parselmouth")
from parselmouth.praat import call  # noqa: E402

ARQUIVO = Path(__file__).parent / "dados" / "marcacoes.TextGrid"


def test_praat_le_o_textgrid_da_tela():
    tg = parselmouth.read(str(ARQUIVO))
    assert call(tg, "Get number of tiers") == 1
    assert call(tg, "Get tier name...", 1) == "trechos"
    assert call(tg, "Get number of intervals", 1) == 6
    rotulos = [call(tg, "Get label of interval", 1, i) for i in range(1, 7)]
    assert rotulos == ["", "a", "", 'pa "forte"', "ção", ""]
    assert call(tg, "Get end time of interval", 1, 5) == pytest.approx(1.6)
    assert call(tg, "Get end time") == pytest.approx(2.5)
