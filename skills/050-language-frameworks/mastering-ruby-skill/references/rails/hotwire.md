# Hotwire — Turbo + Stimulus

Server-rendered HTML with sparse JavaScript. The default frontend in Rails 8.

## Mental Model

- **Turbo Drive** — navigation without full page reloads (SPA-like behavior, zero JS written).
- **Turbo Frames** — independent, self-updating regions. `<turbo-frame>` tags scope requests.
- **Turbo Streams** — incremental DOM updates pushed from the server (append, prepend, replace, remove, update, before, after, morph).
- **Stimulus** — small JS "controllers" for behavior, wired by data attributes.

Server code always returns HTML. Turbo interprets it.

## Turbo Frames — Scoped Navigation

```erb
<!-- app/views/posts/show.html.erb -->
<h1><%= @post.title %></h1>

<%= turbo_frame_tag "comments" do %>
  <%= render @post.comments %>
  <%= link_to "Add comment", new_post_comment_path(@post) %>
<% end %>
```

When "Add comment" is clicked, Turbo fetches the target URL and replaces only the `comments` frame with the matching `<turbo-frame id="comments">` from the response. The rest of the page stays intact.

```erb
<!-- app/views/comments/new.html.erb -->
<%= turbo_frame_tag "comments" do %>
  <%= form_with model: [@post, @comment] do |f| %>
    <%= f.text_area :body %>
    <%= f.submit "Post" %>
  <% end %>
<% end %>
```

### Lazy-Loaded Frames

```erb
<%= turbo_frame_tag "recommendations", src: recommendations_path, loading: :lazy %>
```

The frame loads when it scrolls into view. Useful for below-the-fold data.

## Turbo Streams — Push Updates

Streams are HTML fragments wrapped in `<turbo-stream action="append" target="id">`. Rails helpers build them:

```ruby
# app/controllers/comments_controller.rb
def create
  @comment = @post.comments.create!(comment_params.merge(user: current_user))

  respond_to do |format|
    format.turbo_stream  # Renders create.turbo_stream.erb
    format.html { redirect_to @post }
  end
end
```

```erb
<!-- app/views/comments/create.turbo_stream.erb -->
<%= turbo_stream.append "comments" do %>
  <%= render @comment %>
<% end %>

<%= turbo_stream.replace "new_comment_form" do %>
  <%= render "form", comment: Comment.new, post: @post %>
<% end %>
```

### Available Stream Actions

| Action      | Effect                                                       |
| ----------- | ------------------------------------------------------------ |
| `append`    | Insert inside target, at the end                             |
| `prepend`   | Insert inside target, at the start                           |
| `replace`   | Replace the target element entirely                          |
| `update`    | Replace the target's innerHTML                               |
| `remove`    | Remove the target                                            |
| `before`    | Insert before the target                                     |
| `after`     | Insert after the target                                      |
| `morph`     | Smart merge that preserves form inputs, focus, scroll (8.0+) |
| `refresh`   | Trigger page morph (Rails 8.0+)                              |

### Page Morphing (Rails 8)

```erb
<!-- layout or page header -->
<meta name="turbo-refresh-method" content="morph">
<meta name="turbo-refresh-scroll" content="preserve">
```

With morph enabled, Turbo compares the current DOM to the incoming HTML and updates only what changed — preserving form state, focus, and scroll. Combined with `turbo_stream.refresh`, this is the cleanest way to keep lists in sync after mutations.

## Broadcasting (Turbo + Action Cable)

Push updates to all viewers of a page in real time:

```ruby
class Post < ApplicationRecord
  # Broadcasts turbo_stream to "posts" channel on create/update/destroy
  broadcasts_to ->(post) { "posts" }, inserts_by: :prepend

  has_many :comments
end

class Comment < ApplicationRecord
  belongs_to :post
  broadcasts_to :post                   # Scoped to the parent post's stream
end
```

```erb
<!-- app/views/posts/index.html.erb -->
<%= turbo_stream_from "posts" %>

<div id="posts">
  <%= render @posts %>
</div>
```

Every connected browser now receives the new/updated/deleted posts automatically. Underneath: Action Cable broadcasts turbo stream HTML over a WebSocket.

### Rails 8: Solid Cable

Backs the Action Cable broadcast bus with the database instead of Redis — zero extra infrastructure:

```yaml
# config/cable.yml
production:
  adapter: solid_cable
  connects_to:
    database:
      writing: cable
  polling_interval: "0.1.seconds"
  message_retention: "1.day"
```

## Stimulus — JavaScript Sprinkles

Stimulus controllers attach behavior to HTML via data attributes. They don't manage state — the DOM is the state.

### Scaffold a controller

```bash
bin/rails generate stimulus dropdown
```

### Anatomy

```javascript
// app/javascript/controllers/dropdown_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["menu", "button"]
  static values  = { open: { type: Boolean, default: false } }
  static classes = ["open"]

  connect() {
    // Called when the controller is attached
  }

  disconnect() {
    // Called when it's detached — clean up timers, listeners
  }

  toggle(event) {
    event.preventDefault()
    this.openValue = !this.openValue
  }

  openValueChanged(current, previous) {
    this.menuTarget.classList.toggle(this.openClass, current)
    this.buttonTarget.setAttribute("aria-expanded", current)
  }

  closeOnOutside(event) {
    if (!this.element.contains(event.target)) this.openValue = false
  }
}
```

