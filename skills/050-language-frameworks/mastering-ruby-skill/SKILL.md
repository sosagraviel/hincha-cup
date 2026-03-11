---
name: mastering-ruby-skill
description: Comprehensive Ruby expertise covering Rails, idioms, metaprogramming, testing with RSpec, and ecosystem gems
user-invokable: true
disable-model-invocation: false
---

# Mastering Ruby

Expert guidance for Ruby development with emphasis on Rails framework and Ruby idioms.

## Language Fundamentals

### Ruby Idioms and Style
```ruby
# Use symbols for hash keys
user = { name: 'Alice', email: 'alice@example.com' }

# Safe navigation operator (&.)
user&.name  # Returns nil if user is nil

# Double pipe for default values
name = user_name || 'Guest'

# Trailing conditionals for guard clauses
return unless valid?
raise ArgumentError unless name.present?

# String interpolation (preferred over concatenation)
"Hello, #{name}!"

# Array/Hash access with fetch (raises error if missing)
config.fetch(:api_key)  # Raises KeyError if missing
config.fetch(:timeout, 30)  # Returns 30 if missing

# Truthiness: only nil and false are falsy
0 if true  # Returns 0 (not falsy like in JavaScript)
```

### Blocks, Procs, and Lambdas
```ruby
# Blocks
[1, 2, 3].each do |num|
  puts num
end

# One-liner blocks
[1, 2, 3].each { |num| puts num }

# Proc (doesn't check argument count)
my_proc = Proc.new { |x| x * 2 }
my_proc.call(5)  # => 10

# Lambda (checks argument count, returns from lambda)
my_lambda = ->(x) { x * 2 }
my_lambda.call(5)  # => 10

# Block to proc
def method_taking_block(&block)
  block.call(5) if block
end

# Yield to implicit block
def greet
  yield 'Alice' if block_given?
end

greet { |name| puts "Hello, #{name}!" }
```

### Modules and Mixins
```ruby
# Module as namespace
module MyApp
  class User
  end
end

# Module as mixin
module Loggable
  def log(message)
    puts "[#{Time.now}] #{message}"
  end
end

class User
  include Loggable  # Instance methods
  extend Loggable   # Class methods

  def save
    log('Saving user')  # Instance method from include
  end
end

User.log('Class method')  # Class method from extend
```

### Metaprogramming
```ruby
# define_method
class Person
  %w[name age email].each do |attr|
    define_method(attr) { instance_variable_get("@#{attr}") }
    define_method("#{attr}=") { |val| instance_variable_set("@#{attr}", val) }
  end
end

# method_missing
class DynamicAttributes
  def method_missing(method, *args)
    if method.to_s.end_with?('=')
      instance_variable_set("@#{method.to_s.chop}", args.first)
    else
      instance_variable_get("@#{method}")
    end
  end

  def respond_to_missing?(method, include_private = false)
    true
  end
end

# Class methods vs instance methods
class User
  def self.find(id)  # Class method
    # ...
  end

  def save  # Instance method
    # ...
  end

  class << self  # Alternative class method definition
    def all
      # ...
    end
  end
end
```

## Ruby on Rails

### MVC Architecture
```ruby
# Model (app/models/user.rb)
class User < ApplicationRecord
  has_many :posts, dependent: :destroy
  belongs_to :organization

  validates :email, presence: true, uniqueness: true
  validates :name, presence: true

  before_save :downcase_email

  scope :active, -> { where(active: true) }
  scope :recent, -> { where('created_at > ?', 1.week.ago) }

  def full_name
    "#{first_name} #{last_name}"
  end

  private

  def downcase_email
    self.email = email.downcase
  end
end

# Controller (app/controllers/users_controller.rb)
class UsersController < ApplicationController
  before_action :set_user, only: [:show, :edit, :update, :destroy]
  before_action :authenticate_user!

  def index
    @users = User.active.page(params[:page])
  end

  def show
  end

  def create
    @user = User.new(user_params)

    if @user.save
      redirect_to @user, notice: 'User created successfully'
    else
      render :new, status: :unprocessable_entity
    end
  end

  def update
    if @user.update(user_params)
      redirect_to @user, notice: 'User updated successfully'
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @user.destroy
    redirect_to users_path, notice: 'User deleted'
  end

  private

  def set_user
    @user = User.find(params[:id])
  end

  def user_params
    params.require(:user).permit(:name, :email, :age)
  end
end

# View (app/views/users/index.html.erb)
<h1>Users</h1>
<%= link_to 'New User', new_user_path %>

<% @users.each do |user| %>
  <div>
    <%= link_to user.name, user_path(user) %>
    <%= user.email %>
  </div>
<% end %>

<%= paginate @users %>
```

