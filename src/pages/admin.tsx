import React, { useState, useEffect } from 'react';
import { AuthProvider } from '../auth/AuthContext';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from '../router/navigation';

export const AdminDashboard = () => {
  console.log('AdminDashboard render');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState<any[]>([]);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchInitialData = async () => {
    setLoading(true);
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role, name, plan');
    if (!profileError && profileData) setUsers(profileData);

    const { data: whitelistData, error: whitelistError } = await supabase
      .from('michina_whitelist')
      .select('email')
      .eq('active', true);
    if (!whitelistError && whitelistData) setWhitelist(whitelistData.map(item => item.email));

    setLoading(false);
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const emails = text.split(/\r?\n/).map(row => row.trim()).filter(email => email.includes('@'));
      if (emails.length > 0) {
        const records = emails.map(email => ({ email: email.toLowerCase(), active: true }));
        const { error } = await supabase.from('michina_whitelist').upsert(records, { onConflict: 'email' });
        if (error) {
          console.error('Failed to update whitelist', error);
          alert('명단 업로드에 실패했습니다.');
          return;
        }
        setWhitelist(records.map(r => r.email));
        alert(`${emails.length}개의 이메일이 미치나 명단에 등록되었습니다.`);
      }
    };
    reader.readAsText(file);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/home', { replace: true });
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div></div>;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-border-color flex flex-col p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="size-10 bg-primary rounded-xl flex items-center justify-center"><span className="material-symbols-outlined font-black">auto_fix_high</span></div>
          <div><h1 className="font-black text-lg">픽셀 어드민</h1><p className="text-[10px] text-text-sub font-bold">v2.4.0</p></div>
        </div>
        <nav className="flex-1 space-y-2">
          {[
            { id: 'dashboard', icon: 'dashboard', label: '대시보드' },
            { id: 'users', icon: 'group', label: '사용자' },
            { id: 'tools', icon: 'auto_fix_normal', label: '편집 도구' },
            { id: 'payments', icon: 'payments', label: '결제 관리' },
          ].map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl font-black text-sm transition-all ${activeTab === item.id ? 'bg-primary/10 text-text-main' : 'text-text-sub hover:bg-background'}`}>
              <span className={`material-symbols-outlined ${activeTab === item.id ? 'fill-1' : ''}`}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-4">
          <div className="bg-background p-4 rounded-2xl space-y-2">
            <div className="flex justify-between text-[10px] font-bold"><span><span className="material-symbols-outlined text-xs align-middle mr-1">cloud</span> 저장 공간</span><span>1TB 전체</span></div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-primary w-3/4"></div></div>
            <p className="text-[10px] font-bold text-text-sub text-center">750GB 사용됨</p>
          </div>
          <button type="button" onClick={handleLogout} className="w-full flex items-center gap-4 px-4 py-3 text-text-sub font-black text-sm hover:text-red-500"><span className="material-symbols-outlined">logout</span>로그아웃</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="flex items-center justify-between mb-8">
          <div className="relative w-96">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-sub">search</span>
            <input type="text" placeholder="사용자, 이미지 또는 로그 검색..." className="w-full bg-white border border-border-color pl-12 pr-4 py-3 rounded-full text-sm font-bold" />
          </div>
          <div className="flex items-center gap-6">
            <span className="material-symbols-outlined text-text-sub cursor-pointer relative"><span className="absolute -top-1 -right-1 size-2 bg-red-500 rounded-full"></span>notifications</span>
            <div className="flex items-center gap-3">
              <div className="text-right"><h3 className="text-sm font-black">관리자</h3><p className="text-[10px] text-text-sub font-bold">최고 관리자</p></div>
              <div className="size-10 bg-gray-200 rounded-full border-2 border-primary"></div>
            </div>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
              <div><h2 className="text-3xl font-black mb-1">대시보드</h2><p className="text-text-sub text-sm font-bold">앱 성과 및 사용자 활동 개요</p></div>
              <div className="flex items-center gap-4">
                <div className="bg-white border border-border-color p-1 rounded-xl flex text-xs font-black">
                  <button className="px-4 py-1.5 bg-primary rounded-lg shadow-sm">7일</button>
                  <button className="px-4 py-1.5">30일</button>
                  <button className="px-4 py-1.5">월별</button>
                </div>
                <button className="bg-primary px-6 py-2.5 rounded-xl font-black text-sm shadow-sm hover:bg-primary-hover"><span className="material-symbols-outlined align-middle mr-2">download</span>보고서 내보내기</button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6">
              {[
                { label: '총 사용자', value: '12,450', growth: '+5.2%', icon: 'group' },
                { label: '현재 접속 중', value: '845', growth: '+1.2%', icon: 'bolt' },
                { label: '오늘 처리됨', value: '2,302', growth: '+8.5%', icon: 'auto_fix_high' },
                { label: '월 매출', value: '$15.2k', growth: '안정적', icon: 'payments' },
              ].map(card => (
                <div key={card.label} className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="size-10 bg-gray-100 rounded-xl flex items-center justify-center"><span className="material-symbols-outlined text-text-sub">{card.icon}</span></div>
                    <span className="text-[10px] font-black px-2 py-0.5 bg-green-100 text-green-600 rounded-full">{card.growth}</span>
                  </div>
                  <h4 className="text-xs text-text-sub font-bold mb-1">{card.label}</h4>
                  <p className="text-2xl font-black">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-white p-8 rounded-3xl border border-border-color shadow-sm relative h-[400px]">
                <div className="flex justify-between items-center mb-8">
                  <div><h3 className="font-black text-lg">처리량 추이</h3><p className="text-xs text-text-sub font-bold">시간 경과에 따른 이미지 처리 및 신규 사용자</p></div>
                  <span className="material-symbols-outlined text-text-sub cursor-pointer">more_horiz</span>
                </div>
                {/* Mock Chart Area */}
                <div className="flex items-end justify-between h-48 gap-4 px-4">
                  {[40, 45, 60, 55, 80, 70, 50].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col gap-2 items-center group cursor-pointer">
                      <div className="w-full bg-primary/20 rounded-t-lg relative" style={{ height: '100px' }}>
                        <div className="absolute bottom-0 w-full bg-primary rounded-t-lg transition-all" style={{ height: `${h}%` }}></div>
                      </div>
                      <span className="text-[10px] font-bold text-text-sub">{['월', '화', '수', '목', '금', '토', '일'][i]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
                  <h3 className="font-black text-sm mb-6 uppercase tracking-wider">인기 기능</h3>
                  <div className="space-y-6">
                    {[
                      { label: '배경 제거', value: '42%', color: 'bg-primary' },
                      { label: 'AI 업스케일', value: '28%', color: 'bg-primary/60' },
                      { label: '필터 및 조정', value: '15%', color: 'bg-primary/30' },
                      { label: '자르기 및 리사이즈', value: '15%', color: 'bg-primary/30' },
                    ].map(feat => (
                      <div key={feat.label} className="space-y-2">
                        <div className="flex justify-between text-xs font-black"><span>{feat.label}</span><span>{feat.value}</span></div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`${feat.color} h-full`} style={{ width: feat.value }}></div></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
                  <h3 className="font-black text-sm mb-6 uppercase tracking-wider">사용자 요금제 현황</h3>
                  <div className="flex items-center gap-6">
                    <div className="relative size-24 shrink-0">
                      <svg className="size-full" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="16" fill="none" className="stroke-gray-100" strokeWidth="3"></circle>
                        <circle cx="18" cy="18" r="16" fill="none" className="stroke-primary" strokeWidth="3" strokeDasharray="60, 100" strokeLinecap="round"></circle>
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-black">85%</span></div>
                    </div>
                    <div className="space-y-2 text-[10px] font-bold">
                      <div className="flex items-center gap-2"><span className="size-2 bg-gray-200 rounded-full"></span><span>무료 60%</span></div>
                      <div className="flex items-center gap-2"><span className="size-2 bg-primary rounded-full"></span><span>프로 30%</span></div>
                      <div className="flex items-center gap-2"><span className="size-2 bg-green-500 rounded-full"></span><span>팀 10%</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs font-black text-primary mb-1">사용자 관리</p>
                  <h3 className="text-2xl font-black">전체 계정</h3>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-primary text-sm font-black rounded-xl shadow-sm"><span className="material-symbols-outlined">person_add</span>새 사용자</button>
              </div>
              <div className="rounded-2xl border border-border-color overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-background">
                    <tr>
                      <th className="px-4 py-3 text-xs font-black text-text-sub">이메일</th>
                      <th className="px-4 py-3 text-xs font-black text-text-sub">이름</th>
                      <th className="px-4 py-3 text-xs font-black text-text-sub">역할</th>
                      <th className="px-4 py-3 text-xs font-black text-text-sub">플랜</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-color">
                    {users.map(user => (
                      <tr key={user.id} className="hover:bg-background-light">
                        <td className="px-4 py-3 text-sm font-bold">{user.email}</td>
                        <td className="px-4 py-3 text-sm font-bold">{user.name || '이름 없음'}</td>
                        <td className="px-4 py-3 text-sm font-bold"><span className={`px-3 py-1 rounded-full text-xs ${user.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-gray-100 text-text-sub'}`}>{user.role}</span></td>
                        <td className="px-4 py-3 text-sm font-bold">{user.plan || 'free'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs font-black text-primary mb-1">화이트리스트</p>
                  <h3 className="text-2xl font-black">미치나 전용</h3>
                </div>
                <label className="px-4 py-2 border border-border-color rounded-xl text-sm font-black cursor-pointer hover:bg-background">
                  CSV 업로드
                  <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {whitelist.map(email => (
                  <div key={email} className="flex items-center justify-between px-4 py-3 bg-background rounded-xl text-sm font-black">
                    <span>{email}</span>
                    <span className="text-[10px] text-text-sub">ACTIVE</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="grid grid-cols-3 gap-6 animate-in fade-in duration-500">
            {[{ title: '배경 제거', icon: 'brush' }, { title: '리터칭', icon: 'healing' }, { title: 'AI 업스케일', icon: 'auto_fix_high' }, { title: '필터 및 보정', icon: 'palette' }, { title: '자르기 및 리사이즈', icon: 'crop' }, { title: 'SVG 변환', icon: 'vector_square' }].map(tool => (
              <div key={tool.title} className="bg-white p-6 rounded-3xl border border-border-color shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-sub font-black">편집 도구</p>
                  <h3 className="text-xl font-black">{tool.title}</h3>
                </div>
                <span className="material-symbols-outlined text-3xl text-primary">{tool.icon}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="grid grid-cols-2 gap-6 animate-in fade-in duration-500">
            {[{ title: '이번 달 매출', value: '$15,240', change: '+8.5%' }, { title: '신규 결제', value: '142', change: '+12%' }, { title: '환불 건수', value: '3', change: '-2%' }, { title: '평균 결제 금액', value: '$68.40', change: '+5%' }].map(card => (
              <div key={card.title} className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-text-sub font-black">결제 현황</p>
                    <h3 className="text-xl font-black">{card.title}</h3>
                  </div>
                  <span className="text-[10px] font-black px-2 py-1 rounded-full bg-green-50 text-green-600">{card.change}</span>
                </div>
                <p className="text-3xl font-black">{card.value}</p>
              </div>
            ))}

            <div className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
              <h3 className="text-xl font-black mb-4">최근 결제</h3>
              <div className="space-y-4">
                {[{ name: '김민주', plan: 'PRO', amount: '$68.40', status: '성공' }, { name: '이수현', plan: 'TEAM', amount: '$120.00', status: '성공' }, { name: '박지훈', plan: 'FREE', amount: '$0', status: '실패' }].map(tx => (
                  <div key={tx.name} className="flex items-center justify-between p-4 bg-background rounded-2xl">
                    <div>
                      <p className="text-sm font-black">{tx.name}</p>
                      <p className="text-[10px] text-text-sub font-bold">{tx.plan} 플랜</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black">{tx.amount}</p>
                      <p className="text-[10px] text-green-600 font-bold">{tx.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs text-text-sub font-black">영업 성과</p>
                  <h3 className="text-xl font-black">영업팀 KPI</h3>
                </div>
                <button className="px-4 py-2 bg-primary/10 text-primary text-sm font-black rounded-xl">월간 보고서</button>
              </div>
              <div className="space-y-3">
                {[{ label: '전환율', value: '8.5%', change: '+1.2%' }, { label: '평균 체류 시간', value: '12m 40s', change: '+0.8m' }, { label: '세일즈 리드', value: '482', change: '+6.3%' }].map(row => (
                  <div key={row.label} className="flex items-center justify-between p-4 bg-background rounded-2xl">
                    <div>
                      <p className="text-sm font-black">{row.label}</p>
                      <p className="text-[10px] text-text-sub font-bold">주간 변화</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black">{row.value}</p>
                      <p className="text-[10px] text-primary font-bold">{row.change}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export const AdminPage = () => (
  <AuthProvider>
    <ProtectedRoute>
      <AdminDashboard />
    </ProtectedRoute>
  </AuthProvider>
);

export default AdminDashboard;
