import axios from 'axios';
import { API_URL, API_VERSION } from './constants';

const ENDPOINT = `${API_URL}/api/${API_VERSION}`;

const api = axios.create({
  baseURL: ENDPOINT,
  timeout: 10000
});

export default api;

// Singleton for authenticated API
let authenticatedApiInstance: ReturnType<typeof axios.create> | null = null;

// Initialize the authenticated API singleton
export const initializeAuthenticatedApi = (token: string) => {
  authenticatedApiInstance = axios.create({
    baseURL: ENDPOINT,
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  // Set up interceptors for the authenticated API instance
  if (setupAuthenticatedApiInterceptors) {
    setupAuthenticatedApiInterceptors();
  }

  return authenticatedApiInstance;
};

// Function to set up interceptors for authenticated API
let setupAuthenticatedApiInterceptors: (() => void) | null = null;

export const setAuthenticatedApiInterceptors = (setupFn: () => void) => {
  setupAuthenticatedApiInterceptors = setupFn;
  // If the authenticated API is already initialized, set up interceptors immediately
  if (authenticatedApiInstance) {
    setupFn();
  }
};

// Get the authenticated API instance
export const getAuthenticatedApi = () => {
  if (!authenticatedApiInstance) {
    throw new Error(
      'Authenticated API not initialized. Call initializeAuthenticatedApi first.'
    );
  }
  return authenticatedApiInstance;
};

// Update token for existing instance
export const updateAuthenticatedApiToken = (token: string) => {
  if (authenticatedApiInstance) {
    authenticatedApiInstance.defaults.headers.Authorization = `Bearer ${token}`;
  }
};

// Error handling utility
export const handleApiError = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const axiosError = error as {
      response: { status: number; data: { message?: string } };
    };
    console.error(
      'API Error:',
      axiosError.response.status,
      axiosError.response.data
    );
    return {
      status: axiosError.response.status,
      message: axiosError.response.data?.message || 'An error occurred',
      data: axiosError.response.data
    };
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'request' in error
  ) {
    console.error('Network Error:', (error as { request: unknown }).request);
    return {
      status: 0,
      message: 'Network error - no response received',
      data: null
    };
  } else {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('Request Error:', message);
    return {
      status: 0,
      message,
      data: null
    };
  }
};
