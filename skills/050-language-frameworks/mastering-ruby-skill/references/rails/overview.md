# Ruby on Rails — Overview

Production-ready Rails 8 patterns with the Solid Stack and Kamal 2 deployment.

> **Compatibility:** Rails 8.0+, Ruby 3.3+, Puma 6+, Propshaft, Hotwire (Turbo 8 / Stimulus 3), Kamal 2.

## Quick Start

```bash
# New Rails 8 app with all modern defaults
rails new blog --database=postgresql --css=tailwind --javascript=importmap

# Or API-only
rails new api --api --database=postgresql

# Initialize quality and security tools
cd blog
bundle add rspec-rails factory_bot_rails --group=development,test
bundle add rubocop-rails-omakase brakeman bundler-audit --group=development
bin/rails generate rspec:install
```

## Project Setup Checklist

```
- [ ] Ruby 3.3+ pinned in .ruby-version and Gemfile
- [ ] PostgreSQL (or other prod-grade DB) — not SQLite except for micro apps
- [ ] rubocop-rails-omakase (or RuboCop + rubocop-rails) configured
- [ ] brakeman + bundler-audit in CI
- [ ] RSpec (or Minitest) with SimpleCov 80%+ coverage gate
- [ ] Devise or rodauth for authentication (unless using Rails 8's generators)
- [ ] Pundit or CanCanCan for authorization
- [ ] Kamal 2 for deployment (config/deploy.yml)
- [ ] Solid Queue / Cache / Cable configured (or Sidekiq + Redis)
- [ ] lograge for structured production logs
- [ ] Credentials per environment via rails credentials:edit
```

## Rails 8 Highlights

| Feature              | What it replaces                 | Notes                                                                  |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| **Solid Queue**      | Sidekiq / Redis                  | DB-backed job queue. Supports PostgreSQL, MySQL, SQLite. FOR UPDATE SKIP LOCKED. |
| **Solid Cache**      | Redis / Memcached cache          | Disk-backed cache. Large, persistent, cheap.                          |
| **Solid Cable**      | Redis pub/sub for ActionCable    | DB-backed WebSocket fanout.                                           |
| **Kamal 2**          | Capistrano / Heroku              | Zero-downtime Docker deploys to any VM.                               |
| **Propshaft**        | Sprockets                        | Simpler asset pipeline.                                                |
| **Authentication generator** | Third-party gems for basics | `rails generate authentication` scaffolds a minimal auth system.      |

## Directory Structure (Rails 8)

```
app/
├── assets/              # Images, stylesheets
├── channels/            # ActionCable channels
├── controllers/
│   ├── application_controller.rb
│   ├── concerns/        # Controller concerns (auth, pagination)
│   └── api/v1/          # Versioned API controllers
├── helpers/             # View helpers
├── javascript/          # Stimulus controllers, importmap entries
├── jobs/                # ActiveJob (Solid Queue)
├── mailers/             # ActionMailer
├── models/
│   ├── application_record.rb
│   └── concerns/        # Model concerns (Taggable, Auditable)
├── policies/            # Pundit policies
├── services/            # Service objects (business logic)
├── views/
│   ├── layouts/
│   └── <controller>/
└── components/          # ViewComponent (optional)

config/
├── application.rb
├── database.yml
├── deploy.yml           # Kamal 2 configuration
├── queue.yml            # Solid Queue workers
├── cache.yml            # Solid Cache
├── cable.yml            # Solid Cable
├── credentials/         # Per-env encrypted credentials
├── environments/
├── initializers/
└── routes.rb

db/
├── migrate/             # Sequential schema migrations
├── schema.rb            # Current schema snapshot
└── seeds.rb

spec/ (or test/)
lib/
├── tasks/               # Custom rake tasks
└── …
bin/
├── rails
├── jobs                 # Solid Queue dispatcher
├── kamal
└── setup
```

## Controllers

```ruby
# app/controllers/posts_controller.rb
class PostsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_post, only: %i[show edit update destroy]

  # Scope via current_user association for authorization-by-construction
  def index
    @posts = current_user.posts
                         .includes(:author, :tags)        # avoid N+1
                         .order(published_at: :desc)
                         .page(params[:page])
  end

  def show
    authorize @post                                       # Pundit
  end

  def create
    @post = current_user.posts.build(post_params)

    if @post.save
      redirect_to @post, notice: t('.created')
    else
      render :new, status: :unprocessable_entity
    end
  end

  def update
    authorize @post
    if @post.update(post_params)
      redirect_to @post, notice: t('.updated')
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    authorize @post
    @post.destroy!
    redirect_to posts_path, notice: t('.destroyed'), status: :see_other
  end

  private

  def set_post
    @post = current_user.posts.find(params[:id])
  end

  def post_params
    params.require(:post).permit(:title, :body, :published_at, tag_ids: [])
  end
end
```