```erb
<div data-controller="dropdown"
     data-dropdown-open-class="block"
     data-action="click@window->dropdown#closeOnOutside">
  <button data-dropdown-target="button"
          data-action="click->dropdown#toggle"
          aria-expanded="false">Menu</button>

  <ul data-dropdown-target="menu" class="hidden">
    <li>…</li>
  </ul>
</div>
```

### Stimulus Conventions

- **One behavior per controller.** If it's getting big, split it.
- **Data attributes for configuration** — not class names or IDs.
- **No global state.** Pass data via `values` or `data-*` attributes.
- **Listen for Turbo events** (`turbo:load`, `turbo:frame-render`) inside `connect()` when needed, rather than `DOMContentLoaded`.

## Form Patterns

### Full-Page Form (Classic)

```erb
<%= form_with model: @post do |f| %>
  <%= f.label :title %>
  <%= f.text_field :title %>

  <div id="errors">
    <%= render 'shared/errors', resource: @post %>
  </div>

  <%= f.submit %>
<% end %>
```

### In-Frame Form — No Page Reload

Wrap the form in a turbo-frame with a unique ID. Submit replaces just the frame:

```erb
<%= turbo_frame_tag "new_post" do %>
  <%= form_with model: @post do |f| %>
    <%= f.text_field :title %>
    <%= f.submit %>
  <% end %>
<% end %>
```

Controller handles valid vs invalid:

```ruby
def create
  @post = current_user.posts.build(post_params)
  if @post.save
    respond_to do |format|
      format.turbo_stream do
        render turbo_stream: [
          turbo_stream.prepend("posts", @post),
          turbo_stream.replace("new_post", partial: "posts/form", locals: { post: Post.new })
        ]
      end
      format.html { redirect_to @post }
    end
  else
    render :new, status: :unprocessable_entity   # Frame re-renders with errors
  end
end
```

## Confirming Actions

```erb
<%= button_to "Delete", post_path(@post),
              method: :delete,
              data: { turbo_confirm: "Are you sure?" } %>
```

Customize the confirm dialog via a Stimulus controller:

```javascript
// app/javascript/controllers/confirm_controller.js
import { Controller } from "@hotwired/stimulus"
Turbo.setConfirmMethod((message) => window.confirmDialog.open(message))
```

## Common Pitfalls

| Problem                                                        | Cause                                                                 | Fix                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Full page reloads on link click                                | Link targeted outside any frame and Drive didn't intercept            | Check for `data-turbo="false"` or cross-origin URLs            |
| Form redirect shows old page                                   | Returned `302` without Turbo header                                   | Use `status: :see_other` on destroy/update redirects           |
| Validation errors disappear                                    | Rendered with `status: :ok` → Turbo follows as success                | Render with `status: :unprocessable_entity`                   |
| Stimulus controller not loading                                | Lazy ESM loading missed the file                                       | Add explicit `pin` in `config/importmap.rb`                    |
| Streams don't update                                           | `<%= turbo_stream_from "channel" %>` missing on the page              | Add it to the layout or partial                                |
| Flash messages not clearing                                    | Stream response doesn't include flash                                 | Broadcast flash via `turbo_stream.update "flash"`              |

## Full Example: Real-Time Comments

```ruby
# app/models/comment.rb
class Comment < ApplicationRecord
  belongs_to :post
  belongs_to :user

  broadcasts_to ->(c) { [c.post, :comments] }, inserts_by: :append
end
```

```erb
<!-- app/views/posts/show.html.erb -->
<%= turbo_stream_from @post, :comments %>

<div id="<%= dom_id(@post, :comments) %>">
  <%= render @post.comments %>
</div>

<%= render "comments/form", comment: Comment.new, post: @post %>
```

```ruby
# app/controllers/comments_controller.rb
class CommentsController < ApplicationController
  before_action :authenticate_user!

  def create
    @post    = Post.find(params[:post_id])
    @comment = @post.comments.create!(comment_params.merge(user: current_user))

    respond_to do |format|
      format.turbo_stream   # form submitter; others get broadcast
      format.html { redirect_to @post }
    end
  end
end
```

```erb
<!-- app/views/comments/create.turbo_stream.erb -->
<%= turbo_stream.replace "new_comment" do %>
  <%= render "form", comment: Comment.new, post: @post %>
<% end %>
```

Result: submitter sees the cleared form immediately; all other viewers see the new comment appear via broadcast — with one controller action, zero custom JS.

## Upgrade Notes

- **Turbo 8** introduced morphing and refresh. Enable both if your app can tolerate preserve-on-refresh semantics.
- Rails 7.0 → 7.1 → 7.2 all ship progressively better Turbo defaults. On 8.0, the happy path is: model `broadcasts_to`, view `turbo_stream_from`, controller `format.turbo_stream`.
- Avoid mixing React/Vue with Turbo in the same page unless you understand the lifecycle — double-rendering is easy.

## Related References

### Rails

- [overview.md](overview.md) — Where Hotwire fits in a Rails app (routing, controllers, views).
- [active-record.md](active-record.md) — `broadcasts_to` callbacks emit Turbo Streams from AR models.
- [deployment.md](deployment.md) — Solid Cable replaces Redis for ActionCable in Rails 8.

### Ruby skill (cross-cutting)

- [../testing.md](../testing.md) — System specs with Capybara, testing Turbo Streams and Stimulus controllers.
