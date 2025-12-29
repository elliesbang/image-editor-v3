import { ReactNode, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from '../router/navigation';

interface Props {
  children: ReactNode;
  allow?: Array<'admin' | 'vod' | 'student'>;
}

const mapRole = (value?: string | null): 'admin' | 'vod' | 'student' | null => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'admin') return 'admin';
  if (normalized === 'vod') return 'vod';
  return 'student';
};

export const ProtectedRoute = ({ children, allow }: Props) => {
  const navigate = useNavigate();
  const allowedRoles = useMemo(() => allow ?? ['admin'], [allow]);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<'admin' | 'vod' | 'student' | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadSessionAndRole = async () => {
      setCheckingSession(true);
      const { data, error } = await supabase.auth.getSession();
      const nextSession = error ? null : data.session;
      console.log('admin route session', nextSession);
      if (!active) return;
      setSession(nextSession);
      setCheckingSession(false);

      if (!nextSession) {
        navigate('/login', { replace: true });
        return;
      }

      setLoadingProfile(true);
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', nextSession.user.id)
        .maybeSingle();

      if (!active) return;

      if (profileError) {
        console.error('Failed to load admin profile', profileError);
        setProfileLoadError(profileError.message || '프로필 조회 실패');
        setLoadingProfile(false);
        return;
      }

      const normalizedRole = mapRole(profileData?.role);
      console.log('admin role', normalizedRole ?? 'unknown');
      setProfileLoadError(null);
      setRole(normalizedRole);
      setLoadingProfile(false);
    };

    loadSessionAndRole();

    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (checkingSession || loadingProfile) return;
    if (!session) return;
    if (!role) return;
    if (!allowedRoles.includes(role)) {
      navigate('/', { replace: true });
    }
  }, [allowedRoles, checkingSession, loadingProfile, navigate, role, session]);

  if (checkingSession || loadingProfile) return <div className="flex h-screen items-center justify-center" />;
  if (profileLoadError) return <div className="flex h-screen items-center justify-center text-sm font-bold">관리자 권한 확인 중입니다...</div>;
  if (!session) return null;
  if (!role || !allowedRoles.includes(role)) return null;

  return <>{children}</>;
};
