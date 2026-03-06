---
name: mastering-go-skill
description: Comprehensive Go language expertise covering idioms, concurrency, testing, and standard library patterns
user-invokable: true
disable-model-invocation: false
---

# Mastering Go

Expert guidance for Go development following idiomatic patterns and best practices.

## Language Fundamentals

### Go Idioms and Conventions
- Follow effective Go principles
- Use `gofmt` for code formatting (enforced)
- Use `goimports` for import management
- Package naming: lowercase, single word, no underscores
- Exported identifiers start with uppercase (PascalCase)
- Unexported identifiers use camelCase
- Accept interfaces, return structs
- Make the zero value useful
- Keep package main and func main minimal

### Error Handling Patterns
```go
// Standard error handling
if err != nil {
    return fmt.Errorf("failed to process: %w", err)
}

// Error wrapping (Go 1.13+)
errors.Is(err, ErrNotFound)
errors.As(err, &target)

// Custom errors
type ValidationError struct {
    Field string
    Err   error
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation failed for %s: %v", e.Field, e.Err)
}
```

### Interfaces and Composition
- Interfaces are satisfied implicitly
- Define interfaces where they're used, not where they're implemented
- Prefer small interfaces (1-2 methods)
- Common patterns:
  - `io.Reader`, `io.Writer` for streaming
  - `fmt.Stringer` for custom string representation
  - `error` interface for error types

```go
// Small, focused interfaces
type DataStore interface {
    Save(key string, value []byte) error
    Load(key string) ([]byte, error)
}

// Embedding interfaces
type ReadWriter interface {
    io.Reader
    io.Writer
}
```

### Struct Embedding and Composition
```go
// Embed types to compose behavior
type Engine struct {
    HP int
}

func (e *Engine) Start() { /* ... */ }

type Car struct {
    Engine  // Embedding
    Make string
}

// car.Start() calls embedded Engine.Start()
```

## Concurrency Patterns

### Goroutines and Channels
```go
// Starting goroutines
go processData(data)

// Channels for communication
ch := make(chan int)        // Unbuffered
ch := make(chan int, 10)    // Buffered

// Send and receive
ch <- value    // Send
value := <-ch  // Receive

// Close channels (sender's responsibility)
close(ch)

// Range over channels
for value := range ch {
    // Process until channel is closed
}
```

### Worker Pool Pattern
```go
func worker(id int, jobs <-chan Job, results chan<- Result) {
    for job := range jobs {
        results <- process(job)
    }
}

// Create worker pool
jobs := make(chan Job, 100)
results := make(chan Result, 100)

for w := 1; w <= numWorkers; w++ {
    go worker(w, jobs, results)
}

// Send work
for _, job := range allJobs {
    jobs <- job
}
close(jobs)

// Collect results
for range allJobs {
    <-results
}
```

### Context Package for Cancellation
```go
// Create context with timeout
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

// Pass context to long-running operations
err := doWork(ctx, data)

// Check for cancellation
select {
case <-ctx.Done():
    return ctx.Err()
case result := <-ch:
    return result
}
```

### Select Statement
```go
// Multiplex channel operations
select {
case msg := <-ch1:
    // Handle ch1
case ch2 <- value:
    // Send to ch2
case <-time.After(1 * time.Second):
    // Timeout
default:
    // Non-blocking
}
```

### Sync Package Primitives
```go
// Mutex for protecting shared state
var mu sync.Mutex
mu.Lock()
// Critical section
mu.Unlock()

// RWMutex for read-heavy workloads
var rwmu sync.RWMutex
rwmu.RLock()  // Multiple readers allowed
defer rwmu.RUnlock()

// WaitGroup for waiting on goroutines
var wg sync.WaitGroup
for i := 0; i < 10; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        // Work
    }()
}
wg.Wait()

// Once for one-time initialization
var once sync.Once
once.Do(func() {
    // Initialize exactly once
})
```

## Testing & Quality

### Table-Driven Tests
```go
func TestAdd(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        expected int
    }{
        {"positive numbers", 2, 3, 5},
        {"negative numbers", -1, -2, -3},
        {"zero", 0, 0, 0},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := Add(tt.a, tt.b)
            if result != tt.expected {
                t.Errorf("Add(%d, %d) = %d; want %d",
                    tt.a, tt.b, result, tt.expected)
            }
        })
    }
}
```

### Test Helpers and Fixtures
```go
// Test helper
func setupDB(t *testing.T) *sql.DB {
    t.Helper()
    db, err := sql.Open("sqlite3", ":memory:")
    if err != nil {
        t.Fatalf("failed to setup DB: %v", err)
    }
    t.Cleanup(func() {
        db.Close()
    })
    return db
}

// Use in tests
func TestQuery(t *testing.T) {
    db := setupDB(t)
    // Test with db
}
```

### Benchmarking
```go
func BenchmarkAdd(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Add(100, 200)
    }
}

// Run: go test -bench=. -benchmem
```

### Race Detector
```bash
# Detect data races
go test -race ./...
go build -race
go run -race main.go
```

### Code Quality Tools
```bash
# golangci-lint (comprehensive linter aggregator)
golangci-lint run

# go vet (official static analyzer)
go vet ./...

# staticcheck (advanced static analysis)
staticcheck ./...
```

