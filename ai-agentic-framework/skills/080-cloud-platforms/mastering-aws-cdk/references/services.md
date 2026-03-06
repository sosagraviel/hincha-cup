# AWS Service Patterns with CDK

## Contents

- [Lambda](#lambda)
- [DynamoDB](#dynamodb)
- [S3](#s3)
- [ECS/Fargate](#ecsfargate)
- [Aurora](#aurora)
- [MSK (Kafka)](#msk-kafka)
- [EventBridge](#eventbridge)
- [API Gateway](#api-gateway)

---

## Lambda

### Basic Function
```typescript
const fn = new lambda.Function(this, 'Fn', {
  runtime: lambda.Runtime.NODEJS_18_X,
  architecture: lambda.Architecture.ARM_64,  // 20% cheaper
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
  memorySize: 1024,
  timeout: Duration.seconds(30),
  environment: { STAGE: 'prod' },
  tracing: lambda.Tracing.ACTIVE,  // X-Ray
});
```

### Event Sources
```typescript
// SQS trigger
fn.addEventSource(new SqsEventSource(queue, { batchSize: 10 }));

// DynamoDB Streams
fn.addEventSource(new DynamoEventSource(table, {
  startingPosition: lambda.StartingPosition.TRIM_HORIZON,
  batchSize: 100,
  bisectBatchOnError: true,
}));

// S3 trigger
bucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.LambdaDestination(fn),
  { prefix: 'uploads/' }
);
```

### Cold Start Mitigation
```typescript
const alias = new lambda.Alias(this, 'Alias', {
  aliasName: 'live',
  version: fn.currentVersion,
});
alias.addAutoScaling({ minCapacity: 1, maxCapacity: 10 })
     .scaleOnUtilization({ utilizationTarget: 0.7 });
```

### Best Practices
- Use ARM64 for cost savings (compatible with most runtimes)
- Set appropriate `timeout` (default 3s often too low)
- Configure `reservedConcurrentExecutions` to protect downstream
- Use Secrets Manager for sensitive config (not env vars)
- Set `logRetention` explicitly to avoid infinite log growth
- Consider layers for shared code and dependencies

### NodejsFunction (Bundled TypeScript)
```typescript
const fn = new nodejs.NodejsFunction(this, 'Fn', {
  entry: 'lambda/handler.ts',
  runtime: lambda.Runtime.NODEJS_20_X,
  bundling: { minify: true },
});
```

### Container Image Lambda
```typescript
new lambda.DockerImageFunction(this, 'ImageFn', {
  code: lambda.DockerImageCode.fromImageAsset('lambda-image'),
});
```

### Reserved Concurrency
```typescript
const fn = new lambda.Function(this, 'Fn', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
  reservedConcurrentExecutions: 10,
});
```

---

## DynamoDB

### Table with GSI
```typescript
const table = new dynamodb.Table(this, 'Table', {
  partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
});

table.addGlobalSecondaryIndex({
  indexName: 'gsi1',
  partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});
```

### Auto Scaling (Provisioned)
```typescript
const scaling = table.autoScaleReadCapacity({ minCapacity: 5, maxCapacity: 100 });
scaling.scaleOnUtilization({ targetUtilizationPercent: 75 });
```

### Best Practices
- Enable PITR (`pointInTimeRecovery: true`) for production
- Use PAY_PER_REQUEST for variable workloads
- Enable streams for CDC patterns
- Design partition keys for even distribution
- Use TTL for expiring data
- Enable `contributorInsightsEnabled` to detect hot partitions
- Enable deletion protection for production tables

### Global Tables (Multi-Region)
```typescript
const table = new dynamodb.Table(this, 'Table', {
  partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  replicationRegions: ['us-east-1', 'eu-west-1'],
});
```

### TTL and Contributor Insights
```typescript
const table = new dynamodb.Table(this, 'Table', {
  partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  timeToLiveAttribute: 'expiresAt',
  contributorInsightsEnabled: true,
});
```

---

## S3

### Secure Bucket
```typescript
const bucket = new s3.Bucket(this, 'Bucket', {
  encryption: s3.BucketEncryption.S3_MANAGED,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
  versioned: true,
  lifecycleRules: [{
    expiration: Duration.days(365),
    transitions: [{
      storageClass: s3.StorageClass.INTELLIGENT_TIERING,
      transitionAfter: Duration.days(30),
    }],
  }],
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,  // Dev only
});
```

### Additional S3 Guidance
- Use bucket keys with KMS to reduce SSE-KMS cost
- Prefer object ownership = bucket owner enforced
- Keep access logs in a separate, retained log bucket
- Avoid ACLs; keep `blockPublicAccess` enabled
- For high-scale notifications, route via SQS or EventBridge

### S3 Deployment and Invalidation
```typescript
new s3deploy.BucketDeployment(this, 'Deploy', {
  sources: [s3deploy.Source.asset('./site')],
  destinationBucket: bucket,
  distribution,
  distributionPaths: ['/*'],
  prune: true,
});
```

### CORS Configuration
```typescript
bucket.addCorsRule({
  allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
  allowedOrigins: ['https://example.com'],
  allowedHeaders: ['*'],
});
```

### Monitoring
```typescript
const alarm = new cloudwatch.Alarm(this, 'S3Errors', {
  metric: bucket.metric5xxErrors({ period: Duration.minutes(5) }),
  threshold: 1,
  evaluationPeriods: 1,
});
```

### S3 to EventBridge
```typescript
const bucket = new s3.Bucket(this, 'Bucket', {
  eventBridgeEnabled: true,
});
```

### CloudFront + S3 + WAF
```typescript
const distribution = new cloudfront.Distribution(this, 'Dist', {
  defaultBehavior: { origin: new origins.S3Origin(bucket) },
  webAclId: webAcl.attrArn,
});
```

---

## ECS/Fargate

### ALB Fargate Service (High-Level)
```typescript
const service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Svc', {
  cluster,
  taskImageOptions: {
    image: ecs.ContainerImage.fromEcrRepository(repo),
    environment: { NODE_ENV: 'production' },
    secrets: { DB_PASS: ecs.Secret.fromSecretsManager(secret) },
  },
  memoryLimitMiB: 1024,
  cpu: 512,
  desiredCount: 2,
  publicLoadBalancer: true,
});
```

### Manual Task Definition
```typescript
const taskDef = new ecs.FargateTaskDefinition(this, 'Task', {
  memoryLimitMiB: 1024,
  cpu: 512,
});

const container = taskDef.addContainer('App', {
  image: ecs.ContainerImage.fromRegistry('nginx'),
  logging: ecs.LogDrivers.awsLogs({
    streamPrefix: 'app',
    logGroup: new logs.LogGroup(this, 'Logs', {
      retention: logs.RetentionDays.ONE_WEEK,
    }),
  }),
});
container.addPortMappings({ containerPort: 80 });
```

### Auto Scaling
```typescript
const scaling = service.service.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 10 });
scaling.scaleOnCpuUtilization('CpuScaling', { targetUtilizationPercent: 50 });
```

### Networking
- Fargate uses `awsvpc` mode (each task gets ENI)
- Create separate SGs for ALB and service
- ALB SG allows 80/443 from internet
- Service SG allows container port from ALB SG only

---

## Aurora

### Serverless v2 Cluster
```typescript
const cluster = new rds.DatabaseCluster(this, 'Aurora', {
  engine: rds.DatabaseClusterEngine.auroraPostgres({
    version: rds.AuroraPostgresEngineVersion.VER_15_4,
  }),
  serverlessV2MinCapacity: 0.5,
  serverlessV2MaxCapacity: 16,
  writer: rds.ClusterInstance.serverlessV2('writer'),
  readers: [rds.ClusterInstance.serverlessV2('reader', { scaleWithWriter: true })],
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
  credentials: rds.Credentials.fromGeneratedSecret('admin'),
  backup: { retention: Duration.days(7) },
});
```

### Best Practices
- Use Secrets Manager for credentials (`fromGeneratedSecret`)
- Enable Performance Insights for query analysis
- Place in private subnets, allow only from app SGs
- Enable deletion protection for production
- Prefer `DatabaseCluster` over deprecated serverless constructs
- Set backup retention and maintenance windows explicitly

### Credential Rotation
```typescript
cluster.addRotationSingleUser({
  automaticallyAfter: Duration.days(30),
});
```

---

## MSK (Kafka)

### Cluster Setup
```typescript
const cluster = new msk.Cluster(this, 'Kafka', {
  clusterName: 'my-cluster',
  kafkaVersion: msk.KafkaVersion.V3_4_0,
  vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  numberOfBrokerNodes: 3,
  instanceType: new ec2.InstanceType('kafka.m5.large'),
  encryptionInTransit: { clientBroker: msk.ClientBrokerEncryption.TLS },
  clientAuthentication: msk.ClientAuthentication.sasl({ iam: true }),
});
```

### Lambda Consumer
```typescript
new lambda.EventSourceMapping(this, 'MskSource', {
  eventSourceArn: cluster.clusterArn,
  startingPosition: lambda.StartingPosition.TRIM_HORIZON,
  kafkaTopic: 'my-topic',
  batchSize: 100,
  target: consumerFn,
});
```

### Best Practices
- MSK provisioning takes 15+ minutes (don't interrupt)
- Enable TLS for client-broker encryption
- Use IAM auth for serverless consumers
- Monitor broker storage (auto-expand not automatic)
- Enable broker logs in CloudWatch for diagnostics
- Keep brokers in private subnets with controlled egress

### MSK Serverless (L1/L2 Alpha)
```typescript
new msk.CfnServerlessCluster(this, 'Serverless', {
  clientAuthentication: { sasl: { iam: { enabled: true } } },
  vpcConfigs: [{ subnetIds: ['subnet-1', 'subnet-2'] }],
});
```

### MSK Authentication Modes
- IAM (recommended for AWS-native integrations)
- mTLS for legacy or cross-cloud clients
- SCRAM for username/password workflows

---

## EventBridge

### Event Rule
```typescript
const rule = new events.Rule(this, 'Rule', {
  eventPattern: {
    source: ['myapp.orders'],
    detailType: ['OrderCreated'],
    detail: { priority: [{ numeric: ['>=', 5] }] },
  },
  targets: [new targets.LambdaFunction(processFn)],
});
```

### Scheduled Rule
```typescript
new events.Rule(this, 'ScheduleRule', {
  schedule: events.Schedule.rate(Duration.hours(1)),
  targets: [new targets.LambdaFunction(cleanupFn)],
});
```

### Cross-Account
```typescript
// Send to another account's bus
const targetBus = events.EventBus.fromEventBusArn(
  this, 'TargetBus',
  'arn:aws:events:us-east-1:OTHER_ACCOUNT:event-bus/default'
);
new events.Rule(this, 'CrossAccountRule', {
  eventPattern: { source: ['myapp'] },
  targets: [new targets.EventBus(targetBus)],
});
```

### EventBridge Pipes
```typescript
new pipes.Pipe(this, 'Pipe', {
  source: new SqsSource(queue),
  target: new EventBridgeTarget(bus),
  filter: new pipes.Filter([
    pipes.FilterPattern.fromObject({ body: { type: ['ORDER'] } }),
  ]),
});
```

### Best Practices
- Use Pipes for filter/enrich/route without Lambda glue
- Set DLQs and retry policies on targets when supported
- Version event schemas via `detailType` changes

### Custom Event Bus
```typescript
const bus = new events.EventBus(this, 'Bus', {
  eventBusName: 'orders-bus',
});
```

---

## API Gateway

### REST API with Lambda
```typescript
const api = new apigateway.RestApi(this, 'Api', {
  restApiName: 'MyAPI',
  deployOptions: { stageName: 'prod' },
});

api.root.addResource('items').addMethod(
  'GET',
  new apigateway.LambdaIntegration(listFn)
);
```

### HTTP API (Lighter Weight)
```typescript
const httpApi = new apigwv2.HttpApi(this, 'HttpApi');
httpApi.addRoutes({
  path: '/items',
  methods: [apigwv2.HttpMethod.GET],
  integration: new HttpLambdaIntegration('ListIntegration', listFn),
});
```

### Best Practices
- Use HTTP API for simple Lambda proxies (cheaper, faster)
- Use REST API for transformations, request validation, usage plans
- Enable CloudWatch logging for debugging
- Use custom domain with ACM certificate

### API Gateway to SQS (Storage First)
```typescript
const queue = new sqs.Queue(this, 'Queue');
api.root.addMethod('POST', new apigateway.AwsIntegration({
  service: 'sqs',
  path: `${cdk.Aws.ACCOUNT_ID}/${queue.queueName}`,
  integrationHttpMethod: 'POST',
  options: { requestTemplates: { 'application/json': 'Action=SendMessage&MessageBody=$input.body' } },
}));
```

---

## ECS/Fargate (Operational Add-ons)

### Circuit Breaker
```typescript
new ecs.FargateService(this, 'Service', {
  cluster,
  taskDefinition,
  circuitBreaker: { rollback: true },
});
```

### Guardrails
- Enable Container Insights on the cluster
- Use separate SGs for ALB and tasks
- Set autoscaling on CPU and memory

### Service Connect
```typescript
service.enableServiceConnect({
  services: [{ portMappingName: 'app', discoveryName: 'api' }],
});
```

### Task Role vs Execution Role
- Execution role pulls images and writes logs
- Task role grants application access to AWS services