### ActiveRecord (ORM)
```ruby
# Associations
class Author < ApplicationRecord
  has_many :books
  has_many :genres, through: :books
end

class Book < ApplicationRecord
  belongs_to :author
  has_many :reviews
  has_and_belongs_to_many :genres
end

# Validations
class User < ApplicationRecord
  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :age, numericality: { greater_than_or_equal_to: 18 }
  validates :password, length: { minimum: 8 }, if: :password_required?

  validate :custom_validation

  private

  def custom_validation
    errors.add(:base, 'Custom error') unless some_condition
  end
end

# Callbacks
class User < ApplicationRecord
  before_validation :normalize_email
  before_save :encrypt_password
  after_create :send_welcome_email
  after_destroy :cleanup_resources

  private

  def normalize_email
    self.email = email.downcase.strip
  end
end

# Scopes
class Post < ApplicationRecord
  scope :published, -> { where(published: true) }
  scope :by_author, ->(author_id) { where(author_id: author_id) }
  scope :recent, -> { where('created_at > ?', 1.month.ago).order(created_at: :desc) }

  def self.trending
    published.where('views > ?', 1000).order(views: :desc)
  end
end

# Querying
User.where(active: true).order(created_at: :desc).limit(10)
User.find_by(email: 'user@example.com')
User.where('age > ?', 18).or(User.where(verified: true))
User.includes(:posts).where(posts: { published: true })  # Eager loading

# Transactions
ActiveRecord::Base.transaction do
  user.update!(balance: user.balance - 100)
  transaction.create!(amount: 100)
end
```

### Migrations
```ruby
# Create migration: rails generate migration CreateUsers
class CreateUsers < ActiveRecord::Migration[7.0]
  def change
    create_table :users do |t|
      t.string :name, null: false
      t.string :email, null: false
      t.integer :age
      t.boolean :active, default: true

      t.timestamps
    end

    add_index :users, :email, unique: true
  end
end

# Add column: rails generate migration AddPhoneToUsers phone:string
class AddPhoneToUsers < ActiveRecord::Migration[7.0]
  def change
    add_column :users, :phone, :string
    add_index :users, :phone
  end
end

# Change column
class ChangeUserEmailType < ActiveRecord::Migration[7.0]
  def up
    change_column :users, :email, :text
  end

  def down
    change_column :users, :email, :string
  end
end

# Run migrations
rails db:migrate
rails db:rollback
rails db:migrate:status
```

### Routes
```ruby
# config/routes.rb
Rails.application.routes.draw do
  root 'home#index'

  # RESTful resources
  resources :users do
    resources :posts  # Nested resources
    member do
      post :activate  # /users/:id/activate
    end
    collection do
      get :search  # /users/search
    end
  end

  # Namespace
  namespace :api do
    namespace :v1 do
      resources :users, only: [:index, :show, :create]
    end
  end

  # Custom routes
  get '/about', to: 'pages#about'
  post '/login', to: 'sessions#create'
  delete '/logout', to: 'sessions#destroy'

  # Constraints
  get '/admin', to: 'admin#index', constraints: { subdomain: 'admin' }
end

# Generate paths
users_path  # => /users
user_path(@user)  # => /users/1
new_user_path  # => /users/new
edit_user_path(@user)  # => /users/1/edit
```

### Concerns
```ruby
# app/models/concerns/taggable.rb
module Taggable
  extend ActiveSupport::Concern

  included do
    has_many :tags, as: :taggable, dependent: :destroy
    scope :tagged_with, ->(tag_name) { joins(:tags).where(tags: { name: tag_name }) }
  end

  def tag_list
    tags.map(&:name).join(', ')
  end

  class_methods do
    def popular_tags
      Tag.where(taggable_type: name).group(:name).count
    end
  end
end

# Use in models
class Post < ApplicationRecord
  include Taggable
end
```

## Testing with RSpec

### Model Specs
```ruby
# spec/models/user_spec.rb
require 'rails_helper'

RSpec.describe User, type: :model do
  describe 'validations' do
    it { should validate_presence_of(:email) }
    it { should validate_uniqueness_of(:email) }
    it { should validate_presence_of(:name) }
  end

  describe 'associations' do
    it { should have_many(:posts).dependent(:destroy) }
    it { should belong_to(:organization) }
  end

  describe '#full_name' do
    it 'returns first and last name' do
      user = User.new(first_name: 'John', last_name: 'Doe')
      expect(user.full_name).to eq('John Doe')
    end
  end

  describe 'scopes' do
    describe '.active' do
      it 'returns only active users' do
        active_user = create(:user, active: true)
        inactive_user = create(:user, active: false)

        expect(User.active).to include(active_user)
        expect(User.active).not_to include(inactive_user)
      end
    end
  end
end
```

