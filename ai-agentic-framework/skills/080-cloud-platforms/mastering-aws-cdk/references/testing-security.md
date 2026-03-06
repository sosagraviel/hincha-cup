# Testing and Security for CDK

## Contents

- [Unit Tests with Assertions](#unit-tests-with-assertions)
- [Snapshot Tests for Refactors](#snapshot-tests-for-refactors)
- [Integration Tests](#integration-tests)
- [Security Checks with cdk-nag](#security-checks-with-cdk-nag)
- [CI Integration](#ci-integration)
- [Testing Pyramid](#testing-pyramid)

---

## Unit Tests with Assertions

Use `aws-cdk-lib/assertions` for fine-grained checks:
```typescript
import { Template } from 'aws-cdk-lib/assertions';

const app = new cdk.App();
const stack = new MyStack(app, 'TestStack');
const template = Template.fromStack(stack);

template.hasResourceProperties('AWS::S3::Bucket', {
  BucketEncryption: {
    ServerSideEncryptionConfiguration: [{
      ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
    }],
  },
});
```

## Snapshot Tests for Refactors

Snapshot tests help detect unintended template changes during refactors:
```typescript
const template = JSON.stringify(
  app.synth().getStackByName('SnapshotStack').template,
  null,
  2
);
```

Use snapshots for refactor safety, not as the only regression check.

## Integration Tests

Use `@aws-cdk/integ-tests-alpha` to validate deployed behavior:
```typescript
const integ = new IntegTest(app, 'IntegTest', { testCases: [stack] });
```

Integration tests are slower and incur real AWS costs. Use them sparingly.

## Security Checks with cdk-nag

Run compliance checks with `cdk-nag`:
```typescript
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';

Aspects.of(app).add(new AwsSolutionsChecks({ reports: true }));
```

Use suppressions sparingly and document reasons.

Aspects can also enforce org-wide tagging or policy rules across the construct tree.

## CI Integration

Fail builds on violations:
```typescript
if (report.violations?.length) {
  process.exit(1);
}
```

## Testing Pyramid

Balance coverage:
- Unit assertions for specific properties
- Snapshot tests to guard refactors
- Integration tests for critical end-to-end paths
