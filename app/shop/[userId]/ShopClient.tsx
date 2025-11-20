'use client' // これが「ブラウザで動く部品」という宣言です

import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

// 必要なデータの形を定義
type Product = {
  id: number
  name: string
  price: number
  stock: number
  category: string
}

type User = {
  id: number
  name: string
}

export default function ShopClient({ user, products }: { user: User, products: Product[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // Supabase接続（クライアント側用）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 購入ボタンを押した時の処理
  const handlePurchase = async (product: Product) => {
    if (product.stock <= 0) return
    
    const confirmMessage = `${product.name} (${product.price}円) を購入しますか？\n\n※お金箱に ${product.price}円 を入れてください。`
    
    if (!window.confirm(confirmMessage)) return

    setLoading(true)

    try {
      // 以前SQLで作った「purchase_item」関数を呼び出す
      const { data, error } = await supabase.rpc('purchase_item', {
        p_user_id: user.id,
        p_product_id: product.id,
        p_quantity: 1
      })

      if (error) throw error

      if (data.success) {
        alert('購入しました！')
        router.refresh() // 画面の在庫数を最新にする
      } else {
        alert('エラー: ' + data.message)
      }
    } catch (e) {
      console.error(e)
      alert('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">
          {user.name} さん
        </h2>
        <button onClick={() => router.push('/')} className="text-sm text-gray-500 underline">
          戻る
        </button>
      </div>

      {loading && <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 text-white font-bold">処理中...</div>}

      <div className="grid grid-cols-2 gap-4">
        {products.map((product) => (
          <button
            key={product.id}
            disabled={product.stock <= 0 || loading}
            onClick={() => handlePurchase(product)}
            className={`p-4 rounded-xl border-2 text-left transition relative shadow-sm
              ${product.stock > 0 
                ? 'bg-white border-transparent hover:border-blue-400 active:scale-95' 
                : 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed'}`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {product.category}
              </span>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                残 {product.stock}
              </span>
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-1">{product.name}</h3>
            <p className="text-blue-600 font-bold text-xl">¥{product.price}</p>
          </button>
        ))}
      </div>
    </div>
  )
}