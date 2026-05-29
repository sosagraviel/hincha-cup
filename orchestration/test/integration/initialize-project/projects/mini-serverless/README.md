# mini-serverless

A small serverless fixture mimicking a Firebase-based project shape: Firebase
emulators + GCP Cloud Functions in mixed JS/Python + a lightweight web
SPA. Deliberately small in source code but production-realistic in
surrounding configuration.

## Getting Started

```bash
# install (pnpm + poetry)
pnpm install
cd functions/python && poetry install && cd ../..

# fire up the Firebase emulators (firestore, functions, auth, storage)
make emulators

# in a second terminal, run the web SPA
pnpm --filter web dev   # http://localhost:5173

# deploy (CI does this — local 'make deploy' just dry-runs)
make deploy
```

Firebase emulator UI: http://localhost:4000
Functions: http://localhost:5001
Firestore: http://localhost:8080
Auth: http://localhost:9099
