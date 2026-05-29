import type { LanguageConfig } from '../types.js';
import { regexFirstGroup } from '../extractors.js';

/**
 * C# / ASP.NET Core. F# (`fsharp.ts`) and VB.NET (`vbnet.ts`) live in their
 * own files but share the same `.NET` toolchain (NuGet / dotnet CLI /
 * `packages.lock.json`). The shared `commandDefaults` mirror those F# / VB
 * entries so callers can keep using a single command set per service.
 */
export const csharp: LanguageConfig = {
  key: 'csharp',
  displayName: 'C#',
  extensions: ['cs', 'csx'],
  manifests: [
    { kind: '*.csproj', format: 'xml', manager: 'nuget' },
    { kind: '*.sln', format: 'text', manager: 'nuget' },
    { kind: 'Directory.Build.props', format: 'xml', manager: 'nuget' },
    { kind: 'global.json', format: 'json', manager: 'nuget', isPrimary: false },
  ],
  lockFiles: [{ filename: 'packages.lock.json', manager: 'nuget' }],
  runtimeVersionFiles: [
    {
      key: 'dotnet',
      filename: 'global.json',
      extract: regexFirstGroup(/"version"\s*:\s*"([^"]+)"/),
    },
  ],
  toolTokens: {
    linters: ['stylecop.analyzers', 'sonaranalyzer.csharp', 'roslynator'],
    formatters: ['dotnet-format', 'csharpier'],
    typeCheckers: ['dotnet'],
    testRunners: ['xunit', 'nunit', 'mstest', 'fluentassertions', 'moq'],
    commonFrameworks: [
      'asp.netcore.app',
      'aspnetcore.mvc',
      'aspnetcore.minimal',
      'blazor',
      'maui',
      'wpf',
      'winforms',
    ],
    databases: ['entityframeworkcore', 'dapper', 'nhibernate'],
    externalServiceSdks: [
      { pkg: 'Stripe.net', vendor: 'Stripe', purpose: 'payments' },
      { pkg: 'Sentry.AspNetCore', vendor: 'Sentry', purpose: 'error monitoring' },
      { pkg: 'Sentry', vendor: 'Sentry', purpose: 'error monitoring' },
      { pkg: 'SendGrid', vendor: 'SendGrid', purpose: 'transactional email' },
      { pkg: 'Twilio', vendor: 'Twilio', purpose: 'sms / voice' },
      { pkg: 'AWSSDK.', vendor: 'AWS', purpose: 'cloud services' },
      { pkg: 'Google.Cloud.', vendor: 'Google Cloud', purpose: 'cloud services' },
      { pkg: 'Azure.', vendor: 'Azure', purpose: 'cloud services' },
      { pkg: 'Microsoft.Azure.', vendor: 'Azure', purpose: 'cloud services' },
      { pkg: 'Datadog.Trace', vendor: 'Datadog', purpose: 'observability' },
      { pkg: 'Elasticsearch.Net', vendor: 'Elastic', purpose: 'search' },
    ],
    authLibraries: [
      {
        pkg: 'Microsoft.AspNetCore.Authentication.JwtBearer',
        strategy: 'jwt-bearer',
        displayName: 'AspNetCore JwtBearer',
      },
      {
        pkg: 'Microsoft.AspNetCore.Authentication.OpenIdConnect',
        strategy: 'oauth2-pkce',
        displayName: 'AspNetCore OIDC',
      },
      {
        pkg: 'Microsoft.AspNetCore.Authentication.Cookies',
        strategy: 'session-cookie',
        displayName: 'AspNetCore Cookies',
      },
      { pkg: 'IdentityServer4', strategy: 'oauth2-code', displayName: 'IdentityServer4' },
      {
        pkg: 'Duende.IdentityServer',
        strategy: 'oauth2-code',
        displayName: 'Duende IdentityServer',
      },
      { pkg: 'IdentityModel', strategy: 'oauth2-code', displayName: 'IdentityModel' },
      {
        pkg: 'Keycloak.AuthServices',
        strategy: 'oauth2-pkce',
        displayName: 'Keycloak.AuthServices',
      },
    ],
    eventQueueLibraries: [
      { pkg: 'Hangfire', pattern: 'task-queue', displayName: 'Hangfire' },
      { pkg: 'MassTransit', pattern: 'event-bus', displayName: 'MassTransit' },
      { pkg: 'RabbitMQ.Client', pattern: 'event-bus', displayName: 'RabbitMQ.Client' },
      { pkg: 'Confluent.Kafka', pattern: 'kafka-streams', displayName: 'Confluent.Kafka' },
      { pkg: 'NATS.Client', pattern: 'pubsub', displayName: 'NATS.Client' },
      { pkg: 'Microsoft.AspNetCore.SignalR', pattern: 'websocket', displayName: 'SignalR' },
      { pkg: 'Quartz', pattern: 'task-queue', displayName: 'Quartz.NET' },
    ],
  },
  commandDefaults: {
    lint: 'dotnet format --verify-no-changes',
    format: 'dotnet format',
    typecheck: 'dotnet build --no-incremental',
    test: 'dotnet test',
    build: 'dotnet build',
  },
  hasImplementerAgent: true,
  skillName: 'dotnet',
};
