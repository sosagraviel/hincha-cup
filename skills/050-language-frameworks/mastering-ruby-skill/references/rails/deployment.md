# Rails 8 Deployment

Production-grade deployment with Kamal 2, the Solid Stack, and zero-downtime operations.

## The Rails 8 Deployment Story

Rails 8 includes everything to deploy a production web app to any VM without external services:

- **Kamal 2** — Docker-based zero-downtime deploys to your own servers
- **Thruster** — HTTP cache + compression proxy in front of Puma
- **Solid Queue** — DB-backed ActiveJob adapter (replaces Sidekiq/Redis)
- **Solid Cache** — DB-backed `Rails.cache` (replaces Redis/Memcached)
- **Solid Cable** — DB-backed ActionCable pub/sub (replaces Redis)
- **Propshaft** — Simpler asset pipeline (replaces Sprockets)

You can run a production Rails app with just: one VM + PostgreSQL (or SQLite) + Docker.

## Kamal 2

### Initial Setup

```bash
bin/kamal init               # Generates config/deploy.yml, Dockerfile, .kamal/

# Edit config/deploy.yml to set servers, domain, registry
bin/kamal setup              # First-time provision (installs Docker, Traefik, etc.)
bin/kamal deploy             # Builds image, pushes, rotates container on server
```

### config/deploy.yml (annotated)

```yaml
service: blog                          # Docker image name suffix
image: my-org/blog                     # Full image path (prefixed by registry)

# Web servers
servers:
  web:
    hosts:
      - 10.0.0.11
      - 10.0.0.12
    labels:
      traefik.http.routers.blog.rule: "Host(`blog.example.com`)"
      traefik.http.routers.blog.tls.certresolver: letsencrypt
      traefik.http.routers.blog.entrypoints: websecure
    healthcheck:
      path: /up
      port: 3000
      max_attempts: 10
      interval: 20s

  job:                                 # Dedicated job processes
    hosts:
      - 10.0.0.20
    cmd: bin/jobs                      # Solid Queue dispatcher + workers
    options:
      restart: unless-stopped

# Build
builder:
  arch: amd64                          # Or arm64 for Graviton / Apple Silicon servers
  args:
    RUBY_VERSION: 3.3.5
  secrets:
    - BUNDLE_GITHUB__COM               # For private gems via GitHub

# Image registry (GHCR, Docker Hub, ECR, etc.)
registry:
  server: ghcr.io
  username: my-org
  password:
    - KAMAL_REGISTRY_PASSWORD          # Set in .kamal/secrets

# Environment
env:
  clear:
    RAILS_ENV: production
    RAILS_LOG_TO_STDOUT: "true"
    RAILS_SERVE_STATIC_FILES: "true"
    RUBY_YJIT_ENABLE: "1"
    SOLID_QUEUE_IN_PUMA: "false"       # Using dedicated job host
  secret:
    - RAILS_MASTER_KEY
    - DATABASE_URL
    - SMTP_PASSWORD

# Accessories (databases, Redis, etc.)
accessories:
  postgres:
    image: postgres:16
    host: 10.0.0.30
    port: 5432
    env:
      clear:
        POSTGRES_USER: blog
        POSTGRES_DB: blog_production
      secret:
        - POSTGRES_PASSWORD
    files:
      - db/production.sql:/docker-entrypoint-initdb.d/setup.sql
    directories:
      - data:/var/lib/postgresql/data

# Traefik reverse proxy
traefik:
  options:
    publish:
      - "443:443"
  args:
    entrypoints.websecure.address: ":443"
    certificatesResolvers.letsencrypt.acme.email: ops@example.com
    certificatesResolvers.letsencrypt.acme.storage: /letsencrypt/acme.json
    certificatesResolvers.letsencrypt.acme.httpchallenge: true
    certificatesResolvers.letsencrypt.acme.httpchallenge.entrypoint: web

# Health endpoints in your Rails app
# routes.rb:  get 'up' => 'rails/health#show', as: :rails_health_check

# Rolling deploy strategy (default is rolling)
asset_path: /rails/public/assets
```

### Kamal Secrets

```bash
# .kamal/secrets — NEVER commit
KAMAL_REGISTRY_PASSWORD=$(cat ~/.docker/ghcr_token)
RAILS_MASTER_KEY=$(cat config/master.key)
DATABASE_URL=postgresql://blog:${POSTGRES_PASSWORD}@10.0.0.30/blog_production
POSTGRES_PASSWORD=$(pass show infra/postgres)
```

Load from 1Password, pass, AWS Secrets Manager, etc. at deploy time.

### Common Kamal Commands

