# Next.js Framework Patterns

## App Router (Next.js 13+)

Next.js App Router with Server Components:

```typescript
// app/users/page.tsx - Server Component
import { UserList } from '@/components/UserList';

async function getUsers() {
  const res = await fetch('https://api.example.com/users', {
    cache: 'no-store', // or { next: { revalidate: 3600 } }
  });

  if (!res.ok) {
    throw new Error('Failed to fetch users');
  }

  return res.json();
}

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <div>
      <h1>Users</h1>
      <UserList users={users} />
    </div>
  );
}
```

## Server Actions

Server Actions for mutations:

```typescript
// app/actions/user-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

export async function createUser(formData: FormData) {
  const rawData = {
    name: formData.get('name'),
    email: formData.get('email'),
  };

  const validatedData = createUserSchema.parse(rawData);

  const response = await fetch('https://api.example.com/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validatedData),
  });

  if (!response.ok) {
    throw new Error('Failed to create user');
  }

  revalidatePath('/users');
  redirect('/users');
}

export async function updateUser(id: string, formData: FormData) {
  const rawData = {
    name: formData.get('name'),
    email: formData.get('email'),
  };

  const validatedData = createUserSchema.partial().parse(rawData);

  const response = await fetch(`https://api.example.com/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validatedData),
  });

  if (!response.ok) {
    throw new Error('Failed to update user');
  }

  revalidatePath('/users');
  revalidatePath(`/users/${id}`);
}

export async function deleteUser(id: string) {
  const response = await fetch(`https://api.example.com/users/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete user');
  }

  revalidatePath('/users');
  redirect('/users');
}
```

## Client Components for Interactivity

```typescript
// components/UserForm.tsx
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createUser } from '@/app/actions/user-actions';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Creating...' : 'Create User'}
    </button>
  );
}

export function UserForm() {
  const [state, formAction] = useFormState(createUser, null);

  return (
    <form action={formAction}>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required />
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
      </div>

      <SubmitButton />

      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}
```

## API Routes

API routes in the App Router:

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search');

  try {
    const users = await db.user.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
    });

    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = createUserSchema.parse(body);

    const user = await db.user.create({
      data: validatedData,
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}

// app/api/users/[id]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await db.user.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const validatedData = createUserSchema.partial().parse(body);

    const user = await db.user.update({
      where: { id: params.id },
      data: validatedData,
    });

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await db.user.delete({
      where: { id: params.id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
```

## Data Fetching Patterns

```typescript
// Server Component with streaming
import { Suspense } from 'react';
import { UserList } from '@/components/UserList';
import { UserListSkeleton } from '@/components/UserListSkeleton';

export default function UsersPage() {
  return (
    <div>
      <h1>Users</h1>
      <Suspense fallback={<UserListSkeleton />}>
        <UserListAsync />
      </Suspense>
    </div>
  );
}

async function UserListAsync() {
  const users = await getUsers();
  return <UserList users={users} />;
}

// Revalidation patterns
export const revalidate = 3600; // Revalidate every hour
// OR
export const dynamic = 'force-dynamic'; // Always fresh data
```

## Testing Next.js Components

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserForm } from '@/components/UserForm';
import { createUser } from '@/app/actions/user-actions';

vi.mock('@/app/actions/user-actions');

describe('UserForm', () => {
  it('should render form fields', () => {
    render(<UserForm />);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
  });

  it('should call createUser action on submit', async () => {
    const user = userEvent.setup();
    render(<UserForm />);

    await user.type(screen.getByLabelText('Name'), 'John Doe');
    await user.type(screen.getByLabelText('Email'), 'john@example.com');
    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(createUser).toHaveBeenCalled();
    });
  });
});
```

## Testing API Routes

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GET, POST } from '@/app/api/users/route';
import { NextRequest } from 'next/server';

describe('User API Routes', () => {
  describe('GET /api/users', () => {
    it('should return list of users', async () => {
      const request = new NextRequest('http://localhost:3000/api/users');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('should filter users by search query', async () => {
      const request = new NextRequest('http://localhost:3000/api/users?search=john');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('POST /api/users', () => {
    it('should create a new user with valid data', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'SecurePass123',
      };

      const request = new NextRequest('http://localhost:3000/api/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toHaveProperty('id');
      expect(data.name).toBe('John Doe');
    });

    it('should return 400 for invalid email', async () => {
      const userData = {
        name: 'John Doe',
        email: 'invalid-email',
        password: 'SecurePass123',
      };

      const request = new NextRequest('http://localhost:3000/api/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });
});
```
