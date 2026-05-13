import type { LanguageConfig } from '../types.js';
import { regexFirstGroup } from '../extractors.js';

export const php: LanguageConfig = {
  key: 'php',
  displayName: 'PHP',
  extensions: ['php'],
  manifests: [{ kind: 'composer.json', format: 'json' }],
  lockFiles: [{ filename: 'composer.lock', manager: 'composer' }],
  runtimeVersionFiles: [
    {
      key: 'php',
      filename: 'composer.json',
      extract: regexFirstGroup(/"php"\s*:\s*"([^"]+)"/),
    },
  ],
  toolTokens: {
    linters: ['phpstan', 'phpcs', 'psalm', 'phan'],
    formatters: ['php-cs-fixer', 'phpcbf'],
    typeCheckers: ['phpstan', 'psalm'],
    testRunners: ['phpunit', 'pest', 'codeception', 'behat'],
    commonFrameworks: ['laravel', 'symfony', 'codeigniter', 'cakephp', 'yii', 'slim'],
    databases: ['doctrine', 'eloquent', 'propel'],
    externalServiceSdks: [
      { pkg: 'stripe/stripe-php', vendor: 'Stripe', purpose: 'payments' },
      { pkg: 'sentry/sentry', vendor: 'Sentry', purpose: 'error monitoring' },
      { pkg: 'sentry/sentry-laravel', vendor: 'Sentry', purpose: 'error monitoring' },
      { pkg: 'sendgrid/sendgrid', vendor: 'SendGrid', purpose: 'transactional email' },
      { pkg: 'twilio/sdk', vendor: 'Twilio', purpose: 'sms / voice' },
      { pkg: 'aws/aws-sdk-php', vendor: 'AWS', purpose: 'cloud services' },
      { pkg: 'google/cloud', vendor: 'Google Cloud', purpose: 'cloud services' },
      { pkg: 'algolia/algoliasearch-client-php', vendor: 'Algolia', purpose: 'search' },
    ],
    authLibraries: [
      { pkg: 'laravel/passport', strategy: 'oauth2-code', displayName: 'Laravel Passport' },
      { pkg: 'laravel/sanctum', strategy: 'session-cookie', displayName: 'Laravel Sanctum' },
      {
        pkg: 'symfony/security-bundle',
        strategy: 'session-cookie',
        displayName: 'Symfony Security',
      },
      { pkg: 'firebase/php-jwt', strategy: 'jwt-bearer', displayName: 'firebase/php-jwt' },
      { pkg: 'lcobucci/jwt', strategy: 'jwt-bearer', displayName: 'lcobucci/jwt' },
      { pkg: 'league/oauth2-server', strategy: 'oauth2-code', displayName: 'league/oauth2-server' },
    ],
    eventQueueLibraries: [
      { pkg: 'symfony/messenger', pattern: 'event-bus', displayName: 'Symfony Messenger' },
      { pkg: 'laravel/horizon', pattern: 'task-queue', displayName: 'Laravel Horizon' },
      { pkg: 'pda/pheanstalk', pattern: 'task-queue', displayName: 'Pheanstalk (Beanstalkd)' },
      { pkg: 'php-amqplib/php-amqplib', pattern: 'event-bus', displayName: 'php-amqplib' },
      { pkg: 'enqueue/enqueue', pattern: 'event-bus', displayName: 'Enqueue' },
    ],
  },
};
