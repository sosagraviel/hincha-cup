"""Shared pytest fixtures."""
import pytest


@pytest.fixture
def sample_products() -> list[str]:
    """Canonical set of product ids used across tests."""
    return ["p1", "p2", "p3", "p4", "p5"]
