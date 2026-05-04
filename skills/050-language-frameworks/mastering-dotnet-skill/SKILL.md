---
name: mastering-dotnet-skill
description: Comprehensive .NET and C# expertise covering ASP.NET Core Minimal APIs and Controllers, Entity Framework Core, Dapper, dependency injection, IOptions pattern, xUnit/NUnit testing, clean architecture, CQRS with MediatR, Result pattern, caching with Redis, middleware, SignalR, and modern C# 13+ patterns. Use when asked to "write C# code", "create an ASP.NET Core API", "set up Entity Framework", "configure a .NET project", "write xUnit tests", "implement dependency injection", "create Minimal API endpoints", "use MediatR or CQRS", "configure middleware", or "debug .NET errors". Triggers on ".NET best practices", "C# patterns", "ASP.NET Core", "Entity Framework", "Blazor", "SignalR", "dotnet CLI".
allowed-tools: Read, Write, Bash, Edit
---

# Mastering .NET

Production-ready .NET and C# patterns for enterprise-grade applications.

> **Compatibility:** .NET 9+, C# 13+, ASP.NET Core 9+, EF Core 9+

## Quick Start

```bash
# Create Minimal API project
dotnet new webapi -n MyApi --use-controllers false
cd MyApi && dotnet run

# Or create Clean Architecture solution
dotnet new sln -n MySolution
dotnet new webapi -n Api -o src/Api
dotnet new classlib -n Domain -o src/Domain
dotnet new classlib -n Application -o src/Application
dotnet new classlib -n Infrastructure -o src/Infrastructure
dotnet new xunit -n Api.Tests -o tests/Api.Tests
dotnet sln add src/Api src/Domain src/Application src/Infrastructure tests/Api.Tests
```

## When to Use This Skill

Use when:

- Building REST APIs with ASP.NET Core (Minimal APIs or Controllers)
- Working with Entity Framework Core or Dapper for data access
- Implementing clean architecture, CQRS, or vertical slice patterns
- Building real-time apps with SignalR or interactive UIs with Blazor
- Writing tests with xUnit, NUnit, or MSTest
- Configuring dependency injection, middleware, or authentication
- Working with the dotnet CLI for builds, migrations, and packaging

## Project Setup Checklist

```
- [ ] Use .NET 9+ SDK (pin with global.json)
- [ ] Configure solution file (.sln) for multi-project setups
- [ ] Enable nullable reference types (<Nullable>enable</Nullable>)
- [ ] Enable implicit usings (<ImplicitUsings>enable</ImplicitUsings>)
- [ ] Add Directory.Build.props for shared build settings
- [ ] Set up EditorConfig or dotnet format for code style
- [ ] Configure xUnit for testing with coverlet for coverage
```

## Workflow

### Phase 1: Setup

1. Verify .NET SDK

   ```bash
   dotnet --version   # Require 9.0+
   ```

2. Project structure (Clean Architecture)

   ```
   src/
   ├── Domain/              # Entities, value objects, interfaces (no dependencies)
   ├── Application/         # Use cases, DTOs, validators, service interfaces
   ├── Infrastructure/      # EF Core, Redis, external APIs, DI registration
   └── Api/                 # Controllers/Minimal APIs, middleware, Program.cs
   tests/
   └── Api.Tests/           # Unit + integration tests
   ```

3. Shared build properties

   ```xml
   <!-- Directory.Build.props -->
   <Project>
     <PropertyGroup>
       <TargetFramework>net9.0</TargetFramework>
       <Nullable>enable</Nullable>
       <ImplicitUsings>enable</ImplicitUsings>
       <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
     </PropertyGroup>
   </Project>
   ```

### Phase 2: Develop

4. Reference appropriate patterns from sections below
5. Follow C# conventions (PascalCase public, camelCase locals, _camelCase fields)

### Phase 3: Validate

6. Run quality checks

   ```bash
   dotnet format --verify-no-changes
   dotnet build --warnaserrors
   ```

7. Run tests

   ```bash
   dotnet test
   dotnet test --collect:"XPlat Code Coverage"
   ```

### Phase 4: Package and Deploy

8. Publish

   ```bash
   dotnet publish -c Release
   dotnet publish -c Release --self-contained -r linux-x64
   ```

