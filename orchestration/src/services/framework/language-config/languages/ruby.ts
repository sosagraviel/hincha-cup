import type { LanguageConfig } from '../types.js';
import { firstLine } from '../extractors.js';

export const ruby: LanguageConfig = {
  key: 'ruby',
  displayName: 'Ruby',
  extensions: ['rb', 'rake', 'gemspec'],
  manifests: [
    { kind: 'Gemfile', format: 'text' },
    { kind: '*.gemspec', format: 'text' },
  ],
  lockFiles: [
    { filename: 'Gemfile.lock', manager: 'bundler' },
    { filename: 'Berksfile.lock', manager: 'berkshelf' },
  ],
  defaultManager: 'bundler',
  runtimeVersionFiles: [{ key: 'ruby', filename: '.ruby-version', extract: firstLine }],
  toolTokens: {
    linters: ['rubocop', 'standardrb', 'reek'],
    formatters: ['rubocop', 'standardrb'],
    typeCheckers: ['sorbet', 'steep'],
    testRunners: ['rspec', 'minitest', 'cucumber', 'capybara'],
    commonFrameworks: ['rails', 'sinatra', 'hanami', 'roda', 'grape'],
    databases: ['activerecord', 'sequel', 'mongoid', 'rom-rb'],
    externalServiceSdks: [
      { pkg: 'stripe', vendor: 'Stripe', purpose: 'payments' },
      { pkg: 'sentry-ruby', vendor: 'Sentry', purpose: 'error monitoring' },
      { pkg: 'sentry-rails', vendor: 'Sentry', purpose: 'error monitoring' },
      { pkg: 'sendgrid-ruby', vendor: 'SendGrid', purpose: 'transactional email' },
      { pkg: 'twilio-ruby', vendor: 'Twilio', purpose: 'sms / voice' },
      { pkg: 'aws-sdk', vendor: 'AWS', purpose: 'cloud services' },
      { pkg: 'datadog', vendor: 'Datadog', purpose: 'observability' },
      { pkg: 'mixpanel-ruby', vendor: 'Mixpanel', purpose: 'product analytics' },
      { pkg: 'segment-analytics-ruby', vendor: 'Segment', purpose: 'event collection' },
    ],
    authLibraries: [
      { pkg: 'devise', strategy: 'session-cookie', displayName: 'Devise' },
      { pkg: 'omniauth', strategy: 'oauth2-code', displayName: 'OmniAuth' },
      { pkg: 'jwt', strategy: 'jwt-bearer', displayName: 'ruby-jwt' },
      { pkg: 'doorkeeper', strategy: 'oauth2-code', displayName: 'Doorkeeper' },
      { pkg: 'rodauth', strategy: 'session-cookie', displayName: 'Rodauth' },
    ],
    eventQueueLibraries: [
      { pkg: 'sidekiq', pattern: 'task-queue', displayName: 'Sidekiq' },
      { pkg: 'resque', pattern: 'task-queue', displayName: 'Resque' },
      { pkg: 'sneakers', pattern: 'task-queue', displayName: 'Sneakers' },
      { pkg: 'bunny', pattern: 'event-bus', displayName: 'Bunny (RabbitMQ)' },
      { pkg: 'ruby-kafka', pattern: 'kafka-streams', displayName: 'ruby-kafka' },
      { pkg: 'racecar', pattern: 'kafka-streams', displayName: 'Racecar' },
      { pkg: 'good_job', pattern: 'task-queue', displayName: 'GoodJob' },
      { pkg: 'solid_queue', pattern: 'task-queue', displayName: 'SolidQueue' },
    ],
  },
  commandDefaults: {
    lint: 'rubocop',
    format: 'rubocop -a',
    typecheck: 'bundle exec steep check',
    test: 'bundle exec rspec',
    build: 'bundle install',
  },
  hasImplementerAgent: true,
};
