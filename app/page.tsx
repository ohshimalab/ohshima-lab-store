import { supabase } from '@/lib/supabase'
import HomeClient from './HomeClient'

export const dynamic = 'force-dynamic'

async function getData() {
  // 1. ユーザー一覧を取得
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true)
    .order('id')

  // 2. 取引履歴を取得 (★NEW: 直近50件)
  // ランキング計算と履歴表示に使います
  const { data: history } = await supabase
    .from('transaction_details')
    .select('*')
    .limit(50)
    .order('created_at', { ascending: false })

  return {
    users: users || [],
    history: history || []
  }
}

export default async function Home() {
  const { users, history } = await getData()

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-20">
      {/* 履歴データも渡す */}
      <HomeClient users={users} history={history} />
    </main>
  )
}