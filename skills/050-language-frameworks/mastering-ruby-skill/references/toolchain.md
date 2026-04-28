# Ruby Toolchain

Modern Ruby development tooling for 2026 projects.

## Version Management

```bash
# Preferred: mise (https://mise.jdx.dev) — replaces asdf for most users
mise install ruby@3.3.5
mise use ruby@3.3.5

# Alternatives
rbenv install 3.3.5  && rbenv local 3.3.5
asdf install ruby 3.3.5 && asdf local ruby 3.3.5
chruby + ruby-install
```

Pin the version in `.ruby-version` (all tools respect it):

```
3.3.5
```

Also declare it in your `Gemfile`:

```ruby
ruby "3.3.5"
```

## Bundler

```bash
# Initialize a new project
bundle init

# Add gems (preferred over manually editing Gemfile)
bundle add rails --version "~> 8.0"
bundle add rspec-rails factory_bot_rails --group=development,test
bundle add dotenv-rails --group=development,test

# Install
bundle install                           # From Gemfile.lock (reproducible)
bundle install --deployment              # CI mode — fail if lock outdated

# Update
bundle update                            # Update all (review diff carefully)
bundle update rails --conservative       # Only bump rails, minimal transitive updates
bundle outdated                          # What's stale?

# Running commands with project gems
bundle exec rspec
bundle exec rails console
bundle exec rake db:migrate

# Binstubs (avoid `bundle exec` prefix)
bundle binstubs rspec-core
# Now you can run: bin/rspec
```

### Gemfile structure

```ruby
# frozen_string_literal: true
source "https://rubygems.org"
ruby "3.3.5"

gem "rails", "~> 8.0"
gem "pg"
gem "puma"

group :development, :test do
  gem "debug", platforms: %i[mri]
  gem "rspec-rails"
  gem "factory_bot_rails"
  gem "rubocop-rails-omakase", require: false
end

group :test do
  gem "capybara"
  gem "selenium-webdriver"
end

group :production do
  gem "kamal"   # Rails 8 default deployment
end
```

## RuboCop — Style and Linting

```bash
gem install rubocop rubocop-rails rubocop-rspec rubocop-performance
```

### .rubocop.yml

```yaml
require:
  - rubocop-rails
  - rubocop-rspec
  - rubocop-performance

AllCops:
  TargetRubyVersion: 3.3
  NewCops: enable
  SuggestExtensions: false
  Exclude:
    - 'bin/**/*'
    - 'db/migrate/**/*'
    - 'db/schema.rb'
    - 'tmp/**/*'
    - 'vendor/**/*'
    - 'node_modules/**/*'

Style/Documentation:
  Enabled: false             # Too noisy for app code

Style/FrozenStringLiteralComment:
  Enabled: true
  EnforcedStyle: always

Metrics/BlockLength:
  Exclude:
    - 'spec/**/*'            # RSpec describe blocks are naturally long
    - 'config/routes.rb'
    - '**/*.gemspec'

Layout/LineLength:
  Max: 120

RSpec/ExampleLength:
  Max: 20

RSpec/MultipleExpectations:
  Max: 5                     # Pragmatic over dogmatic
```

### Common commands

```bash
bundle exec rubocop                    # Check everything
bundle exec rubocop app spec           # Specific paths
bundle exec rubocop -a                 # Auto-correct safe issues
bundle exec rubocop -A                 # Auto-correct all, including unsafe ones that may change semantics. (review first!)
bundle exec rubocop --parallel         # Multi-core
bundle exec rubocop --format github    # GitHub Actions annotations

# Generate TODO file for existing offenses (gradual adoption)
bundle exec rubocop --auto-gen-config
# Creates .rubocop_todo.yml — inherit from it in .rubocop.yml
```

## Security Toolchain

```bash
# Rails SAST (static analysis for Rails apps)
gem install brakeman
bundle exec brakeman

# Dependency vulnerability scanning (Gemfile.lock vs ruby-advisory-db)
gem install bundler-audit
bundle-audit update && bundle-audit check

# Alternative: built-in `bundle audit` (recent Bundler versions)
bundle audit check --update
```

Run these in CI on every PR. See [security.md](security.md) for details.

## Rake — Task Automation

```ruby
# lib/tasks/cleanup.rake
namespace :cleanup do
  desc "Remove users inactive > 1 year"
  task stale_users: :environment do
    count = User.where('last_seen_at < ?', 1.year.ago).destroy_all.size
    puts "Removed #{count} stale users"
  end
end
```

```bash
bundle exec rake -T                # List tasks
bundle exec rake cleanup:stale_users
```

## Development Helpers

| Gem             | Purpose                                                              |
| --------------- | -------------------------------------------------------------------- |
| **debug**       | Official Ruby debugger (replaces byebug/pry-byebug). `binding.break` |
| **dotenv-rails** | Load `.env` in development                                          |
| **guard**       | Auto-run tests/linters on file changes                               |
| **foreman**     | Run multiple processes via Procfile (rails + jobs + css watcher)     |
| **letter_opener** | Preview email in dev browser                                        |
| **bullet**      | Detect N+1 queries in development                                    |
| **annotate**    | Auto-add schema annotations to models                                |

### Procfile (development)

```procfile
web:       bin/rails server
jobs:      bin/jobs                 # Rails 8 Solid Queue
css:       bin/rails tailwindcss:watch
js:        bin/rails javascript:build --watch
```

```bash
bundle exec foreman start -f Procfile.dev
```

## CI Setup (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: ruby/setup-ruby@v1
        with:
          bundler-cache: true   # Auto `bundle install` + cache

      - name: Lint
        run: bundle exec rubocop --format github

      - name: Security scan
        run: |
          bundle exec brakeman -q --no-pager
          bundle-audit update && bundle-audit check

      - name: Test
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/test
          RAILS_ENV: test
        run: |
          bin/rails db:prepare
          bundle exec rspec
```

## Profiling and Debugging

```ruby
# CPU profiling
require 'stackprof'
StackProf.run(mode: :cpu, out: 'tmp/stackprof.dump') do
  expensive_operation
end

# Memory profiling
require 'memory_profiler'
report = MemoryProfiler.report { expensive_operation }
report.pretty_print

# Benchmark-ips (more accurate than Benchmark for micro-benchmarks)
require 'benchmark/ips'
Benchmark.ips do |x|
  x.report('map')    { array.map { |i| i * 2 } }
  x.report('inject') { array.inject([]) { |a, i| a << i * 2 } }
  x.compare!
end
```

See [performance.md](performance.md) for deeper profiling strategies.

## Tool Summary Table

| Concern              | Tool                   | Command                                  |
| -------------------- | ---------------------- | ---------------------------------------- |
| Version manager      | mise / rbenv           | `mise use ruby@3.3.5`                    |
| Dependencies         | Bundler                | `bundle install`                         |
| Linting              | RuboCop                | `bundle exec rubocop -a`                 |
| Formatting           | RuboCop (built-in)     | `bundle exec rubocop -a`                 |
| Testing              | RSpec / Minitest       | `bundle exec rspec`                      |
| Coverage             | SimpleCov              | `COVERAGE=true bundle exec rspec`        |
| Security (SAST)      | Brakeman               | `bundle exec brakeman`                   |
| Dep vulnerabilities  | bundler-audit          | `bundle-audit update && bundle-audit check` |
| Debugger             | debug (official)       | `binding.break` in code                  |
| Task automation      | Rake                   | `bundle exec rake <task>`                |
| Process manager      | foreman                | `foreman start -f Procfile.dev`          |
| Deployment (Rails 8) | Kamal 2                | `bin/kamal deploy`                       |
