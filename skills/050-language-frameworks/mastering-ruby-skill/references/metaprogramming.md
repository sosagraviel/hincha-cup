# Ruby Metaprogramming

Techniques for programs that generate or modify code at runtime. Powerful — and easy to misuse. The rule of thumb: **metaprogram only when the payoff is substantial and no simpler design suffices.**

## Reflection Basics

```ruby
"hello".class                    # String
String.ancestors                 # [String, Comparable, Object, ...]
user.methods - Object.methods    # Methods defined on User
user.public_methods(false)       # Only methods defined directly on user

user.respond_to?(:email)
user.method(:save).source_location   # ["app/models/user.rb", 42]
user.method(:save).parameters        # [[:key, :validate], ...]

# Constants
MyApp.constants
MyApp.const_get(:Config)
MyApp.const_defined?(:Config)
```

## define_method — Runtime Method Generation

```ruby
# Generate attribute accessors programmatically (what attr_accessor does under the hood)
class Config
  %i[host port database].each do |key|
    define_method(key)            { @settings[key] }
    define_method("#{key}=")      { |val| @settings[key] = val }
  end

  def initialize(settings = {})
    @settings = settings
  end
end

# Preferred over `class_eval "def #{name}; ..."` because it preserves closures
# and avoids string-eval injection risks.
```

## method_missing + respond_to_missing? — Always Pair Them

```ruby
class SoftObject
  def initialize
    @data = {}
  end

  def method_missing(name, *args, **kwargs)
    return @data[name] if @data.key?(name)

    if name.to_s.end_with?('=') && args.size == 1
      @data[name.to_s.chomp('=').to_sym] = args.first
    else
      super  # Important — preserve default "no method" behavior
    end
  end

  def respond_to_missing?(name, include_private = false)
    @data.key?(name) || name.to_s.end_with?('=') || super
  end
end
```

Always override `respond_to_missing?` alongside `method_missing` so `respond_to?` and `method(:name)` work correctly.

## Class Macros (DSL Pattern)

```ruby
class Validator
  class << self
    def validates(field, presence: false, format: nil)
      @validations ||= []
      @validations << { field:, presence:, format: }
    end

    def validations
      @validations ||= []
    end
  end

  def valid?(record)
    self.class.validations.all? { |v| check(record, v) }
  end

  private

  def check(record, rules)
    value = record[rules[:field]]
    return false if rules[:presence] && value.to_s.strip.empty?
    return false if rules[:format] && value !~ rules[:format]
    true
  end
end

class UserValidator < Validator
  validates :email, presence: true, format: URI::MailTo::EMAIL_REGEXP
  validates :name,  presence: true
end
```

This is the same pattern Rails uses (`has_many`, `validates`, `before_action`). Macros are defined at class level and stored in class-ivars or inheritable settings.

## Modules, `include`, `extend`, `prepend`

```ruby
module Loggable
  def log(msg) = puts("[#{self.class}] #{msg}")
end

class User
  include Loggable   # Adds Loggable as instance methods (between User and superclass)
  extend  Loggable   # Adds Loggable as class-level methods
end

User.new.log("hi")   # include → instance method
User.log("hi")       # extend  → class method

# prepend inserts the module BEFORE the class in the ancestor chain.
# This is the modern idiomatic replacement for alias_method_chain.
module Audited
  def save(...)
    log_change
    super   # Calls original User#save
  end
end

class User
  prepend Audited
end
```

Ancestor resolution: `prepend` > class > `include` > superclass. Use `prepend` when you need to wrap/intercept existing methods.

## Refinements — Scoped Monkey-Patching

When you must patch core classes but want to limit the blast radius:

```ruby
module StringExtensions
  refine String do
    def palindrome? = self == reverse
  end
end

class Validator
  using StringExtensions
  def validate(s) = s.palindrome?
end

"racecar".palindrome?   # NoMethodError — only active inside Validator
```

Use refinements instead of global monkey-patches to avoid leaking behavior into unrelated parts of the codebase.

## Hooks / Callbacks

```ruby
module Trackable
  def self.included(base)
    base.extend(ClassMethods)
    base.class_eval { @registry = [] }
  end

  module ClassMethods
    attr_reader :registry

    def register(item)
      @registry << item
    end
  end
end

class Plugin
  include Trackable
end

Plugin.register(:foo)
Plugin.registry  # [:foo]
```

Other useful hooks:
- `Class#inherited(subclass)` — called when a subclass is defined
- `Module#included(base)` — called when the module is included
- `Module#extended(base)` — called on `extend`
- `Object#method_added(name)` — when a method is defined
- `Object#singleton_method_added(name)` — for singleton methods