**Rules of thumb**:
- `current_user.association` for authorization-by-construction.
- `before_action` for auth and resource loading. Keep them minimal.
- Strong params always. Never `permit!`.
- Flash messages via i18n (`t('.created')`).
- Return `:see_other` status on `destroy` — avoids double-submit on JS-disabled browsers.
- Controller should never be >100 lines. Extract to service objects when it grows.

## ActiveRecord

ActiveRecord is Rails' ORM. Models inherit from `ApplicationRecord` and gain associations, validations, callbacks, scopes, and a rich query interface for free.

```ruby
class Post < ApplicationRecord
  belongs_to :author, counter_cache: true    # updates author.posts_count
  has_many :comments, dependent: :destroy
  has_rich_text :body                         # Action Text
  has_many_attached :images                   # Active Storage

  validates :title, presence: true
  validates :slug,  presence: true, uniqueness: true

  scope :published, -> { where.not(published_at: nil) }
  scope :recent,    -> { order(published_at: :desc) }

  before_validation :generate_slug, on: :create

  private

  def generate_slug
    self.slug ||= title.to_s.parameterize
  end
end
```

Three query patterns that show up in every Rails app:

```ruby
# Avoiding N+1 — eager-load associations referenced in views
Post.published.includes(:author, comments: :user).recent.limit(10)

# find_each / find_in_batches for large result sets
User.find_each(batch_size: 500) { |u| ReindexJob.perform_later(u.id) }

# pluck for cheap single-column fetches (no model instantiation)
Post.published.pluck(:id, :title)
```

For everything else — counter caches in depth, callback anti-patterns, `includes` vs `preload` vs `eager_load`, transactions, optimistic/pessimistic locking, encryption, multiple databases, bulk operations, and zero-downtime migrations — see [active-record.md](active-record.md).

## Routes

```ruby
# config/routes.rb
Rails.application.routes.draw do
  root 'home#index'

  devise_for :users

  resources :posts do
    resources :comments, shallow: true      # /comments/:id, /posts/:post_id/comments
    member do
      post :publish, :unpublish
    end
    collection do
      get :drafts
    end
  end

  namespace :api do
    namespace :v1 do
      resources :posts, only: %i[index show create update destroy]
      resources :sessions, only: %i[create destroy]
    end
  end

  # Health check for Kamal
  get 'up' => 'rails/health#show', as: :rails_health_check

  # Mountable engines
  mount Sidekiq::Web => '/admin/sidekiq' if defined?(Sidekiq::Web)

  # Catch-all for SPA frontends (must be LAST)
  # get '*path', to: 'home#index', constraints: ->(req) { !req.xhr? && req.format.html? }
end
```

## Service Objects

Keep business logic out of models and controllers:

```ruby
# app/services/posts/publish_service.rb
module Posts
  Success = Data.define(:value)
  Failure = Data.define(:error)

  class PublishService
    def self.call(post:, actor:) = new(post:, actor:).call

    def initialize(post:, actor:)
      @post, @actor = post, actor
    end

    def call
      return Failure.new(:already_published) if @post.published?
      return Failure.new(:unauthorized)      unless PostPolicy.new(@actor, @post).publish?

      ActiveRecord::Base.transaction do
        @post.update!(published_at: Time.current, published_by: @actor)
        Notifications::NewPostJob.perform_later(@post.id)
      end

      Success.new(@post)
    end
  end
end

# Controller — pattern matching makes the two paths explicit
class PostsController < ApplicationController
  def publish
    case Posts::PublishService.call(post: @post, actor: current_user)
    in Posts::Success(value: post)
      redirect_to post, notice: 'Published!'
    in Posts::Failure(error:)
      redirect_to @post, alert: error.to_s.humanize
    end
  end
end
```

## Background Jobs (Solid Queue — Rails 8 default)

