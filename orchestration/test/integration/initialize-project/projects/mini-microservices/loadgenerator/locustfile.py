"""Locust load test for the frontend."""
from locust import HttpUser, between, task


class BoutiqueUser(HttpUser):
    """Simulated customer browsing the storefront."""

    wait_time = between(1, 5)

    @task(3)
    def home(self) -> None:
        self.client.get("/")

    @task(1)
    def view_cart(self) -> None:
        self.client.get("/cart")

    @task(1)
    def healthcheck(self) -> None:
        self.client.get("/healthz")
