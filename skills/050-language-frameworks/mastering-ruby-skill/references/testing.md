# Ruby Testing

Patterns and toolchain for testing Ruby applications with both RSpec and Minitest.

## Test Framework Selection

| Framework   | Strengths                                                 | Best for                                   |
| ----------- | --------------------------------------------------------- | ------------------------------------------ |
| **RSpec**   | Rich DSL, expressive matchers, wide Rails ecosystem       | Business apps, BDD-style, readable specs   |
| **Minitest** | Bundled with Ruby/Rails, fast, small surface area          | Libraries, Ruby-idiomatic assertions       |

Rails 8 defaults to Minitest; the community still widely uses RSpec for applications. Pick one per repo and stay consistent.

## RSpec Setup

```ruby
# Gemfile
group :development, :test do
  gem 'rspec-rails', '~> 7.0'
  gem 'factory_bot_rails'
  gem 'faker'
end

group :test do
  gem 'capybara'
  gem 'selenium-webdriver'
  gem 'shoulda-matchers'
  gem 'simplecov', require: false
  gem 'webmock'
  gem 'vcr'
  gem 'timecop'
  gem 'database_cleaner-active_record'
end
```

```bash
bundle install
bin/rails generate rspec:install    # Creates .rspec, spec/spec_helper.rb, spec/rails_helper.rb
```

### .rspec configuration

```
--require spec_helper
--format documentation
--color
--order random
```

### spec_helper.rb essentials

```ruby
# frozen_string_literal: true
require 'simplecov'
SimpleCov.start 'rails' do
  enable_coverage :branch
  minimum_coverage line: 80, branch: 75
  add_filter %w[/spec/ /config/ /db/migrate/]
end

RSpec.configure do |config|
  config.expect_with :rspec do |expectations|
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
  end

  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true   # Catch typos in stubs
  end

  config.shared_context_metadata_behavior = :apply_to_host_groups
  config.filter_run_when_matching :focus
  config.example_status_persistence_file_path = 'spec/examples.txt'
  config.disable_monkey_patching!
  config.warnings = true
  config.profile_examples = 10
  config.order = :random
  Kernel.srand(config.seed)
end
```

### Shoulda Matchers (RSpec only)

```ruby
# spec/rails_helper.rb
Shoulda::Matchers.configure do |config|
  config.integrate do |with|
    with.test_framework :rspec
    with.library :rails
  end
end
```

## Model / Unit Specs

```ruby
# spec/models/user_spec.rb
require 'rails_helper'

RSpec.describe User, type: :model do
  subject(:user) { build(:user) }

  describe 'validations' do
    it { is_expected.to validate_presence_of(:email) }
    it { is_expected.to validate_uniqueness_of(:email).case_insensitive }
    it { is_expected.to allow_value('a@b.com').for(:email) }
    it { is_expected.not_to allow_value('invalid').for(:email) }
  end

  describe 'associations' do
    it { is_expected.to have_many(:posts).dependent(:destroy) }
    it { is_expected.to belong_to(:organization).optional }
  end

  describe '#full_name' do
    subject { user.full_name }

    context 'when both names present' do
      let(:user) { build(:user, first_name: 'Ada', last_name: 'Lovelace') }
      it { is_expected.to eq('Ada Lovelace') }
    end

    context 'when only first name present' do
      let(:user) { build(:user, first_name: 'Ada', last_name: nil) }
      it { is_expected.to eq('Ada') }
    end
  end

  describe '.active' do
    let!(:active)   { create(:user, active: true) }
    let!(:inactive) { create(:user, active: false) }

    it 'returns only active users' do
      expect(User.active).to contain_exactly(active)
    end
  end
end
```

## Request Specs (Integration — Preferred)

