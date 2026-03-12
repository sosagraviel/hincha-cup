# Vue 3 Framework Patterns

## Composition API with TypeScript

Vue 3 Composition API with full TypeScript support:

```typescript
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

interface User {
  id: string;
  name: string;
  email: string;
}

interface Props {
  userId?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update', user: User): void;
  (e: 'delete', id: string): void;
}>();

const user = ref<User | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const displayName = computed(() => {
  return user.value ? `${user.value.name} (${user.value.email})` : 'Unknown';
});

async function fetchUser() {
  if (!props.userId) return;

  loading.value = true;
  error.value = null;

  try {
    const response = await fetch(`/api/users/${props.userId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch user');
    }
    user.value = await response.json();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error';
  } finally {
    loading.value = false;
  }
}

function handleUpdate() {
  if (user.value) {
    emit('update', user.value);
  }
}

function handleDelete() {
  if (user.value) {
    emit('delete', user.value.id);
  }
}

onMounted(() => {
  fetchUser();
});
</script>

<template>
  <div class="user-card">
    <div v-if="loading">Loading...</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="user">
      <h3>{{ displayName }}</h3>
      <p>{{ user.email }}</p>
      <button @click="handleUpdate">Edit</button>
      <button @click="handleDelete">Delete</button>
    </div>
  </div>
</template>
```

## Composables (Custom Hooks)

Reusable composition functions:

```typescript
// composables/useUsers.ts
import { ref, Ref } from 'vue';

interface User {
  id: string;
  name: string;
  email: string;
}

export function useUsers() {
  const users = ref<User[]>([]);
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function fetchUsers() {
    loading.value = true;
    error.value = null;

    try {
      const response = await fetch('/api/users');
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      users.value = await response.json();
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('Unknown error');
    } finally {
      loading.value = false;
    }
  }

  async function createUser(userData: Omit<User, 'id'>) {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      throw new Error('Failed to create user');
    }

    const newUser = await response.json();
    users.value.push(newUser);
    return newUser;
  }

  async function updateUser(id: string, userData: Partial<User>) {
    const response = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      throw new Error('Failed to update user');
    }

    const updatedUser = await response.json();
    const index = users.value.findIndex(u => u.id === id);
    if (index !== -1) {
      users.value[index] = updatedUser;
    }
    return updatedUser;
  }

  async function deleteUser(id: string) {
    const response = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete user');
    }

    users.value = users.value.filter(u => u.id !== id);
  }

  return {
    users,
    loading,
    error,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
  };
}
```

## Provide/Inject for Dependency Injection

Share state across components:

```typescript
// App.vue
<script setup lang="ts">
import { provide } from 'vue';
import { useAuth } from '@/composables/useAuth';

const auth = useAuth();
provide('auth', auth);
</script>

// AuthContext.vue (or any child component)
<script setup lang="ts">
import { inject } from 'vue';

const auth = inject('auth');

if (!auth) {
  throw new Error('Auth context not provided');
}

async function login() {
  await auth.login('user@example.com', 'password');
}

function logout() {
  auth.logout();
}
</script>

<template>
  <div v-if="auth.isAuthenticated">
    <p>Welcome, {{ auth.user?.name }}</p>
    <button @click="logout">Logout</button>
  </div>
  <div v-else>
    <button @click="login">Login</button>
  </div>
</template>
```

## Reactivity with computed and watch

```typescript
<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const users = ref<User[]>([]);
const searchTerm = ref('');

// Computed property
const filteredUsers = computed(() => {
  return users.value.filter(user =>
    user.name.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.value.toLowerCase())
  );
});

// Watcher
watch(searchTerm, (newValue, oldValue) => {
  console.log(`Search term changed from "${oldValue}" to "${newValue}"`);
});

// Watch with immediate execution
watch(
  () => props.userId,
  async (userId) => {
    if (userId) {
      await fetchUser(userId);
    }
  },
  { immediate: true }
);
</script>

<template>
  <div>
    <input v-model="searchTerm" placeholder="Search users..." />
    <ul>
      <li v-for="user in filteredUsers" :key="user.id">
        {{ user.name }} - {{ user.email }}
      </li>
    </ul>
  </div>
