'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { Product, ExpenseItem } from '../../types'
import { showToast } from '../Toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Props = {
  products: Product[]
  fund: number
  onFundChange: (newFund: number) => void
}

export default function ShoppingTab({ products, fund, onFundChange }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [expenseCart, setExpenseCart] = useState<ExpenseItem[]>([])
  const [shopperName, setShopperName] = useState('庶務係')
  const [storeName, setStoreName] = useState('スーパー')
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [buyCost, setBuyCost] = useState<number>(0)
  const [buyQty, setBuyQty] = useState<number>(1)
  const [supplyName, setSupplyName] = useState('')
  const [supplyCost, setSupplyCost] = useState<number>(0)
  const [supplyQty, setSupplyQty] = useState<number>(1)

  const handleProductSelect = (idStr: string) => {
    setSelectedProductId(idStr)
    const p = products.find(p => p.id === Number(idStr))
    if (p) setBuyCost(p.cost_price || 0)
  }

  const addStockItemToCart = () => {
    if (!selectedProductId) return
    const product = products.find(p => p.id === Number(selectedProductId))
    if (!product) return
    const newItem: ExpenseItem = { tempId: Date.now(), product_id: product.id, name: product.name, cost: buyCost, quantity: buyQty, is_stock: true }
    setExpenseCart([...expenseCart, newItem])
    setBuyQty(1)
  }

  const addSupplyToCart = () => {
    if (!supplyName || supplyCost <= 0) return
    const newItem: ExpenseItem = { tempId: Date.now(), product_id: null, name: `(備品) ${supplyName}`, cost: supplyCost, quantity: supplyQty, is_stock: false }
    setExpenseCart([...expenseCart, newItem])
    setSupplyName(''); setSupplyCost(0); setSupplyQty(1)
  }

  const removeCartItem = (tempId: number) => {
    setExpenseCart(expenseCart.filter(i => i.tempId !== tempId))
  }

  const submitExpense = async () => {
    const total = expenseCart.reduce((sum, item) => sum + (item.cost * item.quantity), 0)
    if (total === 0) return
    if (!window.confirm(`買い出しを記録しますか？\n\n場所: ${storeName}\n合計: ${total} $SHM\n\n※金庫から引き落とされ、在庫が反映されます。`)) return
    setLoading(true)
    const { error } = await supabase.rpc('register_expense', { p_shopper_name: shopperName, p_store_name: storeName, p_items: expenseCart })
    if (error) {
      showToast('error', 'エラー: ' + error.message)
    } else {
      showToast('success', '買い出しを記録しました！')
      setExpenseCart([])
      onFundChange(fund - total)
      router.refresh()
    }
    setLoading(false)
  }

  const cartTotal = expenseCart.reduce((sum, i) => sum + (i.cost * i.quantity), 0)

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 在庫商品の仕入れ */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-green-200">
          <h3 className="text-lg font-bold text-green-800 mb-4">🛒 在庫商品の仕入れ</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500">商品選択</label>
              <select value={selectedProductId} onChange={(e) => handleProductSelect(e.target.value)} className="w-full p-2.5 border rounded-lg text-gray-900 bg-gray-50">
                <option value="">選択してください</option>
                {products.filter(p => p.is_active).map(p => (<option key={p.id} value={p.id}>{p.name} (在庫: {p.stock})</option>))}
              </select>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500">仕入れ単価 ($SHM)</label>
                <input type="number" value={buyCost} onChange={(e) => setBuyCost(Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-full p-2.5 border rounded-lg text-right font-bold text-gray-900" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500">個数</label>
                <input type="number" value={buyQty} onChange={(e) => setBuyQty(Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-full p-2.5 border rounded-lg text-right font-bold text-gray-900" />
              </div>
            </div>
            <button onClick={addStockItemToCart} disabled={!selectedProductId} className="w-full bg-green-600 text-white py-2.5 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-300">カートに追加</button>
          </div>
        </section>

        {/* 備品 */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-orange-200">
          <h3 className="text-lg font-bold text-orange-800 mb-4">🧻 備品・その他の購入</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500">品名</label>
              <input type="text" placeholder="例: キッチンペーパー" value={supplyName} onChange={(e) => setSupplyName(e.target.value)} className="w-full p-2.5 border rounded-lg text-gray-900" />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500">単価 ($SHM)</label>
                <input type="number" value={supplyCost} onChange={(e) => setSupplyCost(Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-full p-2.5 border rounded-lg text-right font-bold text-gray-900" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500">個数</label>
                <input type="number" value={supplyQty} onChange={(e) => setSupplyQty(Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-full p-2.5 border rounded-lg text-right font-bold text-gray-900" />
              </div>
            </div>
            <button onClick={addSupplyToCart} disabled={!supplyName || supplyCost <= 0} className="w-full bg-orange-500 text-white py-2.5 rounded-lg font-bold hover:bg-orange-600 disabled:bg-gray-300">備品を追加</button>
          </div>
        </section>
      </div>

      {/* 買い出しリスト */}
      <section className="bg-white p-6 rounded-xl shadow-md border-t-4 border-gray-600">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-800">🧾 買い出しリスト</h3>
          <div className="text-right">
            <span className="text-sm text-gray-500">合計支出:</span>
            <span className="text-2xl font-extrabold text-red-600 ml-2">{cartTotal.toLocaleString()} $SHM</span>
          </div>
        </div>
        <div className="mb-4 flex gap-4">
          <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="border p-2.5 rounded-lg text-sm w-40 text-gray-900" placeholder="店名" />
          <input type="text" value={shopperName} onChange={(e) => setShopperName(e.target.value)} className="border p-2.5 rounded-lg text-sm w-40 text-gray-900" placeholder="担当者" />
        </div>
        <div className="border rounded-lg overflow-hidden mb-4">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-gray-700">品名</th>
                <th className="p-3 text-gray-700">種類</th>
                <th className="p-3 text-right text-gray-700">単価</th>
                <th className="p-3 text-right text-gray-700">個数</th>
                <th className="p-3 text-right text-gray-700">小計</th>
                <th className="p-3 text-center text-gray-700">削除</th>
              </tr>
            </thead>
            <tbody>
              {expenseCart.map(item => (
                <tr key={item.tempId} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-bold text-gray-800">{item.name}</td>
                  <td className="p-3">
                    {item.is_stock
                      ? <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">在庫</span>
                      : <span className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded">備品</span>
                    }
                  </td>
                  <td className="p-3 text-right text-gray-900">{item.cost}</td>
                  <td className="p-3 text-right text-gray-900">{item.quantity}</td>
                  <td className="p-3 text-right font-bold text-gray-900">{item.cost * item.quantity}</td>
                  <td className="p-3 text-center"><button onClick={() => removeCartItem(item.tempId)} className="text-red-500 hover:text-red-700">✕</button></td>
                </tr>
              ))}
              {expenseCart.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-400">リストは空です</td></tr>}
            </tbody>
          </table>
        </div>
        <button onClick={submitExpense} disabled={expenseCart.length === 0 || loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-blue-700 disabled:bg-gray-400 shadow-lg">
          買い出しを確定する (在庫反映・金庫出金)
        </button>
      </section>
    </div>
  )
}
