import { ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface Props {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: Props) => {
  const { roleReady, role } = useAuth();

  useEffect(() => {
    if (roleReady && role !== 'admin') {
      window.location.href = '/';
    }
  }, [roleReady, role]);

  if (!roleReady) return null;
  if (role !== 'admin') return null;

  return <>{children}</>;
};
