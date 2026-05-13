# Deploy

## Cloud Build (CI)

The `cloudbuild.yaml` runs three steps:

1. Install + lint + test all workspaces.
2. Deploy Python GCP Cloud Functions via `gcloud functions deploy`.
3. Deploy Firebase services (`firestore`, `storage`, `functions`).

The Cloud Build trigger fires on every push to `main`.

## Manual

```bash
# Firebase
firebase deploy --only firestore,storage,functions --project mini-serverless-prod

# GCP Python function
gcloud functions deploy audit-py \
  --gen2 --runtime=python312 --source=functions/python \
  --entry-point=audit_handler --region=us-central1 --trigger-http
```