**Pre-Completion Checklist:**

```
- [ ] All tests pass
- [ ] No compiler warnings
- [ ] dotnet format applied
- [ ] No nullable reference warnings
```

## Language Fundamentals

### Modern C# Features

```csharp
// Records (immutable reference types)
public record User(long Id, string Name, string Email);
public record CreateUserRequest(string Name, string Email);

// Primary constructors (C# 12+)
public class UserService(IUserRepository repository, ILogger<UserService> logger)
{
    public async Task<User?> GetByIdAsync(long id, CancellationToken ct = default)
    {
        logger.LogInformation("Fetching user {Id}", id);
        return await repository.FindByIdAsync(id, ct);
    }
}

// Pattern matching
public static string Classify(object obj) => obj switch
{
    int n when n < 0 => "negative",
    int n when n > 0 => "positive",
    int => "zero",
    string { Length: > 100 } => "long string",
    string s => $"string: {s}",
    null => "null",
    _ => "unknown"
};

// Collection expressions (C# 12+)
int[] numbers = [1, 2, 3, 4, 5];
List<string> names = ["Alice", "Bob"];

// Raw string literals
var json = """
    {
        "name": "Alice",
        "email": "alice@example.com"
    }
    """;

// Required members
public class Config
{
    public required string ConnectionString { get; init; }
    public required int MaxRetries { get; init; }
    public int TimeoutMs { get; init; } = 5000;
}

// Extension methods
public static class StringExtensions
{
    public static string Truncate(this string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength] + "...";
}
```

### Async/Await Patterns

```csharp
// Async all the way down
public async Task<Product> GetProductAsync(string id, CancellationToken ct = default)
    => await _repository.GetByIdAsync(id, ct);

// Parallel execution with WhenAll
public async Task<(Stock, Price)> GetStockAndPriceAsync(string productId, CancellationToken ct)
{
    var stockTask = _stockService.GetAsync(productId, ct);
    var priceTask = _priceService.GetAsync(productId, ct);
    await Task.WhenAll(stockTask, priceTask);
    return (await stockTask, await priceTask);
}

// ValueTask for hot paths with caching
public ValueTask<Product?> GetCachedProductAsync(string id)
{
    if (_cache.TryGetValue(id, out Product? product))
        return ValueTask.FromResult(product);
    return new ValueTask<Product?>(GetFromDatabaseAsync(id));
}

// ConfigureAwait(false) in library code
public async Task<T> LibraryMethodAsync<T>(CancellationToken ct = default)
{
    var result = await _httpClient.GetAsync(url, ct).ConfigureAwait(false);
    return await result.Content.ReadFromJsonAsync<T>(ct).ConfigureAwait(false);
}

// AVOID: blocking on async (deadlock risk)
// var result = GetProductAsync(id).Result;       // NEVER
// var result = GetProductAsync(id).GetAwaiter().GetResult(); // NEVER
// async void ProcessOrder() { }                  // NEVER (except event handlers)
```

### Dependency Injection

```csharp
// Service registration in Program.cs
var builder = WebApplication.CreateBuilder(args);

// Scoped: one instance per HTTP request
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IUserService, UserService>();

// Singleton: one instance for app lifetime
builder.Services.AddSingleton<ICacheService, RedisCacheService>();

// Transient: new instance every time
builder.Services.AddTransient<IValidator<CreateUserRequest>, CreateUserValidator>();

// Keyed services (.NET 8+)
builder.Services.AddKeyedScoped<IPaymentProcessor, StripeProcessor>("stripe");
builder.Services.AddKeyedScoped<IPaymentProcessor, PayPalProcessor>("paypal");

// Extension method pattern for clean registration
public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddApplicationServices(
        this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IUserService, UserService>();
        services.Configure<DatabaseOptions>(configuration.GetSection("Database"));
        return services;
    }
}

// Usage: builder.Services.AddApplicationServices(builder.Configuration);
```

### Configuration with IOptions

