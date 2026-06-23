"""Unit tests for the SM-2 spaced repetition algorithm."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.routes.tasks import _sm2_calc


class TestSM2QualityBelow3:
    """When quality < 3 (forgot), the algorithm resets repetitions and interval."""

    def test_quality_0_resets(self):
        ef, reps, interval = _sm2_calc(quality=0, ease_factor=2.5, repetitions=5, interval=30)
        assert reps == 0
        assert interval == 1
        assert ef < 2.5  # ease factor decreases

    def test_quality_1_resets(self):
        ef, reps, interval = _sm2_calc(quality=1, ease_factor=2.5, repetitions=3, interval=10)
        assert reps == 0
        assert interval == 1

    def test_quality_2_resets(self):
        ef, reps, interval = _sm2_calc(quality=2, ease_factor=2.0, repetitions=2, interval=5)
        assert reps == 0
        assert interval == 1

    def test_ease_factor_never_below_minimum(self):
        ef, _, _ = _sm2_calc(quality=0, ease_factor=1.3, repetitions=5, interval=30)
        assert ef == 1.3  # clamped


class TestSM2Quality3OrAbove:
    """When quality >= 3 (recalled), the algorithm increases intervals."""

    def test_first_review_repetition_0(self):
        ef, reps, interval = _sm2_calc(quality=3, ease_factor=2.5, repetitions=0, interval=0)
        assert reps == 1
        assert interval == 1

    def test_second_review_repetition_1(self):
        ef, reps, interval = _sm2_calc(quality=4, ease_factor=2.5, repetitions=1, interval=1)
        assert reps == 2
        assert interval == 6

    def test_subsequent_reviews(self):
        ef, reps, interval = _sm2_calc(quality=4, ease_factor=2.5, repetitions=2, interval=6)
        assert reps == 3
        assert interval == round(6 * 2.5)  # 15

    def test_perfect_recall_increases_ease_factor(self):
        ef, _, _ = _sm2_calc(quality=5, ease_factor=2.5, repetitions=2, interval=6)
        assert ef > 2.5

    def test_barely_recalled_decreases_ease_factor(self):
        ef, _, _ = _sm2_calc(quality=3, ease_factor=2.5, repetitions=2, interval=6)
        assert ef < 2.5

    def test_ease_factor_never_below_1_3(self):
        ef, _, _ = _sm2_calc(quality=3, ease_factor=1.31, repetitions=2, interval=6)
        assert ef >= 1.3


class TestSM2EdgeCases:
    """Edge cases and boundary values."""

    def test_quality_5_with_low_repetitions(self):
        ef, reps, interval = _sm2_calc(quality=5, ease_factor=2.5, repetitions=0, interval=0)
        assert reps == 1
        assert interval == 1
        assert ef > 2.5

    def test_high_repetition_count(self):
        ef, reps, interval = _sm2_calc(quality=4, ease_factor=2.0, repetitions=10, interval=100)
        assert reps == 11
        assert interval == 200  # 100 * 2.0

    def test_interval_rounding(self):
        ef, reps, interval = _sm2_calc(quality=4, ease_factor=2.3, repetitions=3, interval=15)
        assert interval == round(15 * 2.3)  # 34 or 35
        assert isinstance(interval, int)

    def test_all_qualities_are_valid(self):
        for q in range(6):
            ef, reps, interval = _sm2_calc(quality=q, ease_factor=2.5, repetitions=2, interval=10)
            assert 1.3 <= ef <= 3.0 or ef > 3.0  # ease factor reasonable
            assert isinstance(reps, int)
            assert isinstance(interval, int)
            assert interval >= 1
