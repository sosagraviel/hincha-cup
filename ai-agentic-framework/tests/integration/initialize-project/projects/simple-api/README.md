# Test API

A simple Express + TypeScript API for testing the initialize-project skill.

## Features

- Express REST API
- TypeScript
- JWT Authentication
- Jest Testing
- ESLint + Prettier

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

## Testing

```bash
npm test
```

## Build

```bash
npm run build
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/users` - Get all users (requires auth)
- `GET /api/users/:id` - Get user by ID (requires auth)
- `POST /api/users` - Create user (requires auth)