```ruby
# app/jobs/welcome_email_job.rb
class WelcomeEmailJob < ApplicationJob
  queue_as :default
  retry_on ActiveRecord::Deadlocked, attempts: 5, wait: :polynomially_longer
  discard_on ActiveJob::DeserializationError

  def perform(user_id)
    user = User.find(user_id)
    UserMailer.welcome(user).deliver_now
  end
end

# Enqueue
WelcomeEmailJob.perform_later(user.id)
WelcomeEmailJob.set(wait: 1.hour).perform_later(user.id)
WelcomeEmailJob.set(queue: :critical).perform_later(user.id)
```

### Solid Queue configuration

```yaml
# config/queue.yml
default: &default
  dispatchers:
    - polling_interval: 1
      batch_size: 500
      concurrency_maintenance_interval: 300
  workers:
    - queues: [critical, default, low]
      threads: 5
      processes: 2

production:
  <<: *default
  workers:
    - queues: [critical, default, low]
      threads: 10
      processes: 4
```

Run the dispatcher: `bin/jobs`. In Puma plugin mode it runs in-process.

### Sidekiq Alternative (Redis)

Still preferred for high-throughput workloads. Configure:

```ruby
# config/application.rb
config.active_job.queue_adapter = :sidekiq

# config/sidekiq.yml
:concurrency: 10
:queues:
  - [critical, 4]
  - [default,  2]
  - [low,      1]
```

## Hotwire — Turbo + Stimulus

Rails 8 ships with Hotwire by default. Write server-rendered HTML; sprinkle JavaScript.

### Turbo Frames

```erb
<!-- app/views/posts/show.html.erb -->
<%= turbo_frame_tag dom_id(@post, :comments) do %>
  <%= render @post.comments %>
  <%= render 'comments/new_form', post: @post %>
<% end %>
```

```ruby
# app/controllers/comments_controller.rb
def create
  @comment = @post.comments.create!(comment_params.merge(user: current_user))

  respond_to do |format|
    format.turbo_stream   # Rails finds create.turbo_stream.erb automatically
    format.html { redirect_to @post }
  end
end
```

```erb
<!-- app/views/comments/create.turbo_stream.erb -->
<%= turbo_stream.append dom_id(@post, :comments) do %>
  <%= render @comment %>
<% end %>
<%= turbo_stream.replace 'new_comment_form' do %>
  <%= render 'new_form', post: @post, comment: Comment.new %>
<% end %>
```

### Stimulus Controllers

```javascript
// app/javascript/controllers/dropdown_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["menu"]

  toggle(event) {
    event.preventDefault()
    this.menuTarget.classList.toggle("hidden")
  }

  close() {
    this.menuTarget.classList.add("hidden")
  }
}
```

```erb
<div data-controller="dropdown" data-action="click@window->dropdown#close">
  <button data-action="click->dropdown#toggle">Menu</button>
  <ul data-dropdown-target="menu" class="hidden">
    <li>…</li>
  </ul>
</div>
```

## API Mode

```ruby
# app/controllers/api/v1/base_controller.rb
module Api
  module V1
    class BaseController < ActionController::API
      include ActionController::HttpAuthentication::Token::ControllerMethods

      before_action :authenticate_token!

      rescue_from ActiveRecord::RecordNotFound,   with: :not_found
      rescue_from ActiveRecord::RecordInvalid,    with: :unprocessable
      rescue_from Pundit::NotAuthorizedError,     with: :forbidden

      private

      def authenticate_token!
        authenticate_or_request_with_http_token do |token|
          @current_user = ApiToken.find_by(token: token)&.user
        end
      end

      def current_user = @current_user

      def not_found(e)       = render json: { error: e.message }, status: :not_found
      def unprocessable(e)   = render json: { errors: e.record.errors }, status: :unprocessable_entity
      def forbidden          = render json: { error: 'forbidden' },     status: :forbidden
    end
  end
end
```

### Serialization

Use `Oj` + `Jbuilder` for small-to-medium, or `fast_jsonapi` / `alba` for larger payloads:

```ruby
# app/views/api/v1/posts/show.json.jbuilder
json.post do
  json.extract! @post, :id, :title, :body, :published_at
  json.author do
    json.extract! @post.author, :id, :name
  end
end
```

## Deployment with Kamal 2

