import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

type Role = 'admin' | 'student' | 'vod';

interface AuthContextValue {
  session: Session | null;
  role: Role | null;
  loading: boolean;
  roleReady: boolean;
  refreshRole: (userIdOverride?: string | null) => Promise<Role | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const mapRole = (value?: string | null): Role | null => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'admin') return 'admin';
  if (normalized === 'vod') return 'vod';
  return 'student';
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleReady, setRoleReady] = useState(false);

  const fetchRoleForUser = async (userId?: string | null) => {
    if (!userId) {
      setRole('student');
      setRoleReady(true);
      setLoading(false);
      localStorage.removeItem('app_role');
      return 'student';
    }

    setRoleReady(false);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) throw error;
      const mapped = mapRole(data?.role);
      if (!mapped) throw new Error('Invalid role value');

      setRole(mapped);
      setRoleReady(true);
      localStorage.setItem('app_role', mapped);
      return mapped;
    } catch (error) {
      console.error('Failed to load role', error);
      setRole(null);
      localStorage.removeItem('app_role');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      setLoading(true);
      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        setSession(data.session);
        if (data.session?.user) {
          await fetchRoleForUser(data.session.user.id);
        } else {
          setRole('student');
          setRoleReady(true);
          setLoading(false);
          localStorage.removeItem('app_role');
        }
      } else {
        setRole('student');
        setRoleReady(true);
        setLoading(false);
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession);

      if (event === 'SIGNED_OUT') {
        setRole('student');
        setRoleReady(true);
        setLoading(false);
        localStorage.removeItem('app_role');
        return;
      }

      if (nextSession?.user) {
        await fetchRoleForUser(nextSession.user.id);
      } else {
        setRole('student');
        setRoleReady(true);
        setLoading(false);
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
      loading,
      roleReady,
      refreshRole: (userIdOverride?: string | null) => fetchRoleForUser(userIdOverride ?? session?.user.id),
    }),
    [session, role, loading, roleReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
