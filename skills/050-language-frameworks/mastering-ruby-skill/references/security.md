# Ruby Security

Hardening patterns and automated scanning for Ruby/Rails applications.

## Automated Scanners

### Brakeman (Rails SAST)

Static analysis for Rails apps. Detects 33+ vulnerability classes without running the app.

```bash
gem install brakeman
bundle exec brakeman                         # Full scan
bundle exec brakeman -q                      # Quiet
bundle exec brakeman -o report.json -f json  # Machine-readable
bundle exec brakeman --no-pager --confidence-level 2   # Medium+ confidence only

# In CI — exit non-zero on findings
bundle exec brakeman -z --no-progress --format plain
```

**Tune signals**: after first scan, create `config/brakeman.ignore` by running `brakeman -I` interactively. Review ignored entries during every security audit.

### bundler-audit

Compares `Gemfile.lock` against [ruby-advisory-db](https://github.com/rubysec/ruby-advisory-db).

```bash
gem install bundler-audit
bundle-audit update                # Refresh CVE database
bundle-audit check                 # Scan Gemfile.lock
bundle-audit check --update        # Update + scan in one step
bundle-audit check --ignore CVE-2024-1234   # Accept a specific risk
```

Modern Bundler (2.3+, 2021) ships a built-in `bundle audit` command with the same behavior, so installing the standalone gem is no longer strictly required.

### RuboCop Security Cops

RuboCop includes security-focused cops (separate from style). Run them in isolation:

```bash
bundle exec rubocop --only Security
```

Key cops: `Security/Eval`, `Security/MarshalLoad`, `Security/YAMLLoad`, `Security/Open`, `Security/JSONLoad`, `Security/IoMethods`.

## OWASP Top 10 for Ruby/Rails

### A01 — Broken Access Control

```ruby
# Bad: trusting params for authorization
def update
  @post = Post.find(params[:id])
  @post.update(post_params)
end

# Good: scope queries to current_user + explicit authorization
class PostsController < ApplicationController
  before_action :authenticate_user!

  def update
    @post = current_user.posts.find(params[:id])   # Scoped access
    authorize @post                                # Pundit policy
    @post.update(post_params)
  end
end

# Pundit policy (app/policies/post_policy.rb)
class PostPolicy < ApplicationPolicy
  def update? = user.admin? || record.author_id == user.id
end
```

Rules:
- Scope ActiveRecord queries through `current_user.association` whenever possible.
- Use Pundit or CanCanCan for authorization; never infer permissions from URL parameters.
- Call `authorize` in every controller action (`after_action :verify_authorized` in `ApplicationController` enforces this).

### A02 — Cryptographic Failures

```ruby
# Use Active Record encryption (Rails 7+) for sensitive columns
class User < ApplicationRecord
  encrypts :ssn, deterministic: false        # At-rest encryption
  encrypts :email, deterministic: true       # Allows querying (less secure)
end

# Passwords: never roll your own — use has_secure_password (BCrypt)
class User < ApplicationRecord
  has_secure_password
end

# Secrets: ActiveSupport::MessageEncryptor / Rails.application.credentials
Rails.application.credentials.stripe[:secret_key]

# Never use MD5/SHA1 for anything security-related
# Don't: Digest::MD5.hexdigest(password)
# Do:    BCrypt::Password.create(password)  # or Argon2
```

### A03 — Injection

```ruby
# SQL injection — most common in Ruby apps
# BAD — string interpolation
User.where("email = '#{params[:email]}'")      # VULNERABLE

# GOOD — parameterized
User.where(email: params[:email])              # Bind param
User.where('email = ?', params[:email])        # Positional
User.where('email = :email', email: params[:email])   # Named

# Also avoid raw SQL built from params
User.find_by_sql(["SELECT * FROM users WHERE id = ?", params[:id]])  # Safe
User.find_by_sql("SELECT * FROM users WHERE id = #{params[:id]}")     # VULNERABLE

# Command injection
# BAD
system("convert #{params[:input_file]} output.pdf")   # Shell metacharacters!

# GOOD — use array form (no shell)
system('convert', params[:input_file], 'output.pdf')
# Or Open3
require 'open3'
stdout, stderr, status = Open3.capture3('convert', params[:input_file], 'output.pdf')
```

### A04 — Insecure Design

- **Strong parameters** — never pass `params` directly to `update`/`create`:

  ```ruby
  def user_params
    params.require(:user).permit(:name, :email)  # Explicit whitelist
  end
  ```

- **Mass-assignment protection** — Rails enforces this via strong params; Brakeman flags violations.

### A05 — Security Misconfiguration

```ruby
# config/environments/production.rb
config.force_ssl = true                         # HSTS + redirect HTTP → HTTPS
config.session_store :cookie_store,
                     key: '_app_session',
                     secure: true,
                     httponly: true,
                     same_site: :lax

# config/application.rb — security headers (Rails 7.1+ has secure_headers defaults)
config.action_dispatch.default_headers.merge!(
  'X-Frame-Options'         => 'DENY',
  'X-Content-Type-Options'  => 'nosniff',
  'Referrer-Policy'         => 'strict-origin-when-cross-origin',
  'Permissions-Policy'      => 'geolocation=(), microphone=(), camera=()'
)

# CSP via secure_headers gem or content_security_policy DSL
Rails.application.config.content_security_policy do |policy|
  policy.default_src :self, :https
  policy.script_src  :self
  policy.style_src   :self
  policy.img_src     :self, :data
end
```

### A06 — Vulnerable and Outdated Components

- Run `bundle-audit check --update` in CI (fail pipeline on findings).
- Subscribe to Rails security announcements: https://groups.google.com/g/rubyonrails-security
- Use `bundle outdated` monthly; prefer `bundle update --conservative` for patch/minor bumps.
- Pin Ruby patch version in `.ruby-version` — patch releases routinely contain security fixes.

### A07 — Identification and Authentication Failures

```ruby
# Use Devise for authentication (battle-tested)
# Gemfile
gem 'devise'

# User model
class User < ApplicationRecord
  devise :database_authenticatable,
         :registerable,
         :recoverable,
         :rememberable,
         :validatable,
         :lockable,                            # Lock after N failed attempts
         :timeoutable                          # Auto-sign-out after inactivity
end

# config/initializers/devise.rb
config.password_length = 12..128              # Enforce strong passwords
config.maximum_attempts = 5
config.lock_strategy = :failed_attempts
config.unlock_strategy = :time
config.unlock_in = 1.hour
config.timeout_in = 30.minutes

# Rate-limiting: rack-attack
# config/initializers/rack_attack.rb
Rack::Attack.throttle('logins/ip', limit: 5, period: 60.seconds) do |req|
  req.ip if req.path == '/users/sign_in' && req.post?
end
```

### A08 — Software and Data Integrity Failures

```ruby
# Marshal.load is unsafe with untrusted data — leads to RCE
# BAD
Marshal.load(params[:data])                   # RCE

# YAML.load was unsafe pre-Ruby 3.1 (now safe_load by default)
YAML.safe_load(yaml_string,
               permitted_classes: [Symbol, Date, Time],
               aliases: false)

# Use MessagePack or JSON for cross-process serialization
```

### A09 — Security Logging and Monitoring Failures

```ruby
# Filter sensitive params from logs
# config/initializers/filter_parameter_logging.rb
Rails.application.config.filter_parameters += %i[
  password password_confirmation secret token api_key ssn credit_card cvv
]

# Structured logs (lograge)
# Gemfile
gem 'lograge'

# config/environments/production.rb
config.lograge.enabled = true
config.lograge.formatter = Lograge::Formatters::Json.new
config.lograge.custom_options = lambda do |event|
  { request_id: event.payload[:request_id],
    user_id:    event.payload[:user_id] }
end
```

Send logs to centralized ingestion (Datadog, CloudWatch, Grafana Loki) and alert on auth failures, 5xx spikes, and Brakeman warnings in prod deploys.

### A10 — Server-Side Request Forgery (SSRF)

> **Scope:** this section is about **runtime** outbound HTTP — validating URLs that your code is about to fetch so attackers can't pivot the server into your private network. For **test-time** HTTP stubbing and recording (WebMock, VCR), see [testing.md § HTTP Mocking](testing.md#http-mocking-webmock--vcr).

```ruby
# BAD — attacker controls the URL
uri = URI(params[:callback_url])
Net::HTTP.get(uri)

# GOOD — validate host allowlist, resolve IP, block private ranges
require 'resolv'

ALLOWED_HOSTS = %w[api.partner.com webhooks.trusted.com].freeze

def safe_http_get(url)
  uri = URI.parse(url)
  raise 'bad scheme' unless %w[http https].include?(uri.scheme)
  raise 'bad host'   unless ALLOWED_HOSTS.include?(uri.host)

  ip = Resolv.getaddress(uri.host)
  raise 'private IP' if IPAddr.new(ip).private? || IPAddr.new(ip).loopback?

  Net::HTTP.get(uri)
end
```

## CSRF Protection

Rails enables CSRF tokens by default for non-GET requests:

```ruby
# app/controllers/application_controller.rb
class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
end
```

For JSON APIs (no session cookies), skip CSRF but require a bearer token.

## Secret Management

```bash
# Rails encrypted credentials (preferred)
EDITOR="code --wait" bin/rails credentials:edit --environment production
# Produces config/credentials/production.yml.enc + production.key

# Access
Rails.application.credentials.dig(:aws, :access_key_id)

# NEVER commit:
# - config/master.key
# - config/credentials/*.key
# (Already in default .gitignore — keep it that way)

# For multi-env: use Rails 6+ multi-env credentials or a secret manager
# (AWS Secrets Manager, HashiCorp Vault, Doppler)
```

## File Uploads

```ruby
# Active Storage — validate content type and size
class Post < ApplicationRecord
  has_one_attached :cover_image

  validates :cover_image, content_type: %w[image/png image/jpeg],
                          size: { less_than: 5.megabytes }
end

# Never trust the client-supplied filename
# Active Storage auto-generates keys; if you must use the original name, sanitize:
require 'action_controller/metal/strong_parameters'
safe_name = ActionController::Parameters.new(name: params[:filename])
                                         .permit(:name)[:name]
                                         .gsub(/[^\w.-]/, '_')
```

## Regex Denial of Service (ReDoS)

```ruby
# Catastrophic backtracking — AVOID patterns like:
/^(a+)+$/.match?(input)    # Exponential on input "aaaa...!"

# Use Timeout::timeout for user-supplied regexes
Timeout.timeout(1) { input.match?(user_regex) }

# Or use the Regexp::timeout feature (Ruby 3.2+)
Regexp.timeout = 1.0
```

## Checklist: Rails App Security Baseline

```
- [ ] force_ssl = true in production
- [ ] Strong parameters on every controller action
- [ ] CSP / X-Frame-Options / HSTS configured
- [ ] Devise lockable + timeoutable + password_length enforced
- [ ] rack-attack rate limiting on auth + signup endpoints
- [ ] filter_parameters blocks password/token/ssn in logs
- [ ] Encrypted credentials — no secrets in ENV / app code
- [ ] Active Record encryption on PII columns
- [ ] Brakeman in CI — zero high-confidence warnings
- [ ] bundler-audit in CI — zero unpatched CVEs
- [ ] Active Storage validates content type + size
- [ ] CSRF protection enabled (or JWT if API-only)
- [ ] Database backups encrypted + tested for restore
```

## References

- [Rails Security Guide](https://guides.rubyonrails.org/security.html)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Brakeman Wiki](https://github.com/presidentbeef/brakeman/wiki)
- [ruby-advisory-db](https://github.com/rubysec/ruby-advisory-db)
- [Rails Security Announcements](https://groups.google.com/g/rubyonrails-security)
