# e2e

Cross-service smoke harness. Runs as a separate compose service via
`docker-compose.test.yml` — waits for the storefront to be reachable,
then exercises the cart → checkout flow.