```csharp
// Strongly-typed options
public class DatabaseOptions
{
    public const string Section = "Database";
    public required string ConnectionString { get; init; }
    public int MaxRetryCount { get; init; } = 3;
}

// Registration with validation
builder.Services.AddOptionsWithValidateOnStart<DatabaseOptions>()
    .Bind(builder.Configuration.GetSection(DatabaseOptions.Section))
    .ValidateDataAnnotations();

// IOptions: singleton, read once at startup
public class StaticService(IOptions<DatabaseOptions> options)
{
    private readonly DatabaseOptions _db = options.Value;
}

// IOptionsSnapshot: scoped, re-reads per request
public class DynamicService(IOptionsSnapshot<DatabaseOptions> options)
{
    private readonly DatabaseOptions _db = options.Value;
}

// IOptionsMonitor: singleton, notified on changes
public class MonitoredService(IOptionsMonitor<DatabaseOptions> monitor)
{
    private DatabaseOptions _db = monitor.CurrentValue;
    // monitor.OnChange(newOptions => _db = newOptions);
}
```

## ASP.NET Core

### Minimal APIs

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
app.UseSwagger();
app.UseSwaggerUI();

var users = app.MapGroup("/api/users").WithTags("Users");

users.MapGet("/", async (IUserService service, CancellationToken ct) =>
    Results.Ok(await service.GetAllAsync(ct)));

users.MapGet("/{id:long}", async (long id, IUserService service, CancellationToken ct) =>
    await service.GetByIdAsync(id, ct) is { } user
        ? Results.Ok(user)
        : Results.NotFound());

users.MapPost("/", async (CreateUserRequest request, IUserService service, CancellationToken ct) =>
{
    var user = await service.CreateAsync(request, ct);
    return Results.Created($"/api/users/{user.Id}", user);
});

users.MapDelete("/{id:long}", async (long id, IUserService service, CancellationToken ct) =>
{
    await service.DeleteAsync(id, ct);
    return Results.NoContent();
});

app.Run();
```

### Controllers

```csharp
[ApiController]
[Route("api/[controller]")]
public class UsersController(IUserService userService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetAll(CancellationToken ct)
        => Ok(await userService.GetAllAsync(ct));

    [HttpGet("{id:long}")]
    public async Task<ActionResult<UserDto>> GetById(long id, CancellationToken ct)
    {
        var user = await userService.GetByIdAsync(id, ct);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPost]
    public async Task<ActionResult<UserDto>> Create([FromBody] CreateUserRequest request, CancellationToken ct)
    {
        var user = await userService.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, user);
    }
}
```

### Middleware

```csharp
// Custom middleware with primary constructor
public class RequestTimingMiddleware(RequestDelegate next, ILogger<RequestTimingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        try { await next(context); }
        finally
        {
            logger.LogInformation("{Method} {Path} => {Status} in {Elapsed}ms",
                context.Request.Method, context.Request.Path,
                context.Response.StatusCode, stopwatch.ElapsedMilliseconds);
        }
    }
}

// Global exception handler
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            error = "An unexpected error occurred",
            traceId = Activity.Current?.Id ?? context.TraceIdentifier
        });
    });
});
```

### Result Pattern (Avoid Exceptions for Flow Control)

```csharp
public class Result<T>
{
    public bool IsSuccess { get; }
    public T? Value { get; }
    public string? Error { get; }
    public string? ErrorCode { get; }

    private Result(bool isSuccess, T? value, string? error, string? errorCode)
    {
        IsSuccess = isSuccess; Value = value; Error = error; ErrorCode = errorCode;
    }

    public static Result<T> Success(T value) => new(true, value, null, null);
    public static Result<T> Failure(string error, string? code = null) => new(false, default, error, code);
}

// Usage in service
public async Task<Result<Order>> CreateOrderAsync(CreateOrderRequest request, CancellationToken ct)
{
    var validation = await _validator.ValidateAsync(request, ct);
    if (!validation.IsValid)
        return Result<Order>.Failure(validation.Errors.First().ErrorMessage, "VALIDATION_ERROR");

    var stock = await _stockService.CheckAsync(request.ProductId, request.Quantity, ct);
    if (!stock.IsAvailable)
        return Result<Order>.Failure($"Insufficient stock: {stock.Available} available", "INSUFFICIENT_STOCK");

    var order = await _repository.CreateAsync(request.ToEntity(), ct);
    return Result<Order>.Success(order);
}

