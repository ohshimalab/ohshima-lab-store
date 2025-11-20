import { supabase } from '@/lib/supabase'
import ShopClient from './ShopClient'

// データベースからデータを取得する関数
async function getData(userId: string) {
  // 1. ユーザー情報を取得
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  // 2. 商品一覧を取得（ID順に並べる）
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('id')

  return { user, products }
}

// 画面本体
export default async function ShopPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const { user, products } = await getData(userId)

  if (!user) {
    return <div className="p-4">ユーザーが見つかりません</div>
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-20">
      <div className="max-w-md mx-auto">
        {/* さっき作ったクライアント部品を表示 */}
        <ShopClient user={user} products={products || []} />
      </div>
    </main>
  )
}