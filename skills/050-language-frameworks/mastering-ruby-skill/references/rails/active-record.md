# ActiveRecord Deep Dive

Patterns for modeling, querying, and scaling ActiveRecord in Rails 7.1+ / 8.0+.

## Naming and Structure

```ruby
# File:          app/models/order_line_item.rb
# Class:         OrderLineItem
# Table:         order_line_items
# Foreign key:   order_line_item_id
# has_many :order_line_items
```

Rails inflector handles pluralization via `ActiveSupport::Inflector`. Register irregular cases in `config/initializers/inflections.rb`:

```ruby
ActiveSupport::Inflector.inflections(:en) do |inflect|
  inflect.irregular 'person', 'people'
  inflect.acronym   'API'                    # APIEndpoint, not ApiEndpoint
end
```

## Associations

### Common association types

```ruby
class Author < ApplicationRecord
  has_many :books, dependent: :destroy
  has_many :reviews, through: :books
  has_one  :profile, dependent: :destroy

  # Polymorphic
  has_many :comments, as: :commentable

  # Self-referential (e.g., followers)
  has_many :follows, foreign_key: :follower_id
  has_many :following, through: :follows, source: :followed
end

class Book < ApplicationRecord
  belongs_to :author, counter_cache: true    # Keeps author.books_count updated
  has_many :reviews, dependent: :destroy

  # Many-to-many via join table
  has_and_belongs_to_many :categories        # Rare — prefer has_many :through

  # Rich text (Action Text)
  has_rich_text :summary
end
```

### Counter Caches

When you frequently display `author.books.count`, a counter cache avoids COUNT queries:

```ruby
# Migration
add_column :authors, :books_count, :integer, default: 0, null: false

# Backfill for existing records
Author.find_each { |a| Author.reset_counters(a.id, :books) }

# Model
class Book < ApplicationRecord
  belongs_to :author, counter_cache: true
end

# Usage — now reads from the cached column, no query
author.books.size
```

### Optional, Inverse, and Touch

```ruby
class Review < ApplicationRecord
  belongs_to :book, touch: true              # Updates book.updated_at on save
  belongs_to :user, optional: true           # Allows nil user (default = required)
  belongs_to :parent, class_name: 'Review',
                     inverse_of: :children,  # Critical for in-memory consistency
                     optional: true
  has_many :children, class_name: 'Review', foreign_key: :parent_id, inverse_of: :parent
end
```

`inverse_of` tells ActiveRecord that two associations point at each other, so navigating `review.book.reviews` returns the same in-memory `review` object. Without it, you can get subtle bugs where assigning to one side doesn't reflect on the other until a reload.

### Dependent Options

```ruby
has_many :comments, dependent: :destroy          # Runs callbacks on each
has_many :comments, dependent: :delete_all       # Fast — single DELETE query, NO callbacks
has_many :comments, dependent: :nullify          # Sets foreign_key to NULL
has_many :comments, dependent: :restrict_with_exception  # Blocks parent deletion
```

Pick `:destroy` only when callbacks matter. `:delete_all` is orders of magnitude faster for large collections.

## Validations

### Common validations

```ruby
class User < ApplicationRecord
  validates :email, presence: true,
                    uniqueness: { case_sensitive: false, scope: :organization_id },
                    format: { with: URI::MailTo::EMAIL_REGEXP }

  validates :name,  presence: true, length: { in: 2..50 }
  validates :age,   numericality: { greater_than_or_equal_to: 18 }, allow_nil: true
  validates :role,  inclusion: { in: %w[user admin moderator] }
  validates :url,   format: { with: URI::DEFAULT_PARSER.make_regexp(%w[http https]) },
                    allow_nil: true

  # Conditional
  validates :password, length: { minimum: 12 }, if: -> { password.present? }

  # Custom validation method
  validate :birthdate_not_in_future

  # Custom validator class (reusable)
  validates :domain, email_domain: true        # see EmailDomainValidator

  private

  def birthdate_not_in_future
    return if birthdate.blank? || birthdate <= Date.current
    errors.add(:birthdate, 'cannot be in the future')
  end
end

# app/validators/email_domain_validator.rb
class EmailDomainValidator < ActiveModel::EachValidator
  def validate_each(record, attribute, value)
    return if value.blank?
    unless value.include?('@') && Resolv::DNS.open { |d| d.getresources(value.split('@').last, Resolv::DNS::Resource::IN::MX).any? }
      record.errors.add(attribute, 'has no MX record')
    end
  end
end
```

