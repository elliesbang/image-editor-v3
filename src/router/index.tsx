import { useEffect } from 'react';
import { App } from '../App';
import { AdminDashboard } from '../pages/admin';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { NavigationProvider, useLocationPath, useNavigate } from './navigation';

export { NavigationProvider, useLocationPath, useNavigate } from './navigation';

export const AppRouter = () => {
  const path = useLocationPath();
  const navigate = useNavigate();

  useEffect(() => {
    if (path === '/home') {
      navigate('/', { replace: true });
    }
  }, [navigate, path]);

  if (path.startsWith('/admin')) {
    return (
      <ProtectedRoute>
        <AdminDashboard />
      </ProtectedRoute>
    );
  }

  return <App />;
};
