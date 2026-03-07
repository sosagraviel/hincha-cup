# Mocking Strategies for Jest

Comprehensive guide to mocking dependencies, modules, and external services in Jest tests.

## Core Mocking Techniques

### 1. Mock Functions

```typescript
// Create a mock function
const mockCallback = jest.fn();

// With implementation
const mockCallback = jest.fn(x => x * 2);

// With return value
const mockCallback = jest.fn().mockReturnValue(42);

// With resolved promise
const mockAsync = jest.fn().mockResolvedValue({ data: 'success' });

// With rejected promise
const mockFailing = jest.fn().mockRejectedValue(new Error('Failed'));
```

### 2. Module Mocking

```typescript
// Mock entire module
jest.mock('./user.service');

// Mock with implementation
jest.mock('./user.service', () => ({
  UserService: jest.fn().mockImplementation(() => ({
    getUser: jest.fn().mockResolvedValue({ id: 1 })
  }))
}));

// Partial mock (keep some real implementations)
jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  formatDate: jest.fn().mockReturnValue('2025-01-21')
}));
```

### 3. Mocking TypeScript Modules

```typescript
import { UserService } from './user.service';
import { User } from './user.entity';

jest.mock('./user.service');

describe('UserController', () => {
  let mockUserService: jest.Mocked<UserService>;

  beforeEach(() => {
    mockUserService = new UserService() as jest.Mocked<UserService>;
    mockUserService.findById = jest.fn();
  });

  it('should get user', async () => {
    const mockUser: User = { id: '1', email: 'test@example.com' };
    mockUserService.findById.mockResolvedValue(mockUser);

    const result = await controller.getUser('1');

    expect(result).toEqual(mockUser);
  });
});
```

## Mocking External Dependencies

### Axios Mocking

#### Approach 1: jest.mock()

```typescript
import axios from 'axios';
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch data from API', async () => {
    const mockData = { id: 1, name: 'Test' };
    mockedAxios.get.mockResolvedValue({ data: mockData });

    const result = await apiService.getData(1);

    expect(result).toEqual(mockData);
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/data/1');
  });

  it('should handle HTTP errors', async () => {
    mockedAxios.get.mockRejectedValue({
      response: { status: 404, data: { message: 'Not found' } }
    });

    await expect(apiService.getData(999))
      .rejects.toThrow('Not found');
  });
});
```

#### Approach 2: axios-mock-adapter

```typescript
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

describe('ApiService', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.restore();
  });

  it('should fetch user data', async () => {
    mock.onGet('/users/1').reply(200, { id: 1, name: 'John' });

    const result = await apiService.getUser(1);

    expect(result.name).toBe('John');
  });

  it('should handle network errors', async () => {
    mock.onGet('/users/1').networkError();

    await expect(apiService.getUser(1))
      .rejects.toThrow('Network Error');
  });
});
```

### TypeORM Repository Mocking

```typescript
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './user.entity';

describe('UserService', () => {
  let mockRepository: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
        getOne: jest.fn()
      }))
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository
        }
      ]
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should find user by email', async () => {
    const mockUser = { id: '1', email: 'test@example.com' };
    mockRepository.findOne.mockResolvedValue(mockUser);

    const result = await service.findByEmail('test@example.com');

    expect(result).toEqual(mockUser);
    expect(mockRepository.findOne).toHaveBeenCalledWith({
      where: { email: 'test@example.com' }
    });
  });
});
```

### Environment Variables

```typescript
describe('Config Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use development config', () => {
    process.env.NODE_ENV = 'development';
    const config = new ConfigService();
    expect(config.isDevelopment()).toBe(true);
  });

  it('should use production config', () => {
    process.env.NODE_ENV = 'production';
    process.env.API_URL = 'https://api.prod.com';
    const config = new ConfigService();
    expect(config.apiUrl).toBe('https://api.prod.com');
  });
});
```

## NestJS-Specific Mocking

### Mocking Dependencies in NestJS

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserService } from '../users/user.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserService: jest.Mocked<UserService>;
  let mockJwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    mockUserService = {
      findByEmail: jest.fn(),
      validatePassword: jest.fn()
    } as any;

    mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn()
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: mockUserService
        },
        {
          provide: JwtService,
          useValue: mockJwtService
        }
      ]
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('should login successfully', async () => {
    const mockUser = { id: '1', email: 'test@example.com' };
    mockUserService.findByEmail.mockResolvedValue(mockUser);
    mockUserService.validatePassword.mockResolvedValue(true);
    mockJwtService.sign.mockReturnValue('mock-jwt-token');

    const result = await authService.login('test@example.com', 'password');

    expect(result.accessToken).toBe('mock-jwt-token');
  });
});
```

### Mocking Guards and Interceptors

```typescript
import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

