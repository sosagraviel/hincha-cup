# Getting Started

## Prerequisites

- Node 22, pnpm 10.2.1
- Python 3.12, Poetry
- Firebase CLI (`pnpm add -g firebase-tools`)
- Google Cloud SDK (`gcloud`)

## First run

```bash
pnpm install
pnpm --filter functions-python install   # via Poetry
make emulators                            # spins up the Firebase emulator suite
```

## Deploys

- Firebase functions / firestore: `firebase deploy`
- GCP Cloud Functions: `gcloud functions deploy ...`
- Cloud Build pipeline: `cloudbuild.yaml` runs lint + tests + deploys on every push.
