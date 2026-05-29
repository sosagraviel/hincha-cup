"""Tests for RecommendationEngine."""
from recommendations import RecommendationEngine


def test_excludes_user_history(sample_products):
    engine = RecommendationEngine(sample_products, seed=42)
    out = engine.recommend(user_history=["p1", "p2"], max_results=10)
    assert "p1" not in out
    assert "p2" not in out


def test_caps_at_max_results(sample_products):
    engine = RecommendationEngine(sample_products, seed=42)
    out = engine.recommend(user_history=[], max_results=2)
    assert len(out) == 2


def test_deterministic_with_seed(sample_products):
    a = RecommendationEngine(sample_products, seed=7).recommend([], max_results=3)
    b = RecommendationEngine(sample_products, seed=7).recommend([], max_results=3)
    assert a == b
