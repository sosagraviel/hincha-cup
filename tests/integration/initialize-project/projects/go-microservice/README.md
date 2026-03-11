# Go Microservice

A test microservice built with Go for validating the initialize-project framework with Go projects.

## Features

- **Gorilla Mux** - HTTP router and URL matcher
- **JWT Authentication** - Token-based auth with golang-jwt
- **bcrypt** - Password hashing via golang.org/x/crypto
- **Middleware** - Logging and authentication middleware
- **RESTful API** - Clean REST endpoint design
- **Docker** - Multi-stage Dockerfile for production
- **Makefile** - Common development tasks
- **In-memory Storage** - Simple user storage for testing

## Project Structure

```
go-microservice/
├── cmd/
│   └── api/
│       └── main.go           # Application entry point
├── internal/
│   ├── handlers/
│   │   └── user_handler.go   # HTTP handlers
│   ├── models/
│   │   └── user.go           # Data models
│   └── middleware/
│       ├── auth.go           # JWT middleware
│       └── logging.go        # Request logging
├── pkg/
│   └── auth/
│       └── jwt.go            # JWT utilities
├── go.mod                    # Go dependencies
├── Dockerfile                # Docker configuration
├── Makefile                  # Build automation
└── .env.example              # Environment variables template
```

## Setup

1. Install Go 1.21 or higher

2. Download dependencies:
```bash
make deps
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Run the application:
```bash
make run
```

## Development

Run with auto-reload (requires air):
```bash
make dev
```

Format code:
```bash
make fmt
```

Run linter:
```bash
make lint
```

## Testing

Run tests:
```bash
make test
```

Run tests with coverage:
```bash
make test-coverage
```

## Building

Build binary:
```bash
make build
```

Build Docker image:
```bash
make docker-build
```

Run Docker container:
```bash
make docker-run
```

## API Endpoints

### Public Endpoints

- `GET /health` - Health check
- `GET /api/v1/users` - Get all users
- `GET /api/v1/users/{id}` - Get user by ID
- `POST /api/v1/users` - Create user

### Protected Endpoints (Require JWT)

- `PUT /api/v1/users/{id}` - Update user
- `DELETE /api/v1/users/{id}` - Delete user

## Authentication

This service uses JWT tokens for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Environment Variables

See `.env.example` for required environment variables:
- `PORT` - Server port (default: 8080)
- `JWT_SECRET` - JWT signing secret
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` - Database configuration

## Technology Stack

- **Language**: Go 1.21
- **Router**: Gorilla Mux v1.8.1
- **Auth**: golang-jwt/jwt v5.2.0
- **Crypto**: golang.org/x/crypto v0.17.0
- **Environment**: godotenv v1.5.1
- **Testing**: testify v1.8.4, go-sqlmock v1.5.2
- **Containerization**: Docker multi-stage build

## Architecture

This microservice follows clean architecture principles:
- **cmd/api** - Application entry point
- **internal** - Private application code
  - **handlers** - HTTP request handlers (controllers)
  - **models** - Domain models and DTOs
  - **middleware** - HTTP middleware (auth, logging)
- **pkg** - Public utility packages (reusable)
