# Unit Testing Patterns for Jest

Comprehensive guide to writing effective unit tests with Jest and TypeScript.

## Core Principles

### 1. Test One Thing at a Time

Each test should verify a single behavior:

```typescript
// ✅ Good - focused test
it('should return null when user not found', async () => {
  mockRepository.findOne.mockResolvedValue(null);
  const result = await userService.getUserById('999');
  expect(result).toBeNull();
});

// ❌ Bad - testing multiple things
it('should handle user operations', async () => {
  // Tests finding, creating, updating all in one test
});
```

### 2. Use AAA Pattern

Structure tests as Arrange-Act-Assert:

```typescript
describe('calculateDiscount', () => {
  it('should apply 10% discount for regular customers', () => {
    // Arrange
    const customer = { type: 'regular', totalPurchases: 1000 };
    const orderAmount = 100;

    // Act
    const discount = calculateDiscount(customer, orderAmount);

    // Assert
    expect(discount).toBe(10);
  });
});
```

### 3. Test Behavior, Not Implementation

Focus on what the code does, not how:

```typescript
// ✅ Good - tests behavior
it('should save user to database', async () => {
  await userService.createUser(userData);
  expect(mockRepository.save).toHaveBeenCalled();
});

// ❌ Bad - tests implementation details
it('should call private method _validateUser', async () => {
  // Don't test private methods directly
});
```

## Common Patterns

### Testing Services (NestJS)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserService } from './user.service';
import { User } from './user.entity';

describe('UserService', () => {
  let service: UserService;
  let repository: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            create: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: '1', email: 'test@example.com' } as User;
      repository.findOne.mockResolvedValue(mockUser);

      const result = await service.findById('1');

      expect(result).toEqual(mockUser);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('should return null when user not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findById('999');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create and save new user', async () => {
      const createData = { email: 'new@example.com', password: 'pass123' };
      const newUser = { id: '2', ...createData } as User;

      repository.create.mockReturnValue(newUser as any);
      repository.save.mockResolvedValue(newUser);

      const result = await service.create(createData);

      expect(repository.create).toHaveBeenCalledWith(createData);
      expect(repository.save).toHaveBeenCalledWith(newUser);
      expect(result).toEqual(newUser);
    });

    it('should throw error on duplicate email', async () => {
      repository.save.mockRejectedValue({ code: '23505' }); // PostgreSQL unique violation

      await expect(service.create({ email: 'exists@example.com' }))
        .rejects.toThrow();
    });
  });
});
```

### Testing Utilities and Pure Functions

```typescript
import { formatCurrency, calculateTax, validateEmail } from './helpers';

