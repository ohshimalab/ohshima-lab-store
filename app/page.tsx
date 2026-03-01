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

  // 2. 取引履歴（表示用：直近50件）
  const { data: history } = await supabase
    .from('transaction_details')
    .select('*')
    .limit(50)
    .order('created_at', { ascending: false })

  // 3. ランキング集計用（全件取得）
  const { data: allHistory } = await supabase
    .from('transaction_details')
    .select('user_name, product_name, total_amount, quantity')

  // サーバー側でランキングを集計
  const userSpending: Record<string, number> = {}
  const productCount: Record<string, number> = {}
  ;(allHistory || []).forEach((t: { user_name: string; product_name: string; total_amount: number; quantity: number }) => {
    const uName = t.user_name || '不明'
    userSpending[uName] = (userSpending[uName] || 0) + (t.total_amount || 0)
    const pName = t.product_name || '不明'
    productCount[pName] = (productCount[pName] || 0) + (t.quantity || 0)
  })
  const topUsers = Object.entries(userSpending).sort(([, a], [, b]) => b - a)
  const topProducts = Object.entries(productCount).sort(([, a], [, b]) => b - a)

  // 4. 商品一覧
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
    products: products || [],
    rankings: { topUsers, topProducts }
  }
}

export default async function Home() {
  const { users, history, products, rankings } = await getData()

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-20">
      <HomeClient users={users} history={history} products={products} rankings={rankings} />
    </main>
  )
}