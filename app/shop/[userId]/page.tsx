import { supabase } from '@/lib/supabase'
import ShopClient from './ShopClient'

export const dynamic = 'force-dynamic'

// ★変更点1: params を Promise型にする
type Props = {
  params: Promise<{ userId: string }>
}

async function getData(userId: string) {
  // 1. ユーザー情報を取得
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  // 2. 商品一覧を取得
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('id')
    
  // 3. ユーザー残高を取得
  const { data: balanceData } = await supabase
    .from('user_balances')
    .select('balance')
    .eq('user_id', userId)
    .single()

  return { 
    user, 
    products, 
    currentBalance: balanceData?.balance || 0 
  }
}

export default async function ShopPage({ params }: Props) {
  // ★変更点2: params を await して中身を取り出す
  const { userId } = await params
  
  const { user, products, currentBalance } = await getData(userId)

  if (!user) {
    return <div className="text-center p-8">ユーザーが見つかりません</div>
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-20">
      <ShopClient 
        user={user} 
        products={products || []} 
        initialBalance={currentBalance} 
      />
    </main>
  )
}