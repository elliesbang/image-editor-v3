import { ReactNode, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';

interface Props {
  children: ReactNode;
  allow?: Array<'admin' | 'vod' | 'student'>;
}

export const ProtectedRoute = ({ children, allow }: Props) => {
  const { loading, roleReady, role } = useAuth();
  const allowedRoles = useMemo(() => allow ?? ['admin'], [allow]);

  useEffect(() => {
    if (loading || !roleReady) return;
    if (!role || !allowedRoles.includes(role)) {
      window.location.href = '/';
    }
  }, [allowedRoles, loading, roleReady, role]);

  if (loading) return null;
  if (!roleReady) return null;
  if (!role || !allowedRoles.includes(role)) return null;

  return <>{children}</>;
};