</template>
```

## Form Handling with v-model

```typescript
<script setup lang="ts">
import { ref, reactive } from 'vue';

interface UserForm {
  name: string;
  email: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  submit?: string;
}

const formData = reactive<UserForm>({
  name: '',
  email: '',
});

const errors = reactive<FormErrors>({});
const submitting = ref(false);

function validate(): boolean {
  errors.name = undefined;
  errors.email = undefined;
  errors.submit = undefined;

  if (!formData.name.trim()) {
    errors.name = 'Name is required';
  } else if (formData.name.length < 2) {
    errors.name = 'Name must be at least 2 characters';
  }

  if (!formData.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    errors.email = 'Invalid email format';
  }

  return !errors.name && !errors.email;
}

async function handleSubmit() {
  if (!validate()) {
    return;
  }

  submitting.value = true;
  errors.submit = undefined;

  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      throw new Error('Failed to create user');
    }

    // Reset form
    formData.name = '';
    formData.email = '';
  } catch (err) {
    errors.submit = 'Failed to save user';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div>
      <label for="name">Name</label>
      <input id="name" v-model="formData.name" type="text" />
      <span v-if="errors.name" class="error">{{ errors.name }}</span>
    </div>

    <div>
      <label for="email">Email</label>
      <input id="email" v-model="formData.email" type="email" />
      <span v-if="errors.email" class="error">{{ errors.email }}</span>
    </div>

    <div v-if="errors.submit" class="error">{{ errors.submit }}</div>

    <button type="submit" :disabled="submitting">
      {{ submitting ? 'Saving...' : 'Save' }}
    </button>
  </form>
</template>
```

## Testing Vue Components

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import UserCard from '@/components/UserCard.vue';
import UserForm from '@/components/UserForm.vue';

describe('UserCard', () => {
  const mockUser = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
  };

  it('should render user information', () => {
    const wrapper = mount(UserCard, {
      props: { user: mockUser },
    });

    expect(wrapper.text()).toContain('John Doe');
    expect(wrapper.text()).toContain('john@example.com');
  });

  it('should emit update event when edit button clicked', async () => {
    const wrapper = mount(UserCard, {
      props: { user: mockUser },
    });

    await wrapper.find('button').trigger('click');

    expect(wrapper.emitted('update')).toBeTruthy();
    expect(wrapper.emitted('update')?.[0]).toEqual([mockUser]);
  });
});

describe('UserForm', () => {
  it('should show validation errors for empty fields', async () => {
    const wrapper = mount(UserForm);

    await wrapper.find('form').trigger('submit.prevent');

    expect(wrapper.text()).toContain('Name is required');
    expect(wrapper.text()).toContain('Email is required');
  });

  it('should call onSubmit with form data when valid', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', name: 'John Doe', email: 'john@example.com' }),
    });

    const wrapper = mount(UserForm);

    await wrapper.find('#name').setValue('John Doe');
    await wrapper.find('#email').setValue('john@example.com');
    await wrapper.find('form').trigger('submit.prevent');

    expect(fetch).toHaveBeenCalledWith(
      '/api/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
      })
    );
  });
});
```

## Testing Composables

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUsers } from '@/composables/useUsers';

global.fetch = vi.fn();

describe('useUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch users', async () => {
    const mockUsers = [
      { id: '1', name: 'John', email: 'john@example.com' },
      { id: '2', name: 'Jane', email: 'jane@example.com' },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUsers,
    } as Response);

    const { users, loading, fetchUsers } = useUsers();

    expect(loading.value).toBe(false);

    await fetchUsers();

    expect(users.value).toEqual(mockUsers);
    expect(loading.value).toBe(false);
  });

  it('should create user and update state', async () => {
    const newUser = { id: '2', name: 'Jane', email: 'jane@example.com' };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => newUser,
    } as Response);

    const { users, createUser } = useUsers();

    await createUser({ name: 'Jane', email: 'jane@example.com' });

    expect(users.value).toHaveLength(1);
    expect(users.value[0]).toEqual(newUser);
  });
});
```
