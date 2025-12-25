
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ImageData, ProcessingOptions, GeminiAnalysisResponse } from './types';
import { analyzeImages, generateAIImages } from './geminiService';
import { processImage } from './imageProcessor';

// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

type PlanType = 'free' | 'basic' | 'standard' | 'premium' | 'michina';
type UserRole = 'special' | 'normal' | 'admin';

interface UserAuth {
  uid: string;
  isLoggedIn: boolean;
  email: string;
  name: string;
  role: UserRole;
  plan: PlanType;
  credits: number | 'unlimited';
  extraFeatureUsage: number;
  extraFeatureLimit: number | 'unlimited';
}

const App: React.FC = () => {
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
  const [signupForm, setSignupForm] = useState({ name: '', email: '', password: '', role: 'normal' as UserRole });
  
  const [user, setUser] = useState<UserAuth>({
    uid: '', isLoggedIn: false, email: '', name: '', role: 'normal',
    plan: 'free', credits: 30, extraFeatureUsage: 0, extraFeatureLimit: 5
  });

  const [options, setOptions] = useState<ProcessingOptions>({
    bgRemove: true, autoCrop: true, format: 'png', svgColors: 6, resizeWidth: 1080, noiseLevel: 0, gifMotion: '부드럽게 좌우로 흔들리는 효과'
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUser({
            uid: firebaseUser.uid,
            isLoggedIn: true,
            email: firebaseUser.email || '',
            name: userData.name || '사용자',
            role: userData.role || 'normal',
            plan: userData.plan || 'free',
            credits: userData.credits || 30,
            extraFeatureUsage: userData.extraFeatureUsage || 0,
            extraFeatureLimit: userData.extraFeatureLimit || 5
          });
          if (userData.role === 'admin' && window.location.pathname !== '/admin') {
            window.location.href = '/admin';
          }
        }
      } else {
        setUser(prev => ({ ...prev, isLoggedIn: false }));
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignup = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, signupForm.email, signupForm.password);
      const newUser = userCredential.user;
      const plan = signupForm.role === 'special' ? 'michina' : 'free';
      const userData = {
        uid: newUser.uid,
        name: signupForm.name,
        email: signupForm.email,
        role: signupForm.role,
        plan: plan,
        credits: plan === 'michina' ? 'unlimited' : 30,
        extraFeatureLimit: plan === 'michina' ? 'unlimited' : 5,
        extraFeatureUsage: 0
      };
      await setDoc(doc(db, "users", newUser.uid), userData);
      alert("회원가입 성공!");
      setShowSignupModal(false);
    } catch (error: any) { alert(error.message); }
  };

  const handleLogin = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
      const firebaseUser = userCredential.user;
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      if (userDoc.exists() && userDoc.data().role === 'admin') {
        window.location.href = '/admin';
      } else {
        setShowLoginModal(false);
      }
    } catch (error: any) { alert(error.message); }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      if (!userDoc.exists()) {
        const userData = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || 'User',
          email: firebaseUser.email || '',
          role: loginForm.role, // 로그인 시 선택한 역할 적용
          plan: loginForm.role === 'special' ? 'michina' : 'free',
          credits: loginForm.role === 'special' ? 'unlimited' : 30,
          extraFeatureLimit: loginForm.role === 'special' ? 'unlimited' : 5,
          extraFeatureUsage: 0
        };
        await setDoc(doc(db, "users", firebaseUser.uid), userData);
      }
      setShowLoginModal(false);
    } catch (error: any) { alert(error.message); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/';
  };

  const handleFiles = (incomingFiles: File[]) => {
    const newFiles: ImageData[] = incomingFiles.map((file: File) => ({
      id: Math.random().toString(36).substring(2, 11),
      file, previewUrl: URL.createObjectURL(file), status: 'idle', progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const processAll = async () => {
    if (files.length === 0) return;
    const targets = files.filter(f => selectedIds.size === 0 || selectedIds.has(f.id));
    setIsProcessing(true);
    setFiles(prev => prev.map(f => targets.find(t => t.id === f.id) ? { ...f, status: 'processing' } : f));

    try {
      const analysisData = await analyzeImages(await Promise.all(targets.map(async f => ({
        id: f.id, base64: await new Promise<string>(res => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(f.file);
        })
      }))));
      setCommonKeywords(analysisData.commonKeywords);

      for (const target of targets) {
        const reader = new FileReader();
        const base64 = await new Promise<string>(res => {
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(target.file);
        });
        const result = await processImage(base64, options);
        const fileAnalysis = analysisData.files.find(af => af.id === target.id);
        
        setFiles(prev => prev.map(f => f.id === target.id ? {
          ...f, status: 'completed', result: {
            ...result, title: fileAnalysis?.title || '가공 이미지', keywords: fileAnalysis?.keywords || [], format: options.format
          }
        } : f));
      }
    } catch (e) { alert("처리 오류 발생"); }
    finally { setIsProcessing(false); }
  };

  const handleUpdateSvgColor = (fileId: string, oldColor: string, newColor: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId && f.result?.svgContent) {
        const updatedSvg = f.result.svgContent.replaceAll(`fill="${oldColor}"`, `fill="${newColor.toUpperCase()}"`);
        const updatedColors = f.result.svgColorsList?.map(c => c === oldColor ? newColor.toUpperCase() : c);
        return { ...f, result: { ...f.result, svgContent: updatedSvg, svgColorsList: updatedColors } };
      }
      return f;
    }));
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

  return (
    <div className="flex flex-col min-h-screen relative">
      {/* Header */}
      <header className="flex-none flex items-center justify-between border-b border-border-color px-6 py-5 bg-surface sticky top-0 z-50 backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-4">
          <div className="size-11 rounded-2xl bg-primary flex items-center justify-center text-text-main shadow-glow transform rotate-3">
            <span className="material-symbols-outlined text-2xl font-black">auto_fix_high</span>
          </div>
          <h2 className="text-text-main text-2xl font-black tracking-tighter">ImageGenius</h2>
        </div>
        <div className="flex gap-2">
          {user.isLoggedIn ? (
            <button onClick={handleLogout} className="px-5 py-2.5 bg-background-light border border-border-color rounded-2xl font-black text-sm">로그아웃</button>
          ) : (
            <button onClick={() => setShowLoginModal(true)} className="px-5 py-2.5 bg-background-light border border-border-color rounded-2xl font-black text-sm">로그인</button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 flex flex-col gap-10">
        {/* Generation Section */}
        <section className="bg-surface rounded-3xl p-8 border border-border-color shadow-soft space-y-4">
          <div className="flex items-center gap-3 mb-2"><span className="material-symbols-outlined text-primary text-3xl">magic_button</span><h3 className="text-xl font-black">AI 이미지 4장 생성</h3></div>
          <div className="flex flex-col md:flex-row gap-4">
            <textarea value={generationPrompt} onChange={(e) => setGenerationPrompt(e.target.value)} placeholder="예: 붉은 말 캐릭터, 로고 스타일, 흰색 배경" className="flex-1 p-5 rounded-2xl border border-border-color bg-background-light font-bold min-h-[100px] outline-none" />
            <button onClick={() => {}} className="md:w-32 bg-primary hover:bg-primary-hover rounded-2xl font-black shadow-glow">생성하기</button>
          </div>
        </section>

        {/* Upload Section */}
        <section className="bg-surface rounded-3xl border border-border-color shadow-soft overflow-hidden">
          <div className="p-6 border-b border-border-color flex justify-between items-center bg-surface-highlight/30">
            <div className="flex gap-2">
              <button onClick={() => setSelectedIds(new Set(files.map(f => f.id)))} className="text-xs font-black bg-white border border-border-color px-4 py-2 rounded-xl">전체 선택</button>
              <button onClick={() => setFiles([])} className="text-xs font-black bg-white border border-border-color px-4 py-2 rounded-xl text-red-500">전체 삭제</button>
            </div>
            <span className="text-xs font-black text-text-main bg-primary px-3 py-1.5 rounded-full shadow-sm">{files.length} 장</span>
          </div>
          <div className="p-6">
            <label className="flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed py-12 transition-all cursor-pointer border-border-color bg-background-light hover:border-primary/50">
              <span className="material-symbols-outlined text-4xl text-primary">add_photo_alternate</span>
              <p className="font-black text-sm">이미지 드래그 또는 클릭하여 추가</p>
              <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))} />
            </label>
            <div className="grid grid-cols-6 sm:grid-cols-10 gap-2 mt-6">
              {files.map(f => (
                <div key={f.id} className={`aspect-square relative rounded-xl overflow-hidden border-2 cursor-pointer ${selectedIds.has(f.id) ? 'border-primary' : 'border-transparent'}`} onClick={() => setSelectedIds(prev => {const n = new Set(prev); if(n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}>
                  <img src={f.previewUrl} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Processing Controls - 첨부 이미지와 동일하게 구현 */}
        <section className="bg-surface rounded-3xl p-8 border border-border-color shadow-soft space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button onClick={() => setOptions(o => ({...o, bgRemove: !o.bgRemove}))} className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${options.bgRemove ? 'bg-primary/10 border-primary shadow-inner' : 'bg-background-light border-border-color'}`}>
              <div className="text-left font-black">배경 & 구멍 제거 {options.bgRemove ? 'ON' : 'OFF'}</div>
              <span className={`material-symbols-outlined ${options.bgRemove ? 'text-primary' : 'text-text-sub'}`}>{options.bgRemove ? 'check_circle' : 'radio_button_unchecked'}</span>
            </button>
            <button onClick={() => setOptions(o => ({...o, autoCrop: !o.autoCrop}))} className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${options.autoCrop ? 'bg-primary/10 border-primary shadow-inner' : 'bg-background-light border-border-color'}`}>
              <div className="text-left font-black">자동 여백 크롭 {options.autoCrop ? 'ON' : 'OFF'}</div>
              <span className={`material-symbols-outlined ${options.autoCrop ? 'text-primary' : 'text-text-sub'}`}>{options.autoCrop ? 'check_circle' : 'radio_button_unchecked'}</span>
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-border-color pt-8">
            <div className="space-y-4">
              <label className="text-sm font-black text-text-sub uppercase">리사이즈 (가로 너비 PX)</label>
              <input type="number" value={options.resizeWidth} onChange={(e) => setOptions(o => ({...o, resizeWidth: parseInt(e.target.value)}))} className="w-full bg-background-light border border-border-color font-black rounded-xl p-4 outline-none shadow-inner" />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between font-black"><label className="text-sm text-text-sub uppercase">노이즈/블러 제거</label><span>{options.noiseLevel}%</span></div>
              <input type="range" min="0" max="100" value={options.noiseLevel} onChange={(e) => setOptions(o => ({...o, noiseLevel: parseInt(e.target.value)}))} className="w-full accent-primary h-2 rounded-full cursor-pointer" />
            </div>
          </div>
          <div className="space-y-4 border-t border-border-color pt-8">
            <label className="text-sm font-black text-text-sub uppercase">변환 포맷 및 상세 설정</label>
            <div className="flex gap-2">
              {['png', 'svg', 'gif'].map(fmt => (
                <button key={fmt} onClick={() => setOptions(o => ({...o, format: fmt as any}))} className={`flex-1 py-4 rounded-xl border text-sm font-black transition-all ${options.format === fmt ? 'bg-text-main text-white shadow-lg' : 'bg-white border-border-color text-text-sub'}`}>{fmt.toUpperCase()}</button>
              ))}
            </div>
            {options.format === 'svg' && (
              <div className="bg-background-light p-4 rounded-2xl space-y-3 border border-border-color shadow-inner">
                <p className="text-xs font-black">최대 추출 색상 (2-6색) - <span className="text-primary-hover">원본 색상 보존 및 빈틈 방지 적용</span></p>
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

        {/* Results Section */}
        {files.some(f => f.status === 'completed') && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
            {files.filter(f => f.status === 'completed' && f.result).map(f => (
              <div key={f.id} className="bg-surface rounded-3xl p-6 border border-border-color shadow-soft flex flex-col gap-5">
                <div className="flex gap-5">
                  <div className="w-32 h-32 bg-white rounded-2xl overflow-hidden border border-border-color flex items-center justify-center p-2 relative group shadow-inner">
                    <img src={f.result?.processedUrl} className="max-h-full max-w-full object-contain" />
                    <button onClick={() => downloadResult(f)} className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><span className="material-symbols-outlined text-3xl">download</span></button>
                  </div>
                  <div className="flex-1 flex flex-col justify-center gap-2">
                    <h4 className="text-sm font-black line-clamp-1">{f.result?.title}</h4>
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] font-black bg-primary px-2 py-0.5 rounded-md uppercase">{f.result?.format}</span>
                      {f.result?.svgColorsList && f.result.svgColorsList.map((c, i) => (
                        <input key={i} type="color" value={c} onChange={(e) => handleUpdateSvgColor(f.id, c, e.target.value)} className="size-5 rounded-full border border-border-color cursor-pointer appearance-none overflow-hidden" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>

      {/* Auth Modals - Role Selection Included */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-3xl shadow-soft p-8 space-y-6">
            <h3 className="text-2xl font-black">로그인</h3>
            <div className="flex gap-2">
              {(['admin', 'special', 'normal'] as UserRole[]).map(r => (
                <button key={r} onClick={() => setLoginForm(prev => ({...prev, role: r}))} className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${loginForm.role === r ? 'bg-primary border-primary shadow-inner' : 'bg-background-light border-border-color'}`}>
                  {r === 'admin' ? '관리자' : r === 'special' ? '미치나' : '일반'}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              <input type="email" placeholder="이메일" value={loginForm.email} onChange={e => setLoginForm(p => ({...p, email: e.target.value}))} className="w-full p-4 rounded-2xl border border-border-color bg-background-light font-bold" />
              <input type="password" placeholder="비밀번호" value={loginForm.password} onChange={e => setLoginForm(p => ({...p, password: e.target.value}))} className="w-full p-4 rounded-2xl border border-border-color bg-background-light font-bold" />
            </div>
            <div className="space-y-3">
              <button onClick={handleLogin} className="w-full py-4 rounded-2xl bg-primary hover:bg-primary-hover font-black text-lg">로그인하기</button>
              <button onClick={handleGoogleLogin} className="w-full py-4 rounded-2xl bg-white border border-border-color hover:bg-background-light flex items-center justify-center gap-3 font-black">Google로 로그인</button>
            </div>
            <div className="text-center"><button onClick={() => {setShowLoginModal(false); setShowSignupModal(true);}} className="text-sm font-black text-text-sub underline">회원가입</button></div>
          </div>
        </div>
      )}

      {showSignupModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-3xl shadow-soft p-8 space-y-6">
            <h3 className="text-2xl font-black">회원가입</h3>
            <div className="flex gap-2">
              {(['special', 'normal'] as UserRole[]).map(r => (
                <button key={r} onClick={() => setSignupForm(prev => ({...prev, role: r}))} className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${signupForm.role === r ? 'bg-primary border-primary shadow-inner' : 'bg-background-light border-border-color'}`}>
                  {r === 'special' ? '미치나' : '일반'}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="이름" value={signupForm.name} onChange={e => setSignupForm(p => ({...p, name: e.target.value}))} className="w-full p-4 rounded-2xl border border-border-color bg-background-light font-bold" />
              <input type="email" placeholder="이메일" value={signupForm.email} onChange={e => setSignupForm(p => ({...p, email: e.target.value}))} className="w-full p-4 rounded-2xl border border-border-color bg-background-light font-bold" />
              <input type="password" placeholder="비밀번호" value={signupForm.password} onChange={e => setSignupForm(p => ({...p, password: e.target.value}))} className="w-full p-4 rounded-2xl border border-border-color bg-background-light font-bold" />
            </div>
            <button onClick={handleSignup} className="w-full py-4 rounded-2xl bg-text-main text-white font-black text-lg">가입 완료</button>
          </div>
        </div>
      )}

      {/* Footer Content */}
      <footer className="border-t border-border-color py-10 flex flex-col items-center gap-4">
        <div className="flex gap-6">
          <button onClick={() => setShowTermsModal(true)} className="text-xs font-black text-text-sub">이용약관</button>
          <button onClick={() => setShowPrivacyModal(true)} className="text-xs font-black text-text-sub">개인정보처리방침</button>
        </div>
        <p className="text-[10px] font-bold text-text-sub opacity-50">© 2025 ImageGenius. All rights reserved.</p>
      </footer>

      {/* Content Modals */}
      {showTermsModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-[2rem] p-8 space-y-4">
            <h2 className="text-2xl font-black">이용약관</h2>
            <div className="text-sm font-bold text-text-sub space-y-3 leading-relaxed">
              <p>제1조 (목적) 본 약관은 ImageGenius가 제공하는 이미지 편집 서비스의 이용 조건 및 절차를 규정합니다.</p>
              <p>제2조 (서비스 내용) 회사는 AI 기반 배경 제거, 크롭, 키워드 추출 기능을 제공하며, 사용자의 크레딧에 따라 이용 범위를 제한할 수 있습니다.</p>
              <p>제3조 (저작권) 서비스로 생성된 결과물의 저작권은 사용자에게 귀속되나, AI 모델의 특성상 동일하거나 유사한 결과가 다른 사용자에게 생성될 수 있음을 동의합니다.</p>
              <p>제4조 (금지사항) 불법적인 성인물 생성, 타인의 명예 훼손, 지적 재산권 침해 도구로 서비스를 사용하는 것을 엄격히 금지합니다.</p>
            </div>
            <button onClick={() => setShowTermsModal(false)} className="w-full py-3 bg-primary rounded-xl font-black mt-4">닫기</button>
          </div>
        </div>
      )}

      {showPrivacyModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-[2rem] p-8 space-y-4">
            <h2 className="text-2xl font-black">개인정보처리방침</h2>
            <div className="text-sm font-bold text-text-sub space-y-3 leading-relaxed">
              <p>1. 수집하는 개인정보: 이메일 주소, 이름, 계정 역할(관리자, 미치나, 일반), 서비스 이용 기록.</p>
              <p>2. 이용 목적: 계정 관리, 서비스 제공, 맞춤형 SEO 키워드 분석 및 구독 플랜 관리.</p>
              <p>3. 개인정보의 보유 및 이용기간: 회원 탈퇴 시까지 또는 법령이 정한 기간 동안 보관합니다.</p>
              <p>4. 개인정보의 파기: 수집 목적이 달성되면 해당 정보를 지체 없이 파기합니다.</p>
            </div>
            <button onClick={() => setShowPrivacyModal(false)} className="w-full py-3 bg-primary rounded-xl font-black mt-4">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
