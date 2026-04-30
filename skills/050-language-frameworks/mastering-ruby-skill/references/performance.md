# Ruby Performance

Profiling, optimization, and runtime tuning for Ruby 3.3+.

## YJIT — Just-In-Time Compiler

YJIT is production-ready as of Ruby 3.3 and provides 15–40% throughput improvements on Rails apps.

```bash
# Enable at runtime
ruby --yjit script.rb
RUBY_YJIT_ENABLE=1 bundle exec puma

# For Rails: set in config/boot.rb or via env
# Procfile / Dockerfile
ENV RUBY_YJIT_ENABLE=1

# Runtime introspection
ruby --yjit -e 'p RubyVM::YJIT.runtime_stats'
```

Tunables worth knowing:

```bash
RUBY_YJIT_EXEC_MEM_SIZE=128      # Cache size in MB (default 128)
RUBY_YJIT_CALL_THRESHOLD=30      # Compile after N calls (default 30)
RUBY_YJIT_COLD_CALL_THRESHOLD=200000
```

For ops: monitor `yjit_cached_code_memory` via NewRelic / Datadog / Prometheus. If the cache fills, tune `RUBY_YJIT_EXEC_MEM_SIZE` upward.

## Profiling

### CPU Profiling — StackProf

```ruby
# Gemfile
gem 'stackprof', require: false

# Wrap the hot path
require 'stackprof'
StackProf.run(mode: :cpu, out: 'tmp/stackprof-cpu.dump', interval: 1000) do
  100.times { Post.published.map(&:to_preview) }
end
```

```bash
# Analyze
bundle exec stackprof tmp/stackprof-cpu.dump --text --limit 20
bundle exec stackprof tmp/stackprof-cpu.dump --flamegraph > tmp/flame.html
```

### Memory Profiling — memory_profiler

```ruby
require 'memory_profiler'
report = MemoryProfiler.report do
  Post.includes(:author).limit(1000).to_a
end
report.pretty_print(to_file: 'tmp/memory.txt')
```

Look for:
- **Allocated objects** — high numbers indicate temporary object churn
- **Retained objects** — memory leaks
- **String allocations** — usually the biggest offender

### Micro-Benchmarks — benchmark-ips

Use for comparing implementations. Don't trust `Benchmark.measure` for small code (too noisy).

```ruby
require 'benchmark/ips'

Benchmark.ips do |x|
  x.warmup = 2
  x.time   = 5
  x.config(stats: :bootstrap, confidence: 95)

  x.report('map')   { array.map(&:to_s) }
  x.report('each')  { array.each_with_object([]) { |i, a| a << i.to_s } }
  x.report('then')  { array.then { |a| a.map(&:to_s) } }

  x.compare!
end
```

### Rails Request Profiling — rack-mini-profiler

Drops a speed badge into your pages in development. Shows SQL queries, memory, partial render times.

```ruby
# Gemfile
group :development do
  gem 'rack-mini-profiler'
  gem 'memory_profiler'
  gem 'stackprof'
end
```

## Database Performance (Rails)

### N+1 Query Detection

```ruby
# BAD — N+1
posts = Post.all
posts.each { |p| puts p.author.name }   # 1 query for posts, N for authors

# GOOD — eager load
posts = Post.includes(:author).all
posts.each { |p| puts p.author.name }   # 2 queries total

# Bullet gem — detects N+1 and unnecessary eager loads in dev/test
# Gemfile
group :development, :test do
  gem 'bullet'
end

# config/environments/development.rb
config.after_initialize do
  Bullet.enable = true
  Bullet.alert  = true
  Bullet.rails_logger = true
  Bullet.raise  = Rails.env.test?    # Fail tests on N+1
end
```

### Query Strategies

```ruby
# Prefer pluck for single-column or column tuples
Post.pluck(:id)                        # SELECT id
Post.pluck(:id, :title)                # SELECT id, title

# in_batches for large-scale updates
Post.where(status: 'draft').in_batches(of: 1000).update_all(archived: true)

# find_each for large-scale iteration
User.find_each(batch_size: 500) { |u| ExportJob.perform_later(u.id) }

# Existence checks — use exists? instead of present?
Post.where(user_id: user.id).exists?   # SELECT 1 ... LIMIT 1
Post.where(user_id: user.id).present?  # Loads all rows first!

# Count strategies
Post.count          # SELECT COUNT(*)
Post.size           # Uses cached count if association already loaded
```

