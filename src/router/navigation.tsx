import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

interface NavigationContextValue {
  path: string;
  navigate: (path: string, options?: { replace?: boolean }) => void;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

export const NavigationProvider = ({ children }: { children: ReactNode }) => {
  const [path, setPath] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((nextPath: string, options?: { replace?: boolean }) => {
    if (options?.replace) {
      window.history.replaceState({}, '', nextPath);
    } else {
      window.history.pushState({}, '', nextPath);
    }
    setPath(nextPath);
  }, []);

  const value = useMemo<NavigationContextValue>(() => ({ path, navigate }), [path, navigate]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

export const useNavigate = () => {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigate must be used within NavigationProvider');
  return ctx.navigate;
};

export const useLocationPath = () => {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useLocationPath must be used within NavigationProvider');
  return ctx.path;
};
