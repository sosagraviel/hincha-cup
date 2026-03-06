# Observability with CDK

## Contents

- [CloudWatch Logs](#cloudwatch-logs)
- [CloudWatch Metrics and Alarms](#cloudwatch-metrics-and-alarms)
- [CloudWatch Dashboards](#cloudwatch-dashboards)
- [X-Ray Tracing](#x-ray-tracing)
- [Service-Specific Observability](#service-specific-observability)
- [Embedded Metric Format (EMF)](#embedded-metric-format-emf)
- [Log Subscriptions](#log-subscriptions)

---

## CloudWatch Logs

### Log Group with Retention
```typescript
const logGroup = new logs.LogGroup(this, 'AppLogs', {
  logGroupName: '/myapp/service',
  retention: logs.RetentionDays.ONE_WEEK,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

### Lambda Logging
```typescript
// Explicit log group (recommended for control)
const fn = new lambda.Function(this, 'Fn', {
  // ...
  logGroup: new logs.LogGroup(this, 'FnLogs', {
    retention: logs.RetentionDays.TWO_WEEKS,
  }),
});

// Or use logRetention shorthand
const fn2 = new lambda.Function(this, 'Fn2', {
  // ...
  logRetention: logs.RetentionDays.ONE_WEEK,
});
```

### ECS Container Logging
```typescript
taskDef.addContainer('App', {
  image,
  logging: ecs.LogDrivers.awsLogs({
    streamPrefix: 'myapp',
    logGroup: new logs.LogGroup(this, 'EcsLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
    }),
  }),
});
```

### Metric Filters
```typescript
new logs.MetricFilter(this, 'ErrorFilter', {
  logGroup,
  metricNamespace: 'MyApp',
  metricName: 'ErrorCount',
  filterPattern: logs.FilterPattern.literal('ERROR'),
  metricValue: '1',
});
```

---

## CloudWatch Metrics and Alarms

### Service Metrics
```typescript
// Lambda
fn.metricErrors({ period: Duration.minutes(5) });
fn.metricDuration({ statistic: 'p99' });
fn.metricInvocations();

// DynamoDB
table.metricThrottledRequests();
table.metricConsumedReadCapacityUnits();

// SQS
queue.metricApproximateNumberOfMessagesVisible();
queue.metricApproximateAgeOfOldestMessage();

// S3
bucket.metric5xxErrors();
bucket.metricGetRequests();
```

### Creating Alarms
```typescript
new cloudwatch.Alarm(this, 'LambdaErrors', {
  metric: fn.metricErrors({ period: Duration.minutes(5) }),
  threshold: 1,
  evaluationPeriods: 1,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  alarmDescription: 'Lambda function errors detected',
});

// Alarm with SNS notification
const topic = new sns.Topic(this, 'AlertTopic');
alarm.addAlarmAction(new cw_actions.SnsAction(topic));
```

### Composite Alarms
```typescript
const composite = new cloudwatch.CompositeAlarm(this, 'ServiceHealth', {
  alarmRule: cloudwatch.AlarmRule.anyOf(
    errorAlarm,
    latencyAlarm,
    throttleAlarm
  ),
});
```

### Custom Metrics
```typescript
const customMetric = new cloudwatch.Metric({
  namespace: 'MyApp',
  metricName: 'OrdersProcessed',
  dimensionsMap: { Environment: 'prod' },
  statistic: 'Sum',
  period: Duration.minutes(1),
});
```

---

## CloudWatch Dashboards

### Basic Dashboard
```typescript
const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
  dashboardName: 'MyAppDashboard',
});

dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Lambda Invocations',
    left: [fn.metricInvocations()],
    right: [fn.metricErrors()],
    width: 12,
  }),
  new cloudwatch.SingleValueWidget({
    title: 'DynamoDB Reads',
    metrics: [table.metricConsumedReadCapacityUnits()],
    width: 6,
  }),
);
```

### Multi-Row Dashboard
```typescript
dashboard.addWidgets(
  // Row 1: Lambda
  new cloudwatch.GraphWidget({
    title: 'Lambda Performance',
    left: [fn.metricDuration({ statistic: 'p50' })],
    right: [fn.metricDuration({ statistic: 'p99' })],
  }),
);

dashboard.addWidgets(
  // Row 2: DynamoDB
  new cloudwatch.GraphWidget({
    title: 'DynamoDB Capacity',
    left: [
      table.metricConsumedReadCapacityUnits(),
      table.metricConsumedWriteCapacityUnits(),
    ],
  }),
);
```

### Alarm Status Widget
```typescript
dashboard.addWidgets(
  new cloudwatch.AlarmStatusWidget({
    title: 'Service Alarms',
    alarms: [errorAlarm, latencyAlarm, throttleAlarm],
    width: 24,
  }),
);
```

---

## X-Ray Tracing

### Lambda Tracing
```typescript
const fn = new lambda.Function(this, 'Fn', {
  // ...
  tracing: lambda.Tracing.ACTIVE,
});
```

### API Gateway Tracing
```typescript
const api = new apigateway.RestApi(this, 'Api', {
  deployOptions: {
    tracingEnabled: true,
    dataTraceEnabled: true,  // Log request/response
    loggingLevel: apigateway.MethodLoggingLevel.INFO,
  },
});
```

### Step Functions Tracing
```typescript
const stateMachine = new sfn.StateMachine(this, 'SM', {
  // ...
  tracingEnabled: true,
});
```

### ECS X-Ray Daemon
```typescript
// Add X-Ray daemon sidecar
taskDef.addContainer('xray', {
  image: ecs.ContainerImage.fromRegistry('amazon/aws-xray-daemon'),
  cpu: 32,
  memoryReservationMiB: 256,
  essential: false,
  portMappings: [{ containerPort: 2000, protocol: ecs.Protocol.UDP }],
});
```

---

## Service-Specific Observability

### Lambda Insights
```typescript
const fn = new lambda.Function(this, 'Fn', {
  // ...
  insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_143_0,
});
```
Provides: CPU, memory, cold starts, network metrics.

### Container Insights
```typescript
const cluster = new ecs.Cluster(this, 'Cluster', {
  vpc,
  containerInsights: true,
});
```
Provides: Task/service metrics, CPU/memory per container.

### RDS Performance Insights
```typescript
const cluster = new rds.DatabaseCluster(this, 'DB', {
  // ...
  enablePerformanceInsights: true,
  performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
});
```

### Key Metrics to Monitor

| Service | Critical Metrics |
|---------|------------------|
| Lambda | Errors, Duration (p99), ConcurrentExecutions, Throttles |
| DynamoDB | ThrottledRequests, ConsumedCapacity, SystemErrors |
| ECS | CPUUtilization, MemoryUtilization, RunningTaskCount |
| SQS | ApproximateAgeOfOldestMessage, NumberOfMessagesDeleted |
| API Gateway | 4XXError, 5XXError, Latency, Count |
| RDS | CPUUtilization, FreeableMemory, DatabaseConnections |

### Structured Logging Pattern
```typescript
// In Lambda code - log JSON for CloudWatch Insights queries
console.log(JSON.stringify({
  level: 'INFO',
  message: 'Order processed',
  orderId: '123',
  userId: 'user-456',
  duration: 150,
}));

// Query in CloudWatch Logs Insights:
// fields @timestamp, orderId, duration
// | filter level = 'ERROR'
// | sort @timestamp desc
```

### Best Practices
1. Set log retention on all log groups (avoid infinite growth)
2. Use structured JSON logs for queryability
3. Enable X-Ray for distributed tracing across services
4. Create dashboards per application/service boundary
5. Set alarms on business metrics, not just technical
6. Use anomaly detection for unpredictable patterns
7. Tag all resources for cost attribution

## Embedded Metric Format (EMF)

EMF allows high-cardinality custom metrics via logs:
```typescript
console.log(JSON.stringify({
  _aws: {
    Timestamp: Date.now(),
    CloudWatchMetrics: [{
      Namespace: 'MyApp/Orders',
      Dimensions: [['Service', 'Status']],
      Metrics: [{ Name: 'OrderCount', Unit: 'Count' }],
    }],
  },
  Service: 'OrderProcessor',
  Status: 'Success',
  OrderCount: 1,
}));
```

## Log Subscriptions

Stream logs to centralized systems:
```typescript
new logs.SubscriptionFilter(this, 'LogsToFirehose', {
  logGroup,
  destination: new destinations.KinesisFirehoseDestination(firehose),
  filterPattern: logs.FilterPattern.allEvents(),
});
```
