# Latest Features and Recent Patterns

## Contents

- [CDK v2 Consolidation](#cdk-v2-consolidation)
- [Construct Lifecycle Phases](#construct-lifecycle-phases)
- [Alpha Modules and Opt-In APIs](#alpha-modules-and-opt-in-apis)
- [Feature Flags](#feature-flags)
- [Recent Service Additions](#recent-service-additions)

---

## CDK v2 Consolidation

CDK v2 ships as a single package (`aws-cdk-lib`) to avoid version drift across modules.

## Construct Lifecycle Phases

CDK apps move through:
1. Construction
2. Preparation
3. Validation
4. Synthesis
5. Deployment

Use this model when debugging issues that appear only at synth or deploy time.

## Alpha Modules and Opt-In APIs

Experimental modules are explicitly labeled `-alpha` and may introduce breaking changes:
- Example: `aws-cdk-lib/aws-pipes-alpha`

Only use alpha modules when you can tolerate API changes.

## Feature Flags

New defaults are gated by `cdk.json` feature flags. Review and enable new flags periodically to adopt security fixes and behavior improvements.

## Recent Service Additions

Keep an eye on new L2 constructs as AWS adds services:
- Data Firehose
- AppSync Events
- EKS with auto mode
