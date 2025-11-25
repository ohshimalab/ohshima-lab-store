import { supabase } from '@/lib/supabase'
import HomeClient from './HomeClient'

export const dynamic = 'force-dynamic'

async function getData() {
  // 1. ユーザー一覧
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true)
    .order('id')

  // 2. 取引履歴
  const { data: history } = await supabase
    .from('transaction_details')
    .select('*')
    .limit(50)
    .order('created_at', { ascending: false })

  // 3. 商品一覧 (★NEW: これを追加)
  // 販売中(is_active=true)のものだけを取得
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('category') // カテゴリ順に並べる
    .order('id')

  return {
    users: users || [],
    history: history || [],
    products: products || [] // ★渡す
  }
}

export default async function Home() {
  const { users, history, products } = await getData()

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-20">
      {/* productsも渡す */}
      <HomeClient users={users} history={history} products={products} />
    </main>
  )
}