### Database-Level Constraints (Defense in Depth)

Validations alone are not enough — add DB constraints for critical invariants:

```ruby
class CreateUsers < ActiveRecord::Migration[8.0]
  def change
    create_table :users do |t|
      t.string :email, null: false
      t.integer :organization_id, null: false
      t.check_constraint 'age >= 0', name: 'age_non_negative'
      t.timestamps
    end

    add_index :users, [:email, :organization_id], unique: true
    add_foreign_key :users, :organizations, on_delete: :cascade
  end
end
```

> **Database support:** `t.check_constraint` works on PostgreSQL and MySQL 8.0.16+. SQLite ignores it silently before Rails 7.1; on older setups, enforce the invariant in the application layer or via a custom validator.

## Callbacks — Use Sparingly

Callbacks often cause subtle bugs across models. Prefer service objects for multi-step logic.

```ruby
class Order < ApplicationRecord
  # Safe: data normalization
  before_validation :normalize_totals

  # Safe: after_commit for side effects (jobs, emails)
  after_create_commit  -> { OrderConfirmationJob.perform_later(id) }
  after_update_commit  :notify_shipping, if: :saved_change_to_status?
  after_destroy_commit -> { AnalyticsService.record_cancellation(id) }

  private

  def normalize_totals
    self.total = line_items.sum(&:subtotal)
  end

  def notify_shipping
    ShipmentUpdateJob.perform_later(id) if status == 'paid'
  end
end
```

**Why `after_commit` instead of `after_save`?** Jobs enqueued in `after_save` may run before the transaction commits — the worker fetches from the DB and finds nothing.

## Scopes

```ruby
class Post < ApplicationRecord
  scope :published,  -> { where.not(published_at: nil) }
  scope :recent,     -> { order(published_at: :desc) }
  scope :for_author, ->(author) { where(author:) }
  scope :featured,   -> { where(featured: true) }

  # Default scope — use with extreme caution; propagates everywhere
  # default_scope { where(archived: false) }

  # Parameterized scope with validation
  scope :popular_since, lambda { |date|
    raise ArgumentError, 'date required' if date.nil?
    where('views > 1000 AND published_at > ?', date)
  }

  # Class method alternative (more flexible than scope when logic is complex)
  def self.trending
    published.where('views > ?', 1000).recent.limit(20)
  end
end

Post.published.recent.for_author(current_user).limit(10)
```

## Query Optimization

### N+1 Detection

```ruby
# BAD
Post.all.each { |p| puts p.author.name }     # 1 + N queries

# GOOD
Post.includes(:author).each { |p| puts p.author.name }
```

Use the `bullet` gem in development to auto-flag N+1.

### `includes` vs `preload` vs `eager_load`

```ruby
# preload — separate query per association (best when no filtering on association)
Post.preload(:comments).where(published: true)

# eager_load — single LEFT OUTER JOIN (required when filtering on association)
Post.eager_load(:comments).where(comments: { flagged: true })

# includes — Rails picks preload or eager_load automatically based on usage
Post.includes(:comments).where(comments: { flagged: true })
```

Use `preload` when you know you don't need JOIN semantics — it's clearer and often faster.

### Select Only What You Need

```ruby
# Bad: loads every column
User.all.map { |u| [u.id, u.email] }

# Good: pluck returns arrays directly
User.pluck(:id, :email)

# Good: select + minimal fields when you need a Model object
User.select(:id, :email).find_each { |u| u.email }
```

### Counter-Intuitive: `count` vs `size` vs `length`

```ruby
users.count    # Always hits DB: SELECT COUNT(*)
users.size     # Uses cached count if loaded, else COUNT
users.length   # Forces load of entire collection into memory
```

## Transactions

```ruby
ActiveRecord::Base.transaction do
  payer.lock!                              # SELECT ... FOR UPDATE
  payee.lock!
  payer.update!(balance: payer.balance - amount)
  payee.update!(balance: payee.balance + amount)
  Transfer.create!(from: payer, to: payee, amount:)
end

# Nested transactions (savepoints)
User.transaction(requires_new: true) do
  # ...
end

# Raise to rollback
raise ActiveRecord::Rollback    # Silent rollback — no exception propagates
```

