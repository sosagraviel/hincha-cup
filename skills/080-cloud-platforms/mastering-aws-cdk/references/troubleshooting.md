# Troubleshooting AWS CDK

## Contents

- [Version and Bootstrap Errors](#version-and-bootstrap-errors)
- [Deployment Failures](#deployment-failures)
- [Resource Limits and Quotas](#resource-limits-and-quotas)
- [Deletion and Update Issues](#deletion-and-update-issues)
- [Context and Sync Problems](#context-and-sync-problems)
- [Cross-Stack and Dependency Errors](#cross-stack-and-dependency-errors)
- [Custom Resource Failures](#custom-resource-failures)
- [Logical ID and Refactor Issues](#logical-id-and-refactor-issues)

---

## Version and Bootstrap Errors

### "CDK CLI is not compatible with the CDK library"
**Cause**: Global CDK CLI older than project libraries.
**Fix**:
```bash
npm install -g aws-cdk@latest
cdk --version  # Verify upgrade
```

### "NoSuchBucket" on deploy
**Cause**: CDK bootstrap not run for account/region.
**Fix**:
```bash
cdk bootstrap aws://ACCOUNT_ID/REGION
```

### "/cdk-bootstrap/hnb659fds/version not found"
**Cause**: Target account/region not bootstrapped with the modern CDK v2 template.
**Fix**:
```bash
cdk bootstrap aws://ACCOUNT_ID/REGION
```
**Note**: Use `--qualifier` only if the environment is intentionally customized.

### "Forbidden: null" on deploy
**Cause**: Credentials lack permission to CDK bootstrap bucket.
**Fix**: Ensure deploying role has access to bootstrap resources (S3 bucket, ECR repo). Re-bootstrap with correct trust policy if needed.

### "--app is required"
**Cause**: CDK cannot find application entry point.
**Fix**: 
- Run from project root (where `cdk.json` exists)
- Verify `cdk.json` has correct `app` field: `"app": "npx ts-node bin/app.ts"`

---

## Deployment Failures

### "Resource already exists"
**Cause**: Resource with same name exists (often S3 bucket from previous stack).
**Fix**:
- Delete orphaned resource manually, or
- Change resource name in CDK code, or
- Import existing resource with `cdk import`

### IAM permission denied during resource creation
**Cause**: Deploy role lacks permissions for specific resource.
**Fix**:
- Add required IAM policies to deploy role
- For CDK Pipelines: check pipeline's CloudFormation execution role

### CloudFormation rollback
**Cause**: Resource creation failed partway through.
**Fix**:
- Check CloudFormation Events for specific failure reason
- Fix issue in CDK code
- Delete stack if in `ROLLBACK_COMPLETE` state, then redeploy

### "Internal Failure"
**Cause**: Custom resource provider failed during deployment.
**Fix**:
- Locate the provider Lambda logs (often `*Provider*`)
- Fix permissions or network access (NAT/VPC endpoints)

### "Unable to assume role"
**Cause**: Cross-account role trust or execution role misconfigured.
**Fix**:
- Verify trust policy on target account roles
- Check CDK bootstrap roles exist: `cdk-hnb659fds-deploy-role-*`

---

## Resource Limits and Quotas

### "CloudFormation resource limit exceeded" (500 resources)
**Cause**: Stack exceeds 500 resource limit.
**Fix**:
```typescript
// Option 1: Split into multiple stacks
const dbStack = new DatabaseStack(app, 'DB');
const apiStack = new ApiStack(app, 'API', { db: dbStack.table });

// Option 2: Use nested stacks
import { NestedStack } from 'aws-cdk-lib';
class MyNestedStack extends NestedStack { ... }
```

### "Specified 3 AZs but only 2 were used"
**Cause**: Environment-agnostic synthesis doesn't know actual AZs.
**Fix**:
```typescript
new MyStack(app, 'Stack', {
  env: { account: '123456789012', region: 'us-east-1' }
});
```

---

## Deletion and Update Issues

### Resource not deleted on `cdk destroy`
**Cause**: `RemovalPolicy.RETAIN` (default for stateful resources).
**Fix**:
```typescript
// For dev/test only
new s3.Bucket(this, 'Bucket', {
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,  // For S3 specifically
});

new dynamodb.Table(this, 'Table', {
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```
**Note**: Manually delete retained resources that block redeployment.

### Update causes resource replacement
**Cause**: Changed immutable property (Lambda function name, RDS identifier).
**Fix**:
- Let CDK-generated names be used (avoid explicit naming)
- Use `cdk diff` before deploy to spot replacements (`[~]` vs `[-] [+]`)

### Drift detected / out-of-band changes
**Cause**: Manual changes in AWS console.
**Fix**:
- Re-sync by importing changes into CDK code
- Use CloudFormation drift detection to identify differences
- Avoid manual changes to CDK-managed resources

### Resource replacement surprises
**Cause**: Immutable property changed (name, identifier, or encryption settings).
**Fix**:
- Review `cdk diff` for replacements
- Avoid explicit names for stateful resources
- Use snapshots or migration steps when replacements are required

---

## Context and Sync Problems

### Stale context values (VPC, AMI)
**Cause**: Cached lookup values in `cdk.context.json`.
**Fix**:
```bash
cdk context                    # List cached values
cdk context --reset KEY        # Clear specific entry
cdk synth                      # Re-fetch on next synth
```

### Context mismatch after environment changes
**Cause**: Underlying resources changed but cached context still used.
**Fix**:
```bash
cdk context --clear
```

### Non-deterministic synthesis
**Cause**: Using `Date.now()`, random values, or environment-dependent values in resource definitions.
**Fix**: Use fixed identifiers or derive from stack parameters.

### Cross-stack reference failure
**Cause**: Dependent stack deleted or output changed.
**Fix**:
- Use `exportValue()` for explicit exports
- Prefer passing constructs directly between stacks in same app
- Avoid circular dependencies

## Cross-Stack and Dependency Errors

### "Export EXPORT_NAME cannot be updated as it is in use by STACK_NAME"
**Cause**: Stack B imports an output from Stack A that is being removed or changed.
**Fix**:
- Remove the import in Stack B (temporary value if needed)
- Deploy Stack B
- Remove the export in Stack A
- Deploy Stack A

### "Circular dependency found"
**Cause**: Two constructs reference each other implicitly (often via grants or triggers).
**Fix**:
- Break the cycle with explicit roles or permissions
- Use lazy values to defer resolution at synth time

## Custom Resource Failures

### Deployment hangs then fails after ~1 hour
**Cause**: Custom resource Lambda cannot reach AWS APIs (private subnets, no NAT, missing endpoints).
**Fix**:
- Check `AWSCDK-CustomResource-*` Lambda logs
- Add NAT Gateway or VPC endpoints for required services

### Need to preserve failed resources for debugging
**Cause**: Default rollback deletes evidence.
**Fix**:
```bash
cdk deploy --no-rollback
```

## Logical ID and Refactor Issues

### Unintended resource replacement after refactor
**Cause**: Construct path changes alter logical IDs.
**Fix**:
- Use `cdk refactor` to move or rename constructs safely
- Use explicit physical names when required for stability
