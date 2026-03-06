import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './shared/context/theme-provider';
import { KeycloakProvider } from './shared/context/keycloak';
import { SocketProvider } from './shared/context/socket/socket-context';
import { useKeycloak } from './shared/hooks/useKeycloak';
import { GenericLoader } from '@/shared/ui/generic-loader';
import { GlobalErrorBoundary, Error404 } from '@/shared/ui/error';
import * as Sentry from '@sentry/react';

// Query Client
const queryClient = new QueryClient();

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  context: {
    auth: undefined! // This will be set after we wrap the app in an AuthProvider
  },
  defaultNotFoundComponent: () => <Error404 />
});

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function InnerApp() {
  const auth = useKeycloak();

  if (!auth.isAuthenticated || auth.isLoading) {
    return <GenericLoader />;
  }

  return (
    <RouterProvider
      router={router}
      context={{ auth }}
      defaultErrorComponent={GlobalErrorBoundary}
    />
  );
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <ThemeProvider defaultTheme="light">
          <InnerApp />
        </ThemeProvider>
      </SocketProvider>
    </QueryClientProvider>
  );
}

const rootElement = document.getElementById('root')!;

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement, {
    onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
      console.warn('Uncaught error', error, errorInfo.componentStack);
    }),
    onCaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler()
  });
  root.render(
    <KeycloakProvider>
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </KeycloakProvider>
  );
}
