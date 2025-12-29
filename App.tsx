import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type UserRole = 'normal' | 'admin' | 'special'

interface UserState {
  isLoggedIn: boolean
  id: string
  email: string
  name: string
  role: UserRole
}

export function App() {
  const [user, setUser] = useState<UserState>({
    isLoggedIn: false,
    id: '',
    email: '',
    name: '',
    role: 'normal',
  })

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)

  /* ===============================
     로그인 상태 감지 (핵심)
  =============================== */
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setUser({
          isLoggedIn: false,
          id: '',
          email: '',
          name: '',
          role: 'normal',
        })
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, role')
        .eq('id', session.user.id)
        .single()

      setUser({
        isLoggedIn: true,
        id: session.user.id,
        email: session.user.email ?? '',
        name: profile?.name ?? '사용자',
        role: profile?.role ?? 'normal',
      })

      // 관리자면 admin.html 이동
      if (profile?.role === 'admin') {
        window.location.href = '/admin.html'
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  /* ===============================
     로그인
  =============================== */
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
    }
  }

  /* ===============================
     회원가입
  =============================== */
  const handleSignup = async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error || !data.user) {
      alert(error?.message)
      return
    }

    await supabase.from('profiles').insert({
      id: data.user.id,
      email,
      name: '신규 사용자',
      role: 'normal',
      plan: 'free',
      credits: 30,
    })

    alert('회원가입 완료')
  }

  /* ===============================
     로그아웃
  =============================== */
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  /* ===============================
     로딩 중
  =============================== */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        로딩 중...
      </div>
    )
  }

  /* ===============================
     로그인 전 화면
  =============================== */
  if (!user.isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">ImageGenius 로그인</h1>

        <input
          className="border p-2 rounded w-64"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="border p-2 rounded w-64"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex gap-2">
          <button
            onClick={handleLogin}
            className="px-4 py-2 bg-black text-white rounded"
          >
            로그인
          </button>
          <button
            onClick={handleSignup}
            className="px-4 py-2 border rounded"
          >
            회원가입
          </button>
        </div>
      </div>
    )
  }

  /* ===============================
     로그인 후 메인 화면
  =============================== */
  return (
    <div className="min-h-screen p-8">
      <header className="flex justify-between items-center mb-8">
        <h2 className="text-xl font-bold">
          안녕하세요, {user.name}님
        </h2>
        <button
          onClick={handleLogout}
          className="px-4 py-2 border rounded"
        >
          로그아웃
        </button>
      </header>

      <main>
        <p>여기에 AI 이미지 기능 / 편집 UI 연결</p>
      </main>
    </div>
  )
}
