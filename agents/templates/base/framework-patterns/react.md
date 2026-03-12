# React Framework Patterns

## Functional Components with TypeScript

Modern React uses functional components with TypeScript:

```typescript
import { FC } from 'react';

interface UserCardProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const UserCard: FC<UserCardProps> = ({ user, onEdit, onDelete }) => {
  return (
    <div className="user-card">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <div className="actions">
        {onEdit && (
          <button onClick={() => onEdit(user.id)}>Edit</button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(user.id)}>Delete</button>
        )}
      </div>
    </div>
  );
};
```

## Custom Hooks

Extract reusable logic into custom hooks:

```typescript
import { useState, useEffect } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        setLoading(true);
        const response = await fetch('/api/users');
        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }
        const data = await response.json();
        setUsers(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, []);

  const createUser = async (userData: Omit<User, 'id'>) => {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      throw new Error('Failed to create user');
    }

    const newUser = await response.json();
    setUsers(prev => [...prev, newUser]);
    return newUser;
  };

  const updateUser = async (id: string, userData: Partial<User>) => {
    const response = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      throw new Error('Failed to update user');
    }

    const updatedUser = await response.json();
    setUsers(prev => prev.map(u => u.id === id ? updatedUser : u));
    return updatedUser;
  };

  const deleteUser = async (id: string) => {
    const response = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete user');
    }

    setUsers(prev => prev.filter(u => u.id !== id));
  };

  return { users, loading, error, createUser, updateUser, deleteUser };
}
```

## Context API for State Management

Share state across components:

```typescript
import { createContext, useContext, useState, FC, ReactNode } from 'react';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const userData = await response.json();
    setUser(userData.user);
    localStorage.setItem('token', userData.token);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('token');
  };

  const value = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

## Performance Optimization with useMemo and useCallback

Optimize expensive computations and callbacks:

```typescript
import { useMemo, useCallback, FC } from 'react';

interface UserListProps {
  users: User[];
  searchTerm: string;
  onUserClick: (id: string) => void;
}

export const UserList: FC<UserListProps> = ({ users, searchTerm, onUserClick }) => {
  // Memoize filtered users to avoid re-filtering on every render
  const filteredUsers = useMemo(() => {
    return users.filter(user =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  // Memoize callback to avoid re-creating function on every render
  const handleUserClick = useCallback((id: string) => {
    onUserClick(id);
  }, [onUserClick]);

  return (
    <ul>
      {filteredUsers.map(user => (
        <li key={user.id} onClick={() => handleUserClick(user.id)}>
          {user.name} - {user.email}
        </li>
      ))}
    </ul>
  );
};
```

## Form Handling with Controlled Components

Handle forms with React state:

```typescript
import { useState, FormEvent, FC } from 'react';

interface UserFormProps {
  initialUser?: User;
  onSubmit: (user: Omit<User, 'id'>) => Promise<void>;
  onCancel: () => void;
}

export const UserForm: FC<UserFormProps> = ({ initialUser, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    name: initialUser?.name || '',
    email: initialUser?.email || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    return newErrors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit(formData);
    } catch (error) {
      setErrors({ submit: 'Failed to save user' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="name">Name</label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
        />
        {errors.name && <span className="error">{errors.name}</span>}
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
        />
        {errors.email && <span className="error">{errors.email}</span>}
      </div>

      {errors.submit && <div className="error">{errors.submit}</div>}

      <div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
};
```

## Testing React Components

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserCard } from './UserCard';
import { UserForm } from './UserForm';

describe('UserCard', () => {
  const mockUser = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
  };

  it('should render user information', () => {
    render(<UserCard user={mockUser} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });

  it('should call onEdit when edit button clicked', () => {
    const onEdit = vi.fn();
    render(<UserCard user={mockUser} onEdit={onEdit} />);

    fireEvent.click(screen.getByText('Edit'));

    expect(onEdit).toHaveBeenCalledWith('1');
  });

  it('should not render edit button when onEdit not provided', () => {
    render(<UserCard user={mockUser} />);

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });
});

describe('UserForm', () => {
  it('should show validation errors for empty fields', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(<UserForm onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('should call onSubmit with form data when valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(<UserForm onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'John Doe' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'john@example.com' },
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
      });
    });
  });

  it('should populate form with initial user data', () => {
    const initialUser = {
      id: '1',
      name: 'Jane Doe',
      email: 'jane@example.com',
    };
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    render(
      <UserForm
        initialUser={initialUser}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    expect(screen.getByLabelText('Name')).toHaveValue('Jane Doe');
    expect(screen.getByLabelText('Email')).toHaveValue('jane@example.com');
  });
});
```

## Testing Custom Hooks

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useUsers } from './useUsers';

// Mock fetch
global.fetch = vi.fn();

describe('useUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch users on mount', async () => {
    const mockUsers = [
      { id: '1', name: 'John', email: 'john@example.com' },
      { id: '2', name: 'Jane', email: 'jane@example.com' },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    } as Response);

    const { result } = renderHook(() => useUsers());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.users).toEqual(mockUsers);
    expect(result.current.error).toBeNull();
  });

  it('should handle fetch error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
    } as Response);

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.users).toEqual([]);
  });

  it('should create user and update state', async () => {
    const existingUsers = [{ id: '1', name: 'John', email: 'john@example.com' }];
    const newUser = { id: '2', name: 'Jane', email: 'jane@example.com' };

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => existingUsers,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => newUser,
      } as Response);

    const { result } = renderHook(() => useUsers());

    await waitFor(() => {
      expect(result.current.users).toEqual(existingUsers);
    });

    await result.current.createUser({ name: 'Jane', email: 'jane@example.com' });

    expect(result.current.users).toHaveLength(2);
    expect(result.current.users[1]).toEqual(newUser);
  });
});
```
