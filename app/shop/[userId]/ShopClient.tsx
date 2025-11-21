'use client'

import { createClient } from '@supabase/supabase-js'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type User = {
  id: number
  name: string
  grade: string
}
type Product = {
  id: number
  name: string
  price: number
  stock: number
  category: string
}

export default function ShopClient({ 
  user, 
  products,
  initialBalance
}: { 
  user: User, 
  products: Product[],
  initialBalance: number
}) {
  const router = useRouter()
  const [currentProducts, setCurrentProducts] = useState(products)
  const [currentBalance, setCurrentBalance] = useState(initialBalance)
  const [loading, setLoading] = useState(false)
  
  // カート状態: { 商品ID: 個数 } という形で管理
  // 例: { 1: 2, 4: 1 } -> 商品ID1が2個、ID4が1個
  const [cart, setCart] = useState<Record<number, number>>({})

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // カートに入れる（＋ボタン）
  const increment = (product: Product) => {
    const currentQty = cart[product.id] || 0
    if (currentQty >= product.stock) return // 在庫以上は選べない
    setCart({ ...cart, [product.id]: currentQty + 1 })
  }

  // カートから減らす（－ボタン）
  const decrement = (productId: number) => {
    const currentQty = cart[productId] || 0
    if (currentQty <= 0) return
    const newCart = { ...cart, [productId]: currentQty - 1 }
    if (newCart[productId] <= 0) delete newCart[productId] // 0になったらキーごと消す
    setCart(newCart)
  }

  // 合計金額の計算
  const totalAmount = Object.entries(cart).reduce((sum, [id, qty]) => {
    const product = currentProducts.find(p => p.id === Number(id))
    return sum + (product ? product.price * qty : 0)
  }, 0)

  // まとめて購入処理
  const handleCheckout = async () => {
    if (totalAmount === 0) return
    if (loading) return

    // ... (残高チェックなどはそのまま) ...
    
    if (!confirm(`合計 ${totalAmount} 円で決済しますか？`)) return

    setLoading(true)

    // API用データ作成
    const items = Object.entries(cart).map(([id, qty]) => ({
        product_id: Number(id),
        quantity: qty
    }))

    try {
        const { data, error } = await supabase.rpc('purchase_cart', {
            p_user_id: user.id,
            p_items: items
        })

        if (error) {
            alert('エラー: ' + error.message)
        } else if (data.success) {
            alert('購入完了しました！')
            
            // 購入した商品ごとに、残り在庫を計算して通知判定
            items.forEach(item => {
                const product = currentProducts.find(p => p.id === item.product_id)
                if (product) {
                    const remainingStock = product.stock - item.quantity
                    
                    // 「元々は4個以上あったけど、今回の購入で3個以下になった時」だけ通知するとスマートです
                    // が、簡単にするため「3個以下なら毎回通知」にします（買い忘れ防止のためしつこく通知）
                    if (remainingStock <= 3) {
                        // 裏側でこっそりAPIを呼ぶ（awaitしなくて良い＝ユーザーを待たせない）
                        fetch('/api/slack', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                productName: product.name, 
                                stock: remainingStock 
                            })
                        })
                    }
                }
            })

            setCart({}) 
            setCurrentBalance(data.new_balance) 
            router.refresh() 
        } else {
            alert('購入失敗: ' + data.error)
        }
    } catch (e) {
        alert('通信エラーが発生しました')
    } finally {
        setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto pb-24"> {/* 下部の固定バーのために余白確保 */}
      <div className="flex justify-between items-center mb-4 sticky top-0 bg-gray-50 py-2 z-10">
        <div>
            <h1 className="text-xl font-bold text-gray-800">
            🛒 {user.name}
            </h1>
            <p className="text-xs text-gray-500">商品を選んでください</p>
        </div>
        <div className="bg-white border border-blue-200 text-blue-800 px-3 py-1 rounded-lg font-bold shadow-sm">
          残高: {currentBalance.toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {currentProducts.map((product) => {
          const quantity = cart[product.id] || 0
          const isStockOut = product.stock <= 0

          return (
            <div
              key={product.id}
              className={`flex justify-between items-center p-3 rounded-lg border bg-white shadow-sm
                ${isStockOut ? 'opacity-60 bg-gray-100' : ''}`}
            >
              {/* 左側：商品情報 */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold bg-gray-100 text-gray-500 px-1.5 rounded">{product.category}</span>
                    <h2 className="font-bold text-gray-800">{product.name}</h2>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <span className="font-bold text-blue-600">¥{product.price}</span>
                    <span className={`text-xs ${product.stock < 3 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                        (在庫: {product.stock})
                    </span>
                </div>
              </div>

              {/* 右側：カウンター */}
              {isStockOut ? (
                  <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100">売り切れ</span>
              ) : (
                  <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-1 border border-gray-200">
                    <button
                        onClick={() => decrement(product.id)}
                        disabled={quantity === 0}
                        className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm text-blue-600 font-bold disabled:opacity-30 disabled:shadow-none"
                    >
                        －
                    </button>
                    <span className="w-6 text-center font-bold text-lg text-gray-700">{quantity}</span>
                    <button
                        onClick={() => increment(product)}
                        disabled={quantity >= product.stock}
                        className="w-8 h-8 flex items-center justify-center bg-blue-600 rounded shadow-sm text-white font-bold disabled:bg-gray-300 disabled:shadow-none"
                    >
                        ＋
                    </button>
                  </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 下部固定：合計金額と決済ボタン */}
      {totalAmount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] p-4 animate-slide-up z-50">
            <div className="max-w-md mx-auto flex justify-between items-center gap-4">
                <div>
                    <p className="text-xs text-gray-500 font-bold">お支払い合計</p>
                    <p className="text-2xl font-extrabold text-blue-600">¥{totalAmount.toLocaleString()}</p>
                </div>
                <button
                    onClick={handleCheckout}
                    disabled={loading}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-700 active:scale-95 transition transform flex justify-center items-center gap-2"
                >
                    {loading ? '処理中...' : '購入を確定する'}
                </button>
            </div>
        </div>
      )}

      <button
        onClick={() => router.push('/')}
        className="mt-8 w-full py-3 text-gray-400 text-sm hover:text-gray-600"
      >
        トップに戻る
      </button>
    </div>
  )
}