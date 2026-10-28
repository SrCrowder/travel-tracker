import { useQueryClient } from '@tanstack/react-query';
import { authApi, type AuthStatus } from '../api/client';

/** Logs out and forgets everything fetched with the session. */
export function useLogout() {
  const queryClient = useQueryClient();
  return async () => {
    await authApi.logout();
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
    queryClient.setQueryData<AuthStatus>(['auth'], { authRequired: true, authenticated: false, role: null, username: null });
  };
}
