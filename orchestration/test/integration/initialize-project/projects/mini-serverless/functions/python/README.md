# functions/python

GCP Cloud Functions (Python 3.12). One representative handler:
`audit_handler` — writes an audit record into Firestore.

## Run locally

```bash
poetry install
poetry run functions-framework --target=audit_handler --port=8082
```

## Test

```bash
poetry run pytest
```