```ruby
# spec/requests/api/users_spec.rb
require 'rails_helper'

RSpec.describe 'API V1 Users', type: :request do
  let(:headers) { { 'Accept' => 'application/json', 'Authorization' => "Bearer #{token}" } }
  let(:token)   { login_as(create(:user, :admin)) }

  describe 'GET /api/v1/users' do
    before { create_list(:user, 3) }

    it 'returns paginated users' do
      get '/api/v1/users', headers: headers, params: { page: 1 }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body['users'].size).to eq(3)
      expect(response.headers['Total-Count']).to eq('3')
    end
  end

  describe 'POST /api/v1/users' do
    context 'with valid params' do
      let(:params) { { user: attributes_for(:user) } }

      it 'creates user' do
        expect { post '/api/v1/users', params:, headers: }
          .to change(User, :count).by(1)

        expect(response).to have_http_status(:created)
      end
    end

    context 'with invalid params' do
      let(:params) { { user: { email: 'bad' } } }

      it 'returns validation errors' do
        post '/api/v1/users', params:, headers:
        expect(response).to have_http_status(:unprocessable_entity)
        expect(response.parsed_body['errors']).to include('email')
      end
    end
  end
end
```

## System Specs (Browser E2E with Capybara)

```ruby
# spec/system/sign_in_spec.rb
require 'rails_helper'

RSpec.describe 'Sign in', type: :system do
  before { driven_by(:selenium_chrome_headless) }

  let(:user) { create(:user, password: 'secret12') }

  it 'signs in with valid credentials' do
    visit new_user_session_path

    fill_in 'Email',    with: user.email
    fill_in 'Password', with: 'secret12'
    click_button 'Sign in'

    expect(page).to have_content('Signed in successfully')
    expect(page).to have_current_path(root_path)
  end
end
```

## FactoryBot

```ruby
# spec/factories/users.rb
FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    first_name { Faker::Name.first_name }
    last_name  { Faker::Name.last_name }
    password   { 'password123' }
    active     { true }

    trait :admin do
      role { 'admin' }
    end

    trait :with_posts do
      transient do
        post_count { 3 }
      end

      after(:create) do |user, evaluator|
        create_list(:post, evaluator.post_count, author: user)
      end
    end

    factory :admin_user, traits: [:admin]
  end
end

# Usage
build(:user)                           # Build in memory (no DB)
build_stubbed(:user)                   # Faster — fake IDs, callbacks skipped
create(:user)                          # Persist
create(:user, :admin)                  # With trait
create(:user, :with_posts, post_count: 5)
create_list(:user, 10)                 # Multiple
attributes_for(:user)                  # Hash of attributes (no DB)
```

**Avoid factory bloat**: prefer `build_stubbed` over `create` when you don't need persistence. A 10× speedup on large suites.

## Shared Examples and Contexts

```ruby
# spec/support/shared_examples/authenticatable.rb
RSpec.shared_examples 'authenticatable resource' do
  context 'when unauthenticated' do
    it 'returns 401' do
      subject
      expect(response).to have_http_status(:unauthorized)
    end
  end
end

# Usage
RSpec.describe 'GET /api/v1/posts', type: :request do
  subject { get '/api/v1/posts' }
  it_behaves_like 'authenticatable resource'
end
```

## Mocking and Stubbing

```ruby
# Verify partial doubles is critical — catches typos
# spec_helper.rb must have: mocks.verify_partial_doubles = true

# Stub return value
allow(UserMailer).to receive(:welcome).and_return(double(deliver_later: true))

# Expectation (message MUST be received)
expect(PaymentGateway).to receive(:charge).with(100).and_return(success)

# Class method stub
allow(Time).to receive(:now).and_return(Time.utc(2026, 1, 1))

# Prefer DI where practical
service.call(gateway: double(charge: true))
```

**Don't mock what you don't own.** If you're stubbing `Net::HTTP` or `Stripe`, wrap those in an adapter you control and mock the adapter.

## HTTP Mocking: WebMock + VCR

