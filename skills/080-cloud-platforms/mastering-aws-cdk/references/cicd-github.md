# CI/CD with GitHub Actions and OIDC

## Contents

- [OIDC Authentication Setup](#oidc-authentication-setup)
- [GitHub Actions Workflow](#github-actions-workflow)
- [Multi-Account Deployments](#multi-account-deployments)
- [Security Best Practices](#security-best-practices)

---

## OIDC Authentication Setup

Use OIDC instead of storing AWS access keys in GitHub secrets.

### Step 1: Create OIDC Provider in AWS

In IAM Console → Identity Providers → Add Provider:
- Provider type: OpenID Connect
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

### Step 2: Create IAM Role for GitHub Actions

Trust policy (restrict to your repo and branch):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:ORG/REPO:ref:refs/heads/main"
      }
    }
  }]
}
```

**Trust Policy Guardrails**
- Lock `sub` to a specific repo and branch (avoid wildcards)
- Require `aud` to be `sts.amazonaws.com`
- Use `StringEquals` wherever possible

### Step 3: Attach Permissions

Minimum permissions for CDK deployment:
- `sts:AssumeRole` on CDK bootstrap roles
- Or use `AdministratorAccess` for simplicity (scope down for production)

**Least-Privilege Notes**
- The GitHub Actions role should only deploy via CloudFormation
- CloudFormation uses its own execution role for resource creation
- Avoid granting broad service permissions directly to the GitHub Actions role

For least privilege, allow assuming CDK bootstrap roles:
```json
{
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": [
    "arn:aws:iam::*:role/cdk-hnb659fds-deploy-role-*",
    "arn:aws:iam::*:role/cdk-hnb659fds-file-publishing-role-*",
    "arn:aws:iam::*:role/cdk-hnb659fds-image-publishing-role-*",
    "arn:aws:iam::*:role/cdk-hnb659fds-lookup-role-*"
  ]
}
```

---

## GitHub Actions Workflow

### Basic CDK Deploy Workflow

```yaml
name: CDK Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  id-token: write   # Required for OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GHActionsCDKRole
          aws-region: us-east-1
      
      - name: CDK Synth
        run: npx cdk synth
      
      - name: CDK Diff
        if: github.event_name == 'pull_request'
        run: npx cdk diff
      
      - name: CDK Deploy
        if: github.ref == 'refs/heads/main'
        run: npx cdk deploy --all --require-approval=never

### Synth Once, Deploy Many

Build `cdk.out` once and promote the artifact:
- Build stage: `npx cdk synth`
- Deploy stages: `npx cdk deploy --app cdk.out`

This ensures the same template is promoted across environments.

### Permissions Recap

Required GitHub workflow permissions:
```yaml
permissions:
  id-token: write
  contents: read
```
```

### With Caching and Bootstrap Check

```yaml
      - name: Check bootstrap
        run: |
          aws cloudformation describe-stacks \
            --stack-name CDKToolkit \
            --query 'Stacks[0].StackStatus' \
            --output text || echo "Not bootstrapped"
      
      - name: CDK Bootstrap (if needed)
        run: npx cdk bootstrap aws://${{ secrets.AWS_ACCOUNT_ID }}/${{ env.AWS_REGION }}
        env:
          AWS_REGION: us-east-1
```

---

## Multi-Account Deployments

### Cross-Account Trust

When a pipeline runs in a tooling account, bootstrap targets with trust:
```bash
cdk bootstrap --trust TOOLING_ACCOUNT_ID
```

### Separate Roles per Account

```yaml
jobs:
  deploy-dev:
    environment: development
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::DEV_ACCOUNT:role/GHActionsRole
          aws-region: us-east-1
      - run: npx cdk deploy --all

  deploy-prod:
    needs: deploy-dev
    environment: production
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::PROD_ACCOUNT:role/GHActionsRole
          aws-region: us-east-1
      - run: npx cdk deploy --all
```

### CDK Pipelines (Self-Mutating)

For complex multi-account setups, consider CDK Pipelines:
```typescript
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';

const pipeline = new CodePipeline(this, 'Pipeline', {
  pipelineName: 'MyPipeline',
  synth: new ShellStep('Synth', {
    input: CodePipelineSource.gitHub('org/repo', 'main'),
    commands: ['npm ci', 'npx cdk synth'],
  }),
});

pipeline.addStage(new DevStage(this, 'Dev'));
pipeline.addStage(new ProdStage(this, 'Prod'), {
  pre: [new ManualApprovalStep('PromoteToProd')],
});
```

### Multi-Region Waves

Use Waves to deploy multiple regions in parallel:
```typescript
const wave = pipeline.addWave('ProdWave');
wave.addStage(new ProdStage(this, 'ProdUsEast1', { env: { account, region: 'us-east-1' } }));
wave.addStage(new ProdStage(this, 'ProdEuWest1', { env: { account, region: 'eu-west-1' } }));
```

---

## Security Best Practices

### Scope OIDC Trust Policy
- Restrict to specific repository: `repo:ORG/REPO:*`
- Restrict to specific branch: `repo:ORG/REPO:ref:refs/heads/main`
- Restrict to specific environment: `repo:ORG/REPO:environment:production`

### Least Privilege Permissions
- Use CDK bootstrap role assumption instead of direct permissions
- Review CloudTrail logs for actual permissions used
- Create custom policies based on actual needs

### Pipeline Security
- Use GitHub Environments with protection rules for production
- Require approvals for production deployments
- Enable branch protection on main branch

### Avoid in CI/CD
- Don't commit `cdk.out` or generated templates
- Don't store AWS keys in GitHub secrets (use OIDC)
- Don't skip `--require-approval` interactively in CI