describe('Protected Endpoint', () => {
  let mockAuthGuard: AuthGuard;

  beforeEach(async () => {
    mockAuthGuard = { canActivate: jest.fn(() => true) } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [UserService]
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    controller = module.get<UserController>(UserController);
  });

  it('should allow access with valid auth', async () => {
    const result = await controller.getProfile();
    expect(result).toBeDefined();
  });
});
```

## Advanced Mocking Patterns

### Spy on Class Methods

```typescript
describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
  });

  it('should call internal validation method', async () => {
    const spy = jest.spyOn(service as any, '_validateUser');
    spy.mockReturnValue(true);

    await service.createUser(userData);

    expect(spy).toHaveBeenCalledWith(userData);

    spy.mockRestore();
  });
});
```

### Partial Mocking with Real Implementation

```typescript
import * as utils from './utils';

describe('Service with Utils', () => {
  it('should use real implementation for some utils', () => {
    // Spy on specific function
    jest.spyOn(utils, 'formatDate').mockReturnValue('2025-01-21');

    // Other functions use real implementation
    const result = service.process();

    expect(utils.formatDate).toHaveBeenCalled();
    // Other utils.* functions work normally
  });
});
```

### Mock Implementation Changes

```typescript
describe('Dynamic Mocking', () => {
  let mockService: jest.Mocked<DataService>;

  beforeEach(() => {
    mockService = {
      getData: jest.fn()
    } as any;
  });

  it('should handle different responses', async () => {
    // First call returns success
    mockService.getData.mockResolvedValueOnce({ success: true });

    // Second call returns error
    mockService.getData.mockRejectedValueOnce(new Error('Failed'));

    // Third call returns different data
    mockService.getData.mockResolvedValueOnce({ success: true, data: 'new' });

    await expect(service.fetch()).resolves.toBeDefined();
    await expect(service.fetch()).rejects.toThrow();
    await expect(service.fetch()).resolves.toMatchObject({ data: 'new' });
  });
});
```

### Mock Timers

```typescript
describe('Scheduled Tasks', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should execute task after delay', () => {
    const callback = jest.fn();
    scheduler.scheduleTask(callback, 5000);

    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5000);

    expect(callback).toHaveBeenCalled();
  });

  it('should handle setInterval', () => {
    const callback = jest.fn();
    const interval = setInterval(callback, 1000);

    jest.advanceTimersByTime(3500);

    expect(callback).toHaveBeenCalledTimes(3);

    clearInterval(interval);
  });
});
```

## Best Practices

### 1. Clear Mock Setup and Cleanup

```typescript
describe('Service Tests', () => {
  let mockDependency: jest.Mocked<Dependency>;

  beforeEach(() => {
    mockDependency = {
      method: jest.fn()
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks(); // Clear call history
  });

  afterAll(() => {
    jest.restoreAllMocks(); // Restore original implementations
  });
});
```

### 2. Type-Safe Mocks

```typescript
// ✅ Good - type-safe
const mockRepository: jest.Mocked<Repository<User>> = {
  findOne: jest.fn(),
  save: jest.fn()
} as any;

// ❌ Bad - untyped
const mockRepository = {
  findOne: jest.fn(),
  save: jest.fn()
};
```

### 3. Meaningful Mock Data

```typescript
// ✅ Good - realistic data
const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'john.doe@example.com',
  firstName: 'John',
  lastName: 'Doe',
  createdAt: new Date('2025-01-01')
};

// ❌ Bad - magic values
const mockUser = {
  id: '1',
  email: 'test',
  name: 'x'
};
```

### 4. Mock Only External Dependencies

```typescript
// ✅ Good - mock database, HTTP, file system
jest.mock('typeorm');
jest.mock('axios');
jest.mock('fs');

// ❌ Bad - mocking internal business logic
jest.mock('./business-logic'); // Test the real thing
```

### 5. Restore Mocks Between Tests

```typescript
describe('Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();    // Clear calls and instances
    jest.resetAllMocks();    // Reset return values
    jest.restoreAllMocks();  // Restore original implementations
  });
});
```

## Common Pitfalls

### 1. Forgetting to Mock Async Functions

```typescript
// ❌ Wrong
mockService.getData = jest.fn(() => { data: 'test' });

// ✅ Correct
mockService.getData = jest.fn().mockResolvedValue({ data: 'test' });
```

### 2. Not Typing Mocks Properly

```typescript
// ❌ Loses type safety
const mock = jest.fn();

// ✅ Type-safe
const mock = jest.fn<Promise<User>, [string]>();
```

### 3. Over-Mocking

```typescript
// ❌ Mocking too much
jest.mock('./everything');

// ✅ Mock only what's necessary
jest.mock('./external-api');
// Use real implementations for internal code
```

## Resources

- [Jest Mock Functions](https://jestjs.io/docs/mock-functions)
- [Jest Mocking Best Practices - Microsoft](https://devblogs.microsoft.com/ise/jest-mocking-best-practices/)
- [Mocking with Jest in TypeScript](https://medium.com/@vivek.murarka/mocking-with-jest-in-typescript-javascript-d203699cc617)
