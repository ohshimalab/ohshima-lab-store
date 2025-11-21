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
}

// PropsにinitialBalanceを追加
export default function ShopClient({ 
  user, 
  products,
  initialBalance // ★NEW
}: { 
  user: User, 
  products: Product[],
  initialBalance: number // ★NEW
}) {
  const router = useRouter()
  const [currentProducts, setCurrentProducts] = useState(products)
  const [loadingProductId, setLoadingProductId] = useState<number | null>(null)
  const [currentBalance, setCurrentBalance] = useState(initialBalance) // ★NEW: 残高State
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handlePurchase = async (product: Product) => {
    // 残高チェックをフロントエンドでも行う（UI制御）
    if (currentBalance < product.price) {
        alert(`${user.name}さん、残高が足りません。現在の残高は ${currentBalance} 円です。`);
        return; 
    }

    if (product.stock <= 0) {
      alert(`${product.name}は在庫切れです。`);
      return;
    }

    if (!confirm(`${user.name}さん、${product.name}を ${product.price} 円で購入しますか？\n残高: ${currentBalance} 円 → ${currentBalance - product.price} 円`)) {
        return
    }

    setLoadingProductId(product.id)

    // RPC関数呼び出し
    const { data: result, error } = await supabase.rpc('purchase_item', {
      p_user_id: user.id,
      p_product_id: product.id,
    })

    setLoadingProductId(null)

    if (error) {
        console.error('Purchase Error:', error)
        if (error.message.includes('Insufficient balance')) {
            alert(`購入失敗：残高が足りません。\n現在の残高: ${currentBalance} 円`);
        } else {
            alert(`購入に失敗しました: ${error.message}`)
        }
    } else if (result && result.success) {
      // 成功時の処理
      alert(`${product.name} の購入が完了しました！\n残高: ${result.new_balance} 円`);
      
      // Stateの更新
      setCurrentProducts(prev => 
        prev.map(p => p.id === product.id ? { ...p, stock: result.new_stock } : p)
      )
      setCurrentBalance(result.new_balance) // ★NEW: 残高を更新

    } else if (result && result.error) {
        alert(`購入失敗: ${result.error}`)
    } else {
        alert('不明なエラーが発生しました。')
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          🛒 {user.name} のお会計
        </h1>
        {/* 残高表示エリアを設置 */}
        <div className="bg-blue-100 text-blue-800 p-2 rounded-lg font-bold">
          残高: {currentBalance.toLocaleString()} 円
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {currentProducts.map((product) => {
          const isAvailable = product.stock > 0;
          const isLoading = loadingProductId === product.id;
          const canAfford = currentBalance >= product.price; // 支払えるか

          return (
            <div
              key={product.id}
              className={`p-4 rounded-lg shadow-md transition-all 
                ${isAvailable ? (canAfford ? 'bg-white hover:shadow-lg' : 'bg-yellow-50 opacity-70') : 'bg-gray-200 opacity-60'}
              `}
            >
              <h2 className="text-lg font-bold mb-1 text-gray-800">
                {product.name}
              </h2>
              <p className="text-2xl font-extrabold text-green-600 mb-2">
                ¥{product.price.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 mb-3">
                在庫: {product.stock}
              </p>
              <button
                onClick={() => handlePurchase(product)}
                disabled={!isAvailable || isLoading || !canAfford}
                className={`w-full py-2 rounded-md font-semibold text-white transition-colors
                  ${isAvailable && canAfford
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-gray-400 cursor-not-allowed'
                  }
                  ${isLoading ? 'animate-pulse' : ''}
                `}
              >
                {isLoading ? '処理中...' : !isAvailable ? '在庫切れ' : !canAfford ? '残高不足' : '購入する'}
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => router.push('/')}
        className="mt-6 w-full py-3 bg-gray-300 text-gray-800 rounded-md font-semibold hover:bg-gray-400 transition-colors"
      >
        他のメンバーを選ぶ
      </button>
    </div>
  )
}