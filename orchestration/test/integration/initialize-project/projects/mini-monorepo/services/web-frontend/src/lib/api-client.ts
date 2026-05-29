const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3050';

interface LoginInput {
  username: string;
  password: string;
}

interface User {
  id: string;
  email: string;
  displayName: string;
}

export const apiClient = {
  async login(input: LoginInput): Promise<{ accessToken: string }> {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`login failed: ${response.status}`);
    return response.json();
  },

  async me(): Promise<User> {
    const response = await fetch(`${BASE_URL}/users/me`);
    if (!response.ok) throw new Error(`me failed: ${response.status}`);
    return response.json();
  },
};
