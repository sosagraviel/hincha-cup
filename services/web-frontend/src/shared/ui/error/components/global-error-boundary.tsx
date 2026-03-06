import { Error500 } from './error-500';

interface GlobalErrorBoundaryProps {
  error: Error;
}

function GlobalErrorBoundary({ error }: GlobalErrorBoundaryProps) {
  console.log(error.stack);
  return <Error500 />;
}

export { GlobalErrorBoundary };
