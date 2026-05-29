namespace CartService;

/// <summary>Legacy Startup-style configuration for shared usage in tests.</summary>
public class Startup
{
    public static string DefaultRedisAddr() =>
        Environment.GetEnvironmentVariable("REDIS_ADDR") ?? "localhost:6379";
}
