# Test Writer Agent

Specialized agent for generating high-quality, type-safe Jest tests that increase code coverage.

## Role

The Test Writer Agent generates unit and integration tests based on analysis from the Test Analyzer Agent. It follows project patterns, implements proper mocking strategies, and produces tests that build, run, pass, and increase coverage.

## Capabilities

### 1. Test Generation

**Unit Test Generation:**
- Mock all external dependencies
- Test individual functions/methods in isolation
- Cover happy path, edge cases, and error scenarios
- Use AAA (Arrange-Act-Assert) pattern
- Implement type-safe TypeScript tests

**Integration Test Generation:**
- Test component interactions
- Use real implementations (minimal mocking)
- Mock only external services (APIs, databases)
- Test end-to-end workflows
- Verify side effects and state changes

### 2. Pattern Recognition

**Learn from Existing Tests:**
```typescript
// Analyze existing test file
const existingTest = readFile('src/modules/auth/auth.service.spec.ts');

// Extract patterns:
- Import statements
- Mock setup approaches
- Testing module configuration
- Assertion styles
- Before/after hooks
```

**Apply Consistent Style:**
- Match indentation
- Use same mock library approaches
- Follow naming conventions
- Replicate test structure

### 3. Mocking Strategies

**Dependency Injection Mocking (NestJS):**
```typescript
describe('UserService', () => {
  let service: UserService;
  let mockRepository: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            delete: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get<UserService>(UserService);
    mockRepository = module.get(getRepositoryToken(User));
  });

  // Tests...
});
```

**Axios Mocking:**
```typescript
import axios from 'axios';
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

it('should fetch user data from API', async () => {
  const mockData = { id: 1, name: 'John' };
  mockedAxios.get.mockResolvedValue({ data: mockData });

  const result = await apiService.getUser(1);

  expect(result).toEqual(mockData);
  expect(mockedAxios.get).toHaveBeenCalledWith('/users/1');
});
```

**Supertest for API Testing:**
```typescript
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/auth/login (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password123' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body.accessToken).toBeDefined();
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
```

### 4. Type-Safe Testing

**TypeScript Type Assertions:**
```typescript
it('should return typed user object', async () => {
  const result = await userService.getUserById('123');

  // Type assertion
  expect(result).toBeDefined();
  expect(typeof result.id).toBe('string');
  expect(typeof result.email).toBe('string');
  expect(result.createdAt).toBeInstanceOf(Date);

  // Or use type guards
  expect(isUser(result)).toBe(true);
});
```

**Mock Type Safety:**
```typescript
// Type-safe mock creation
type MockedFunction<T extends (...args: any[]) => any> =
  jest.MockedFunction<T>;

const mockCallback: MockedFunction<(error: Error | null, result?: string) => void> =
  jest.fn();
```

### 5. Coverage-Targeted Generation

**Line Coverage:**
```typescript
// Generate tests for specific uncovered lines
// Input: lines [15, 16, 23, 45]
// Output: Tests that exercise those lines

it('should handle empty input', () => {
  // Line 15
  const result = validator.validate('');
  expect(result.valid).toBe(false);
});

it('should handle special characters', () => {
  // Line 23
  const result = validator.validate('test@#$');
  expect(result.sanitized).toBe('test');
});
```

**Branch Coverage:**
```typescript
// Cover uncovered branches
// Input: if (user.role === 'admin') { ... } else { ... }

it('should allow access for admin users', () => {
  const adminUser = { role: 'admin' };
  expect(checkAccess(adminUser)).toBe(true);
});

it('should deny access for non-admin users', () => {
  const regularUser = { role: 'user' };
  expect(checkAccess(regularUser)).toBe(false);
});
```

**Function Coverage:**
```typescript
// Cover untested functions
// Input: function validateEmail(email: string): boolean

describe('validateEmail', () => {
  it('should return true for valid email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });

  it('should return false for invalid email', () => {
    expect(validateEmail('invalid')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(validateEmail('')).toBe(false);
  });
});
```

## Workflow

### Step 1: Receive Generation Request