## Locking Strategies

### Optimistic Locking — Best for Low-Contention Concurrent Writes

```ruby
# Add lock_version column
add_column :users, :lock_version, :integer, default: 0, null: false

# Rails auto-uses it
user = User.find(1)
user.name = "Alice"
user.save!        # If another request updated since we loaded, raises ActiveRecord::StaleObjectError
```

### Pessimistic Locking — When Optimistic Isn't Strong Enough

```ruby
Account.transaction do
  account = Account.lock.find(id)        # SELECT ... FOR UPDATE
  account.update!(balance: account.balance - 100)
end

# Advisory locks (Postgres) — without acquiring row locks
ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(#{key})")
```

## Encryption (Rails 7+)

```ruby
class User < ApplicationRecord
  encrypts :ssn                                       # Non-deterministic (secure)
  encrypts :email, deterministic: true, downcase: true # Deterministic — queryable, weaker
end

# Setup: bin/rails db:encryption:init — prints keys to add to credentials
```

Deterministic encryption allows `User.find_by(email: 'a@b.com')` but is vulnerable to ciphertext correlation. Use non-deterministic for true PII.

## Multiple Databases

```yaml
# config/database.yml
production:
  primary:
    database: app_production
    adapter: postgresql
  cache:
    database: app_cache_production
    adapter: postgresql
    migrations_paths: db/cache_migrate
```

```ruby
class CacheRecord < ApplicationRecord
  self.abstract_class = true
  connects_to database: { writing: :cache, reading: :cache }
end
```

## Bulk Operations

```ruby
# insert_all / upsert_all — bypass validations and callbacks (fast)
Post.insert_all([
  { title: 'a', author_id: 1, created_at: Time.current, updated_at: Time.current },
  { title: 'b', author_id: 1, created_at: Time.current, updated_at: Time.current }
])

Post.upsert_all([
  { id: 1, title: 'updated' }
], unique_by: :id)

# update_all — single UPDATE, no callbacks or validations
Post.where(status: 'draft').update_all(archived: true, archived_at: Time.current)

# delete_all — single DELETE, no dependent callbacks
Post.where(archived: true).delete_all

# For callbacks on bulk, use find_each in batches
Post.where(status: 'draft').find_each(batch_size: 500) do |post|
  post.update!(archived: true)
end
```

## Safe Migrations Cheatsheet

| Operation                       | Safe on prod?        | Mitigation                                         |
| ------------------------------- | -------------------- | -------------------------------------------------- |
| `add_column`, no default        | Yes                  | —                                                  |
| `add_column`, with default      | Yes (Rails 5.2+)     | Rails now does it in one step without locks        |
| `add_index`                     | Not on large tables  | `algorithm: :concurrently` + `disable_ddl_transaction!` |
| `remove_column`                 | Two-deploy dance     | Deploy code ignoring column, then migration        |
| `rename_column`                 | Two-deploy dance     | Add new, copy, switch, drop                        |
| `change_column` (type change)   | Risky                | New column + backfill + swap                       |
| `add_foreign_key`               | Not on large tables  | `validate: false`, then `validate_foreign_key`     |

Install the **strong_migrations** gem to catch these automatically.

## Debugging Slow Queries

```ruby
# In Rails console
Post.where(published: true).explain
Post.where(published: true).explain(:analyze, :verbose, :buffers)  # Rails 7.1+

# Log slow queries in production
# config/environments/production.rb
config.active_record.verbose_query_logs = true

# Use pg_stat_statements (PostgreSQL extension) to find systemic slow queries
```

## Related References

### Rails

- [overview.md](overview.md) — High-level Rails 8 walkthrough: controllers, routes, services, jobs, API mode.
- [hotwire.md](hotwire.md) — `broadcasts_to` and Turbo Streams emit AR events to subscribers.
- [deployment.md](deployment.md) — Solid Queue/Cache/Cable use AR tables; multi-DB config in production.

### Ruby skill (cross-cutting)

- [../security.md](../security.md) — SQL injection prevention, mass-assignment, parameterized queries, attribute encryption.
- [../performance.md](../performance.md) — Query profiling, N+1 detection with bullet, caching strategies.
- [../testing.md](../testing.md) — FactoryBot for model fixtures, Shoulda Matchers for AR assertions.
