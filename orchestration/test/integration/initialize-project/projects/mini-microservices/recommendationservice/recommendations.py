"""Recommendation logic — content-based filtering stub."""
from random import Random


class RecommendationEngine:
    """Returns up to `max_results` product ids excluding those in the user's history."""

    def __init__(self, all_product_ids: list[str], seed: int | None = None) -> None:
        self._products = list(all_product_ids)
        self._rng = Random(seed)

    def recommend(self, user_history: list[str], max_results: int = 5) -> list[str]:
        """Return product ids not in the user's history, ranked randomly.

        Args:
            user_history: product ids the user has already seen/bought.
            max_results: cap on output length.

        Returns:
            A list of product ids the user has NOT seen, length ≤ max_results.
        """
        candidates = [pid for pid in self._products if pid not in user_history]
        self._rng.shuffle(candidates)
        return candidates[:max_results]
