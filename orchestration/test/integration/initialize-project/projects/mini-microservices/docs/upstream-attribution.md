# Upstream attribution

This fixture is derived from
[GoogleCloudPlatform/microservices-demo](https://github.com/GoogleCloudPlatform/microservices-demo)
(commit shape — illustrative; not pinned to a real upstream hash since
this is a synthetic fixture).

## Preserved

- 6 services from the original 11: `frontend`, `productcatalogservice`,
  `cartservice`, `recommendationservice`, `paymentservice`,
  `loadgenerator`.
- The shared `pb/demo.proto` cross-service contract.
- Per-service Dockerfile (multi-stage where applicable).
- Kubernetes manifests for `productcatalogservice` + `frontend`.

## Pruned

- `currencyservice`, `shippingservice`, `emailservice`, `checkoutservice`,
  `adservice` — same shape as the preserved services; only one
  representative kept per stack pattern.
- Real implementation depth — handlers stubbed to 2-5 functions each.
- Helm charts (we kept kustomize), Istio configs, OpenTelemetry traces.

## Why

This fixture exists to test the framework's polyglot-microservices
analysis paths (per-language lockfile detection, multi-runtime tool
versions, k8s + skaffold + kustomize discovery). Production depth is
out of scope.
