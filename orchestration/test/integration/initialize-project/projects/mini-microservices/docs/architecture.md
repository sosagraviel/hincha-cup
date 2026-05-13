# Architecture

Adapted from Online Boutique. Six services communicate over gRPC except
the user-facing `frontend` (HTTP).

```
                 ┌────────────┐
       HTTP      │ frontend   │  Go
         ────────► (port 8080)│
                 └─────┬──────┘
                       │ gRPC
       ┌───────────────┼───────────────┬──────────────┐
       ▼               ▼               ▼              ▼
┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌─────────────┐
│ productcat. │ │ cartservice  │ │ recomm.    │ │ paymentsvc  │
│ (Go, :7000) │ │ (.NET, :7070)│ │ (Py, :8080)│ │ (Node, :50051)
└─────────────┘ └──────┬───────┘ └────┬───────┘ └─────────────┘
                       │              │
                       ▼              ▼ (queries productcatalog)
                   ┌──────┐       (no other dep)
                   │redis │
                   └──────┘

loadgenerator (Python locust, cli) → hammers frontend
```

The contract lives in `pb/demo.proto`.
