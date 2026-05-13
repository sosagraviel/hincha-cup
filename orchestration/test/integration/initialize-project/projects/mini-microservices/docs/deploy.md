# Deploy

Three options:

1. **Skaffold** (`make dev`) — builds images, deploys to a local k8s
   cluster, watches for source changes.
2. **docker-compose** (`make dev.compose`) — for laptops without k8s.
3. **kubectl** (`kubectl apply -k kubernetes/`) — what CI does on
   pushes to `main`.

`kubernetes/kustomization.yaml` is the kustomize base; per-service
overlays live under `kubernetes/<service>/`.