```bash
bin/kamal deploy                           # Build + push + deploy
bin/kamal redeploy                         # Skip build, just redeploy
bin/kamal rollback <version>               # Roll back to a prior image
bin/kamal app logs -f --grep=ERROR         # Live logs
bin/kamal app exec -i 'bin/rails console'  # REPL on a server
bin/kamal app exec --reuse 'bin/rails db:migrate'  # Migrations on existing container
bin/kamal accessory logs postgres -f       # Accessory logs
bin/kamal traefik reboot                   # Restart proxy
```

### Migrations in Deploys

Zero-downtime requires running migrations *before* new code deploys. Kamal does this automatically via `bin/rails db:prepare` in the image entrypoint, but for large migrations, use a separate step:

```bash
bin/kamal app exec --reuse 'bin/rails db:migrate'
bin/kamal deploy
```

For truly long migrations (adding indexes on millions of rows), run them manually outside the deploy window.

## Dockerfile (Rails 8 default)

Rails 8 generates a production-optimized Dockerfile:

```dockerfile
# syntax=docker/dockerfile:1
ARG RUBY_VERSION=3.3.5
FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base

WORKDIR /rails
ENV RAILS_ENV=production \
    BUNDLE_WITHOUT=development:test \
    BUNDLE_DEPLOYMENT=1 \
    BUNDLE_PATH=/usr/local/bundle

# Build layer — tools not needed at runtime
FROM base AS build
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential libpq-dev git pkg-config

COPY Gemfile Gemfile.lock ./
RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile --gemfile

COPY . .
RUN bundle exec bootsnap precompile app/ lib/
RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile

# Runtime layer — minimal
FROM base
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl libsqlite3-0 libvips postgresql-client && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives

COPY --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --from=build /rails /rails

RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash && \
    chown -R rails:rails db log storage tmp
USER rails:rails

ENTRYPOINT ["/rails/bin/docker-entrypoint"]
EXPOSE 3000
CMD ["./bin/thrust", "./bin/rails", "server"]
```

## Thruster

Rails 8 ships `bin/thrust`, an HTTP proxy that:

- Compresses responses (gzip/brotli)
- Serves static assets with far-future caching
- Adds `X-Sendfile` support for `send_file`
- Health check passthrough

No configuration needed — just wrap Puma with it in your CMD line.

## Solid Queue Deployment

### In-Puma (single-server setup)

```ruby
# config/puma.rb
plugin :solid_queue if ENV['SOLID_QUEUE_IN_PUMA'] == 'true'
```

Solid Queue runs in-process alongside the web server — simplest setup for small apps.

### Standalone (recommended for scale)

```yaml
# config/queue.yml
default: &default
  dispatchers:
    - polling_interval: 1
      batch_size: 500
  workers:
    - queues: [critical]
      threads: 5
      processes: 2
    - queues: [default, low]
      threads: 10
      processes: 2

production:
  <<: *default
```

Run with:

```bash
bin/jobs           # Boots the dispatcher + all configured workers
```

In Kamal, this becomes a separate server role with `cmd: bin/jobs`.

## Solid Cache

```yaml
# config/cache.yml
production:
  store_options:
    max_age: <%= 60.days.to_i %>
    max_size: <%= 50.gigabytes %>
    namespace: <%= Rails.env %>
```

Cache data lives in the primary DB (or a separate cache DB if configured). Writes are lazily evicted when `max_age` or `max_size` is reached.

### Multi-DB setup

```yaml
# config/database.yml
production:
  primary:
    database: blog_production
    adapter: postgresql
  cache:
    database: blog_cache_production
    adapter: postgresql
    migrations_paths: db/cache_migrate
  queue:
    database: blog_queue_production
    adapter: postgresql
    migrations_paths: db/queue_migrate
```

Keeps cache and queue write load off the primary DB.

## Health Checks

```ruby
# config/routes.rb
get "up" => "rails/health#show"   # Bundled health controller — returns 200 if app is up

# For deeper checks (DB reachable, jobs running), build your own:
class HealthController < ApplicationController
  def show
    checks = {
      db:     ActiveRecord::Base.connection.execute('SELECT 1').any?,
      cache:  Rails.cache.write('healthcheck', 1) && Rails.cache.read('healthcheck') == 1,
      queue:  SolidQueue::Process.where('last_heartbeat_at > ?', 30.seconds.ago).exists?
    }
    ok = checks.values.all?
    render json: checks, status: ok ? :ok : :service_unavailable
  end
end
```

Kamal hits `/up` before swapping traffic. If it fails, rollout halts.

## Puma Tuning