```yaml
# config/deploy.yml
service: blog
image: my-org/blog

servers:
  web:
    hosts:
      - web-1.example.com
      - web-2.example.com
    labels:
      traefik.http.routers.blog.rule: "Host(`blog.example.com`)"
  job:
    hosts:
      - jobs-1.example.com
    cmd: bin/jobs

registry:
  username: my-org
  password:
    - KAMAL_REGISTRY_PASSWORD

builder:
  arch: amd64
  args:
    RUBY_VERSION: 3.3.5

env:
  secret:
    - RAILS_MASTER_KEY
    - DATABASE_URL
  clear:
    RAILS_ENV: production
    RUBY_YJIT_ENABLE: "1"

accessories:
  postgres:
    image: postgres:16
    host: db-1.example.com
    env:
      secret:
        - POSTGRES_PASSWORD
    volumes:
      - /var/lib/postgresql/data:/var/lib/postgresql/data
```

```bash
bin/kamal setup                      # First deploy (provisions servers)
bin/kamal deploy                     # Subsequent deploys
bin/kamal app logs -f                # Tail logs
bin/kamal app exec -i 'bin/rails console'
bin/kamal rollback <version>         # Roll back to prior image
```

## Configuration & Credentials

```bash
# Edit encrypted credentials per env
EDITOR="code --wait" bin/rails credentials:edit --environment production

# Access
Rails.application.credentials.dig(:stripe, :secret_key)
Rails.application.credentials.database_url!   # Raises if missing
```

`config/credentials/production.key` is required on servers but NEVER committed. Pass via `KAMAL_REGISTRY_PASSWORD`-style secrets.

## Observability

```ruby
# Gemfile
gem 'lograge'
gem 'sentry-ruby'
gem 'sentry-rails'
gem 'opentelemetry-sdk'
gem 'opentelemetry-instrumentation-all'

# config/environments/production.rb
config.lograge.enabled = true
config.lograge.formatter = Lograge::Formatters::Json.new
config.lograge.custom_options = ->(event) {
  { request_id: event.payload[:request_id],
    user_id:    event.payload[:user_id],
    duration_ms: (event.duration).round(2) }
}

# config/initializers/sentry.rb
Sentry.init do |config|
  config.dsn = Rails.application.credentials.dig(:sentry, :dsn)
  config.breadcrumbs_logger = [:active_support_logger, :http_logger]
  config.traces_sample_rate = 0.1
  config.send_default_pii = false
end
```

## Common Anti-Patterns to Avoid

| Anti-pattern                            | Why                                                | Do instead                              |
| --------------------------------------- | -------------------------------------------------- | --------------------------------------- |
| `permit!` or `params.permit(params.keys)` | Mass assignment vulnerability                      | Explicit whitelist                      |
| `Post.find(params[:id])` w/o scoping    | IDOR — users access other users' data              | `current_user.posts.find(...)`          |
| Business logic in controllers           | Hard to test / reuse                               | Service objects                          |
| Large callbacks (`after_save ... 50 lines`) | Hidden coupling                                 | Service objects + `after_commit`        |
| Storing secrets in ENV unencrypted      | Leaked via logs / error reports                    | `rails credentials:edit`                |
| `protect_from_forgery with: :null_session` on all forms | Breaks CSRF for HTML forms            | `:exception` for HTML, skip for API     |
| `.all` then filter in Ruby              | Loads full table into memory                       | Filter in the DB (`where`, scopes)      |
| String interpolation in `.where`        | SQL injection                                      | Bind params                              |
| `Time.now` / `Date.today`               | Bypasses `Time.zone`                                | `Time.current` / `Date.current`         |
| Raw SQL for complex queries             | Hard to maintain, unsafe                           | Arel or ActiveRecord scopes             |

## Related References

### Rails deep dives

- [active-record.md](active-record.md) — ORM deep dive: associations, callbacks, queries, transactions, locking, encryption, multi-DB, migrations cheatsheet.
- [hotwire.md](hotwire.md) — Turbo Drive/Frames/Streams, Stimulus controllers, broadcasting via Solid Cable.
- [deployment.md](deployment.md) — Kamal 2 deploy, Solid Queue/Cache/Cable config, Puma tuning, production readiness checklist.

### Ruby skill (cross-cutting)

- [../testing.md](../testing.md) — RSpec, Minitest, FactoryBot, Capybara, VCR, SimpleCov.
- [../security.md](../security.md) — Brakeman, bundler-audit, OWASP patterns, secret management.
- [../performance.md](../performance.md) — YJIT, profiling, caching, memory.
- [../toolchain.md](../toolchain.md) — Bundler, RuboCop, Rake, dotenv.
