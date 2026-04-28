# Ruby Language Foundations

Core language features targeting Ruby 3.3+.

## Versioning & Runtime

```bash
# .ruby-version (consumed by rbenv, asdf, mise, chruby)
3.3.5

# Gemfile
ruby "3.3.5"

# YJIT (Just-In-Time compiler, production-ready in 3.3)
RUBY_YJIT_ENABLE=1 bundle exec rails server
# or:
ruby --yjit script.rb
```

## Frozen String Literals (Required)

```ruby
# frozen_string_literal: true

# All string literals are immutable — dup if mutation needed
name = "Alice"
# name << "!"   # FrozenError
mutable = name.dup
mutable << "!"  # OK
```

RuboCop's `Style/FrozenStringLiteralComment` enforces this on every file.

## Data Types and Literal Syntax

```ruby
# Numbers
age    = 30              # Integer
price  = 19.99           # Float
money  = BigDecimal("19.99")  # For currency (require 'bigdecimal')
ratio  = Rational(1, 3)  # Rational

# Strings (prefer single quotes when no interpolation)
greet  = 'hello'
hello  = "Hello, #{name}"
multi  = <<~HEREDOC
  Multi-line string
  with squiggly heredoc (indentation stripped)
HEREDOC

# Symbols (immutable, interned — ideal for identifiers)
status = :pending
:"dynamic symbol #{id}"  # Avoid unless necessary

# Arrays and Hashes
tags     = %w[ruby rails ops]                     # Array of strings
symbols  = %i[get post put delete]                # Array of symbols
config   = { host: 'localhost', port: 5432 }      # Shorthand hash
deep     = { api: { v1: { users: [] } } }

# Ranges
1..10     # Inclusive
1...10    # Exclusive
('a'..'z').to_a
```

## Pattern Matching (Ruby 3.0+)

```ruby
# Case/in pattern matching
case response
in { status: 200, body: { users: [*users] } }
  puts "Got #{users.size} users"
in { status: 404 }
  raise NotFound
in { status: 500..599 => code }
  raise ServerError, "HTTP #{code}"
end

# Array patterns with deconstruction
case point
in [x, y]           then "2D"
in [x, y, z]        then "3D"
in [_, _, *]        then "N-D"
end

# Find pattern (Ruby 3.0+)
case users
in [*, { admin: true, name: }, *]
  "Admin: #{name}"
end

# Destructuring with classes (define deconstruct / deconstruct_keys)
class Point
  attr_reader :x, :y

  def initialize(x:, y:)
    @x, @y = x, y
  end

  def deconstruct        = [x, y]
  def deconstruct_keys(_) = { x:, y: }
end

case Point.new(x: 1, y: 2)
in { x:, y: }  then "x=#{x} y=#{y}"
end
```

## Endless Methods & Shorthand Syntax (3.0+)

```ruby
# Endless method definition
def square(x) = x * x
def greet(name:) = "Hello, #{name}!"

# Hash shorthand (Ruby 3.1+): { x:, y: } expands to { x: x, y: y }
x, y = 1, 2
point = { x:, y: }

# One-line method with pattern
def admin?(user) = user.role == :admin
```

## Data.define (Ruby 3.2+) — immutable value objects

```ruby
Point = Data.define(:x, :y)
p1 = Point.new(x: 1, y: 2)
p1.x  # => 1
p1 == Point.new(x: 1, y: 2)  # => true (value equality)

# Inherits ==, hash, eql? — ideal for DTOs, coordinates, money amounts
Money = Data.define(:amount, :currency) do
  def to_s = "#{currency} #{amount}"
end
```

Prefer `Data.define` over `Struct` when immutability is desired.

## Blocks, Procs, and Lambdas

```ruby
# Blocks (most common — passed implicitly to methods)
[1, 2, 3].each { |n| puts n }
[1, 2, 3].map   { |n| n * 2 }

# yield implicit-block invocation
def with_logging
  start = Time.now
  result = yield
  puts "took #{Time.now - start}s"
  result
end

with_logging { expensive_work }

# Explicit block capture (&block)
def memoize(&block)
  @cache ||= block.call
end

# Proc vs Lambda
regular_proc = Proc.new { |x, y| x + y }
regular_proc.call(1)           # Works (missing args become nil)
regular_proc.call(1, 2, 3)     # Works (extras ignored)

strict_lambda = ->(x, y) { x + y }
strict_lambda.call(1)          # ArgumentError — strict arity
strict_lambda.call(1, 2)       # OK
strict_lambda.(1, 2)           # Shorthand
strict_lambda[1, 2]            # Also valid

# Return semantics differ:
# - return in a proc: returns from enclosing method
# - return in a lambda: returns from the lambda itself
```

## Enumerable — The Ruby Workhorse

