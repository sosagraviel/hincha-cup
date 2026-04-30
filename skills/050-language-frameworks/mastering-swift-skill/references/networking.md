# Networking

> **Load when:** implementing HTTP requests, building or extending a network layer, handling API errors, mocking network calls in tests.

## Quick Snippets

| I need to... | Pattern |
|---|---|
| Make a GET request | `let (data, response) = try await URLSession.shared.data(for: request)` |
| Define a reusable HTTP client | `HTTPClient` protocol + `URLSessionHTTPClient` (see below) |
| Decode a JSON response | `try JSONDecoder().decode(T.self, from: data)` |
| Check HTTP status code | `guard (200..<300).contains(httpResponse.statusCode)` |
| Set an authorization header | `request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")` |
| Build a URL with query parameters | `URLComponents` + `.queryItems` |
| Mock network calls in tests | `MockHTTPClient: HTTPClient` with a stubbed response |
| Add auth to requests transparently | `AuthenticatedHTTPClient` decorator wrapping `HTTPClient` |

## HTTPClient Protocol

Define a thin `HTTPClient` protocol over `URLSession` so every networking site depends on an abstraction, not the concrete session. This is the single seam that makes networking testable.

```swift
protocol HTTPClient: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}
```

## URLSessionHTTPClient — The Thin Wrapper

The only job of `URLSessionHTTPClient` is to call `URLSession` and downcast the response. All business logic (status codes, decoding, auth) lives elsewhere.

```swift
final class URLSessionHTTPClient: HTTPClient {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw HTTPError.invalidResponse
        }
        return (data, http)
    }
}
```

`URLSession.data(for:)` throws `URLError` for transport failures (no connectivity, timeout, task cancelled). `HTTPClient.data(for:)` surfaces these unchanged — status-code errors are validated one layer above.

## Building Requests

Use `URLComponents` for URLs with query parameters — it handles percent-encoding automatically.

```swift
enum APIEndpoint {
    static let base = URL(string: "https://api.example.com")!

    static func users() -> URLRequest {
        var request = URLRequest(url: base.appending(path: "/users"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    static func user(id: String) -> URLRequest {
        var request = URLRequest(url: base.appending(path: "/users/\(id)"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    static func search(query: String, page: Int) -> URLRequest {
        var components = URLComponents(url: base.appending(path: "/search"), resolvingAgainstBaseURL: true)!
        components.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "page", value: String(page)),
        ]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    static func createUser(_ body: CreateUserRequest) throws -> URLRequest {
        var request = URLRequest(url: base.appending(path: "/users"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return request
    }
}
```

## Response Validation and Decoding

Centralise status-code validation and decoding in a protocol extension so every call site gets uniform error handling. Define `HTTPError` alongside:

```swift
enum HTTPError: Error {
    case invalidResponse
    case clientError(statusCode: Int, data: Data)   // 4xx
    case serverError(statusCode: Int)               // 5xx
    case decodingFailed(DecodingError)
}

extension HTTPClient {
    func decode<T: Decodable>(
        _ type: T.Type,
        from request: URLRequest,
        using decoder: JSONDecoder = .init()
    ) async throws -> T {
        let (data, response) = try await self.data(for: request)
        switch response.statusCode {
        case 200..<300:
            do {
                return try decoder.decode(T.self, from: data)
            } catch let error as DecodingError {
                throw HTTPError.decodingFailed(error)
            }
        case 400..<500:
            throw HTTPError.clientError(statusCode: response.statusCode, data: data)
        default:
            throw HTTPError.serverError(statusCode: response.statusCode)
        }
    }
}
```

## Repository Using HTTPClient

Repositories take `HTTPClient` by injection. The concrete `URLSessionHTTPClient` is the default; tests pass a `MockHTTPClient`.

```swift
final class UserRepository {
    private let client: HTTPClient
    private let decoder: JSONDecoder

    init(client: HTTPClient = URLSessionHTTPClient()) {
        self.client = client
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
    }

    func fetchUser(id: String) async throws -> User {
        try await client.decode(User.self, from: APIEndpoint.user(id: id), using: decoder)
    }

    func createUser(_ body: CreateUserRequest) async throws -> User {
        let request = try APIEndpoint.createUser(body)
        return try await client.decode(User.self, from: request, using: decoder)
    }
}
```

