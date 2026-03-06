import { createContext, useEffect, useState, type ReactNode } from 'react';
import keycloak from '@/shared/lib/keycloak';
import type { KeycloakProfile } from 'keycloak-js';
import type {
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError
} from 'axios';
import api from '@/shared/lib/axios';
import { isTokenExpired } from '@/shared/lib/utils';
import {
  initializeAuthenticatedApi,
  updateAuthenticatedApiToken,
  getAuthenticatedApi,
  setAuthenticatedApiInterceptors
} from '@/shared/lib/axios';

export interface KeycloakContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updatePassword: () => Promise<void>;
  resetPassword: () => Promise<void>;
  token: string;
  userProfile: {
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null;
}

const KeycloakContext = createContext<KeycloakContextType>({
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  resetPassword: async () => {},
  updatePassword: async () => {},
  token: '',
  userProfile: null
});

export interface KeycloakProviderProps {
  children: ReactNode;
}

export const KeycloakProvider = ({ children }: KeycloakProviderProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<KeycloakProfile | null>(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    const initKeycloak = async () => {
      try {
        const authenticated = await keycloak.init({
          onLoad: 'login-required'
        });
        setIsAuthenticated(authenticated);
        if (authenticated) {
          const profile = await keycloak.loadUserProfile();
          const currentToken = keycloak.token ?? '';
          setToken(currentToken);
          setUserProfile(profile);

          // Initialize the authenticated API singleton
          initializeAuthenticatedApi(currentToken);
        }
      } catch (error) {
        console.error('Failed to initialize Keycloak:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initKeycloak();
  }, []);

  const updateToken = async () => {
    try {
      const refreshed = await keycloak.updateToken(70); // Refresh if token expires in 70 seconds
      if (refreshed) {
        const newToken = keycloak.token ?? '';
        setToken(newToken);
        // Update the authenticated API singleton with new token
        updateAuthenticatedApiToken(newToken);
        console.log('Token refreshed successfully');
      }
      return refreshed;
    } catch (error) {
      console.error('Failed to update token:', error);
      // Token refresh failed, redirect to login
      await keycloak.login();
      return false;
    }
  };

  useEffect(() => {
    // Request interceptor to add auth token
    const requestInterceptor = api.interceptors.request.use(
      async config => {
        // Check if token is expired or will expire soon
        if (keycloak.token && isTokenExpired(keycloak.token)) {
          await updateToken();
        }

        // Add authorization header if token exists
        if (keycloak.token) {
          config.headers.Authorization = `Bearer ${keycloak.token}`;
        }

        return config;
      },
      error => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle auth errors
    const responseInterceptor = api.interceptors.response.use(
      response => {
        return response;
      },
      async error => {
        const originalRequest = error.config;

        // Handle 401 Unauthorized errors
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // Try to refresh the token
            const refreshed = await updateToken();
            if (refreshed && keycloak.token) {
              // Retry the original request with new token
              originalRequest.headers.Authorization = `Bearer ${keycloak.token}`;
              return api(originalRequest);
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            // Redirect to login if refresh fails
            await keycloak.login();
          }
        }

        return Promise.reject(error);
      }
    );

    // Set up interceptors for authenticated API instance
    const setupAuthenticatedApiInterceptors = () => {
      const authenticatedApi = getAuthenticatedApi();

      // Request interceptor for authenticated API
      const authRequestInterceptor = authenticatedApi.interceptors.request.use(
        async (config: InternalAxiosRequestConfig) => {
          // Check if token is expired or will expire soon
          if (keycloak.token && isTokenExpired(keycloak.token)) {
            await updateToken();
          }

          // Add authorization header if token exists
          if (keycloak.token) {
            config.headers.Authorization = `Bearer ${keycloak.token}`;
          }

          return config;
        },
        (error: AxiosError) => {
          return Promise.reject(error);
        }
      );

      // Response interceptor for authenticated API
      const authResponseInterceptor =
        authenticatedApi.interceptors.response.use(
          (response: AxiosResponse) => {
            return response;
          },
          async (
            error: AxiosError & {
              config: InternalAxiosRequestConfig & { _retry?: boolean };
            }
          ) => {
            const originalRequest = error.config;

            // Handle 401 Unauthorized errors
            if (error.response?.status === 401 && !originalRequest._retry) {
              originalRequest._retry = true;

              try {
                // Try to refresh the token
                const refreshed = await updateToken();
                if (refreshed && keycloak.token) {
                  // Retry the original request with new token
                  originalRequest.headers.Authorization = `Bearer ${keycloak.token}`;
                  return authenticatedApi(originalRequest);
                }
              } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                // Redirect to login if refresh fails
                await keycloak.login();
              }
            }

            return Promise.reject(error);
          }
        );

      return { authRequestInterceptor, authResponseInterceptor };
    };

    // Register the interceptor setup function
    setAuthenticatedApiInterceptors(setupAuthenticatedApiInterceptors);

    // Cleanup interceptors on unmount
    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  const login = async () => {
    try {
      await keycloak.login();
    } catch (error) {
      console.error('Failed to login:', error);
    }
  };

  const logout = async () => {
    try {
      await keycloak.logout();
      setUserProfile(null);
      setIsAuthenticated(false);
      setToken('');
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  const updatePassword = async () => {
    try {
      await keycloak.login({ action: 'UPDATE_PASSWORD' });
    } catch (error) {
      console.error('Failed to reset password:', error);
    }
  };

  const resetPassword = async () => {
    try {
      await keycloak.login({ action: 'RESET_PASSWORD' });
    } catch (error) {
      console.error('Failed to reset password:', error);
    }
  };

  const value = {
    isAuthenticated,
    isLoading,
    login,
    logout,
    updatePassword,
    resetPassword,
    userProfile,
    token
  };

  return (
    <KeycloakContext.Provider value={value}>
      {children}
    </KeycloakContext.Provider>
  );
};

export default KeycloakContext;