### Indexing

```ruby
# Add indexes for common query patterns
class AddIndexesToPosts < ActiveRecord::Migration[8.0]
  def change
    add_index :posts, :user_id
    add_index :posts, [:user_id, :published_at]   # Compound index
    add_index :posts, :slug, unique: true
    add_index :posts, :search_vector, using: :gin  # PostgreSQL full-text
  end
end

# PG tip: use EXPLAIN ANALYZE to verify index usage
Post.where(user_id: 1).order(:published_at).explain(analyze: true)
```

## Caching Strategies

### Low-Level Cache (Rails.cache)

```ruby
# Rails 8 default is Solid Cache (DB-backed). Others: memory, redis, memcached.
Rails.cache.fetch("user/#{user.id}/feed", expires_in: 10.minutes) do
  build_feed(user)                     # Expensive operation
end

# Write / read separately
Rails.cache.write('key', value, expires_in: 1.hour)
Rails.cache.read('key')
Rails.cache.delete('key')
Rails.cache.delete_matched('user/*/feed')  # Pattern delete (Redis/Memcached)
```

### Russian Doll Caching (Views)

```erb
<% cache [@user, 'posts', @posts.maximum(:updated_at)] do %>
  <%= render @posts %>
<% end %>

<% @posts.each do |post| %>
  <% cache post do %>
    <%= render post %>
  <% end %>
<% end %>
```

Cache keys auto-invalidate when dependencies update (`touch: true` on associations).

### HTTP Caching

```ruby
# Action controller — ETags and Last-Modified
class PostsController < ApplicationController
  def show
    @post = Post.find(params[:id])
    fresh_when @post, last_modified: @post.updated_at
  end
end
```

## String and Object Allocation

```ruby
# Frozen string literals eliminate allocations for repeated strings
# frozen_string_literal: true

# Concat with << (mutates) vs + (allocates)
s = ''
1000.times { s << 'x' }              # 1 allocation
s = ''
1000.times { s = s + 'x' }           # 1000 allocations

# String#freeze + constant extraction
HOSTNAME = 'api.example.com'.freeze  # Same object reused

# Avoid repeated hash/symbol creation in loops
# BAD
arr.map { |i| { status: 'ok', value: i } }    # N hashes

# GOOD — if shape is repeated, consider Struct / Data.define
Row = Data.define(:status, :value)
arr.map { |i| Row.new(status: 'ok', value: i) }
```

## Background Job Tuning

### Choosing between Sidekiq and Solid Queue

| Need                          | Sidekiq                | Solid Queue                           |
| ----------------------------- | ---------------------- | ------------------------------------- |
| Existing Redis infrastructure | ✅ Required            | ❌ Not needed (uses Postgres)         |
| Sub-second enqueue latency    | ✅ Native              | ⚠️ Polling-bound (`polling_interval`) |
| Job throughput >10k/s         | ✅                     | ⚠️ DB writes become the bottleneck    |
| Operational simplicity        | ❌ One more service    | ✅ One less moving part               |
| Recurring/cron jobs           | Needs `sidekiq-cron`   | ✅ Built-in (`recurring.yml`)         |
| Default in Rails 8            | —                      | ✅                                     |

Pick Solid Queue unless you already operate Redis or need sub-second job-start latency.

### Sidekiq (classic)

```ruby
# config/sidekiq.yml
:concurrency: 10
:queues:
  - [critical, 4]
  - [default,  2]
  - [low,      1]

# Gemfile
gem 'sidekiq-unique-jobs'   # Prevent duplicate enqueues

class EmailJob
  include Sidekiq::Job
  sidekiq_options retry: 3, dead: false, lock: :until_executed
end
```

### Solid Queue (Rails 8 default)