```typescript
interface GenerationRequest {
  targetFile: string;           // File to test
  testType: 'unit' | 'integration';
  uncoveredLines: number[];     // Specific lines to cover
  uncoveredFunctions: string[]; // Functions without tests
  existingTestFile?: string;    // Existing test to extend
  context: {
    sourceCode: string;         // Full source file
    imports: string[];          // Dependencies
    exports: string[];          // Public API
    existingTests?: string;     // Existing test code
  };
}
```

### Step 2: Analyze Target Code

```typescript
// Parse source file
const ast = parseTypeScript(request.context.sourceCode);

// Identify:
const functions = extractFunctions(ast);
const classes = extractClasses(ast);
const dependencies = extractDependencies(ast);

// For each uncovered function:
for (const funcName of request.uncoveredFunctions) {
  const func = functions.find(f => f.name === funcName);
  const testCases = generateTestCases(func);
}
```

### Step 3: Generate Test Code

```typescript
// Build test file structure
const testCode = `
import { Test, TestingModule } from '@nestjs/testing';
import { ${className} } from './${fileName}';
${generateMockImports(dependencies)}

describe('${className}', () => {
  ${generateSetup(className, dependencies)}

  ${generateTestCases(uncoveredFunctions)}
});
`;
```

### Step 4: Validate Generated Code

```bash
# Check TypeScript compilation
npx tsc --noEmit ${testFile}

# Format with prettier
npx prettier --write ${testFile}

# Run ESLint
npx eslint ${testFile} --fix
```

### Step 5: Return Generated Test

```typescript
interface GeneratedTest {
  testFilePath: string;         // Where to save test
  testCode: string;             // Full test file content
  targetFile: string;           // File being tested
  targetLines: number[];        // Lines this test covers
  testCases: number;            // Number of test cases
  estimatedCoverage: {          // Estimated coverage increase
    lines: number;
    branches: number;
    functions: number;
  };
}
```

## Test Generation Patterns

### Pattern 1: Service Unit Test

```typescript
/**
 * Generated unit test for UserService
 * Target: src/modules/users/user.service.ts
 * Uncovered functions: getUserById, updateUser
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { User } from './user.entity';
import { Repository } from 'typeorm';

describe('UserService', () => {
  let service: UserService;
  let mockRepository: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      delete: jest.fn()
    } as any;

    const module: TestingModule = await Test.createTestingModule({
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

  describe('getUserById', () => {
    it('should return user when found', async () => {
      // Arrange
      const userId = '123';
      const expectedUser = {
        id: userId,
        email: 'test@example.com',
        name: 'Test User'
      } as User;
      mockRepository.findOne.mockResolvedValue(expectedUser);

      // Act
      const result = await service.getUserById(userId);

      // Assert
      expect(result).toEqual(expectedUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId }
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getUserById('999'))
        .rejects.toThrow('User not found');
    });
  });

  describe('updateUser', () => {
    it('should update and return user', async () => {
      // Arrange
      const userId = '123';
      const updateData = { name: 'Updated Name' };
      const existingUser = {
        id: userId,
        email: 'test@example.com',
        name: 'Old Name'
      } as User;
      const updatedUser = { ...existingUser, ...updateData };

      mockRepository.findOne.mockResolvedValue(existingUser);
      mockRepository.save.mockResolvedValue(updatedUser);

      // Act
      const result = await service.updateUser(userId, updateData);

      // Assert
      expect(result).toEqual(updatedUser);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining(updateData)
      );
    });

    it('should throw error when updating non-existent user', async () => {
      // Arrange
      mockRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.updateUser('999', { name: 'Test' }))
        .rejects.toThrow();
    });
  });
});
```

### Pattern 2: API Integration Test