> **Scope:** this section is about **test-time** HTTP control — recording cassettes, stubbing third-party APIs, blocking accidental network calls in CI. For **runtime** HTTP safety (validating outbound URLs to prevent SSRF attacks), see [security.md § A10 — SSRF](security.md#a10--server-side-request-forgery-ssrf).

```ruby
# spec/rails_helper.rb
require 'webmock/rspec'
WebMock.disable_net_connect!(allow_localhost: true)

require 'vcr'
VCR.configure do |c|
  c.cassette_library_dir = 'spec/fixtures/vcr_cassettes'
  c.hook_into :webmock
  c.filter_sensitive_data('<API_KEY>') { ENV['API_KEY'] }
  c.configure_rspec_metadata!
end

# Record once, replay forever
RSpec.describe GithubClient do
  it 'fetches user', vcr: 'github/user_octocat' do
    expect(described_class.new.user('octocat').name).to eq('The Octocat')
  end
end
```

## Time Freezing

```ruby
# ActiveSupport::Testing::TimeHelpers (bundled with Rails)
RSpec.describe Subscription do
  include ActiveSupport::Testing::TimeHelpers

  around { |ex| travel_to(Time.utc(2026, 1, 1)) { ex.run } }

  it 'expires after 30 days' do
    subscription = create(:subscription)
    travel 31.days
    expect(subscription.reload).to be_expired
  end
end
```

Prefer `travel_to` over `Timecop` in Rails projects.

## Minitest Equivalent

```ruby
# test/models/user_test.rb
require 'test_helper'

class UserTest < ActiveSupport::TestCase
  setup do
    @user = users(:alice)  # fixture
  end

  test 'full_name combines first and last' do
    @user.first_name = 'Ada'
    @user.last_name  = 'Lovelace'
    assert_equal 'Ada Lovelace', @user.full_name
  end

  test 'requires email' do
    @user.email = nil
    assert_not @user.valid?
    assert_includes @user.errors[:email], "can't be blank"
  end
end

# Running
bin/rails test                    # All
bin/rails test test/models        # Directory
bin/rails test -n test_full_name  # By name
```

## Coverage with SimpleCov

```ruby
# spec/spec_helper.rb (must be first require)
require 'simplecov'
SimpleCov.start 'rails' do
  enable_coverage :branch
  primary_coverage :branch
  minimum_coverage line: 80, branch: 75
  add_filter %w[/spec/ /config/ /db/migrate/ /vendor/]
  add_group 'Models',      'app/models'
  add_group 'Controllers', 'app/controllers'
  add_group 'Services',    'app/services'
end
```

Generates `coverage/index.html` and `coverage/.last_run.json` (the latter is what CI consumes).

## Test Organization

```
spec/
├── models/              # Unit tests for models
├── services/            # Unit tests for service objects
├── requests/            # Integration tests (preferred over controllers/)
├── system/              # Browser E2E with Capybara
├── jobs/                # Background jobs
├── mailers/             # ActionMailer
├── support/             # shared_examples, helpers, matchers
├── factories/           # FactoryBot definitions
├── fixtures/            # VCR cassettes, file uploads
├── rails_helper.rb
└── spec_helper.rb
```

## CI-Ready Commands

```bash
# Parallel test execution (requires parallel_tests gem)
bundle exec parallel_rspec spec/

# Fail on any warnings/deprecations
RUBYOPT="-W:deprecated" bundle exec rspec

# Profiling the slowest specs
bundle exec rspec --profile 20

# Single focused run
bundle exec rspec --tag focus --fail-fast
```

## Best Practices Summary

1. **Fast tests first**: unit > request > system. Don't reach for browsers when a model spec suffices.
2. **Build over create**: only hit the database when the test requires persistence.
3. **One expectation per `it`** — easier to diagnose failures.
4. **No `should`/`it "returns X"`** vibes — write behavior: `it 'transfers funds when balance sufficient'`.
5. **Prefer request specs** over controller specs (Rails 5+ treats controller specs as legacy).
6. **Avoid `let!` unless necessary** — it runs for every example in the group.
7. **Isolate slow specs** with `:slow` tags so CI can shard them.
8. **Never test private methods** — test the public API that exercises them.
