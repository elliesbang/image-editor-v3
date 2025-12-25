
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from '../auth/AuthContext';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { supabase } from '../lib/supabaseClient';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState<any[]>([]);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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
    window.location.href = '/home';
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
          <button onClick={handleLogout} className="w-full flex items-center gap-4 px-4 py-3 text-text-sub font-black text-sm hover:text-red-500"><span className="material-symbols-outlined">logout</span>로그아웃</button>
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
          <div className="space-y-8 animate-in fade-in duration-500">
             <div className="flex justify-between items-end">
              <div><h2 className="text-3xl font-black mb-1">사용자 관리</h2><p className="text-text-sub text-sm font-bold">모든 사용자 계정 상태 조회 및 관리</p></div>
              <div className="flex items-center gap-4">
                <label className="cursor-pointer bg-white border border-border-color px-6 py-2.5 rounded-xl font-black text-sm shadow-sm hover:bg-background">
                  <span className="material-symbols-outlined align-middle mr-2 text-primary">upload_file</span>미치나 명단(CSV) 업로드
                  <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
                </label>
                <button className="bg-primary px-6 py-2.5 rounded-xl font-black text-sm shadow-sm"><span className="material-symbols-outlined align-middle mr-2">person_add</span>사용자 초대</button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {[
                { label: '총 사용자', value: '12,450', icon: 'group' },
                { label: '활성 사용자', value: '8,932', icon: 'person_check', color: 'text-green-500' },
                { label: '유료 구독자', value: '3,245', icon: 'military_tech', color: 'text-blue-500' },
              ].map(stat => (
                <div key={stat.label} className="bg-white p-6 rounded-3xl border border-border-color flex items-center gap-6">
                  <div className="size-12 bg-gray-50 rounded-2xl flex items-center justify-center"><span className={`material-symbols-outlined ${stat.color || 'text-text-main'}`}>{stat.icon}</span></div>
                  <div><h4 className="text-[10px] text-text-sub font-bold uppercase">{stat.label}</h4><p className="text-2xl font-black">{stat.value}</p></div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-3xl border border-border-color shadow-sm overflow-hidden">
              <div className="p-6 border-b border-border-color flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-sub text-lg">search</span>
                  <input type="text" placeholder="이름, 이메일 검색..." className="w-full bg-background border-none pl-12 pr-4 py-2.5 rounded-xl text-xs font-bold" />
                </div>
                <div className="flex items-center gap-2">
                  <select className="bg-background border-none px-4 py-2.5 rounded-xl text-xs font-black">
                    <option>모든 요금제</option><option>무료</option><option>프로</option><option>팀</option>
                  </select>
                  <select className="bg-background border-none px-4 py-2.5 rounded-xl text-xs font-black">
                    <option>모든 상태</option><option>활성</option><option>비활성</option><option>정지됨</option>
                  </select>
                  <button className="p-2.5 bg-background rounded-xl text-text-sub"><span className="material-symbols-outlined text-lg">filter_alt_off</span></button>
                  <select className="bg-background border-none px-4 py-2.5 rounded-xl text-xs font-black">
                    <option>최근 가입순</option><option>오래된순</option>
                  </select>
                </div>
              </div>
              <table className="w-full text-left">
                <thead className="bg-background/50 border-b border-border-color">
                  <tr className="text-[10px] font-black text-text-sub uppercase">
                    <th className="px-8 py-4 w-10"><input type="checkbox" className="rounded border-border-color" /></th>
                    <th className="px-4 py-4">사용자 정보</th>
                    <th className="px-4 py-4">상태</th>
                    <th className="px-4 py-4">요금제</th>
                    <th className="px-4 py-4">가입일</th>
                    <th className="px-4 py-4">마지막 활동</th>
                    <th className="px-4 py-4 text-center">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color">
                  {users.slice(0, 5).map(u => (
                    <tr key={u.id} className="hover:bg-background/30 transition-colors">
                      <td className="px-8 py-4"><input type="checkbox" className="rounded border-border-color" /></td>
                      <td className="px-4 py-4 flex items-center gap-3">
                        <div className="size-8 bg-primary/20 rounded-full flex items-center justify-center font-black text-[10px]">{u.name?.charAt(0)}</div>
                        <div><h5 className="text-xs font-black leading-none">{u.name}</h5><p className="text-[10px] text-text-sub font-bold">{u.email}</p></div>
                      </td>
                      <td className="px-4 py-4"><span className={`px-3 py-1 rounded-full text-[10px] font-black border ${u.status === 'suspended' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>{u.status === 'suspended' ? '정지됨' : '활성'}</span></td>
                      <td className="px-4 py-4"><span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 bg-gray-100 rounded-lg"><span className="material-symbols-outlined text-[10px]">grade</span>{u.plan?.toUpperCase() || 'FREE'}</span></td>
                      <td className="px-4 py-4 text-[10px] font-bold text-text-sub">2023. 10. 15</td>
                      <td className="px-4 py-4 text-[10px] font-bold text-text-sub">2분 전</td>
                      <td className="px-4 py-4 text-center"><span className="material-symbols-outlined text-text-sub cursor-pointer">more_vert</span></td>
                    </tr>
                  ))}
                  {/* Mock Users */}
                  {[
                    { name: 'Sarah M.', email: 'sarah@design.co', status: 'active', plan: 'pro' },
                    { name: 'James L.', email: 'james@agency.net', status: 'inactive', plan: 'free' },
                    { name: 'Alex T.', email: 'alex@tech.io', status: 'active', plan: 'team' },
                  ].map((u, i) => (
                    <tr key={i} className="hover:bg-background/30 transition-colors">
                      <td className="px-8 py-4"><input type="checkbox" className="rounded border-border-color" /></td>
                      <td className="px-4 py-4 flex items-center gap-3">
                        <div className="size-8 bg-gray-200 rounded-full flex items-center justify-center font-black text-[10px] overflow-hidden"><img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`} alt="" /></div>
                        <div><h5 className="text-xs font-black leading-none">{u.name}</h5><p className="text-[10px] text-text-sub font-bold">{u.email}</p></div>
                      </td>
                      <td className="px-4 py-4"><span className={`px-3 py-1 rounded-full text-[10px] font-black border ${u.status === 'active' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-100 text-text-sub border-gray-200'}`}>{u.status === 'active' ? '활성' : '비활성'}</span></td>
                      <td className="px-4 py-4"><span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-lg"><span className="material-symbols-outlined text-[10px]">grade</span>{u.plan.toUpperCase()}</span></td>
                      <td className="px-4 py-4 text-[10px] font-bold text-text-sub">2023. 10. 15</td>
                      <td className="px-4 py-4 text-[10px] font-bold text-text-sub">5일 전</td>
                      <td className="px-4 py-4 text-center"><span className="material-symbols-outlined text-text-sub cursor-pointer">more_vert</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-4 flex items-center justify-between border-t border-border-color bg-background/30">
                <span className="text-[10px] font-bold text-text-sub">1 - 10 / 12,450</span>
                <div className="flex gap-2">
                  <button className="size-8 rounded-lg bg-white border border-border-color flex items-center justify-center text-text-sub"><span className="material-symbols-outlined text-sm">chevron_left</span></button>
                  <button className="size-8 rounded-lg bg-primary font-black text-[10px]">1</button>
                  <button className="size-8 rounded-lg bg-white border border-border-color font-black text-[10px]">2</button>
                  <button className="size-8 rounded-lg bg-white border border-border-color font-black text-[10px]">3</button>
                  <span className="self-end pb-1 text-[10px] font-bold">...</span>
                  <button className="size-8 rounded-lg bg-white border border-border-color font-black text-[10px]">12</button>
                  <button className="size-8 rounded-lg bg-white border border-border-color flex items-center justify-center text-text-sub"><span className="material-symbols-outlined text-sm">chevron_right</span></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
              <div><h2 className="text-3xl font-black mb-1">편집 도구 관리</h2><p className="text-text-sub text-sm font-bold">앱에서 제공하는 이미지 처리 기능을 설정하고 관리합니다.</p></div>
              <div className="flex items-center gap-4">
                <button className="bg-white border border-border-color px-6 py-2.5 rounded-xl font-black text-sm shadow-sm"><span className="material-symbols-outlined align-middle mr-2">history</span>변경 로그</button>
                <button className="bg-primary px-6 py-2.5 rounded-xl font-black text-sm shadow-sm"><span className="material-symbols-outlined align-middle mr-2">add</span>새 도구 추가</button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {[
                { label: '전체 도구', value: '8개', icon: 'inventory_2' },
                { label: '활성화됨', value: '7개', icon: 'check_circle', color: 'text-green-500' },
                { label: '유지보수 중', value: '1개', icon: 'build', color: 'text-yellow-500' },
              ].map(stat => (
                <div key={stat.label} className="bg-white p-6 rounded-3xl border border-border-color flex items-center gap-6">
                  <div className="size-12 bg-gray-50 rounded-2xl flex items-center justify-center"><span className={`material-symbols-outlined ${stat.color || 'text-text-main'}`}>{stat.icon}</span></div>
                  <div><h4 className="text-[10px] text-text-sub font-bold uppercase">{stat.label}</h4><p className="text-2xl font-black">{stat.value}</p></div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-6">
              {[
                { name: '배경 제거', desc: 'AI 모델을 사용하여 이미지의 배경을 정밀하게 감지하고 투명하게 제거합니다.', active: true, popular: true },
                { name: '스마트 리사이즈', desc: '화질 손상을 최소화하면서 이미지 크기를 조절하고 비율을 최적화합니다.', active: true },
                { name: '노이즈 제거', desc: '저조도 촬영 이미지의 그레인과 디지털 노이즈를 효과적으로 제거하여 선명하게 만듭니다.', active: true },
                { name: '포맷 변환기', desc: 'PNG, JPG, SVG, GIF, WebP 등 다양한 이미지 포맷 간의 빠르고 정확한 변환을 지원합니다.', active: true },
                { name: 'AI 키워드 분석', desc: '이미지 내용을 심층 분석하여 검색 최적화(SEO)를 위한 태그와 키워드를 자동 생성합니다.', active: false, maintenance: true },
                { name: 'AI 업스케일', desc: '저해상도 이미지를 딥러닝 기술로 최대 4배까지 선명하게 확대하여 화질을 개선합니다.', active: true },
              ].map(tool => (
                <div key={tool.name} className="bg-white p-6 rounded-3xl border border-border-color shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="size-10 bg-gray-50 rounded-xl flex items-center justify-center"><span className="material-symbols-outlined text-lg">image</span></div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={tool.active} className="sr-only peer" readOnly />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-black text-sm flex items-center gap-2">
                      {tool.name} 
                      {tool.popular && <span className="bg-yellow-100 text-yellow-700 text-[8px] px-1.5 py-0.5 rounded uppercase">인기</span>}
                      {tool.maintenance && <span className="bg-gray-100 text-text-sub text-[8px] px-1.5 py-0.5 rounded uppercase">점검중</span>}
                    </h4>
                    <p className="text-[10px] text-text-sub font-bold leading-relaxed">{tool.desc}</p>
                  </div>
                  <div className="pt-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] font-black text-green-600"><span className="size-1.5 bg-green-500 rounded-full animate-pulse"></span> 정상 작동</span>
                    <button className="bg-background px-4 py-1.5 rounded-lg text-[10px] font-black hover:bg-border-color">설정</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white p-8 rounded-3xl border border-border-color shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-sm flex items-center gap-2"><span className="material-symbols-outlined text-lg">settings</span> 배경 제거 세부 설정</h3>
                <button className="text-xs font-black text-text-sub hover:text-text-main underline">저장하기</button>
              </div>
              <div className="h-20 border-2 border-dashed border-border-color rounded-2xl flex items-center justify-center">
                 <p className="text-[10px] font-bold text-text-sub uppercase tracking-widest">세부 파라미터 구성 영역</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="space-y-8 animate-in fade-in duration-500">
             <div className="flex justify-between items-end">
              <div><h2 className="text-3xl font-black mb-1">결제 관리</h2><p className="text-text-sub text-sm font-bold">결제 내역, 구독 플랜 및 수익 통계</p></div>
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
                { label: '총 매출 (이번 달)', value: '₩18,450,000', growth: '+5.2%', icon: 'payments' },
                { label: '신규 구독자', value: '145명', growth: '+1.2%', icon: 'person_add' },
                { label: '결제 성공 건수', value: '2,302건', growth: '+8.5%', icon: 'check_circle' },
                { label: '평균 사용자 매출 (ARPU)', value: '₩21,500', growth: '안정적', icon: 'analytics' },
              ].map(card => (
                <div key={card.label} className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="size-10 bg-gray-100 rounded-xl flex items-center justify-center"><span className="material-symbols-outlined text-text-sub">{card.icon}</span></div>
                    <span className="text-[10px] font-black px-2 py-0.5 bg-green-100 text-green-600 rounded-full">{card.growth}</span>
                  </div>
                  <h4 className="text-xs text-text-sub font-bold mb-1">{card.label}</h4>
                  <p className="text-xl font-black">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-6">
               <div className="col-span-2 bg-white p-8 rounded-3xl border border-border-color shadow-sm relative h-[400px]">
                <div className="flex justify-between items-center mb-8">
                  <div><h3 className="font-black text-lg">일별 매출 추이</h3><p className="text-xs text-text-sub font-bold">지난 7일간의 총 매출액 변화</p></div>
                  <span className="material-symbols-outlined text-text-sub cursor-pointer">more_horiz</span>
                </div>
                {/* Mock Chart Area */}
                <div className="flex items-end justify-between h-48 gap-4 px-4">
                  {[30, 40, 50, 45, 70, 60, 40].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col gap-2 items-center">
                      <div className="w-full bg-primary/20 rounded-t-lg relative" style={{ height: '100px' }}>
                        <div className="absolute bottom-0 w-full bg-primary rounded-t-lg" style={{ height: `${h}%` }}></div>
                      </div>
                      <span className="text-[10px] font-bold text-text-sub">{['월', '화', '수', '목', '금', '토', '일'][i]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                 <div className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
                  <h3 className="font-black text-sm mb-6 uppercase tracking-wider">플랜별 인기 기능</h3>
                  <div className="space-y-6">
                    {[
                      { label: '프로 플랜 (배경 제거)', value: '42%' },
                      { label: '팀 플랜 (AI 업스케일)', value: '28%' },
                      { label: '베이직 플랜 (필터)', value: '15%' },
                      { label: '무료 (기본 편집)', value: '15%' },
                    ].map(feat => (
                      <div key={feat.label} className="space-y-2">
                        <div className="flex justify-between text-xs font-black"><span>{feat.label}</span><span>{feat.value}</span></div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden"><div className="bg-primary h-full" style={{ width: feat.value }}></div></div>
                      </div>
                    ))}
                  </div>
                </div>
                 <div className="bg-white p-6 rounded-3xl border border-border-color shadow-sm">
                  <h3 className="font-black text-sm mb-4 uppercase tracking-wider">구독 플랜 비율</h3>
                  <div className="flex items-center gap-6">
                    <div className="size-20 bg-gray-50 rounded-full border-4 border-primary flex items-center justify-center font-black text-xs">85%</div>
                    <div className="space-y-1 text-[9px] font-bold">
                      <div className="flex items-center gap-2"><span>무료 60%</span></div>
                      <div className="flex items-center gap-2"><span>프로 30%</span></div>
                      <div className="flex items-center gap-2"><span>팀 10%</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-border-color shadow-sm">
              <div className="p-6 border-b border-border-color flex justify-between items-center">
                <h3 className="font-black text-sm">최근 결제 내역</h3>
                <button className="text-[10px] font-black text-text-sub hover:underline">모두 보기</button>
              </div>
              <table className="w-full text-left text-[10px] font-black">
                <thead className="bg-background/50">
                  <tr className="text-text-sub uppercase border-b border-border-color">
                    <th className="px-8 py-4">사용자</th>
                    <th className="px-4 py-4">플랜 및 항목</th>
                    <th className="px-4 py-4">결제일</th>
                    <th className="px-4 py-4">상태</th>
                    <th className="px-4 py-4 text-right">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-color">
                  {[
                    { u: 'Sarah M.', p: 'Pro Monthly', d: '2023.11.02', s: '완료', a: '₩9,900' },
                    { u: 'James L.', p: 'Standard Annual', d: '2023.11.02', s: '대기', a: '₩179,100' },
                    { u: 'Alex T.', p: 'Team Monthly', d: '2023.11.01', s: '완료', a: '₩39,900' },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-background/30">
                      <td className="px-8 py-4">{row.u}</td>
                      <td className="px-4 py-4">{row.p}</td>
                      <td className="px-4 py-4 text-text-sub">{row.d}</td>
                      <td className="px-4 py-4"><span className={`px-2 py-0.5 rounded-full ${row.s === '완료' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>{row.s}</span></td>
                      <td className="px-4 py-4 text-right font-black">{row.a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <AuthProvider>
    <ProtectedRoute>
      <AdminDashboard />
    </ProtectedRoute>
  </AuthProvider>
);