```ruby
# config/queue.yml
default: &default
  dispatchers:
    - polling_interval: 1
      batch_size: 500
  workers:
    - queues: [default, critical]
      threads: 5
      processes: 2
      polling_interval: 0.1

production:
  <<: *default
  workers:
    - queues: [default, critical]
      threads: 10
      processes: 4
```

Run with `bin/jobs` (standalone) or enable the Puma plugin for single-server deployments.

#### Tuning trade-offs

- **Threads vs processes.** Threads share memory and are cheap — target 5–10 per process for I/O-bound jobs (HTTP, email). Processes are isolated and CPU-parallel — target ~1 process per 2 cores. CPU-bound jobs scale via processes; I/O-bound via threads.
- **`polling_interval`.** 0.1s gives ~100ms p99 enqueue-to-start latency at the cost of constant `SELECT FOR UPDATE` queries against the queue table. Leave at the default `1.0` unless you need sub-second responsiveness.
- **`batch_size`.** Larger batches reduce DB round-trips but hold a transaction longer. 500 is a sensible default; bump to 1000+ only if you measure contention.

#### Connection pool sizing (critical)

The Postgres connection pool **must accommodate**: `workers.threads × processes` + dispatcher connections + Puma's own pool — all sharing the same DB.

```yaml
# config/database.yml — production
production:
  pool: <%= ENV.fetch('RAILS_MAX_THREADS') { 5 }.to_i + 5 %>
```

Under-pooling surfaces as `ActiveRecord::ConnectionTimeoutError` under load. Always size with headroom.

**Memory rule of thumb:** budget 150–300 MB per process at steady state for a Rails app with average gems. Multiply by `processes` to size the host.

#### Sidekiq parallel tuning

- `:concurrency` is threads per process. Match to DB pool (same rule as above).
- Weighted queues (`[critical, 4]`) help only if jobs differ in latency SLA; otherwise prefer flat priority.
- `sidekiq-unique-jobs` (shown above) eliminates duplicate enqueues from retries — borderline mandatory in production.

## HTTP Client Performance

```ruby
# Reuse connections (critical for outbound APIs)
require 'net/http/persistent'
HTTP = Net::HTTP::Persistent.new(name: 'myapp')

# Or use Faraday with connection pooling
require 'faraday'
require 'faraday/net_http_persistent'

CLIENT = Faraday.new(url: 'https://api.partner.com') do |f|
  f.request  :json
  f.response :json
  f.adapter  :net_http_persistent, pool_size: 5
end
```

**Never** create a new `Net::HTTP` instance per request inside a hot loop — TLS handshake costs dominate.

## Memory Bloat Mitigation

```ruby
# Puma worker memory grows over time. Options:

# 1. puma_worker_killer (gem) — restart workers over a threshold
# Gemfile
gem 'puma_worker_killer'

# config/puma.rb
before_fork do
  PumaWorkerKiller.config do |config|
    config.ram           = 1024         # Total MB available
    config.frequency     = 5            # Check every 5 seconds
    config.percent_usage = 0.98
  end
  PumaWorkerKiller.start
end

# 2. MALLOC_ARENA_MAX — reduces glibc fragmentation
# Dockerfile or deployment:
ENV MALLOC_ARENA_MAX=2
```

## Profiling Checklist Before Optimizing

```
- [ ] Measured baseline with real production-like data
- [ ] Identified bottleneck with profiler (StackProf / memory_profiler)
- [ ] Bottleneck accounts for >20% of total time
- [ ] Confirmed N+1 with Bullet or SQL logs
- [ ] Checked for missing indexes via EXPLAIN
- [ ] Verified YJIT enabled in production
- [ ] Cache hit rates monitored in Grafana / Datadog
- [ ] Tested fix reproduces the speedup in benchmarks
```

**Most important rule**: don't optimize without measuring. Ruby is fast enough for most workloads once N+1 queries, missing indexes, and unnecessary object allocation are addressed.

## References

- YJIT documentation: https://github.com/ruby/ruby/blob/master/doc/yjit/yjit.md
- Rails performance guide: https://guides.rubyonrails.org/performance_testing.html
- Scout APM blog on Ruby performance: https://scoutapm.com/blog
- "The Complete Guide to Rails Performance" (Nate Berkopec)
