import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client.js';

export function Dashboard(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient.me(),
  });

  if (isLoading) return <p>Loading…</p>;
  return <p>Hello, {data?.displayName ?? 'there'}.</p>;
}