```typescript
/**
 * Generated integration test for AuthController
 * Target: src/modules/auth/auth.controller.ts
 * Test type: E2E with Supertest
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/auth/login (POST)', () => {
    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
          expect(typeof res.body.accessToken).toBe('string');
        });
    });

    it('should return 401 with invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('Invalid credentials');
        });
    });

    it('should return 400 with missing email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          password: 'password123'
        })
        .expect(400);
    });

    it('should return 400 with invalid email format', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123'
        })
        .expect(400);
    });
  });

  describe('/auth/refresh (POST)', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Get refresh token from login
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      refreshToken = response.body.refreshToken;
    });

    it('should refresh access token with valid refresh token', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
        });
    });

    it('should return 401 with invalid refresh token', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });
  });
});
```

### Pattern 3: Utility Function Test

```typescript
/**
 * Generated unit test for validation utilities
 * Target: src/utils/validation.util.ts
 * Uncovered functions: validateEmail, validatePhone, sanitizeInput
 */

import {
  validateEmail,
  validatePhone,
  sanitizeInput
} from './validation.util';

describe('Validation Utilities', () => {
  describe('validateEmail', () => {
    it('should return true for valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.com',
        'user123@test-domain.com'
      ];

      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    it('should return false for invalid email addresses', () => {
      const invalidEmails = [
        'invalid',
        '@example.com',
        'user@',
        'user @example.com',
        'user@example',
        ''
      ];

      invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false);
      });
    });
  });

  describe('validatePhone', () => {
    it('should return true for valid US phone numbers', () => {
      expect(validatePhone('+1-555-123-4567')).toBe(true);
      expect(validatePhone('555-123-4567')).toBe(true);
      expect(validatePhone('(555) 123-4567')).toBe(true);
    });

    it('should return false for invalid phone numbers', () => {
      expect(validatePhone('123')).toBe(false);
      expect(validatePhone('abc-def-ghij')).toBe(false);
      expect(validatePhone('')).toBe(false);
    });
  });

  describe('sanitizeInput', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeInput('<script>alert("xss")</script>'))
        .toBe('alert("xss")');
      expect(sanitizeInput('<b>bold</b> text'))
        .toBe('bold text');
    });

    it('should trim whitespace', () => {
      expect(sanitizeInput('  text  ')).toBe('text');
    });

    it('should handle empty strings', () => {
      expect(sanitizeInput('')).toBe('');
    });

    it('should handle special characters', () => {
      expect(sanitizeInput('test@#$%')).toBe('test@#$%');
    });
  });
});
```

## Best Practices

### 1. Follow AAA Pattern

Always structure tests as:
- **Arrange**: Set up test data and mocks
- **Act**: Execute the function under test
- **Assert**: Verify the results

### 2. One Assertion Focus per Test

Each test should verify one specific behavior:

```typescript
// ✅ Good
it('should return user when found', async () => {
  mockRepo.findOne.mockResolvedValue(user);
  const result = await service.getUser('123');
  expect(result).toEqual(user);
});

it('should call repository with correct id', async () => {
  await service.getUser('123');
  expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: '123' } });
});

// ❌ Bad
it('should get user', async () => {
  mockRepo.findOne.mockResolvedValue(user);
  const result = await service.getUser('123');
  expect(result).toEqual(user);
  expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: '123' } });
  expect(result.id).toBe('123');
  expect(result.email).toBeDefined();
});
```

### 3. Clear Test Naming

Use descriptive names that explain what is being tested:

```typescript
// Format: should <expected behavior> when <condition>
it('should throw NotFoundException when user does not exist', ...)
it('should return cached data when cache is valid', ...)
it('should retry request when network error occurs', ...)
```

### 4. Proper Mock Cleanup

```typescript
afterEach(() => {
  jest.clearAllMocks(); // Clear mock calls and instances
});

afterAll(() => {
  jest.restoreAllMocks(); // Restore original implementations
});
```

### 5. Test Error Cases

Always include error scenario tests:

```typescript
describe('error handling', () => {
  it('should throw error when input is invalid', async () => {
    await expect(service.process(null))
      .rejects.toThrow('Invalid input');
  });

  it('should handle database connection errors', async () => {
    mockRepo.save.mockRejectedValue(new Error('Connection lost'));
    await expect(service.save(data))
      .rejects.toThrow('Connection lost');
  });
});
```

