import { supabase } from '@/lib/supabase'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic' // 常に最新データを取得する設定

export default async function AdminPage() {
  // 商品一覧を取得
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('id')

  // 金庫残高を取得
  const { data: funds } = await supabase
    .from('lab_fund')
    .select('current_balance')
    .limit(1)
    .single()

  return (
    <main className="min-h-screen bg-gray-100 p-6 pb-20">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          🛠️ 管理者ダッシュボード
        </h1>
        <AdminClient 
            initialProducts={products || []} 
            initialFund={funds?.current_balance || 0} 
        />
      </div>
    </main>
  )
}