### Controller Specs
```ruby
# spec/controllers/users_controller_spec.rb
require 'rails_helper'

RSpec.describe UsersController, type: :controller do
  describe 'GET #index' do
    it 'returns a success response' do
      get :index
      expect(response).to be_successful
    end

    it 'assigns @users' do
      user = create(:user)
      get :index
      expect(assigns(:users)).to include(user)
    end
  end

  describe 'POST #create' do
    context 'with valid parameters' do
      it 'creates a new user' do
        expect {
          post :create, params: { user: attributes_for(:user) }
        }.to change(User, :count).by(1)
      end

      it 'redirects to the created user' do
        post :create, params: { user: attributes_for(:user) }
        expect(response).to redirect_to(User.last)
      end
    end

    context 'with invalid parameters' do
      it 'does not create a new user' do
        expect {
          post :create, params: { user: { name: '' } }
        }.not_to change(User, :count)
      end

      it 'renders new template' do
        post :create, params: { user: { name: '' } }
        expect(response).to render_template(:new)
      end
    end
  end
end
```

### Request Specs (Integration Tests)
```ruby
# spec/requests/users_spec.rb
require 'rails_helper'

RSpec.describe 'Users', type: :request do
  describe 'GET /users' do
    it 'returns all users' do
      create_list(:user, 3)

      get '/users'

      expect(response).to have_http_status(:success)
      expect(JSON.parse(response.body).size).to eq(3)
    end
  end

  describe 'POST /users' do
    it 'creates a user' do
      post '/users', params: { user: { name: 'Alice', email: 'alice@example.com' } }

      expect(response).to have_http_status(:created)
      expect(User.last.name).to eq('Alice')
    end
  end
end
```

### FactoryBot
```ruby
# spec/factories/users.rb
FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user#{n}@example.com" }
    name { 'John Doe' }
    age { 30 }
    active { true }

    trait :inactive do
      active { false }
    end

    trait :admin do
      role { 'admin' }
    end

    factory :admin_user, traits: [:admin]
  end
end

# Usage
user = create(:user)  # Create and save
user = build(:user)   # Build without saving
user = create(:user, :inactive)  # With trait
admin = create(:admin_user)  # Using factory with trait
```

## Common Gems

### Devise (Authentication)
```ruby
# Gemfile
gem 'devise'

# Install
rails generate devise:install
rails generate devise User

# Model
class User < ApplicationRecord
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable
end

# Controller protection
class PostsController < ApplicationController
  before_action :authenticate_user!
end

# View helpers
<% if user_signed_in? %>
  <%= link_to 'Sign Out', destroy_user_session_path, method: :delete %>
<% end %>
```

### Pundit (Authorization)
```ruby
# app/policies/post_policy.rb
class PostPolicy < ApplicationPolicy
  def update?
    user.admin? || record.author == user
  end

  def destroy?
    user.admin?
  end

  class Scope < Scope
    def resolve
      if user.admin?
        scope.all
      else
        scope.where(author: user)
      end
    end
  end
end

# Controller
class PostsController < ApplicationController
  def update
    @post = Post.find(params[:id])
    authorize @post
    @post.update(post_params)
  end
end
```

### Sidekiq (Background Jobs)
```ruby
# app/jobs/send_email_job.rb
class SendEmailJob < ApplicationJob
  queue_as :default

  def perform(user_id)
    user = User.find(user_id)
    UserMailer.welcome_email(user).deliver_now
  end
end

# Enqueue job
SendEmailJob.perform_later(user.id)
SendEmailJob.set(wait: 1.hour).perform_later(user.id)
```

## Build & Deployment

### Bundler
```bash
# Install dependencies
bundle install

# Update dependencies
bundle update

# Check for outdated gems
bundle outdated

# Gemfile
gem 'rails', '~> 7.0'
gem 'pg'
gem 'devise'

group :development, :test do
  gem 'rspec-rails'
  gem 'factory_bot_rails'
end

group :development do
  gem 'pry-rails'
end
```

### Rake Tasks
```bash
# Database
rake db:create
rake db:migrate
rake db:seed
rake db:reset

# Tests
rake spec
rake test

# List all tasks
rake -T
```

## Best Practices

1. **Naming**: snake_case for methods/variables, CamelCase for classes/modules
2. **Rails Conventions**: Follow Rails naming and directory structure
3. **Fat Models, Skinny Controllers**: Business logic in models, controllers coordinate
4. **Service Objects**: Extract complex logic into service classes
5. **Concerns**: Share code across models/controllers with concerns
6. **Testing**: Write specs for all models, controllers, and critical paths
7. **Background Jobs**: Use Sidekiq for long-running or asynchronous tasks
8. **Security**: Use strong parameters, protect from CSRF, XSS, SQL injection
9. **Gems**: Keep gems updated, audit for security vulnerabilities
10. **Code Style**: Use RuboCop for consistent code style