// Usage in endpoint
app.MapPost("/orders", async (CreateOrderRequest request, IOrderService service, CancellationToken ct) =>
{
    var result = await service.CreateOrderAsync(request, ct);
    return result.IsSuccess
        ? Results.Created($"/orders/{result.Value!.Id}", result.Value)
        : Results.BadRequest(new { error = result.Error, code = result.ErrorCode });
});
```

## Data Access

### Entity Framework Core

```csharp
// DbContext
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
        modelBuilder.Entity<Product>().HasQueryFilter(p => !p.IsDeleted);
    }
}

// Entity configuration (Fluent API)
public class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("Products");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Name).HasMaxLength(200).IsRequired();
        builder.Property(p => p.Price).HasPrecision(18, 2);
        builder.HasIndex(p => p.Sku).IsUnique();
        builder.HasMany(p => p.OrderItems)
            .WithOne(oi => oi.Product)
            .HasForeignKey(oi => oi.ProductId);
    }
}

// Repository with EF Core
public class ProductRepository(AppDbContext context) : IProductRepository
{
    public async Task<Product?> GetByIdAsync(string id, CancellationToken ct = default)
        => await context.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<IReadOnlyList<Product>> SearchAsync(
        ProductSearchCriteria criteria, CancellationToken ct = default)
    {
        var query = context.Products.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(criteria.SearchTerm))
            query = query.Where(p => EF.Functions.Like(p.Name, $"%{criteria.SearchTerm}%"));
        if (criteria.MinPrice.HasValue)
            query = query.Where(p => p.Price >= criteria.MinPrice);

        return await query
            .OrderBy(p => p.Name)
            .Skip((criteria.Page - 1) * criteria.PageSize)
            .Take(criteria.PageSize)
            .ToListAsync(ct);
    }

    public async Task<Product> CreateAsync(Product product, CancellationToken ct = default)
    {
        context.Products.Add(product);
        await context.SaveChangesAsync(ct);
        return product;
    }
}

// Migrations
// dotnet ef migrations add InitialCreate
// dotnet ef database update
```

### Dapper (Performance-Critical Queries)

```csharp
public class DapperProductRepository(IDbConnection connection) : IProductRepository
{
    public async Task<Product?> GetByIdAsync(string id, CancellationToken ct = default)
    {
        const string sql = """
            SELECT Id, Name, Sku, Price, CategoryId, CreatedAt
            FROM Products WHERE Id = @Id AND IsDeleted = 0
            """;
        return await connection.QueryFirstOrDefaultAsync<Product>(
            new CommandDefinition(sql, new { Id = id }, cancellationToken: ct));
    }
}
```

## Testing

### xUnit with Moq

```csharp
public class UserServiceTests
{
    private readonly Mock<IUserRepository> _mockRepo = new();
    private readonly Mock<ILogger<UserService>> _mockLogger = new();
    private readonly UserService _sut;

    public UserServiceTests()
    {
        _sut = new UserService(_mockRepo.Object, _mockLogger.Object);
    }

