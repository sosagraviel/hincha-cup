# kubernetes

Kustomize-managed manifests. Only two services have manifests in this
fixture (productcatalogservice + frontend) — that's enough to exercise
the framework's "k8s as secondary port-discovery source" code path
without paying for full deployment coverage.