## Standard Library Mastery

### HTTP Server
```go
// Basic server
http.HandleFunc("/", handler)
http.ListenAndServe(":8080", nil)

// Custom server with configuration
server := &http.Server{
    Addr:         ":8080",
    Handler:      mux,
    ReadTimeout:  10 * time.Second,
    WriteTimeout: 10 * time.Second,
}
server.ListenAndServe()

// Middleware pattern
func loggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        log.Printf("%s %s", r.Method, r.URL.Path)
        next.ServeHTTP(w, r)
    })
}
```

### HTTP Client
```go
// Custom client with timeout
client := &http.Client{
    Timeout: 10 * time.Second,
}

resp, err := client.Get("https://api.example.com")
if err != nil {
    return err
}
defer resp.Body.Close()

body, err := io.ReadAll(resp.Body)
```

### Database/SQL
```go
// Open connection
db, err := sql.Open("postgres", connStr)
if err != nil {
    return err
}
defer db.Close()

// Set connection pool limits
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(5)

// Query single row
var name string
err = db.QueryRow("SELECT name FROM users WHERE id = $1", id).Scan(&name)

// Query multiple rows
rows, err := db.Query("SELECT id, name FROM users")
if err != nil {
    return err
}
defer rows.Close()

for rows.Next() {
    var id int
    var name string
    if err := rows.Scan(&id, &name); err != nil {
        return err
    }
}
```

### JSON Encoding/Decoding
```go
// Struct tags for JSON mapping
type User struct {
    ID        int    `json:"id"`
    Name      string `json:"name"`
    Email     string `json:"email,omitempty"`
    Password  string `json:"-"` // Never marshal
}

// Encode
data, err := json.Marshal(user)

// Decode
var user User
err := json.Unmarshal(data, &user)

// Stream encoding/decoding
encoder := json.NewEncoder(w)
decoder := json.NewDecoder(r.Body)
```

### Time Package
```go
// Parse and format
layout := "2006-01-02 15:04:05"
t, err := time.Parse(layout, "2024-01-15 10:30:00")

// Format
formatted := t.Format(layout)

// Durations
time.Sleep(2 * time.Second)
timeout := 5 * time.Minute

// Timers and tickers
timer := time.NewTimer(1 * time.Second)
ticker := time.NewTicker(100 * time.Millisecond)
defer ticker.Stop()
```

## Build & Deployment

### Go Modules
```bash
# Initialize module
go mod init github.com/user/project

# Add dependency
go get github.com/pkg/errors

# Update dependencies
go get -u ./...

# Tidy dependencies (remove unused)
go mod tidy

# Vendor dependencies
go mod vendor
```

### Build Commands
```bash
# Build binary
go build -o myapp

# Build with optimization flags
go build -ldflags="-s -w" -o myapp

# Cross-compilation
GOOS=linux GOARCH=amd64 go build -o myapp-linux
GOOS=windows GOARCH=amd64 go build -o myapp.exe
GOOS=darwin GOARCH=arm64 go build -o myapp-mac
```

### Build Tags
```go
// +build integration

package mypackage

// Build: go build -tags=integration
```

## Common Frameworks and Libraries

### Gin (Web Framework)
```go
router := gin.Default()

router.GET("/users/:id", func(c *gin.Context) {
    id := c.Param("id")
    c.JSON(200, gin.H{"id": id})
})

router.POST("/users", func(c *gin.Context) {
    var user User
    if err := c.ShouldBindJSON(&user); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    c.JSON(201, user)
})

router.Run(":8080")
```

### GORM (ORM)
```go
// Define model
type User struct {
    gorm.Model
    Name  string
    Email string `gorm:"uniqueIndex"`
}

// Connect
db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})

// Auto migrate
db.AutoMigrate(&User{})

// CRUD operations
db.Create(&user)
db.First(&user, id)
db.Where("email = ?", email).First(&user)
db.Save(&user)
db.Delete(&user)
```

### sqlx (SQL Extensions)
```go
db, err := sqlx.Connect("postgres", connStr)

// Named queries
user := User{}
err = db.Get(&user, "SELECT * FROM users WHERE id = $1", id)

// Batch queries
users := []User{}
err = db.Select(&users, "SELECT * FROM users")

// Named parameters
_, err = db.NamedExec("INSERT INTO users (name, email) VALUES (:name, :email)", user)
```

## Best Practices

1. **Error Handling**: Always handle errors, never ignore them with `_`
2. **Defer**: Use `defer` for cleanup (closing files, unlocking mutexes)
3. **Naming**: Use clear, descriptive names following Go conventions
4. **Package Design**: Keep packages focused, avoid circular dependencies
5. **Concurrency**: Don't communicate by sharing memory, share memory by communicating
6. **Testing**: Write table-driven tests, use test helpers with `t.Helper()`
7. **Documentation**: Add package comments, document exported identifiers
8. **Performance**: Profile before optimizing, use pprof for profiling
9. **Modules**: Use Go modules for dependency management
10. **Code Review**: Run `gofmt`, `go vet`, and linters before committing
