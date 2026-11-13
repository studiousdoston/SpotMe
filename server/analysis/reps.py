"""Generic rep counting on a 1-D signal (ported from notebooks/01, reusable for every exercise).

The signal goes UP during the hard part of a rep (e.g. squat depth), so each rep is one peak.
"""

from dataclasses import dataclass

import numpy as np
from scipy.signal import find_peaks, peak_widths


@dataclass(frozen=True)
class DetectedRep:
    """One rep found in the signal. Indices are frame (grid slot) numbers."""

    start_index: int
    end_index: int
    peak_index: int
    prominence: float


@dataclass(frozen=True)
class RepTempo:
    """Seconds spent going into and coming out of the rep's peak."""

    down_seconds: float
    up_seconds: float

    @property
    def total_seconds(self) -> float:
        return self.down_seconds + self.up_seconds


def count_reps_peaks(
    signal: np.ndarray,
    fps: float,
    min_drop: float = 0.15,
    min_gap_seconds: float = 0.8,
    min_rep_seconds: float = 0.4,
) -> list[DetectedRep]:
    """Notebook's count_reps_peaks: same defaults and formulas.

    - A rep is a peak with prominence >= min_drop, at least min_gap_seconds after the previous one.
    - Its start/end are where the signal crosses half the peak's height (rel_height=0.5),
      truncated to whole frames like the notebook's int(l), int(r).
    - Peaks narrower than min_rep_seconds are ignored (jitter, not reps).
    """
    peak_indices, peak_properties = find_peaks(
        signal, prominence=min_drop, distance=max(int(fps * min_gap_seconds), 1)
    )
    if peak_indices.size == 0:
        return []

    _, _, left_positions, right_positions = peak_widths(signal, peak_indices, rel_height=0.5)

    detected_reps: list[DetectedRep] = []
    for peak_index, left_position, right_position, prominence in zip(
        peak_indices, left_positions, right_positions, peak_properties["prominences"], strict=True
    ):
        if (right_position - left_position) / fps >= min_rep_seconds:
            detected_reps.append(
                DetectedRep(
                    start_index=int(left_position),
                    end_index=int(right_position),
                    peak_index=int(peak_index),
                    prominence=float(prominence),
                )
            )
    return detected_reps


def find_rep_bottom_index(signal: np.ndarray, rep: DetectedRep) -> int:
    """Deepest frame inside the rep window (notebook: start + argmax(signal[start:end + 1]))."""
    signal_during_rep = signal[rep.start_index : rep.end_index + 1]
    return rep.start_index + int(np.argmax(signal_during_rep))


def measure_rep_tempo(signal: np.ndarray, bottom_index: int, fps: float, rel_height: float = 0.8) -> RepTempo:
    """Notebook's tempo_report timing: where the rep really starts/finishes, at 80% of the bump's height."""
    _, _, rep_begin_positions, rep_finish_positions = peak_widths(
        signal, [bottom_index], rel_height=rel_height
    )
    rep_begin = float(rep_begin_positions[0])
    rep_finish = float(rep_finish_positions[0])
    return RepTempo(
        down_seconds=(bottom_index - rep_begin) / fps,
        up_seconds=(rep_finish - bottom_index) / fps,
    )
