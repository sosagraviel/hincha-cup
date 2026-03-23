# IT-001: Add User Authentication Endpoint

**Type**: Feature
**Priority**: High

## Description

Implement a new REST API endpoint for user authentication that accepts email and password, validates credentials, and returns a JWT token.

## Requirements

1. Create POST `/api/auth/login` endpoint
2. Accept JSON body with `email` and `password` fields
3. Validate credentials against user database
4. Return JWT token on success (200 OK)
5. Return error on failure (401 Unauthorized)
6. Add input validation for email format
7. Hash password comparison using bcrypt

## Acceptance Criteria

- [ ] Endpoint responds to POST requests at `/api/auth/login`
- [ ] Valid credentials return 200 with JWT token
- [ ] Invalid credentials return 401 with error message
- [ ] Invalid email format returns 400 with validation error
- [ ] Password is compared using bcrypt
- [ ] JWT token includes user ID and email
- [ ] Token expires after 24 hours

## Technical Notes

- Use existing User model from `models/user.model.ts`
- Use bcrypt for password comparison
- Use jsonwebtoken library for JWT generation
- Add rate limiting to prevent brute force attacks (max 5 attempts per minute)