## `send` vs `public_send`

```ruby
# public_send respects visibility — safer with user input
user.public_send(:name)            # OK — name is public
user.public_send(:destroy_all!)    # NoMethodError if private

# send ignores visibility — use only with trusted method names
user.send(:private_helper)

# NEVER do this with untrusted input
user.send(params[:action])         # RCE — attacker calls arbitrary methods

# Safe alternative: whitelist
ALLOWED = %w[name email].freeze
user.public_send(params[:field]) if ALLOWED.include?(params[:field])
```

## instance_eval and class_eval

```ruby
class Config
  def self.configure(&block)
    new.tap { |c| c.instance_eval(&block) }
  end

  attr_accessor :api_key, :timeout
end

Config.configure do
  self.api_key = ENV.fetch('API_KEY')
  self.timeout = 30
end

# class_eval: evaluates in class context (defines methods on the class)
User.class_eval do
  def full_name = "#{first_name} #{last_name}"
end
```

`instance_eval` changes `self`. `class_eval` evaluates inside the class body. Both are powerful but opaque — prefer `define_method` and regular class reopening when possible.

## When Metaprogramming Is Justified

The right test isn't "does this work?" — it's "would 5 explicit methods be clearer?" Most metaprogramming dies in code review for failing this question.

| Use case                                    | Justified when…                                                      | Don't reach for it when…                              |
| ------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| **DSLs** (validations, routes, ActiveAdmin) | The DSL has 5+ users, gives a readable surface, isolates one concern | Writing a one-off in your own app                     |
| **`Forwardable` delegators**                | 3+ delegated methods, target object never changes                    | 1–2 delegators — write them by hand                   |
| **Dynamic attribute readers**               | Attribute set is data-driven (DB columns, schema-derived)            | The set is known at write time — use `attr_accessor`  |
| **Test doubles** (RSpec, minitest mocks)    | A test framework that already provides them                          | Production code — use dependency injection            |
| **`method_missing` for proxies**            | You're wrapping an opaque protocol you can't enumerate               | You forgot `respond_to_missing?` (you always need it) |

## Gotchas

### Performance: `method_missing` is 10–100× slower than direct dispatch

```ruby
require 'benchmark/ips'

class Direct
  def call = 42
end

class Dynamic
  def method_missing(name, *) = name == :call ? 42 : super
  def respond_to_missing?(name, _ = false) = name == :call || super
end

Benchmark.ips do |x|
  x.report('direct')          { Direct.new.call }
  x.report('method_missing')  { Dynamic.new.call }
  x.compare!
end
# direct:         ~80M i/s
# method_missing: ~2M i/s   (≈40× slower on Ruby 3.3 + YJIT)
```

If a proxy lives in a hot path (per-request, per-record), promote dispatched methods to real methods on first hit:

```ruby
def method_missing(name, *args, &block)
  if @target.respond_to?(name)
    self.class.define_method(name) { |*a, &b| @target.public_send(name, *a, &b) }
    public_send(name, *args, &block)
  else
    super
  end
end
```

After the first call, subsequent invocations dispatch directly — performance is ~equivalent to writing the methods by hand.

### `respond_to_missing?` is not optional

If you implement `method_missing`, you **must** implement `respond_to_missing?` to match. Without it, `respond_to?(:foo)` returns false even though `obj.foo` works, breaking polymorphism, RSpec doubles, `method(:foo)` lookups, and `Enumerable#map(&:foo)` patterns.

### Debugging

- Backtraces may point at `define_method` rather than the call site. Capture `__method__` + `Thread.current.backtrace_locations` for context.
- `pp self.class.instance_methods(false)` to see what was actually defined on a class.

### Tooling friction (real costs)

- **SimpleCov** under-counts dynamically defined methods. Add explicit `it { is_expected.to respond_to(:foo) }` tests so coverage reports reflect reality.
- **RBS / Sorbet / Steep** can't see metaprogrammed methods without manually written signatures. If your codebase is typed, every `define_method` becomes a typing tax.
- **RuboCop, IDE autocomplete, `grep`-based code search** all miss the methods entirely. New contributors will not find them.

### Readability tax

- A 5-line metaprogrammed DSL that saves 20 lines of boilerplate is a win; a 50-line DSL that saves 60 is a wash with worse debuggability.
- Class-level `define_method` blocks longer than ~10 lines should be extracted to a module/concern with documented public methods.
