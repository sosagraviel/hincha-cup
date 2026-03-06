# Architecture and Operations for AWS CDK

## Contents

- [Imperative to Declarative Model](#imperative-to-declarative-model)
- [Construct Levels and Abstractions](#construct-levels-and-abstractions)
- [Determinism and Context](#determinism-and-context)
- [Project Structure and Dependency Hygiene](#project-structure-and-dependency-hygiene)
- [Configuration-Driven Infrastructure](#configuration-driven-infrastructure)
- [Importing Existing Resources](#importing-existing-resources)
- [Cross-Stack References](#cross-stack-references)
- [Drift Detection and Reconciliation](#drift-detection-and-reconciliation)
- [Rapid Iteration Tools](#rapid-iteration-tools)
- [CDK Pipelines and Self-Mutation](#cdk-pipelines-and-self-mutation)
- [Advanced Debugging](#advanced-debugging)

---

## Imperative to Declarative Model

CDK code compiles into CloudFormation templates. Debugging often requires checking both:

- CDK logic (imperative code)
- CloudFormation output (declarative template)

Use `cdk synth` to inspect `cdk.out/<Stack>.template.json` when resources are missing or misconfigured.

## Construct Levels and Abstractions

Construct levels determine how much abstraction you get:

- L1 (Cfn\*): one-to-one with CloudFormation resources, fully explicit
- L2: opinionated defaults and helper logic
- L3: higher-level patterns composed of multiple resources

Prefer L2 or L3 unless you need a missing property or edge behavior from L1.
Solutions Constructs provide vetted L3 patterns and factory helpers for common integrations.

## Determinism and Context

Synthesis must be deterministic. Avoid volatile values in constructs:

- `Date.now()` or random values
- network lookups without cached context

Use `cdk.context.json` for environment lookups (VPCs, AMIs). Commit it to version control and reset with:

```bash
cdk context --reset KEY
```

Context is not application configuration. Use external JSON/YAML for app intent, not context files.

## Project Structure and Dependency Hygiene

Keep CDK dependencies in sync:

- `aws-cdk-lib` and `constructs` versions must match
- Commit lock files (`package-lock.json` or `yarn.lock`)

For multi-app setups:

- Prefer monorepo tooling to enforce consistent CDK versions
- Use semantic versioning for shared construct libraries
- Group CDK updates together in Reliveonit or Dependabot

Optional tooling:

- Projen can generate and manage project configuration files from a single `.projenrc` source.

### Logical Units for Large Apps

Split by lifecycle and blast radius:

- Stateful stacks (databases, storage) with termination protection
- Stateless stacks (compute, APIs) that can be replaced safely
- Infrastructure stacks (networking, shared security, observability)

## Configuration-Driven Infrastructure

When generating constructs from JSON/YAML:

- Load config at synth time
- Use a stable, unique ID from the config as the construct ID
- Never use array indices as construct IDs

Example config:

```json
{
  "services": {
    "payment-gateway": { "memory": 1024, "replicas": 2 },
    "user-auth": { "memory": 512, "replicas": 1 }
  }
}
```

## Importing Existing Resources

To adopt existing resources without re-creating them:

1. Model the resource in CDK with matching properties and physical names.
2. Generate a mapping file:
   ```bash
   cdk import --record-resource-mapping mapping.json
   ```
3. Review and edit `mapping.json` for correct logical-to-physical IDs.
4. Import:
   ```bash
   cdk import --resource-mapping mapping.json
   ```

If the modeled resource diverges from the real resource, CloudFormation may update it after import.

## Cross-Stack References

Prefer SSM Parameter Store for cross-account or cross-region references:

- Avoids tight deployment ordering
- Works across accounts and regions

Use CloudFormation exports only for simple, same-account cases.

## Drift Detection and Reconciliation

Use CloudFormation drift detection to check divergence between live resources and the stack template.
Reconcile by:

- Overwriting drift (deploy to restore desired state)
- Adopting drift (update CDK code to match reality)

Avoid manual console changes to prevent drift.

## Rapid Iteration Tools

Development-only tools:

- `cdk watch` for rapid rebuild/deploy cycles
- `cdk deploy --hotswap` for fast code updates on supported resources

Hotswap introduces drift. Never use it for production pipelines.

## CDK Pipelines and Self-Mutation

CDK Pipelines can update themselves when the pipeline definition changes:

- The synth step detects pipeline changes
- A self-mutate step updates the pipeline before deploying app stacks

This keeps delivery infrastructure aligned with the app definition.

## Advanced Debugging

Synthesis debugging:

- Use `cdk synth` and inspect `cdk.out/*`
- Run with a debugger in your IDE for complex logic

Deployment debugging:

- Use `cdk diff` to spot replacements
- Use `cdk deploy --no-rollback` to preserve failed resources for inspection

Custom resource issues:

- Check the `AWSCDK-CustomResource-*` Lambda logs
- Timeouts often indicate missing NAT or VPC endpoints

Logical ID changes:

- Use `cdk refactor` to rename or move constructs safely
