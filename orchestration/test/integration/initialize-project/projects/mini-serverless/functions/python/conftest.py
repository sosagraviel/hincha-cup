"""Top-level pytest fixtures — emulator endpoints + mocks."""
import os
import pytest


@pytest.fixture(autouse=True)
def use_firestore_emulator(monkeypatch):
    """Point google-cloud-firestore at the emulator so tests never hit prod."""
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "localhost:8080")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "mini-serverless-dev")
    yield
