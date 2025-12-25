
import React, { useState, useEffect } from 'react';
import { ImageData, ProcessingOptions, GeminiAnalysisResponse } from './types';
import { analyzeImages, generateAIImages } from './services/geminiService';
import { processImage } from './services/imageProcessor';
import { supabase } from './lib/supabaseClient';
import { useAuth } from './auth/AuthContext';

type PlanType = 'free' | 'basic' | 'standard' | 'premium' | 'michina';
type UserRole = 'special' | 'normal' | 'admin';

interface UserAuth {
  uid: string;
  isLoggedIn: boolean;
  email: string;
  name: string;
  role: UserRole;
  plan: PlanType;
  credit: number | 'unlimited';
  svgUsage: number;
  svgLimit: number | 'unlimited';
  gifUsage: number;
  gifLimit: number | 'unlimited';
}

export const App: React.FC = () => {
  const [files, setFiles] = useState<ImageData[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [commonKeywords, setCommonKeywords] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const [loginForm, setLoginForm] = useState({ email: '', password: '', role: 'normal' as UserRole });
  const [signupForm, setSignupForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');

  const [user, setUser] = useState<UserAuth>(() => {
    const baseUser: UserAuth = {
      uid: '',
      isLoggedIn: false,
      email: '',
      name: '',
      role: 'normal',
      plan: 'free',
      credit: 30,
      svgUsage: 0,
      svgLimit: 5,
      gifUsage: 0,
      gifLimit: 5,
    };

    try {
      const saved = localStorage.getItem('genius_user_cache');
      if (!saved) return baseUser;

      const parsed = JSON.parse(saved);
      return {
        ...baseUser,
        ...parsed,
        credit: parsed.credit ?? baseUser.credit,
      };
    } catch (e) {
      return baseUser;
    }
  });

  const [options, setOptions] = useState<ProcessingOptions>({
    bgRemove: true, autoCrop: true, format: 'png', svgColors: 6, resizeWidth: 1080, noiseLevel: 0, gifMotion: '부드럽게 좌우로 흔들리는 효과'
  });

  const { role, roleReady, refreshRole } = useAuth();

  const mapProfileToUserState = (profile: any, supabaseUser: any): UserAuth => {
    const dbRole = (profile?.role || 'user') as 'user' | 'michina' | 'admin';
    const mappedRole: UserRole = dbRole === 'admin' ? 'admin' : dbRole === 'michina' ? 'special' : 'normal';

    return {
      uid: supabaseUser.id,
      isLoggedIn: true,
      email: supabaseUser.email || profile?.email || '',
      name: profile?.name || supabaseUser.email || '사용자',
      role: mappedRole,
      plan: profile?.plan || 'free',
      credit: profile?.credit ?? 30,
      svgUsage: profile?.svg_usage || 0,
      svgLimit: profile?.svg_limit ?? 5,
      gifUsage: profile?.gif_usage || 0,
      gifLimit: profile?.gif_limit ?? 5,
    };
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, email, name, plan, credit, svg_usage, svg_limit, gif_usage, gif_limit')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  };

  const refreshUserState = async (userId: string, sessionUser: any) => {
    try {
      const profile = await fetchProfile(userId);
      const mapped = mapProfileToUserState(profile, sessionUser);
      setUser(mapped);
      localStorage.setItem('genius_user_cache', JSON.stringify(mapped));
    } catch (error) {
      console.error('Profile load failed', error);
      setUser(prev => {
        const newState = { ...prev, isLoggedIn: false };
        localStorage.setItem('genius_user_cache', JSON.stringify(newState));
        return newState;
      });
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        await refreshUserState(sessionData.session.user.id, sessionData.session.user);
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        refreshUserState(session.user.id, session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(prev => {
          const newState = { ...prev, isLoggedIn: false };
          localStorage.setItem('genius_user_cache', JSON.stringify(newState));
          return newState;
        });
      }
    });

    initAuth();
    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("클립보드에 복사되었습니다.");
    } catch (err) { console.error('Failed to copy: ', err); }
  };

  const handleSignup = async () => {
    try {
      setAuthError('');
      const { error } = await supabase.auth.signUp({
        email: signupForm.email,
        password: signupForm.password,
        options: { data: { name: signupForm.name } },
      });

      if (error) throw error;
      alert('회원가입 성공! 이메일 인증 후 로그인해 주세요.');
      setShowSignupModal(false);
      setShowLoginModal(true);
    } catch (error: any) {
      setAuthError(error.message || '회원가입에 실패했습니다.');
      alert(error.message || '회원가입에 실패했습니다.');
    }
  };

  const promoteMichinaIfWhitelisted = async (email: string | null, userId: string, currentRole: string) => {
    if (!email || currentRole !== 'user') return currentRole;
    const normalized = email.toLowerCase();
    const { data, error } = await supabase
      .from('michina_whitelist')
      .select('email, active')
      .eq('email', normalized)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      console.error('Whitelist check failed', error);
      return currentRole;
    }

    if (data?.email) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'michina' })
        .eq('id', userId);
      if (updateError) console.error('Failed to promote to michina', updateError);
      return 'michina';
    }

    return currentRole;
  };

  const closeAllModals = () => {
    setShowLoginModal(false);
    setShowSignupModal(false);
    setShowUpgradeModal(false);
    setShowTermsModal(false);
    setShowPrivacyModal(false);
  };

  const handleLogin = async () => {
    try {
      setAuthError('');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });

      if (error || !data.user) throw error || new Error('로그인 실패');

      const profile = await fetchProfile(data.user.id);
      const promotedRole = await promoteMichinaIfWhitelisted(data.user.email, data.user.id, profile.role || 'user');
      const finalProfile = promotedRole !== profile.role ? { ...profile, role: promotedRole } : profile;

      let allowed = true;
      let rejectionMessage = '';
      if (loginForm.role === 'admin' && promotedRole !== 'admin') {
        allowed = false;
        rejectionMessage = '관리자 계정이 아닙니다';
      } else if (loginForm.role === 'special' && !(promotedRole === 'michina' || promotedRole === 'admin')) {
        allowed = false;
        rejectionMessage = '미치나 전용 계정이 아닙니다';
      }

      if (!allowed) {
        await supabase.auth.signOut();
        setAuthError(rejectionMessage || '권한이 없습니다.');
        alert(rejectionMessage || '권한이 없습니다.');
        return;
      }

      const mapped = mapProfileToUserState(finalProfile, data.user);
      setUser(mapped);
      localStorage.setItem('genius_user_cache', JSON.stringify(mapped));
      const fetchedRole = await refreshRole(data.user.id);
      closeAllModals();
      if (fetchedRole === 'admin') {
        window.location.href = '/admin';
      } else if (loginForm.role === 'special') window.location.href = '/michina';
      else window.location.href = '/home';
    } catch (error: any) {
      setAuthError(error?.message || '로그인에 실패했습니다.');
      alert(error?.message || '로그인에 실패했습니다.');
    }
  };

  const handleGoogleLogin = async () => {
    alert('현재는 이메일 로그인만 지원합니다.');
  };

  const handleLogout = async () => {
    closeAllModals();
    console.log('로그아웃 버튼 클릭됨');
    await supabase.auth.signOut();
    setUser({
      uid: '',
      isLoggedIn: false,
      email: '',
      name: '',
      role: 'normal',
      plan: 'free',
      credit: 30,
      svgUsage: 0,
      svgLimit: 5,
      gifUsage: 0,
      gifLimit: 5,
    });
    localStorage.removeItem('genius_user_cache');
    localStorage.removeItem('app_role');
    sessionStorage.clear();
    window.location.href = '/';
  };

  const handleFiles = (incomingFiles: File[]) => {
    const newFiles: ImageData[] = incomingFiles.map((file: File) => ({
      id: Math.random().toString(36).substring(2, 11),
      file, previewUrl: URL.createObjectURL(file), status: 'idle', progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleGenerateImage = async () => {
    if (!generationPrompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      let referenceBase64: string | undefined;
      const selectedFile = files.find(f => selectedIds.has(f.id));
      if (selectedFile) {
        referenceBase64 = await new Promise<string>(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(selectedFile.file);
        });
      }

      const imageUrls = await generateAIImages(generationPrompt, 4, referenceBase64);
      const newFiles: ImageData[] = await Promise.all(imageUrls.map(async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], `ai_${Date.now()}.png`, { type: 'image/png' });
        return { id: Math.random().toString(36).substring(2, 11), file, previewUrl: url, status: 'idle', progress: 0 };
      }));
      setFiles(prev => [...prev, ...newFiles]);
      setGenerationPrompt('');
    } catch (e: any) {
      console.error("Generation error:", e);
      alert(e?.message || "이미지 생성 실패. 네트워크 또는 설정을 확인해 주세요.");
    } finally {
      setIsGenerating(false);
    }
  };

  const processAll = async () => {
    if (files.length === 0) return;
    const targets = files.filter(f => selectedIds.size === 0 || selectedIds.has(f.id));
    
    if (user.credit !== 'unlimited' && (user.credit as number) < targets.length) {
      alert("크레딧이 부족합니다.");
      setShowUpgradeModal(true);
      return;
    }
    if (options.format === 'svg' && user.svgLimit !== 'unlimited' && (user.svgUsage + targets.length > (user.svgLimit as number))) {
      alert("SVG 변환 횟수가 부족합니다.");
      setShowUpgradeModal(true);
      return;
    }
    if (options.format === 'gif' && user.gifLimit !== 'unlimited' && (user.gifUsage + targets.length > (user.gifLimit as number))) {
      alert("GIF 생성 횟수가 부족합니다.");
      setShowUpgradeModal(true);
      return;
    }

    setIsProcessing(true);
    try {
      const analysisData = await analyzeImages(await Promise.all(targets.map(async f => ({
        id: f.id, base64: await new Promise<string>(res => {
          const reader = new FileReader(); reader.onload = () => res(reader.result as string); reader.readAsDataURL(f.file);
        })
      }))));
      setCommonKeywords(analysisData.commonKeywords);
      
      for (const target of targets) {
        const base64 = await new Promise<string>(res => {
          const reader = new FileReader(); reader.onload = () => res(reader.result as string); reader.readAsDataURL(target.file);
        });
        const result = await processImage(base64, options);
        const fileAnalysis = analysisData.files.find(af => af.id === target.id);
        setFiles(prev => prev.map(f => f.id === target.id ? { 
          ...f, status: 'completed', 
          result: { ...result, title: fileAnalysis?.title || '가공 이미지', keywords: fileAnalysis?.keywords || [], format: options.format, size: "" } 
        } : f));
      }

      const updates: any = {};
      if (user.credit !== 'unlimited') updates.credit = (user.credit as number) - targets.length;
      if (options.format === 'svg' && user.svgLimit !== 'unlimited') updates.svgUsage = user.svgUsage + targets.length;
      if (options.format === 'gif' && user.gifLimit !== 'unlimited') updates.gifUsage = user.gifUsage + targets.length;

      if (Object.keys(updates).length > 0 && user.uid) {
        const payload: any = { credit: updates.credit };
        if (typeof updates.svgUsage !== 'undefined') payload.svg_usage = updates.svgUsage;
        if (typeof updates.gifUsage !== 'undefined') payload.gif_usage = updates.gifUsage;

        const { error } = await supabase.from('profiles').update(payload).eq('id', user.uid);
        if (error) console.error('사용 기록 업데이트 실패', error);
        setUser(prev => ({ ...prev, ...updates }));
      }
    } catch (e: any) {
      alert("처리 오류");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadAll = () => {
    const completed = files.filter(f => f.status === 'completed' && f.result);
    completed.forEach((f, i) => setTimeout(() => downloadResult(f), i * 200));
  };

  const downloadResult = (f: ImageData) => {
    if (!f.result) return;
    const link = document.createElement('a');
    if (f.result.svgContent) {
      const blob = new Blob([f.result.svgContent], { type: 'image/svg+xml' });
      link.href = URL.createObjectURL(blob);
      link.download = `${f.result.title}.svg`;
    } else {
      link.href = f.result.processedUrl;
      link.download = `${f.result.title}.${f.result.format || 'png'}`;
    }
    link.click();
  };

  const getPrice = (monthly: number) => {
    if (billingCycle === 'monthly') return monthly.toLocaleString();
    return (Math.floor(monthly * 0.9)).toLocaleString();
  };

  return (
    <div className="flex flex-col min-h-screen relative">
      <header className="flex-none flex items-center justify-between border-b border-border-color px-6 py-5 bg-surface sticky top-0 z-50 backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-4">
          <div className="size-11 rounded-2xl bg-primary flex items-center justify-center text-text-main shadow-glow transform rotate-3">
            <span className="material-symbols-outlined text-2xl font-black">auto_fix_high</span>
          </div>
          <h2 className="text-text-main text-2xl font-black tracking-tighter">ImageGenius</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowUpgradeModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover rounded-2xl font-black text-sm transition-all shadow-sm active:scale-95 border-b-2 border-primary-hover">
            <span className="material-symbols-outlined text-lg">workspace_premium</span>
            업그레이드
          </button>
          {roleReady && role === 'admin' && (
            <button onClick={() => window.location.href = '/admin'} className="flex items-center gap-2 px-5 py-2.5 bg-background-light border border-border-color rounded-2xl font-black text-sm">
              <span className="material-symbols-outlined text-lg">shield_person</span>
              관리자 대시보드
            </button>
          )}
          {user.isLoggedIn ? (
            <button type="button" onClick={handleLogout} className="px-5 py-2.5 bg-background-light border border-border-color rounded-2xl font-black text-sm">로그아웃</button>
          ) : (
            <button type="button" onClick={() => setShowLoginModal(true)} className="px-5 py-2.5 bg-background-light border border-border-color rounded-2xl font-black text-sm">로그인</button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 flex flex-col gap-10">
        <section className="bg-surface rounded-3xl p-8 border border-border-color shadow-soft space-y-4">
          <div className="flex items-center gap-3 mb-2"><span className="material-symbols-outlined text-primary text-3xl">magic_button</span><h3 className="text-xl font-black">AI 이미지 4장 생성</h3></div>
          <div className="flex flex-col md:flex-row gap-4">
            <textarea value={generationPrompt} onChange={(e) => setGenerationPrompt(e.target.value)} placeholder="예: 붉은 말 캐릭터, 로고 스타일, 흰색 배경 (이미지를 선택하면 해당 이미지에 배경을 입힙니다)" className="flex-1 p-5 rounded-2xl border border-border-color bg-background-light font-bold min-h-[100px] outline-none transition-all focus:border-primary shadow-inner" />
            <button disabled={isGenerating || !generationPrompt.trim()} onClick={handleGenerateImage} className="md:w-32 bg-primary hover:bg-primary-hover rounded-2xl font-black shadow-glow disabled:opacity-50 transition-all active:scale-95 border-b-2 border-primary-hover">
              {isGenerating ? <div className="animate-spin rounded-full h-6 w-6 border-2 border-text-main border-t-transparent mx-auto" /> : "생성하기"}
            </button>
          </div>
        </section>

        <section className="bg-surface rounded-3xl border border-border-color shadow-soft overflow-hidden">
          <div className="p-6 border-b border-border-color flex justify-between items-center bg-surface-highlight/30">
            <div className="flex gap-2">
              <button onClick={() => setSelectedIds(new Set(files.map(f => f.id)))} className="text-xs font-black bg-white border border-border-color px-4 py-2 rounded-xl hover:border-primary transition-all">전체 선택</button>
              <button onClick={() => setFiles([])} className="text-xs font-black bg-white border border-border-color px-4 py-2 rounded-xl text-red-500 hover:border-red-500 transition-all">전체 삭제</button>
            </div>
            <span className="text-xs font-black text-text-main bg-primary px-3 py-1.5 rounded-full shadow-sm">{files.length} 장</span>
          </div>
          <div className="p-6">
            <label onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files)); }} 
              className={`flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed py-12 transition-all cursor-pointer ${isDragging ? 'border-primary bg-primary/5 shadow-inner' : 'border-border-color bg-background-light hover:border-primary/50'}`}>
              <span className="material-symbols-outlined text-4xl text-primary">add_photo_alternate</span>
              <p className="font-black text-sm">이미지 드래그 또는 클릭하여 추가</p>
              <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))} />
            </label>
            <div className="grid grid-cols-6 sm:grid-cols-10 gap-2 mt-6">
              {files.map(f => (
                <div key={f.id} className={`aspect-square relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selectedIds.has(f.id) ? 'border-primary' : 'border-transparent'}`} onClick={() => setSelectedIds(prev => {const n = new Set(prev); if(n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}>
                  <img src={f.previewUrl} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-surface rounded-3xl p-8 border border-border-color shadow-soft space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button onClick={() => setOptions(o => ({...o, bgRemove: !o.bgRemove}))} className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${options.bgRemove ? 'bg-primary/10 border-primary shadow-inner' : 'bg-background-light border-border-color'}`}>
              <div className="text-left font-black uppercase text-sm tracking-tight">배경 & 구멍 제거 {options.bgRemove ? 'ON' : 'OFF'}</div>
              <span className={`material-symbols-outlined ${options.bgRemove ? 'text-primary' : 'text-text-sub'}`}>{options.bgRemove ? 'check_circle' : 'radio_button_unchecked'}</span>
            </button>
            <button onClick={() => setOptions(o => ({...o, autoCrop: !o.autoCrop}))} className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${options.autoCrop ? 'bg-primary/10 border-primary shadow-inner' : 'bg-background-light border-border-color'}`}>
              <div className="text-left font-black uppercase text-sm tracking-tight">자동 여백 크롭 {options.autoCrop ? 'ON' : 'OFF'}</div>
              <span className={`material-symbols-outlined ${options.autoCrop ? 'text-primary' : 'text-text-sub'}`}>{options.autoCrop ? 'check_circle' : 'radio_button_unchecked'}</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-background-light p-4 rounded-2xl border border-border-color shadow-inner space-y-2">
              <div className="flex items-center justify-between text-sm font-black text-text-main">
                <span>리사이즈 (가로 기준)</span>
                <span className="text-xs text-text-sub">세로 자동 비율</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  className="flex-1 px-3 py-2 rounded-xl border border-border-color bg-white text-sm font-bold outline-none"
                  value={options.resizeWidth}
                  onChange={(e) => setOptions(o => ({...o, resizeWidth: Math.max(0, Number(e.target.value))}))}
                />
                <span className="text-xs font-black text-text-sub">px</span>
              </div>
              <p className="text-[11px] text-text-sub font-bold">0 입력 시 원본 크기 유지</p>
            </div>
            <div className="bg-background-light p-4 rounded-2xl border border-border-color shadow-inner space-y-2">
              <div className="flex items-center justify-between text-sm font-black text-text-main">
                <span>노이즈 제거</span>
                <span className="text-xs text-text-sub">강도 {options.noiseLevel}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={options.noiseLevel}
                onChange={(e) => setOptions(o => ({...o, noiseLevel: Number(e.target.value)}))}
                className="w-full accent-primary"
              />
              <p className="text-[11px] text-text-sub font-bold">필요 시만 사용하세요. 강도가 높을수록 디테일이 부드러워집니다.</p>
            </div>
          </div>
          <div className="space-y-4 border-t border-border-color pt-8">
            <label className="text-xs font-black text-text-sub uppercase">변환 포맷 및 상세 설정</label>
            <div className="flex gap-2">
              {['png', 'svg', 'gif'].map(fmt => (
                <button key={fmt} onClick={() => setOptions(o => ({...o, format: fmt as any}))} className={`flex-1 py-4 rounded-xl border text-sm font-black transition-all ${options.format === fmt ? 'bg-text-main text-white shadow-lg' : 'bg-white border-border-color text-text-sub'}`}>{fmt.toUpperCase()}</button>
              ))}
            </div>
            {options.format === 'svg' && (
              <div className="bg-background-light p-4 rounded-2xl space-y-3 border border-border-color shadow-inner">
                <p className="text-xs font-black">추출 색상 - <span className="text-primary-hover">원본 디테일 보존 및 벡터 경로 생성</span></p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {[2, 3, 4, 5, 6, 12].map(c => (
                    <button key={c} onClick={() => setOptions(o => ({...o, svgColors: c}))} className={`flex-none px-6 py-2 rounded-xl text-xs font-bold border ${options.svgColors === c ? 'bg-primary border-primary shadow-sm' : 'bg-white'}`}>{c === 12 ? '원본그대로' : `${c}색`}</button>
                  ))}
                </div>
              </div>
            )}
            {options.format === 'gif' && (
              <div className="bg-background-light p-4 rounded-2xl space-y-3 border border-border-color shadow-inner">
                <p className="text-xs font-black">동작 설명 (AI 애니메이션)</p>
                <textarea value={options.gifMotion} onChange={(e) => setOptions(o => ({...o, gifMotion: e.target.value}))} className="w-full p-3 rounded-xl border border-border-color text-sm font-bold h-20 outline-none" />
              </div>
            )}
          </div>
          <button onClick={processAll} disabled={isProcessing} className="w-full py-6 rounded-3xl bg-primary hover:bg-primary-hover font-black text-xl shadow-glow active:scale-95 transition-all">
            {isProcessing ? '처리 중...' : '일괄 처리 시작'}
          </button>
        </section>

        {(files.some(f => f.status === 'completed') || commonKeywords.length > 0) && (
          <div className="space-y-6 pb-20">
            {commonKeywords.length > 0 && (
              <section className="bg-surface rounded-3xl p-8 border border-border-color shadow-soft space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black flex items-center gap-2"><span className="material-symbols-outlined text-primary">sell</span>SEO 키워드</h3>
                  <div className="flex gap-2">
                    <button onClick={downloadAll} className="text-xs font-black bg-primary px-4 py-2 rounded-xl border border-primary-hover">전체 다운로드</button>
                    <button onClick={() => copyToClipboard(commonKeywords.join(', '))} className="text-xs font-black bg-background-light px-4 py-2 rounded-xl border border-border-color">키워드 복사</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">{commonKeywords.map((k, i) => <span key={i} className="text-xs font-bold px-3 py-1.5 bg-background-light rounded-full border border-border-color">#{k}</span>)}</div>
              </section>
            )}

            <section className="grid grid-cols-1 gap-6">
              {files.filter(f => f.status === 'completed' && f.result).map(f => (
                <div key={f.id} className="bg-surface rounded-3xl p-8 border border-border-color shadow-soft flex flex-col md:flex-row gap-8 animate-in fade-in zoom-in-95 duration-300">
                  <div className="w-full md:w-48 aspect-square bg-white rounded-2xl overflow-hidden border border-border-color flex items-center justify-center p-4 relative group shadow-inner shrink-0">
                    <img src={f.result?.processedUrl} className="max-h-full max-w-full object-contain" />
                    <button onClick={() => downloadResult(f)} className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                      <span className="material-symbols-outlined text-3xl">download</span>
                    </button>
                  </div>
                  <div className="flex-1 space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-text-sub uppercase tracking-wider">가공된 제목</label>
                        <button onClick={() => copyToClipboard(f.result?.title || '')} className="text-[10px] font-black text-primary-hover hover:underline">제목 복사</button>
                      </div>
                      <h4 className="text-lg font-black leading-tight">{f.result?.title}</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-text-sub uppercase tracking-wider">이미지 키워드</label>
                        <button onClick={() => copyToClipboard(f.result?.keywords.join(', ') || '')} className="text-[10px] font-black text-primary-hover hover:underline">키워드 복사</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">{f.result?.keywords.map((k, i) => <span key={i} className="text-[11px] font-bold px-2.5 py-1 bg-background-light rounded-lg border border-border-color">{k}</span>)}</div>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <span className="text-[10px] font-black bg-primary px-3 py-1 rounded-md uppercase tracking-wider">{f.result?.format}</span>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}
      </main>

      <footer className="border-t border-border-color py-10 flex flex-col items-center gap-4 bg-white/50">
        <div className="flex gap-6">
          <button onClick={() => setShowTermsModal(true)} className="text-xs font-black text-text-sub hover:text-text-main transition-colors">이용약관</button>
          <button onClick={() => setShowPrivacyModal(true)} className="text-xs font-black text-text-sub hover:text-text-main transition-colors">개인정보처리방침</button>
        </div>
        <p className="text-[10px] font-bold text-text-sub opacity-50">© 2025 ImageGenius. All rights reserved.</p>
      </footer>

      {showUpgradeModal && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={closeAllModals}>
          <div className="bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl relative p-8 md:p-12" onClick={e => e.stopPropagation()}>
            <button onClick={closeAllModals} className="absolute top-8 right-8 text-text-sub hover:text-text-main transition-colors">
              <span className="material-symbols-outlined text-3xl">close</span>
            </button>
            <div className="text-center space-y-2 mb-10">
              <h2 className="text-4xl font-black tracking-tight">구독 플랜 선택</h2>
              <p className="text-text-sub font-bold">등급이 올라갈수록 기능이 확장됩니다.</p>
            </div>
            <div className="flex justify-center mb-12">
              <div className="bg-background-dark p-1 rounded-2xl flex border border-border-color">
                <button onClick={() => setBillingCycle('monthly')} className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all ${billingCycle === 'monthly' ? 'bg-primary shadow-sm' : 'text-text-sub hover:bg-white/50'}`}>월 결제</button>
                <button onClick={() => setBillingCycle('yearly')} className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all ${billingCycle === 'yearly' ? 'bg-primary shadow-sm' : 'text-text-sub hover:bg-white/50'}`}>연 결제 (10% 할인)</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white border border-border-color rounded-3xl p-8 flex flex-col items-center text-center space-y-6 hover:shadow-soft transition-all">
                <span className="material-symbols-outlined text-4xl text-text-main">pets</span>
                <div><h3 className="text-xl font-black">Free</h3><p className="text-2xl font-black mt-1">무료</p></div>
                <ul className="text-xs font-bold text-text-sub space-y-3 flex-1 text-left w-full">
                  <li>• 배경제거 / 크롭 / 노이즈 제거 / 리사이즈</li>
                  <li>• SVG, GIF, 키워드 분석 월 5회 체험</li>
                  <li>• 월 30크레딧 (1장 = 1크레딧)</li>
                </ul>
                <button className="w-full py-3 rounded-xl border border-border-color font-black text-sm hover:bg-background-light transition-all">시작하기</button>
              </div>
              <div className="bg-white border border-border-color rounded-3xl p-8 flex flex-col items-center text-center space-y-6 hover:shadow-soft transition-all">
                <span className="material-symbols-outlined text-4xl text-text-main">inventory_2</span>
                <div><h3 className="text-xl font-black">Basic</h3><p className="text-2xl font-black mt-1">₩{getPrice(9900)} <span className="text-sm font-bold text-text-sub">/ 월</span></p></div>
                <ul className="text-xs font-bold text-text-sub space-y-3 flex-1 text-left w-full">
                  <li>• Free 기능 +</li><li>• 월 300크레딧</li><li>• 추가 기능 각 10회</li>
                </ul>
                <button className="w-full py-3 rounded-xl bg-primary hover:bg-primary-hover font-black text-sm shadow-sm transition-all">업그레이드</button>
              </div>
              <div className="bg-white border border-border-color rounded-3xl p-8 flex flex-col items-center text-center space-y-6 hover:shadow-soft transition-all">
                <span className="material-symbols-outlined text-4xl text-text-main">stars</span>
                <div><h3 className="text-xl font-black">Standard</h3><p className="text-2xl font-black mt-1">₩{getPrice(19900)} <span className="text-sm font-bold text-text-sub">/ 월</span></p></div>
                <ul className="text-xs font-bold text-text-sub space-y-3 flex-1 text-left w-full">
                  <li>• Basic 기능 +</li><li>• 크레딧 무제한</li><li>• 추가 기능 각 50회</li>
                </ul>
                <button className="w-full py-3 rounded-xl bg-primary hover:bg-primary-hover font-black text-sm shadow-sm transition-all">업그레이드</button>
              </div>
              <div className="bg-surface-highlight border-2 border-primary rounded-3xl p-8 flex flex-col items-center text-center space-y-6 relative hover:shadow-soft transition-all">
                <div className="absolute top-4 right-4 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded font-black uppercase">인기</div>
                <span className="material-symbols-outlined text-4xl text-orange-500">military_tech</span>
                <div><h3 className="text-xl font-black">Premium</h3><p className="text-2xl font-black mt-1">₩{getPrice(39900)} <span className="text-sm font-bold text-text-sub">/ 월</span></p></div>
                <ul className="text-xs font-bold text-text-sub space-y-3 flex-1 text-left w-full">
                  <li>• Standard 기능 +</li><li>• 모든 기능 무제한</li>
                </ul>
                <button className="w-full py-3 rounded-xl bg-text-main text-white hover:bg-black font-black text-sm shadow-sm transition-all">업그레이드</button>
              </div>
            </div>
            <div className="max-w-xs">
              <div className="bg-surface-highlight border border-primary/50 rounded-3xl p-8 flex flex-col items-center text-center space-y-5 relative hover:shadow-soft transition-all">
                <div className="absolute top-4 right-4 bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded font-black">특수</div>
                <span className="material-symbols-outlined text-4xl text-primary">emoji_events</span>
                <div><h3 className="text-xl font-black">Michina</h3><p className="text-lg font-black mt-1">챌린지 전용</p></div>
                <ul className="text-xs font-bold text-text-sub space-y-2.5 flex-1 text-left w-full">
                  <li>• Premium 기능 +</li><li>• 챌린지 기간 자동 활성화</li><li>• 미치나 로그인 사용자 전체 적용</li><li>• 종료 시 Free 등급으로 자동 복귀</li>
                </ul>
                <button className="w-full py-3 rounded-xl bg-white border border-border-color font-black text-xs text-text-sub cursor-not-allowed">챌린지 회원 전용</button>
              </div>
            </div>
            <p className="text-center text-[10px] font-bold text-text-sub mt-12 uppercase tracking-widest">다운로드 1장 = 1크레딧 차감</p>
          </div>
        </div>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeAllModals}>
          <div className="bg-surface w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 space-y-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={closeAllModals} className="absolute top-8 right-8 text-text-sub hover:text-text-main"><span className="material-symbols-outlined text-2xl">close</span></button>
            <h3 className="text-3xl font-black">로그인</h3>
            <div className="space-y-4">
              <div className="flex gap-2 p-1 bg-background-light rounded-xl border border-border-color">
                {(['normal', 'special', 'admin'] as UserRole[]).map(r => (
                  <button key={r} onClick={() => setLoginForm(p => ({...p, role: r}))} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${loginForm.role === r ? 'bg-primary shadow-sm' : 'text-text-sub'}`}>
                    {r === 'admin' ? '관리자' : r === 'special' ? '미치나' : '일반'}
                  </button>
                ))}
              </div>
              <input type="email" placeholder="이메일" value={loginForm.email} onChange={e => setLoginForm(p => ({...p, email: e.target.value}))} className="w-full p-5 rounded-2xl border border-border-color bg-background-light font-bold" />
              <input type="password" placeholder="비밀번호" value={loginForm.password} onChange={e => setLoginForm(p => ({...p, password: e.target.value}))} className="w-full p-5 rounded-2xl border border-border-color bg-background-light font-bold" />
            </div>
            <div className="space-y-3">
              <button onClick={handleLogin} className="w-full py-5 rounded-2xl bg-primary hover:bg-primary-hover font-black text-lg border-b-4 border-primary-hover">로그인하기</button>
              <button onClick={handleGoogleLogin} className="w-full py-4 rounded-2xl bg-white border border-border-color flex items-center justify-center gap-3 font-black text-sm">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg" className="w-5 h-5" alt="" /> Google로 로그인
              </button>
            </div>
            <div className="text-center">
              <button onClick={() => {setShowLoginModal(false); setShowSignupModal(true);}} className="text-sm font-black text-text-sub underline hover:text-primary">아직 회원이 아니신가요? 회원가입</button>
            </div>
          </div>
        </div>
      )}

      {showSignupModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeAllModals}>
          <div className="bg-surface w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 space-y-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => {setShowSignupModal(false); setShowLoginModal(true);}} className="absolute top-8 left-8 text-text-sub hover:text-text-main flex items-center gap-1">
              <span className="material-symbols-outlined text-xl">arrow_back</span>
              <span className="text-xs font-black">로그인으로</span>
            </button>
            <h3 className="text-3xl font-black mt-4">회원가입</h3>
            <div className="space-y-4">
              <input type="text" placeholder="이름" value={signupForm.name} onChange={e => setSignupForm(p => ({...p, name: e.target.value}))} className="w-full p-5 rounded-2xl border border-border-color bg-background-light font-bold" />
              <input type="email" placeholder="이메일" value={signupForm.email} onChange={e => setSignupForm(p => ({...p, email: e.target.value}))} className="w-full p-5 rounded-2xl border border-border-color bg-background-light font-bold" />
              <input type="password" placeholder="비밀번호" value={signupForm.password} onChange={e => setSignupForm(p => ({...p, password: e.target.value}))} className="w-full p-5 rounded-2xl border border-border-color bg-background-light font-bold" />
            </div>
            <button onClick={handleSignup} className="w-full py-5 rounded-2xl bg-text-main text-white font-black text-lg hover:bg-black transition-all">가입 완료</button>
          </div>
        </div>
      )}

      {showTermsModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={closeAllModals}>
          <div className="bg-white w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-[2rem] p-10 space-y-4 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={closeAllModals} className="absolute top-8 right-8 text-text-sub hover:text-text-main"><span className="material-symbols-outlined">close</span></button>
            <h2 className="text-3xl font-black mb-6">이용약관</h2>
            <div className="text-sm font-bold text-text-sub space-y-5 leading-relaxed">
              <p>제1조 (목적) 본 약관은 ImageGenius가 제공하는 이미지 편집 서비스의 이용 조건 및 절차를 규정합니다.</p>
              <p>제2조 (서비스 내용) 회사는 AI 기반 배경 제거, 크롭, 키워드 추출 기능을 제공하며, 사용자의 크레딧에 따라 이용 범위를 제한할 수 있습니다.</p>
              <p>제3조 (저작권) 서비스로 생성된 결과물의 저작권은 사용자에게 귀속되나, AI 모델의 특성상 동일하거나 유사한 결과가 다른 사용자에게 생성될 수 있음을 동의합니다.</p>
              <p>제4조 (금지사항) 불법적인 성인물 생성, 타인의 명예 훼손, 지적 재산권 침해 도구로 서비스를 사용하는 것을 엄격히 금지합니다.</p>
            </div>
            <button onClick={closeAllModals} className="w-full py-4 bg-primary rounded-2xl font-black mt-8 text-lg border-b-4 border-primary-hover">확인했습니다</button>
          </div>
        </div>
      )}

      {showPrivacyModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={closeAllModals}>
          <div className="bg-white w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-[2rem] p-10 space-y-4 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={closeAllModals} className="absolute top-8 right-8 text-text-sub hover:text-text-main"><span className="material-symbols-outlined">close</span></button>
            <h2 className="text-3xl font-black mb-6">개인정보처리방침</h2>
            <div className="text-sm font-bold text-text-sub space-y-5 leading-relaxed">
              <p>1. 수집하는 개인정보: 이메일 주소, 이름, 계정 역할(관리자, 미치나, 일반), 서비스 이용 기록.</p>
              <p>2. 이용 목적: 계정 관리, 서비스 제공, 맞춤형 SEO 키워드 분석 및 구독 플랜 관리.</p>
              <p>3. 개인정보의 보유 및 이용기간: 회원 탈퇴 시까지 또는 법령이 정한 기간 동안 보관합니다.</p>
              <p>4. 개인정보의 파기: 수집 목적이 달성되면 해당 정보를 지체 없이 파기합니다.</p>
            </div>
            <button onClick={closeAllModals} className="w-full py-4 bg-primary rounded-2xl font-black mt-8 text-lg border-b-4 border-primary-hover">확인했습니다</button>
          </div>
        </div>
      )}
    </div>
  );
};