## Authentication — Decorator Pattern

Inject authentication via a decorator that wraps any `HTTPClient`. The decorator adds headers; the wrapped client handles transport. This keeps auth logic out of repositories.

```swift
final class AuthenticatedHTTPClient: HTTPClient {
    private let wrapped: HTTPClient
    private let tokenProvider: @Sendable () async throws -> String

    init(wrapped: HTTPClient, tokenProvider: @escaping @Sendable () async throws -> String) {
        self.wrapped = wrapped
        self.tokenProvider = tokenProvider
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        var authenticated = request
        let token = try await tokenProvider()
        authenticated.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await wrapped.data(for: authenticated)
    }
}

// Wiring at startup
let client = AuthenticatedHTTPClient(
    wrapped: URLSessionHTTPClient(),
    tokenProvider: { try await TokenStore.shared.validToken() }
)
```

## Testing the Network Layer

Swap `URLSessionHTTPClient` for a `MockHTTPClient` in tests — no `URLProtocol` subclassing needed.

```swift
final class MockHTTPClient: HTTPClient {
    var result: Result<(Data, HTTPURLResponse), Error>
    private(set) var requestsMade: [URLRequest] = []

    init(result: Result<(Data, HTTPURLResponse), Error> = .success((Data(), makeHTTPResponse(statusCode: 200)))) {
        self.result = result
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requestsMade.append(request)
        return try result.get()
    }

    static func stub<T: Encodable>(_ body: T, statusCode: Int = 200) throws -> MockHTTPClient {
        let data = try JSONEncoder().encode(body)
        return MockHTTPClient(result: .success((data, makeHTTPResponse(statusCode: statusCode))))
    }
}

private func makeHTTPResponse(statusCode: Int) -> HTTPURLResponse {
    HTTPURLResponse(url: URL(string: "https://example.com")!, statusCode: statusCode, httpVersion: nil, headerFields: nil)!
}

// Test using the mock
@Test("fetches user successfully")
func fetchesUser() async throws {
    let expected = User.fixture()
    let mock = try MockHTTPClient.stub(expected)
    let repository = UserRepository(client: mock)

    let user = try await repository.fetchUser(id: expected.id)
    #expect(user == expected)
    #expect(mock.requestsMade.count == 1)
}

@Test("throws on 404")
func throwsOn404() async {
    let mock = MockHTTPClient(result: .success((Data(), makeHTTPResponse(statusCode: 404))))
    let repository = UserRepository(client: mock)

    await #expect(throws: HTTPError.self) {
        try await repository.fetchUser(id: "missing")
    }
}
```

## Pitfalls

| Don't | Do |
|---|---|
| Build URLs with string interpolation: `"https://api.com?q=\(query)"` | Use `URLComponents` + `.queryItems` — handles percent-encoding automatically |
| Force-cast the response: `response as! HTTPURLResponse` | Downcast in `URLSessionHTTPClient` and throw `HTTPError.invalidResponse` |
| Call `URLSession.shared` directly in repositories | Route all networking through the `HTTPClient` protocol |
| Decode response data inline at every call site | Use the `decode(_:from:using:)` extension for uniform error handling |
| Ignore 4xx / 5xx status codes | Always validate `statusCode` — `URLSession` returns `data` for 404, not an error |
| Put auth token logic inside a repository | Use an `AuthenticatedHTTPClient` decorator — repositories stay auth-agnostic |
| Use `try!` when building request bodies | Throw from factory methods — encoding `Encodable` types rarely fails, but `try!` hides bugs |

## Best Practices

- Define `HTTPClient` as `Sendable` so it can be captured safely in actors and async closures
- Keep `URLSessionHTTPClient` final — it wraps a single `URLSession` and has no subclassing reason
- Inject `HTTPClient` via initializer — never access `URLSession.shared` from inside a repository
- Centralise status-code handling and decoding in a protocol extension — one place to add retry or logging later
- Use `URLComponents` for all URLs with query parameters — string interpolation silently skips percent-encoding
- Use an `AuthenticatedHTTPClient` decorator for tokens — don't add auth logic inside repositories
- Configure the shared `JSONDecoder` once (e.g. `dateDecodingStrategy`) at the repository level, not per-call
- Use `MockHTTPClient` in tests — simpler than `URLProtocol` subclassing, and testable at the exact call boundary