    [Fact]
    public async Task GetByIdAsync_WhenUserExists_ReturnsUser()
    {
        // Arrange
        var expected = new User(1, "Alice", "alice@example.com");
        _mockRepo.Setup(r => r.FindByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(expected);

        // Act
        var result = await _sut.GetByIdAsync(1);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Alice", result.Name);
        _mockRepo.Verify(r => r.FindByIdAsync(1, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetByIdAsync_WhenUserNotFound_ReturnsNull()
    {
        _mockRepo.Setup(r => r.FindByIdAsync(999, It.IsAny<CancellationToken>()))
            .ReturnsAsync((User?)null);

        var result = await _sut.GetByIdAsync(999);

        Assert.Null(result);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task GetByIdAsync_WithInvalidId_ThrowsArgumentException(long id)
    {
        await Assert.ThrowsAsync<ArgumentException>(() => _sut.GetByIdAsync(id));
    }
}
```

### Integration Tests with WebApplicationFactory

```csharp
public class ProductsApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;
    private readonly WebApplicationFactory<Program> _factory;

    public ProductsApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.AddDbContext<AppDbContext>(o => o.UseInMemoryDatabase("TestDb"));
            });
        });
        _client = _factory.CreateClient();
    }

    [Fact]
    public async Task GetProduct_WithValidId_ReturnsOk()
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        context.Products.Add(new Product { Id = "TEST-001", Name = "Test", Price = 9.99m });
        await context.SaveChangesAsync();

        var response = await _client.GetAsync("/api/products/TEST-001");

        response.EnsureSuccessStatusCode();
        var product = await response.Content.ReadFromJsonAsync<Product>();
        Assert.Equal("Test", product!.Name);
    }

    [Fact]
    public async Task GetProduct_WithInvalidId_Returns404()
    {
        var response = await _client.GetAsync("/api/products/NONEXISTENT");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
```

## Build and Tooling

### dotnet CLI Reference

```bash
dotnet new webapi -n MyApi          # Create Web API project
dotnet new classlib -n MyLib        # Create class library
dotnet new xunit -n MyTests         # Create test project
dotnet new sln -n MySolution        # Create solution
dotnet sln add src/MyApi            # Add project to solution
dotnet add reference ../MyLib       # Add project reference
dotnet add package Newtonsoft.Json   # Add NuGet package
dotnet build                        # Build solution
dotnet run                          # Run project
dotnet test                         # Run all tests
dotnet test --filter "FullyQualifiedName~UserService"  # Run specific tests
dotnet publish -c Release           # Publish for deployment
dotnet format                       # Format code
dotnet ef migrations add Initial    # EF Core migration
dotnet ef database update           # Apply migrations
```

### Project File (.csproj)

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="9.0.0" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="9.0.0" />
    <PackageReference Include="Swashbuckle.AspNetCore" Version="6.9.0" />
    <PackageReference Include="FluentValidation.DependencyInjectionExtensions" Version="11.11.0" />
    <PackageReference Include="Serilog.AspNetCore" Version="8.0.3" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\Domain\Domain.csproj" />
    <ProjectReference Include="..\Infrastructure\Infrastructure.csproj" />
  </ItemGroup>
</Project>
```

### Docker Support

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY *.sln .
COPY src/Api/Api.csproj src/Api/
COPY src/Domain/Domain.csproj src/Domain/
COPY src/Infrastructure/Infrastructure.csproj src/Infrastructure/
RUN dotnet restore
COPY . .
RUN dotnet publish src/Api -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Api.dll"]
```

## Best Practices

### DO

1. **Async all the way**: Never block on async with `.Result` or `.Wait()`
2. **CancellationToken**: Pass it through every async method signature
3. **Nullable references**: Enable and respect nullable annotations
4. **IOptions pattern**: Use strongly-typed configuration, never raw `IConfiguration`
5. **Result pattern**: Return `Result<T>` instead of throwing exceptions for business logic
6. **AsNoTracking**: Use for read-only EF Core queries
7. **DTOs**: Never expose EF entities directly in APIs
8. **Primary constructors**: Use for DI in services and controllers (C# 12+)
9. **Records**: Use for DTOs, value objects, and immutable data
10. **IHttpClientFactory**: Never `new HttpClient()` manually

### DON'T

1. **async void**: Never use except for event handlers (exceptions are lost)
2. **Catch generic Exception**: Be specific, log, and re-throw when needed
3. **Hardcode config**: Use IOptions, appsettings.json, and environment variables
4. **Skip validation**: Validate at API boundaries with FluentValidation or DataAnnotations
5. **N+1 queries**: Use `.Include()` or explicit joins in EF Core
6. **Task.Run for async**: Don't wrap already-async code in `Task.Run()`
7. **Service locator**: Don't resolve services from `IServiceProvider` directly
8. **Mutable singletons**: Singletons must be thread-safe
9. **Sync over async**: Don't call `.Result` or `.GetAwaiter().GetResult()`
10. **Ignore disposal**: Use `using`/`await using` for `IDisposable`/`IAsyncDisposable`

### Common Pitfalls

- **N+1 Queries**: Use `.Include()` or explicit joins, check query plans
- **Memory Leaks**: Dispose resources, use `using` statements
- **Deadlocks**: Don't mix sync and async, use `ConfigureAwait(false)` in libraries
- **Over-fetching**: Select only needed columns with `.Select()` projections
- **Cache Stampede**: Use distributed locks for cache population
- **Missing Indexes**: Check EF Core query plans, add indexes for common filters
