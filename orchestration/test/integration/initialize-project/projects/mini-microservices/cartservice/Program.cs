using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddGrpc();
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(
        Environment.GetEnvironmentVariable("REDIS_ADDR") ?? "localhost:6379"));

var app = builder.Build();
app.MapGet("/", () => "cartservice — gRPC at :7070");
app.Run("http://0.0.0.0:7070");
