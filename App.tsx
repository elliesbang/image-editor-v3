
import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ImageData, ProcessingOptions, GeminiAnalysisResponse } from './types';
import { analyzeImages, generateAIImages } from './geminiService';
import { processImage } from './imageProcessor';

const App: React.FC = () => {
  const [files, setFiles] = useState<ImageData[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [commonKeywords, setCommonKeywords] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // Auth States
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [userRole, setUserRole] = useState<'special' | 'normal' | 'admin'>('normal');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [options, setOptions] = useState<ProcessingOptions>({
    bgRemove: true,
    autoCrop: true,
    format: 'png',
    svgColors: 6,
    resizeWidth: 1080,
    noiseLevel: 0,
    gifMotion: '부드럽게 좌우로 흔들리는 효과'
  });

  const handleFiles = (incomingFiles: File[]) => {
    const newFiles: ImageData[] = incomingFiles.map((file: File) => ({
      id: Math.random().toString(36).substring(2, 11),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'idle',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(Array.from(e.target.files));
  };

  const deleteFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleGenerateImage = async () => {
    if (!generationPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const dataUrls = await generateAIImages(generationPrompt, 4);
      const newFiles = await Promise.all(dataUrls.map(async (url, idx) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new File([blob], `ai-gen-${Date.now()}-${idx}.png`, { type: 'image/png' });
      }));
      handleFiles(newFiles);
      setGenerationPrompt('');
    } catch (e) { alert("이미지 생성 오류"); }
    finally { setIsGenerating(false); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('복사되었습니다!');
  };

  const processAll = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    const targets = files.filter(f => selectedIds.size === 0 || selectedIds.has(f.id));
    
    setFiles(prev => prev.map(f => targets.find(t => t.id === f.id) ? { ...f, status: 'processing' as const } : f));

    try {
      const imagesForAnalysis = await Promise.all(targets.map(async (f) => {
        const reader = new FileReader();
        const base64 = await new Promise<string>((res) => {
          reader.onload = () => res(reader.result as string);
          reader.readAsDataURL(f.file);
        });
        return { id: f.id, base64 };
      }));

      const analysis = await analyzeImages(imagesForAnalysis);
      setCommonKeywords(analysis.commonKeywords);

      for (const target of targets) {
        const base64 = imagesForAnalysis.find(img => img.id === target.id)?.base64 || '';
        const fileAnalysis = analysis.files.find(af => af.id === target.id);
        
        try {
          const currentProcessFormat = options.format;
          const processed = await processImage(base64, options);
          let finalUrl = processed.processedUrl;

          if (currentProcessFormat === 'gif' && options.gifMotion.trim()) {
            try {
              if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
                await window.aistudio.openSelectKey();
              }
              
              const veoAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
              let operation = await veoAi.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: options.gifMotion,
                image: {
                  imageBytes: processed.processedUrl.split(',')[1],
                  mimeType: 'image/png'
                },
                config: { 
                  numberOfVideos: 1, 
                  resolution: '720p', 
                  aspectRatio: '16:9' 
                }
              });

              while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                operation = await veoAi.operations.getVideosOperation({operation: operation});
              }

              if (operation.error) {
                if (operation.error.message?.includes("Requested entity was not found")) {
                  await window.aistudio?.openSelectKey();
                }
                throw new Error(operation.error.message);
              }

              const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
              if (downloadLink) {
                const gifRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                const gifBlob = await gifRes.blob();
                finalUrl = URL.createObjectURL(gifBlob);
              }
            } catch (veoError) {
              console.error("Veo animation failed", veoError);
            }
          }

          setFiles(prev => prev.map(f => f.id === target.id ? {
            ...f,
            status: 'completed' as const,
            result: {
              processedUrl: finalUrl,
              width: processed.width,
              height: processed.height,
              size: (f.file.size / 1024).toFixed(1) + 'KB',
              title: fileAnalysis?.title || '가공된 이미지',
              keywords: fileAnalysis?.keywords || [],
              svgContent: processed.svgContent,
              svgColorsList: processed.svgColorsList,
              format: currentProcessFormat
            }
          } : f));
        } catch (e) {
          setFiles(prev => prev.map(f => f.id === target.id ? { ...f, status: 'error' as const } : f));
        }
      }
    } catch (e) {
      alert("분석 또는 가공 중 오류 발생");
      setFiles(prev => prev.map(f => f.status === 'processing' ? { ...f, status: 'error' as const } : f));
    } finally { setIsProcessing(false); }
  };

  const handleUpdateSvgColor = (fileId: string, oldColor: string, newColor: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId && f.result?.svgContent) {
        const newSvgContent = f.result.svgContent.replaceAll(`fill="${oldColor}"`, `fill="${newColor.toUpperCase()}"`);
        const newColorsList = f.result.svgColorsList?.map(c => c === oldColor ? newColor.toUpperCase() : c);
        
        return {
          ...f,
          result: {
            ...f.result,
            svgContent: newSvgContent,
            svgColorsList: newColorsList,
            processedUrl: URL.createObjectURL(new Blob([newSvgContent], { type: 'image/svg+xml' }))
          }
        };
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
    } else if (f.result.format === 'gif') {
      link.href = f.result.processedUrl;
      link.download = `${f.result.title}.gif`;
    } else {
      link.href = f.result.processedUrl;
      link.download = `${f.result.title}.png`;
    }
    link.click();
  };

  const downloadAllResults = () => {
    const completedFiles = files.filter(f => f.status === 'completed' && f.result);
    if (completedFiles.length === 0) return;
    
    completedFiles.forEach((f, index) => {
      setTimeout(() => {
        downloadResult(f);
      }, index * 400); 
    });
  };

  const hasCompletedResults = files.some(f => f.status === 'completed');

  return (
    <div className="flex flex-col min-h-screen relative">
      {/* Header */}
      <header className="flex-none flex items-center justify-between border-b border-border-color px-6 py-5 bg-surface sticky top-0 z-50 backdrop-blur-md bg-white/90 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="size-11 rounded-2xl bg-primary flex items-center justify-center text-text-main shadow-glow transform rotate-3">
            <span className="material-symbols-outlined text-2xl font-black">auto_fix_high</span>
          </div>
          <h2 className="text-text-main text-2xl font-black tracking-tighter text-shadow-sm">ImageGenius</h2>
        </div>
        <div className="flex items-center gap-3">
          <button className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover rounded-2xl font-black text-sm transition-all shadow-sm active:scale-95 border-b-2 border-primary-hover">
            <span className="material-symbols-outlined text-lg">workspace_premium</span>
            업그레이드
          </button>
          <button 
            onClick={() => isLoggedIn ? setIsLoggedIn(false) : setShowLoginModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-background-light hover:bg-white border border-border-color rounded-2xl font-black text-sm transition-all shadow-sm active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">{isLoggedIn ? 'logout' : 'person'}</span>
            {isLoggedIn ? '로그아웃' : '로그인'}
          </button>
        </div>
      </header>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-3xl shadow-soft overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black">로그인</h3>
                <button onClick={() => setShowLoginModal(false)} className="text-text-sub hover:text-text-main transition-colors"><span className="material-symbols-outlined">close</span></button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {(['special', 'normal', 'admin'] as const).map(role => (
                    <button 
                      key={role} 
                      onClick={() => setUserRole(role)}
                      className={`py-2 rounded-xl text-xs font-black border transition-all ${userRole === role ? 'bg-primary border-primary shadow-inner' : 'bg-background-light border-border-color hover:border-primary/50'}`}
                    >
                      {role === 'special' ? '미치나' : role === 'normal' ? '일반' : '관리자'}
                    </button>
                  ))}
                </div>
                <input type="email" placeholder="이메일" className="w-full p-4 rounded-2xl border border-border-color bg-background-light font-bold outline-none focus:border-primary shadow-inner" />
                <input type="password" placeholder="비밀번호" className="w-full p-4 rounded-2xl border border-border-color bg-background-light font-bold outline-none focus:border-primary shadow-inner" />
              </div>

              <button 
                onClick={() => { setIsLoggedIn(true); setShowLoginModal(false); }}
                className="w-full py-4 rounded-2xl bg-primary hover:bg-primary-hover font-black text-lg shadow-glow transition-all active:scale-95 border-b-4 border-primary-hover"
              >
                로그인하기
              </button>

              <div className="text-center pt-2">
                <button 
                  onClick={() => { setShowLoginModal(false); setShowSignupModal(true); }}
                  className="text-sm font-black text-text-sub hover:text-primary transition-colors underline underline-offset-4"
                >
                  아직 회원이 아니신가요? 회원가입
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signup Modal */}
      {showSignupModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-3xl shadow-soft overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black">회원가입</h3>
                <button onClick={() => setShowSignupModal(false)} className="text-text-sub hover:text-text-main transition-colors"><span className="material-symbols-outlined">close</span></button>
              </div>
              
              <div className="space-y-4">
                <input type="text" placeholder="이름" className="w-full p-4 rounded-2xl border border-border-color bg-background-light font-bold outline-none focus:border-primary shadow-inner" />
                <input type="email" placeholder="이메일" className="w-full p-4 rounded-2xl border border-border-color bg-background-light font-bold outline-none focus:border-primary shadow-inner" />
                <input type="password" placeholder="비밀번호" className="w-full p-4 rounded-2xl border border-border-color bg-background-light font-bold outline-none focus:border-primary shadow-inner" />
              </div>

              <button 
                onClick={() => { setShowSignupModal(false); setShowLoginModal(true); }}
                className="w-full py-4 rounded-2xl bg-text-main text-white hover:bg-black font-black text-lg shadow-lg transition-all active:scale-95"
              >
                가입 완료
              </button>

              <div className="text-center pt-2">
                <button 
                  onClick={() => { setShowSignupModal(false); setShowLoginModal(true); }}
                  className="text-sm font-black text-text-sub hover:text-primary transition-colors underline underline-offset-4"
                >
                  이미 계정이 있으신가요? 로그인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 flex flex-col gap-10">
        <section className="bg-surface rounded-3xl p-8 border border-border-color shadow-soft space-y-4">
          <div className="flex items-center gap-3 mb-2"><span className="material-symbols-outlined text-primary text-3xl">magic_button</span><h3 className="text-xl font-black">AI 이미지 4장 생성</h3></div>
          <div className="flex flex-col md:row gap-4">
            <textarea value={generationPrompt} onChange={(e) => setGenerationPrompt(e.target.value)} placeholder="예: 붉은 말 캐릭터, 로고 스타일, 흰색 배경" className="flex-1 p-5 rounded-2xl border border-border-color bg-background-light font-bold min-h-[100px] outline-none transition-all focus:border-primary shadow-inner" />
            <button disabled={isGenerating || !generationPrompt.trim()} onClick={handleGenerateImage} className="md:w-32 bg-primary hover:bg-primary-hover rounded-2xl font-black shadow-glow disabled:opacity-50 transition-all active:scale-95">
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
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
            <div className="grid grid-cols-6 sm:grid-cols-10 gap-2 mt-6">
              {files.map(f => (
                <div key={f.id} className="relative group">
                  <div onClick={() => setSelectedIds(prev => { const n = new Set(prev); if(n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })} 
                    className={`aspect-square relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selectedIds.has(f.id) ? 'border-primary scale-90' : 'border-transparent'}`}>
                    <div className="w-full h-full bg-center bg-cover" style={{backgroundImage: `url(${f.previewUrl})`}} />
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }}
                    className="absolute -top-1 -right-1 size-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-20 shadow-sm hover:bg-red-600 scale-90"
                    title="이미지 삭제"
                  >
                    <span className="material-symbols-outlined text-[14px] font-black">close</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-surface rounded-3xl p-8 border border-border-color shadow-soft space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button onClick={() => setOptions(o => ({ ...o, bgRemove: !o.bgRemove }))} className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${options.bgRemove ? 'bg-primary/10 border-primary shadow-inner' : 'bg-background-light border-border-color'}`}>
              <div className="text-left font-black">배경 & 구멍 제거 {options.bgRemove ? 'ON' : 'OFF'}</div>
              <span className={`material-symbols-outlined ${options.bgRemove ? 'text-primary' : 'text-text-sub'}`}>{options.bgRemove ? 'check_circle' : 'radio_button_unchecked'}</span>
            </button>
            <button onClick={() => setOptions(o => ({ ...o, autoCrop: !o.autoCrop }))} className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${options.autoCrop ? 'bg-primary/10 border-primary shadow-inner' : 'bg-background-light border-border-color'}`}>
              <div className="text-left font-black">자동 여백 크롭 {options.autoCrop ? 'ON' : 'OFF'}</div>
              <span className={`material-symbols-outlined ${options.autoCrop ? 'text-primary' : 'text-text-sub'}`}>{options.autoCrop ? 'check_circle' : 'radio_button_unchecked'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-border-color pt-8">
            <div className="space-y-4">
              <label className="text-sm font-black text-text-sub uppercase">리사이즈 (가로 너비 px)</label>
              <input type="number" value={options.resizeWidth} onChange={(e) => setOptions(o => ({ ...o, resizeWidth: parseInt(e.target.value) || 0 }))} className="w-full bg-background-light border border-border-color font-black rounded-xl p-4 focus:ring-2 focus:ring-primary outline-none shadow-inner" />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between font-black"><label className="text-sm text-text-sub uppercase">노이즈/블러 제거</label><span>{options.noiseLevel}%</span></div>
              <input type="range" min="0" max="100" value={options.noiseLevel} onChange={(e) => setOptions(o => ({ ...o, noiseLevel: parseInt(e.target.value) }))} className="w-full accent-primary h-2 rounded-full cursor-pointer" />
            </div>
          </div>

          <div className="space-y-4 border-t border-border-color pt-8">
            <label className="text-sm font-black text-text-sub uppercase">변환 포맷 및 상세 설정</label>
            <div className="flex flex-wrap gap-2">
              {['png', 'svg', 'gif'].map((fmt) => (
                <button key={fmt} onClick={() => setOptions(o => ({ ...o, format: fmt as any }))} className={`flex-1 py-4 rounded-xl border text-sm font-black transition-all ${options.format === fmt ? 'bg-text-main text-white border-text-main shadow-lg' : 'bg-white border-border-color text-text-sub hover:border-primary/50'}`}>
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
            
            {options.format === 'svg' && (
              <div className="bg-background-light p-4 rounded-2xl space-y-3 border border-border-color shadow-inner">
                <p className="text-xs font-black">최대 추출 색상 (2-6색) - <span className="text-primary-hover">원본 색상 보존 및 빈틈 방지 적용</span></p>
                <div className="flex flex-wrap gap-2">
                  {[2, 3, 4, 5, 6, 12].map(c => (
                    <button key={c} onClick={() => setOptions(o => ({ ...o, svgColors: c }))} className={`flex-1 min-w-[60px] py-2 rounded-lg text-xs font-bold border transition-all ${options.svgColors === c ? 'bg-primary border-primary shadow-sm' : 'bg-white hover:border-primary/30'}`}>
                      {c === 12 ? '원본그대로' : `${c}색`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {options.format === 'gif' && (
              <div className="bg-background-light p-4 rounded-2xl space-y-3 border border-border-color shadow-inner">
                <p className="text-xs font-black">동작 설명 (AI 애니메이션)</p>
                <textarea value={options.gifMotion} onChange={(e) => setOptions(o => ({...o, gifMotion: e.target.value}))} className="w-full p-3 rounded-xl border border-border-color text-sm font-bold h-20 resize-none focus:ring-1 focus:ring-primary outline-none" placeholder="어떤 움직임을 주시겠습니까? 예: 캐릭터가 손을 흔듦" />
              </div>
            )}
          </div>

          <button disabled={isProcessing || files.length === 0} onClick={processAll} className="w-full py-6 rounded-3xl bg-primary hover:bg-primary-hover font-black text-xl shadow-glow active:scale-95 disabled:opacity-50 transition-all border-b-4 border-primary-hover">
            {isProcessing ? '가공 및 분석 중...' : '일괄 처리 시작'}
          </button>
        </section>

        {(isProcessing || commonKeywords.length > 0) && (
          <section className="space-y-8 pb-20">
            {commonKeywords.length > 0 && (
              <div className="bg-surface rounded-3xl p-8 border border-border-color shadow-soft">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black flex items-center gap-3"><span className="material-symbols-outlined text-primary">hub</span>공통 핵심 키워드 (25개)</h3>
                  <button onClick={() => copyToClipboard(commonKeywords.join(', '))} className="text-xs font-black bg-background-light border border-border-color px-4 py-2 rounded-xl hover:border-primary transition-all">전체 복사</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {commonKeywords.map((k, i) => (
                    <button key={i} onClick={() => copyToClipboard(k)} className="text-xs font-bold bg-white border border-border-color px-3 py-1.5 rounded-lg hover:border-primary transition-colors">#{k}</button>
                  ))}
                </div>
              </div>
            )}

            {hasCompletedResults && (
              <div className="flex justify-end px-4">
                <button 
                  onClick={downloadAllResults}
                  className="flex items-center gap-2 px-6 py-3 bg-text-main text-white rounded-2xl font-black shadow-lg hover:bg-black transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined">download_for_offline</span>
                  결과 전체 다운로드
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {files.filter(f => f.status !== 'idle').map(f => (
                <div key={f.id} className="bg-surface rounded-3xl p-6 border border-border-color shadow-soft flex flex-col gap-5 transition-all hover:shadow-md">
                  <div className="flex gap-5">
                    <div className="w-32 h-32 bg-white rounded-2xl overflow-hidden border border-border-color flex items-center justify-center p-3 relative group shadow-inner">
                      {f.status === 'completed' && f.result ? (
                        f.result.format === 'gif' ? (
                          <video src={f.result.processedUrl} autoPlay loop muted className="max-h-full max-w-full object-contain" />
                        ) : (
                          <img src={f.result.processedUrl} className="max-h-full max-w-full object-contain" />
                        )
                      ) : f.status === 'error' ? (
                        <span className="material-symbols-outlined text-red-500">error</span>
                      ) : (
                        <div className="animate-spin rounded-full h-8 w-8 border-3 border-primary border-t-transparent" />
                      )}
                      {f.status === 'completed' && (
                        <button onClick={() => downloadResult(f)} className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><span className="material-symbols-outlined text-3xl">download</span></button>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col justify-center gap-2">
                      <div className="flex justify-between items-start">
                        <h4 className="text-sm font-black line-clamp-2 leading-tight">{f.result?.title || "이미지 분석 중..."}</h4>
                        {f.result?.title && <button onClick={() => copyToClipboard(f.result!.title)} className="hover:text-primary transition-colors"><span className="material-symbols-outlined text-lg">content_copy</span></button>}
                      </div>
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="text-[10px] font-black bg-primary px-2 py-0.5 rounded-md uppercase">{f.result?.format || options.format}</span>
                        {f.result?.svgColorsList && f.result.svgColorsList.map((c, i) => (
                          <div key={i} className="flex items-center gap-1 group/color">
                            <input 
                              type="color" 
                              value={c} 
                              onChange={(e) => handleUpdateSvgColor(f.id, c, e.target.value)}
                              className="size-5 rounded-full border border-border-color cursor-pointer hover:scale-125 transition-transform appearance-none overflow-hidden ring-1 ring-border-color shadow-sm" 
                              title="색상 변경"
                            />
                          </div>
                        ))}
                      </div>
                      {f.result?.format === 'svg' && <p className="text-[10px] font-bold text-primary-hover">칩을 눌러 직접 색상 변경 가능</p>}
                    </div>
                  </div>
                  {f.result?.keywords && (
                    <div className="border-t border-border-color pt-4">
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-[10px] font-black text-text-sub uppercase tracking-wider">Stock SEO 최적화 키워드</p>
                        <button onClick={() => copyToClipboard(f.result!.keywords.join(', '))} className="text-[10px] font-black underline hover:text-primary">전체 복사</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {f.result.keywords.slice(0, 15).map((k, i) => (
                          <span key={i} className="text-[10px] font-bold text-text-sub bg-background-light px-2 py-1 rounded border border-transparent hover:border-primary/20 transition-all">#{k}</span>
                        ))}
                        {f.result.keywords.length > 15 && <span className="text-[10px] font-bold text-text-sub px-2 py-1">...</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default App;
