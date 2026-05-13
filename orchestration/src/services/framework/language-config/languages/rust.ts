import type { LanguageConfig } from '../types.js';
import { firstLine, regexFirstGroup } from '../extractors.js';

export const rust: LanguageConfig = {
  key: 'rust',
  displayName: 'Rust',
  extensions: ['rs'],
  manifests: [{ kind: 'Cargo.toml', format: 'toml' }],
  lockFiles: [{ filename: 'Cargo.lock', manager: 'cargo' }],
  runtimeVersionFiles: [
    {
      key: 'rust',
      filename: 'rust-toolchain.toml',
      extract: (contents) =>
        regexFirstGroup(/channel\s*=\s*"([^"]+)"/)(contents) ?? firstLine(contents),
    },
  ],
  toolTokens: {
    linters: ['clippy'],
    formatters: ['rustfmt'],
    typeCheckers: ['rustc'],
    testRunners: ['cargo-test', 'mockall', 'proptest', 'quickcheck'],
    commonFrameworks: ['actix-web', 'axum', 'rocket', 'warp', 'tide', 'salvo', 'poem'],
    databases: ['diesel', 'sqlx', 'sea-orm', 'tokio-postgres', 'mongodb', 'redis-rs'],
    externalServiceSdks: [
      { pkg: 'stripe-rust', vendor: 'Stripe', purpose: 'payments' },
      { pkg: 'async-stripe', vendor: 'Stripe', purpose: 'payments' },
      { pkg: 'sentry', vendor: 'Sentry', purpose: 'error monitoring' },
      { pkg: 'lettre', vendor: 'Lettre', purpose: 'transactional email' },
      { pkg: 'aws-sdk-', vendor: 'AWS', purpose: 'cloud services' },
      { pkg: 'aws-config', vendor: 'AWS', purpose: 'cloud services' },
      { pkg: 'google-cloud-', vendor: 'Google Cloud', purpose: 'cloud services' },
      { pkg: 'elasticsearch', vendor: 'Elastic', purpose: 'search' },
    ],
    authLibraries: [
      { pkg: 'jsonwebtoken', strategy: 'jwt-bearer', displayName: 'jsonwebtoken' },
      { pkg: 'jwt-simple', strategy: 'jwt-bearer', displayName: 'jwt-simple' },
      { pkg: 'oauth2', strategy: 'oauth2-code', displayName: 'oauth2-rs' },
      { pkg: 'openidconnect', strategy: 'oauth2-pkce', displayName: 'openidconnect-rs' },
      { pkg: 'biscuit-auth', strategy: 'other', displayName: 'Biscuit' },
    ],
    eventQueueLibraries: [
      { pkg: 'lapin', pattern: 'event-bus', displayName: 'Lapin (RabbitMQ)' },
      { pkg: 'rdkafka', pattern: 'kafka-streams', displayName: 'rust-rdkafka' },
      { pkg: 'async-nats', pattern: 'pubsub', displayName: 'async-nats' },
      { pkg: 'tokio-cron-scheduler', pattern: 'task-queue', displayName: 'tokio-cron-scheduler' },
      { pkg: 'apalis', pattern: 'task-queue', displayName: 'Apalis' },
    ],
  },
};
