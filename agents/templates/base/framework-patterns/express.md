# Express Framework Patterns

## Modern Express with TypeScript

Express with TypeScript and async/await:

```typescript
import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const app = express();
app.use(express.json());

// Validation schemas
const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

// Routes
app.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userData = createUserSchema.parse(req.body);
    const user = await userService.create(userData);
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

app.get('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

app.put('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userData = updateUserSchema.parse(req.body);
    const user = await userService.update(req.params.id, userData);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

app.delete('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await userService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
```

## Middleware Patterns

Custom middleware for authentication, validation, and error handling:

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Authentication middleware
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    req.user = await userService.findById(payload.userId);

    if (!req.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Validation middleware factory
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      }
      next(error);
    }
  };
};

// Error handling middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(error);

  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.errors,
    });
  }

  if (error.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.status(500).json({ error: 'Internal server error' });
};

// Apply error handler
app.use(errorHandler);
```

## Router Organization

Organize routes into separate router modules:

```typescript
import { Router } from 'express';
import { UserService } from '../services/user.service';
import { authenticate, validate } from '../middleware';
import { createUserSchema, updateUserSchema } from '../schemas';

export const createUserRouter = (userService: UserService) => {
  const router = Router();

  router.post('/', validate(createUserSchema), async (req, res, next) => {
    try {
      const user = await userService.create(req.body);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const user = await userService.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', authenticate, validate(updateUserSchema), async (req, res, next) => {
    try {
      const user = await userService.update(req.params.id, req.body);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', authenticate, async (req, res, next) => {
    try {
      const deleted = await userService.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
};

// Usage in main app
import { createUserRouter } from './routes/users';
const userRouter = createUserRouter(userService);
app.use('/users', userRouter);
```

## Testing Express Routes

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';

describe('User Routes', () => {
  beforeEach(async () => {
    // Setup test database
    await setupTestDb();
  });

  afterEach(async () => {
    // Cleanup test database
    await cleanupTestDb();
  });

  describe('POST /users', () => {
    it('should create a new user with valid data', async () => {
      const response = await request(app)
        .post('/users')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'SecurePass123',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('John Doe');
      expect(response.body.email).toBe('john@example.com');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return 400 when email is invalid', async () => {
      const response = await request(app)
        .post('/users')
        .send({
          name: 'John Doe',
          email: 'invalid-email',
          password: 'SecurePass123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/users')
        .send({ name: 'John Doe' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /users/:id', () => {
    it('should return user when found', async () => {
      const user = await createTestUser({ name: 'John', email: 'john@example.com' });

      const response = await request(app).get(`/users/${user.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(user.id);
      expect(response.body.name).toBe('John');
    });

    it('should return 404 when user not found', async () => {
      const response = await request(app).get('/users/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });
  });

  describe('PUT /users/:id', () => {
    it('should update user with valid data', async () => {
      const user = await createTestUser({ name: 'John', email: 'john@example.com' });
      const token = generateAuthToken(user.id);

      const response = await request(app)
        .put(`/users/${user.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'John Updated' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('John Updated');
    });

    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser({ name: 'John', email: 'john@example.com' });

      const response = await request(app)
        .put(`/users/${user.id}`)
        .send({ name: 'John Updated' });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete user when authenticated', async () => {
      const user = await createTestUser({ name: 'John', email: 'john@example.com' });
      const token = generateAuthToken(user.id);

      const response = await request(app)
        .delete(`/users/${user.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);

      // Verify user was deleted
      const getResponse = await request(app).get(`/users/${user.id}`);
      expect(getResponse.status).toBe(404);
    });
  });
});
```