describe('Helper Functions', () => {
  describe('formatCurrency', () => {
    it('should format positive numbers correctly', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should format negative numbers correctly', () => {
      expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should round to 2 decimal places', () => {
      expect(formatCurrency(1234.567)).toBe('$1,234.57');
    });
  });

  describe('calculateTax', () => {
    it('should calculate 10% tax', () => {
      expect(calculateTax(100, 0.10)).toBe(10);
    });

    it('should return 0 for zero amount', () => {
      expect(calculateTax(0, 0.10)).toBe(0);
    });

    it('should handle decimal rates', () => {
      expect(calculateTax(100, 0.075)).toBe(7.5);
    });
  });

  describe('validateEmail', () => {
    it.each([
      'test@example.com',
      'user+tag@domain.co.uk',
      'name.surname@company.com'
    ])('should return true for valid email: %s', (email) => {
      expect(validateEmail(email)).toBe(true);
    });

    it.each([
      'invalid',
      '@example.com',
      'user@',
      'user @example.com',
      ''
    ])('should return false for invalid email: %s', (email) => {
      expect(validateEmail(email)).toBe(false);
    });
  });
});
```

### Testing with External Dependencies

```typescript
import axios from 'axios';
import { ApiService } from './api.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ApiService', () => {
  let service: ApiService;

  beforeEach(() => {
    service = new ApiService();
    jest.clearAllMocks();
  });

  describe('fetchUser', () => {
    it('should fetch user data from API', async () => {
      const mockData = { id: 1, name: 'John Doe' };
      mockedAxios.get.mockResolvedValue({ data: mockData });

      const result = await service.fetchUser(1);

      expect(result).toEqual(mockData);
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/users/1');
    });

    it('should handle 404 errors', async () => {
      mockedAxios.get.mockRejectedValue({
        response: { status: 404 }
      });

      await expect(service.fetchUser(999))
        .rejects.toThrow('User not found');
    });

    it('should handle network errors', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      await expect(service.fetchUser(1))
        .rejects.toThrow('Network error');
    });
  });
});
```

### Testing Async Code

```typescript
describe('Async Operations', () => {
  it('should handle promises', async () => {
    const result = await asyncFunction();
    expect(result).toBeDefined();
  });

  it('should handle promise rejections', async () => {
    await expect(failingAsyncFunction())
      .rejects.toThrow('Expected error');
  });

  it('should timeout long operations', async () => {
    jest.setTimeout(1000);
    await expect(slowOperation())
      .rejects.toThrow('Timeout');
  }, 1000);
});
```

### Testing Error Handling

```typescript
describe('Error Scenarios', () => {
  it('should throw specific error type', () => {
    expect(() => validateInput(null))
      .toThrow(ValidationError);
  });

  it('should throw with specific message', () => {
    expect(() => validateInput('invalid'))
      .toThrow('Input must be a valid email');
  });

  it('should handle errors gracefully', async () => {
    mockService.getData.mockRejectedValue(new Error('Service unavailable'));

    const result = await serviceWithFallback.getData();

    expect(result).toEqual(defaultData); // Fallback to default
  });
});
```

## Advanced Patterns

### Testing with Timers

```typescript
describe('Delayed Operations', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should call callback after 1 second', () => {
    const callback = jest.fn();
    delayedCall(callback, 1000);

    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);

    expect(callback).toHaveBeenCalled();
  });

  it('should debounce rapid calls', () => {
    const callback = jest.fn();
    const debounced = debounce(callback, 500);

    debounced();
    debounced();
    debounced();

    jest.advanceTimersByTime(500);

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
```

### Testing with Spies

```typescript
describe('Method Spies', () => {
  it('should track method calls', () => {
    const obj = { method: () => 'original' };
    const spy = jest.spyOn(obj, 'method');

    obj.method();
    obj.method();

    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });

  it('should mock implementation temporarily', () => {
    const obj = { getValue: () => 42 };
    const spy = jest.spyOn(obj, 'getValue').mockReturnValue(100);

    expect(obj.getValue()).toBe(100);

    spy.mockRestore();
    expect(obj.getValue()).toBe(42);
  });
});
```

### Parameterized Tests

```typescript
describe('Parameterized Tests', () => {
  describe.each([
    { input: 'admin', expected: true },
    { input: 'user', expected: false },
    { input: 'guest', expected: false }
  ])('isAdmin($input)', ({ input, expected }) => {
    it(`should return ${expected}`, () => {
      expect(isAdmin(input)).toBe(expected);
    });
  });

  it.each([
    [0, 0],
    [1, 1],
    [2, 4],
    [3, 9],
    [4, 16]
  ])('square(%i) should equal %i', (input, expected) => {
    expect(square(input)).toBe(expected);
  });
});
```

## Best Practices

### 1. Clear Test Names

```typescript
// ✅ Good - descriptive names
it('should return 401 when token is expired', ...)
it('should retry 3 times before failing', ...)
it('should sanitize HTML from user input', ...)

// ❌ Bad - vague names
it('works', ...)
it('test user', ...)
it('should do stuff', ...)
```

### 2. Arrange Data Clearly

```typescript
// ✅ Good - clear test data
const validUser = {
  id: '123',
  email: 'test@example.com',
  role: 'user',
  active: true
};

// ❌ Bad - magic values
const user = { id: 'abc', email: 'x', role: 'y', active: true };
```

### 3. Use Test Factories

```typescript
// test/factories/user.factory.ts
export function createMockUser(overrides = {}) {
  return {
    id: faker.datatype.uuid(),
    email: faker.internet.email(),
    name: faker.name.fullName(),
    createdAt: new Date(),
    ...overrides
  };
}

// In tests
const user = createMockUser({ role: 'admin' });
```

### 4. Keep Tests Independent

```typescript
// ✅ Good - isolated tests
beforeEach(() => {
  service = new UserService();
  jest.clearAllMocks();
});

// ❌ Bad - tests depend on each other
let sharedUser;

it('creates user', () => {
  sharedUser = service.create(...);
});

it('updates user', () => {
  service.update(sharedUser.id, ...); // Depends on previous test
});
```

### 5. Mock Only What's Necessary

```typescript
// ✅ Good - mock external dependencies only
const mockRepository = {
  findOne: jest.fn(),
  save: jest.fn()
};

// ❌ Bad - over-mocking
const mockEverything = {
  method1: jest.fn(),
  method2: jest.fn(),
  method3: jest.fn(),
  // ... mocking everything
};
```

## Common Pitfalls

### 1. Testing Implementation Details

```typescript
// ❌ Avoid
it('should call private method', () => {
  // Testing private methods couples tests to implementation
});

// ✅ Test behavior instead
it('should validate user data', () => {
  // Test the public API
});
```

### 2. Brittle Assertions

```typescript
// ❌ Brittle - breaks on any object change
expect(result).toEqual({ id: 1, name: 'John', age: 30, ...manyMoreFields });

// ✅ Flexible - tests only what matters
expect(result).toMatchObject({ id: 1, name: 'John' });
```

### 3. Not Testing Edge Cases

```typescript
// ❌ Incomplete
it('should process array', () => {
  expect(process([1, 2, 3])).toBeDefined();
});

// ✅ Complete
describe('process', () => {
  it('should handle normal arrays', () => { ... });
  it('should handle empty arrays', () => { ... });
  it('should handle null input', () => { ... });
  it('should handle undefined input', () => { ... });
  it('should handle arrays with duplicates', () => { ... });
});
```

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Testing Best Practices - Microsoft](https://devblogs.microsoft.com/ise/jest-mocking-best-practices/)
- [Unit Testing for TypeScript & Node.js](https://www.udemy.com/course/unit-testing-typescript-nodejs/)