```ruby
# Lazy evaluation (critical for large collections)
(1..Float::INFINITY).lazy.select(&:even?).first(10)
# => [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]

# Common operations
[1, 2, 3, 4].map { _1 * 2 }              # [2, 4, 6, 8] — numbered params
[1, 2, 3, 4].reduce(:+)                  # 10
[1, 2, 3, 4].each_slice(2).to_a          # [[1, 2], [3, 4]]
[1, 2, 3, 4].each_cons(2).to_a           # [[1, 2], [2, 3], [3, 4]]
[1, 2, 3, 4].partition(&:even?)          # [[2, 4], [1, 3]]
[1, 2, 3, 4].group_by { _1.odd? }        # {true=>[1,3], false=>[2,4]}
[1, 2, 3, 4].tally                       # {1=>1, 2=>1, 3=>1, 4=>1}

# Chaining for readability
users
  .filter_map { |u| u.email if u.active? }
  .uniq
  .sort

# Reject `then`/`yield_self` for cleaner pipelines
result = raw_data.then { parse(_1) }.then { validate(_1) }
```

## Comparable and Equality

```ruby
class Version
  include Comparable
  attr_reader :parts

  def initialize(str)
    @parts = str.split('.').map(&:to_i)
  end

  def <=>(other)            # Single operator unlocks <, <=, >, >=, between?
    parts <=> other.parts
  end
end

Version.new('1.2.0') < Version.new('1.10.0')  # true

# Equality trio
# ==   Value equality (user-facing)
# eql? Strict: same value AND same type (Hash lookup)
# equal? Object identity (never override)
```

## Error Handling

```ruby
# Rescue specific exceptions
begin
  risky_operation
rescue Net::OpenTimeout => e
  retry_with_backoff
rescue StandardError => e   # NEVER rescue Exception (catches SystemExit, etc.)
  Rails.logger.error(e.full_message)
  raise CustomError.new(cause: e)
ensure
  cleanup_resources
end

# Rescue modifier (use sparingly — only for obvious fallback values)
count = Integer(input, 10) rescue 0

# Retry with attempts cap
attempts = 0
begin
  http_call
rescue HTTPError
  attempts += 1
  retry if attempts < 3
  raise
end

# Custom exception hierarchy (idiomatic)
module MyApp
  class Error < StandardError; end
  class NotFound < Error; end
  class Unauthorized < Error; end
end
```

## Keyword Arguments and Forwarding (3.0+)

```ruby
# Explicit keyword args — required in 3.0+ (no more implicit hash conversion)
def create(name:, email:, role: :user)
  User.new(name:, email:, role:)
end

# Argument forwarding (...)
def wrap(...)
  log_call
  target_method(...)
end

# Anonymous block forwarding (3.1+)
def with_block(&)
  adapter.call(&)
end

# Anonymous keyword forwarding (3.2+)
def wrap(**)
  target(**)
end
```

## Method Visibility

```ruby
class Account
  def transfer(amount)      # public (default)
    validate!(amount)
    apply(amount)
  end

  private

  def validate!(amount)
    raise InvalidAmount if amount.negative?
  end

  protected                 # Callable by same-class instances (rarely needed)

  def balance = @balance
end
```

## File and IO

```ruby
# Always use block form (auto-closes even on exception)
File.open('config.yml', 'r') do |f|
  data = YAML.safe_load(f, permitted_classes: [Symbol, Date])
end

# Reading entire file
content = File.read('README.md', encoding: 'UTF-8')
lines   = File.readlines('input.txt', chomp: true)

# Pathname — preferred over string path manipulation
require 'pathname'
root = Pathname.new(__dir__).expand_path
root.join('config', 'database.yml').read
```

## Timezone-Aware Dates

```ruby
require 'date'
require 'time'

Date.today            # Local date
Date.today.iso8601    # "2026-04-17"
Time.now.utc          # UTC Time instance

# Prefer ActiveSupport in Rails apps:
Time.current          # Respects Time.zone
1.week.ago
Date.current.beginning_of_month
```

## Common Gotchas

| Gotcha                            | Problem                                                 | Fix                                         |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `unless ... else`                 | Hard to read                                            | Use `if ... else` instead                   |
| Mutating default args `def f(x=[])` | Shared mutable default across calls                     | Build inside method: `x ||= []`             |
| `rescue Exception`                | Catches SystemExit, Interrupt — prevents Ctrl-C         | Use `rescue StandardError`                  |
| `Object#send` with user input     | Can invoke private methods or arbitrary code             | Use `public_send` + whitelist               |
| `eval(user_input)`                | RCE vulnerability                                       | Never eval untrusted input                  |
| String concatenation in loops     | O(n²) memory                                            | Use `String#<<` or array.join               |
| `each.map` chain                  | Produces Array twice                                    | Just `map` (already returns Array)          |
| `.lazy` on AR relations or finite collections | Wraps a chain in enumerator overhead without streaming benefit; in Rails, holds the relation in memory across the lazy chain | Use `find_each` for AR; reach for `.lazy` only on truly infinite or very large streams |
| Forgotten `obj.tap { puts/p/binding... }` from debugging | Silent logspam in production; not flagged by tests or default Rubocop | Enable `Lint/Debugger` cop; use `Rails.logger.debug` with explicit verbose toggle when temporary tracing is needed |