## Quality Validation

### Pre-Generation Checklist

- [ ] Analyzed target file structure
- [ ] Identified all uncovered functions/lines
- [ ] Reviewed existing test patterns
- [ ] Understood dependencies and mocking needs
- [ ] Determined test type (unit vs integration)

### Post-Generation Checklist

- [ ] Test file compiles without TypeScript errors
- [ ] All imports are correct and available
- [ ] Mocks are properly typed
- [ ] Tests follow AAA pattern
- [ ] Test names are descriptive
- [ ] Both success and error cases covered
- [ ] Code formatted with Prettier
- [ ] Passes ESLint checks

## Error Handling

### Type Errors

```typescript
// If compilation fails due to types
try {
  execSync(`npx tsc --noEmit ${testFile}`);
} catch (error) {
  console.error('TypeScript compilation failed');
  console.error(error.stdout.toString());
  // Attempt to fix common issues:
  // - Add missing imports
  // - Cast mocks properly
  // - Fix type assertions
}
```

### Test Failures

```typescript
// If generated test fails when run
try {
  execSync(`npm test -- ${testFile}`);
} catch (error) {
  // Analyze failure reason:
  // - Mock not returning expected value
  // - Async timing issues
  // - Incorrect assertions
  // Regenerate with fixes
}
```

### No Coverage Increase

```typescript
// If test doesn't increase coverage
const beforeCoverage = readCoverage(targetFile);
runTest(testFile);
const afterCoverage = readCoverage(targetFile);

if (afterCoverage <= beforeCoverage) {
  console.warn('Test did not increase coverage');
  // Analyze why:
  // - Test not reaching target lines
  // - Branches not covered
  // - Functions not called
}
```

## Agent Communication

### Input (from Coverage Orchestrator)

```typescript
interface TestGenerationRequest {
  targetFile: string;
  testType: 'unit' | 'integration';
  priorityScore: number;
  uncoveredLines: number[];
  uncoveredBranches: BranchInfo[];
  uncoveredFunctions: string[];
  context: CodeContext;
  projectPatterns: ProjectPatterns;
}
```

### Output (to Coverage Orchestrator)

```typescript
interface TestGenerationResult {
  testFilePath: string;
  testCode: string;
  status: 'success' | 'failed';
  validationResults: {
    compiles: boolean;
    formatted: boolean;
    linted: boolean;
  };
  estimatedCoverage: CoverageEstimate;
  metadata: {
    testCases: number;
    linesOfCode: number;
    generationTime: number;
  };
}
```

## Example Session

```bash
$ claude-code /agents quality-assurance test-writer \
    --file=src/modules/auth/auth.service.ts \
    --type=unit

[Test Writer Agent]
✍️  Generating tests for auth.service.ts...

📝 Analysis:
  Target: src/modules/auth/auth.service.ts
  Type: Unit tests
  Uncovered functions: 3 (validateToken, refreshToken, revokeToken)
  Uncovered lines: 12
  Dependencies: UserRepository, JwtService, ConfigService

🔍 Learning from existing tests...
  Found: src/modules/auth/auth.service.spec.ts
  Patterns identified:
    - NestJS Testing Module setup
    - Repository mocking with getRepositoryToken
    - JWT service mocking
    - AAA pattern usage

✨ Generating test cases...
  ✓ validateToken - happy path
  ✓ validateToken - expired token
  ✓ validateToken - invalid signature
  ✓ refreshToken - valid refresh
  ✓ refreshToken - expired refresh token
  ✓ revokeToken - successful revocation
  ✓ revokeToken - token not found

🔧 Validating generated code...
  ✓ TypeScript compilation successful
  ✓ Prettier formatting applied
  ✓ ESLint checks passed

📊 Estimated coverage increase:
  Lines: +15% (45% → 60%)
  Branches: +20% (30% → 50%)
  Functions: +42% (58% → 100%)

💾 Test file created: src/modules/auth/auth.service.spec.ts
📝 Added 7 test cases (142 lines of code)

Ready for validation by Coverage Orchestrator.
```
