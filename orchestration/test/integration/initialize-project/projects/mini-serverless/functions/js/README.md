# functions/js

GCP Cloud Function v2 (HTTP) written in TypeScript. One endpoint:
`POST /charge` — invokes a Stripe-like SDK. Test via
`@google-cloud/functions-framework` locally:

```bash
pnpm build
npx functions-framework --target=charge --port=8081
```