```ruby
# config/puma.rb
workers Integer(ENV.fetch('WEB_CONCURRENCY') { 2 })       # Forked processes
threads_min = Integer(ENV.fetch('RAILS_MIN_THREADS') { 5 })
threads_max = Integer(ENV.fetch('RAILS_MAX_THREADS') { 5 })
threads threads_min, threads_max

preload_app!
port ENV.fetch('PORT') { 3000 }
environment ENV.fetch('RAILS_ENV') { 'production' }

before_fork do
  ActiveRecord::Base.connection_pool.disconnect! if defined?(ActiveRecord)
end

on_worker_boot do
  ActiveRecord::Base.establish_connection if defined?(ActiveRecord)
end
```

**Tuning guidelines**:
- Start with `workers = CPU cores`, `threads = 5`.
- MRI has a GVL — adding too many threads per process doesn't help CPU-bound work.
- Memory grows per worker. Leave headroom: `(RAM × 0.8) / worker_memory_mb`.
- YJIT adds ~30 MB per worker; budget for it.

## Log Management

```ruby
# Gemfile
gem 'lograge'

# config/environments/production.rb
config.log_level = :info
config.logger = ActiveSupport::Logger.new(STDOUT)
  .tap  { |l| l.formatter = ::Logger::Formatter.new }
  .then { |l| ActiveSupport::TaggedLogging.new(l) }

config.lograge.enabled = true
config.lograge.formatter = Lograge::Formatters::Json.new
config.lograge.custom_options = lambda do |event|
  {
    time:        event.time,
    request_id:  event.payload[:request_id],
    user_id:     event.payload[:user_id],
    duration_ms: event.duration.round(2)
  }
end
```

Ship STDOUT to your log aggregator (Datadog, CloudWatch, Grafana Loki). Kamal does this via Docker's log driver.

## Backup and Recovery

For PostgreSQL accessories:

```bash
# Daily backup cron on accessory host
pg_dump -Fc blog_production | \
  aws s3 cp - s3://backups/pg/blog-$(date +%F).dump \
  --sse AES256
```

Test restores quarterly. A backup you never restored is not a backup.

## Rollback Strategy

```bash
# List recent versions
bin/kamal app versions

# Roll back to specific image tag
bin/kamal rollback 2024-10-14-abc123

# If DB migration accompanied the failed deploy:
# Migrations should be backward-compatible by convention. If not:
bin/kamal app exec --reuse 'bin/rails db:rollback STEP=1'
bin/kamal rollback <previous>
```

**Rule**: never write a forward-only migration. Every migration needs a `down` method or `change` that's reversible.

## Monitoring Checklist

```
- [ ] Health endpoint (/up) — probed by Kamal and uptime monitor
- [ ] Application errors → Sentry / Honeybadger / Rollbar
- [ ] Performance metrics → New Relic / Datadog / Skylight / AppSignal
- [ ] Logs shipped to centralized ingestion with search
- [ ] Alerts on: 5xx rate, p95 latency, job queue depth, DB connection pool exhaustion
- [ ] Uptime monitor with multi-region checks (UptimeRobot, Better Uptime)
- [ ] Rack::MiniProfiler gated behind `if Rails.env.production? && current_user&.admin?`
```

## Production Readiness Checklist

```
- [ ] force_ssl = true, HSTS preloaded
- [ ] Secrets via encrypted credentials only (no plaintext ENV)
- [ ] Brakeman in CI — zero high-confidence warnings
- [ ] bundler-audit in CI — no unpatched CVEs
- [ ] Migrations tested against a prod-sized dataset
- [ ] Load test performed (k6 / wrk / vegeta) at expected peak × 2
- [ ] Backup + restore test completed within last 3 months
- [ ] On-call rotation with runbooks documented
- [ ] Rollback procedure rehearsed (non-prod)
- [ ] Log aggregation confirms PII filtering works
- [ ] Rate limiting on /login, /signup, /password/reset, /api/*
```

## Related References

### Rails

- [overview.md](overview.md) — App structure that this deployment serves.
- [active-record.md](active-record.md) — Multi-DB config used by Solid Queue/Cache/Cable.
- [hotwire.md](hotwire.md) — Solid Cable replaces Redis for ActionCable in production.

### Ruby skill (cross-cutting)

- [../security.md](../security.md) — Brakeman/bundler-audit in CI, secrets management with Rails credentials.
- [../performance.md](../performance.md) — YJIT enablement, Puma worker/thread tuning, profiling in production.
- [../toolchain.md](../toolchain.md) — Bundler config, dotenv vs Rails credentials, Rake task scheduling.
