import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

type Role = 'admin' | 'student' | 'vod';

interface AuthContextValue {
  session: Session | null;
  role: Role | null;
  roleReady: boolean;
  refreshRole: (userIdOverride?: string | null) => Promise<Role | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const mapRole = (value?: string | null): Role => {
  if (value === 'admin') return 'admin';
  if (value === 'vod') return 'vod';
  return 'student';
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [roleReady, setRoleReady] = useState(false);

  const fetchRoleForUser = async (userId?: string | null) => {
    if (!userId) {
      setRole(null);
      setRoleReady(true);
      return null;
    }

    setRoleReady(false);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) throw error;
      const mapped = mapRole(data?.role);
      setRole(mapped);
      localStorage.setItem('app_role', mapped);
      return mapped;
    } catch (error) {
      console.error('Failed to load role', error);
      setRole(null);
      localStorage.removeItem('app_role');
      return null;
    } finally {
      setRoleReady(true);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        setSession(data.session);
        if (data.session?.user) {
          await fetchRoleForUser(data.session.user.id);
        } else {
          setRoleReady(true);
        }
      } else {
        setRole(null);
        setRoleReady(true);
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        await fetchRoleForUser(nextSession.user.id);
      } else {
        setRole(null);
        setRoleReady(true);
        localStorage.removeItem('app_role');
      }
    });

    initAuth();
    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      role,
      roleReady,
      refreshRole: (userIdOverride?: string | null) => fetchRoleForUser(userIdOverride ?? session?.user.id),
    }),
    [session, role, roleReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
