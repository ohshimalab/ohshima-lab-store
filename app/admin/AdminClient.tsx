'use client'

import { createClient } from '@supabase/supabase-js'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Product = {
  id: number
  name: string
  price: number
  stock: number
}

export default function AdminClient({ initialProducts, initialFund }: { initialProducts: Product[], initialFund: number }) {
  const router = useRouter()
  const [products, setProducts] = useState(initialProducts)
  const [fund, setFund] = useState(initialFund)
  const [loading, setLoading] = useState(false)

  // Supabase接続
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 金庫残高の更新
  const updateFund = async () => {
    if (!confirm(`金庫残高を ${fund} 円に更新しますか？`)) return
    setLoading(true)

    const { error } = await supabase
      .from('lab_fund')
      .update({ current_balance: fund })
      .eq('id', 1)

    if (error) alert('エラー: ' + error.message)
    else alert('金庫残高を更新しました')
    
    setLoading(false)
    router.refresh()
  }

  // 在庫数の更新
  const updateStock = async (id: number, newStock: number) => {
    // 入力値をStateに反映
    const newProducts = products.map(p => p.id === id ? { ...p, stock: newStock } : p)
    setProducts(newProducts)
  }

  // 在庫保存処理（行ごとの保存ボタン）
  const saveStock = async (product: Product) => {
    setLoading(true)
    const { error } = await supabase
      .from('products')
      .update({ stock: product.stock })
      .eq('id', product.id)

    if (error) alert('エラー: ' + error.message)
    else {
        // 成功したら簡単なエフェクト等は省略（静かに更新）
    }
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="space-y-10">
      {/* 1. 金庫管理エリア */}
      <section className="bg-white p-6 rounded-xl shadow-md border border-blue-100">
        <h2 className="text-lg font-bold text-gray-700 mb-4">💰 金庫残高の管理</h2>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={fund}
            onChange={(e) => setFund(Number(e.target.value))}
            className="text-3xl font-bold p-2 border rounded w-40 text-right"
          />
          <span className="text-xl font-bold text-gray-600">円</span>
          <button 
            onClick={updateFund}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            更新する
          </button>
        </div>
      </section>

      {/* 2. 在庫管理エリア */}
      <section className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <h2 className="text-lg font-bold text-gray-700 mb-4">📦 商品在庫の棚卸し・補充</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 border-b">
              <tr>
                <th className="p-3">商品名</th>
                <th className="p-3">単価</th>
                <th className="p-3">現在在庫</th>
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="p-3 font-bold text-gray-800">{product.name}</td>
                  <td className="p-3 text-gray-500">¥{product.price}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => updateStock(product.id, product.stock - 1)}
                            className="bg-red-100 text-red-600 w-8 h-8 rounded hover:bg-red-200"
                        >-</button>
                        <input
                            type="number"
                            value={product.stock}
                            onChange={(e) => updateStock(product.id, Number(e.target.value))}
                            className="w-16 text-center border rounded p-1 font-bold"
                        />
                        <button 
                            onClick={() => updateStock(product.id, product.stock + 1)}
                            className="bg-green-100 text-green-600 w-8 h-8 rounded hover:bg-green-200"
                        >+</button>
                    </div>
                  </td>
                  <td className="p-3">
                    <button 
                      onClick={() => saveStock(product)}
                      disabled={loading}
                      className="text-blue-600 font-bold hover:underline disabled:opacity-50"
                    >
                      保存
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}