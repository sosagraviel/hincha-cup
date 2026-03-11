# FastAPI Test API

A test project for validating the initialize-project framework with a Python FastAPI application.

## Features

- **FastAPI** - Modern async web framework
- **Pydantic** - Data validation using Python type annotations
- **JWT Authentication** - Secure token-based auth with python-jose
- **Password Hashing** - bcrypt via passlib
- **Poetry** - Dependency management
- **Pytest** - Async testing framework
- **Code Quality** - black, flake8, mypy

## Project Structure

```
python-fastapi/
├── app/
│   ├── __init__.py
│   ├── main.py              # Application entry point
│   ├── core/
│   │   ├── config.py        # Settings management
│   │   └── security.py      # JWT authentication
│   ├── routers/
│   │   └── users.py         # User endpoints
│   ├── schemas/
│   │   └── user.py          # Pydantic schemas
│   └── services/
│       └── user_service.py  # Business logic
├── tests/
│   └── test_users.py        # User tests
├── pyproject.toml           # Poetry dependencies
├── pytest.ini               # Pytest configuration
├── .flake8                  # Linting rules
└── .env.example             # Environment variables template
```

## Setup

1. Install dependencies with Poetry:
```bash
poetry install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Run the application:
```bash
poetry run uvicorn app.main:app --reload
```

## Testing

Run tests with pytest:
```bash
poetry run pytest
```

Run with coverage:
```bash
poetry run pytest --cov=app
```

## Code Quality

Format code with black:
```bash
poetry run black app tests
```

Lint with flake8:
```bash
poetry run flake8 app tests
```

Type check with mypy:
```bash
poetry run mypy app
```

## API Endpoints

- `GET /health` - Health check (no auth required)
- `POST /api/users/` - Create user (no auth required)
- `GET /api/users/` - Get all users (requires auth)
- `GET /api/users/{user_id}` - Get user by ID (requires auth)

## Authentication

This project uses JWT tokens for authentication. To obtain a token:

1. Create a user via `POST /api/users/`
2. Login to receive JWT token
3. Include token in Authorization header: `Bearer <token>`

## Environment Variables

See `.env.example` for required environment variables:
- `SECRET_KEY` - JWT signing key
- `DATABASE_URL` - Database connection string
- `ALLOWED_ORIGINS` - CORS allowed origins

## Technology Stack

- **Framework**: FastAPI 0.104.0
- **Server**: Uvicorn
- **Validation**: Pydantic 2.4.0
- **Database**: SQLAlchemy 2.0.0
- **Auth**: python-jose[cryptography], passlib[bcrypt]
- **Testing**: pytest, httpx
- **Code Quality**: black, flake8, mypy
- **Package Manager**: Poetry
