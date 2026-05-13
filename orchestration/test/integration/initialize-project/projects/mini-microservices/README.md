# mini-microservices

A small multi-service fixture mimicking the
[GoogleCloudPlatform/microservices-demo](https://github.com/GoogleCloudPlatform/microservices-demo)
"Online Boutique" topology. Six services across five languages
(Go, .NET, Python, Node, protobuf). Deliberately small in source code
(≤ 35 src files) but production-realistic in surrounding configuration.

## Getting Started

```bash
# install everything (Go modules + .NET restore + Poetry + pnpm)
make setup

# spin up everything via Skaffold
make dev

# or via docker-compose
make dev.compose

# run tests across every language
make test
```

## Services

| id                       | path                       | type     | language    | port  |
| ------------------------ | -------------------------- | -------- | ----------- | ----- |
| frontend                 | frontend/                  | backend  | go          | 8080  |
| productcatalogservice    | productcatalogservice/     | backend  | go          | 7000  |
| cartservice              | cartservice/               | backend  | csharp      | 7070  |
| recommendationservice    | recommendationservice/     | backend  | python      | 8080  |
| paymentservice           | paymentservice/            | backend  | javascript  | 50051 |
| loadgenerator            | loadgenerator/             | cli      | python      | —     |

See [docs/architecture.md](docs/architecture.md) for the cross-service
flow + protobuf contracts.
