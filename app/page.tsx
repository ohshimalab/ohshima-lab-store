import { supabase } from '@/lib/supabase'
import HomeClient from './HomeClient'

// データ取得時にキャッシュしない（常に最新のカード情報を取るため）
export const dynamic = 'force-dynamic'

async function getUsers() {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true)
    .order('id')
  
  if (error) {
    console.error("User fetch error:", error)
    return []
  }

  return users || []
}

export default async function Home() {
  const users = await getUsers()

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-20">
      {/* Client Componentにデータを渡す */}
      <HomeClient users={users} />
    </main>
  )
}