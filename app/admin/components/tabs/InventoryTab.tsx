'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { Product, CATEGORIES } from '../../types'
import EditProductModal from '../modals/EditProductModal'
import StocktakingModal from '../modals/StocktakingModal'
import { showToast } from '../Toast'
import { useConfirmDialog } from '../ConfirmDialog'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Props = {
  initialProducts: Product[]
}

export default function InventoryTab({ initialProducts }: Props) {
  const router = useRouter()
  const [products, setProducts] = useState(initialProducts)
  const [loading, setLoading] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showStocktaking, setShowStocktaking] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', price: 0, category: 'その他', stock: 0, cost_price: 0 })
  const { confirm, DialogComponent } = useConfirmDialog()

  const logAction = async (n: string, t: string, d: string) => {
    await supabase.from('product_logs').insert([{ product_name: n, action_type: t, details: d }])
  }

  // フィルタリング
  const filteredProducts = useMemo(() => {
    let result = products
    if (!showInactive) result = result.filter(p => p.is_active)
    if (filterCategory !== 'all') result = result.filter(p => p.category === filterCategory)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p => p.name.toLowerCase().includes(q))
    }
    return result
  }, [products, showInactive, filterCategory, searchQuery])

  // 在庫アラート
  const lowStockProducts = useMemo(() => products.filter(p => p.is_active && p.stock <= 3), [products])

  const handleAddProduct = async () => {
    if (!newProduct.name) return
    const ok = await confirm({ title: '商品追加', message: `「${newProduct.name}」を追加しますか？`, confirmLabel: '追加する' })
    if (!ok) return
    setLoading(true)
    const { data, error } = await supabase.from('products').insert([{ ...newProduct, is_active: true }]).select().single()
    if (!error && data) {
      await logAction(data.name, '新規追加', `売価:${data.price}, 原価:${data.cost_price || 0}`)
      setProducts(prev => [...prev, data])
      setNewProduct({ name: '', price: 0, category: 'その他', stock: 0, cost_price: 0 })
      showToast('success', `「${data.name}」を追加しました`)
    } else {
      showToast('error', 'エラー: ' + error?.message)
    }
    setLoading(false)
    router.refresh()
  }

  const handleEditSave = async (updated: Product) => {
    setLoading(true)
    const { error } = await supabase.from('products').update({
      name: updated.name,
      price: updated.price,
      cost_price: updated.cost_price,
      stock: updated.stock,
      category: updated.category,
    }).eq('id', updated.id)
    if (!error) {
      await logAction(updated.name, '情報変更', `売価:${updated.price}, 原価:${updated.cost_price || 0}, 在庫:${updated.stock}`)
      setProducts(prev => prev.map(p => p.id === updated.id ? updated : p))
      showToast('success', `「${updated.name}」を更新しました`)
      setEditingProduct(null)
    } else {
      showToast('error', 'エラー: ' + error.message)
    }
    setLoading(false)
    router.refresh()
  }

  const toggleProductStatus = async (p: Product) => {
    const action = p.is_active ? '廃盤' : '再販'
    const ok = await confirm({
      title: `${action}にする`,
      message: `「${p.name}」を${action}にしますか？`,
      confirmLabel: `${action}にする`,
      variant: p.is_active ? 'danger' : 'default',
    })
    if (!ok) return
    setLoading(true)
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    if (!error) {
      await logAction(p.name, action, '')
      setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, is_active: !p.is_active } : prod))
      showToast('success', `「${p.name}」を${action}にしました`)
    }
    setLoading(false)
    router.refresh()
  }

  const handleStocktaking = async (adjustments: { productId: number; newStock: number }[]) => {
    setLoading(true)
    let successCount = 0
    for (const adj of adjustments) {
      const product = products.find(p => p.id === adj.productId)
      if (!product) continue
      const { error } = await supabase.from('products').update({ stock: adj.newStock }).eq('id', adj.productId)
      if (!error) {
        const diff = adj.newStock - product.stock
        await logAction(product.name, '棚卸し', `${product.stock}→${adj.newStock} (差分:${diff > 0 ? '+' : ''}${diff})`)
        successCount++
      }
    }
    setProducts(prev => prev.map(p => {
      const adj = adjustments.find(a => a.productId === p.id)
      return adj ? { ...p, stock: adj.newStock } : p
    }))
    setShowStocktaking(false)
    showToast('success', `${successCount}件の在庫を更新しました`)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {DialogComponent}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onSave={handleEditSave}
          onClose={() => setEditingProduct(null)}
          loading={loading}
        />
      )}

      {showStocktaking && (
        <StocktakingModal
          products={products}
          onSave={handleStocktaking}
          onClose={() => setShowStocktaking(false)}
          loading={loading}
        />
      )}

      {/* 在庫アラート */}
      {lowStockProducts.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-orange-800 mb-2">⚠️ 在庫残少アラート ({lowStockProducts.length}件)</h3>
          <div className="flex flex-wrap gap-2">
            {lowStockProducts.map(p => (
              <span key={p.id} className={`text-xs font-bold px-2 py-1 rounded-full ${p.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                {p.name}: {p.stock === 0 ? '売切' : `残${p.stock}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* アクションバー */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowStocktaking(true)}
          className="bg-amber-500 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-amber-600 shadow-md flex items-center gap-1"
        >
          📋 棚卸し
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="🔍 商品検索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-40 focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全カテゴリ</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            廃盤を含む
          </label>
        </div>
      </div>

      {/* 新商品追加 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">✨ 新しい商品を追加</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="col-span-2">
            <label className="text-xs font-bold text-gray-500">商品名</label>
            <input type="text" placeholder="商品名" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg text-gray-900" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">売価</label>
            <input type="number" placeholder="売価" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: Number(e.target.value) })} className="w-full p-2.5 border border-gray-300 rounded-lg text-gray-900 text-right" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">カテゴリ</label>
            <select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg text-gray-900">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={handleAddProduct} disabled={loading || !newProduct.name.trim()} className="bg-green-600 text-white font-bold p-2.5 rounded-lg hover:bg-green-700 shadow-md disabled:bg-gray-400">
            追加
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-gray-500 font-bold">参考原価:</span>
          <input type="number" placeholder="0" value={newProduct.cost_price} onChange={e => setNewProduct({ ...newProduct, cost_price: Number(e.target.value) })} className="w-24 p-1 border rounded text-xs text-right text-gray-900" />
          <span className="text-xs text-gray-500 font-bold">初期在庫:</span>
          <input type="number" placeholder="0" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: Number(e.target.value) })} className="w-24 p-1 border rounded text-xs text-right text-gray-900" />
        </div>
      </div>

      {/* 商品一覧 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="p-3 font-bold text-gray-600 border-b">商品名</th>
                <th className="p-3 font-bold text-gray-600 border-b">カテゴリ</th>
                <th className="p-3 font-bold text-gray-600 border-b text-right">売価</th>
                <th className="p-3 font-bold text-gray-600 border-b text-right">利益</th>
                <th className="p-3 font-bold text-gray-600 border-b text-center">在庫</th>
                <th className="p-3 font-bold text-gray-600 border-b text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map(p => {
                const profit = p.price - (p.cost_price || 0)
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${!p.is_active ? 'bg-gray-50 opacity-60' : ''}`}>
                    <td className="p-3">
                      <span className="font-bold text-gray-900">{p.name}</span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">{p.category}</span>
                    </td>
                    <td className="p-3 text-right font-bold text-gray-900">{p.price} $SHM</td>
                    <td className={`p-3 text-right text-xs font-bold ${profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {profit > 0 ? '+' : ''}{profit}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block min-w-[2rem] text-center font-bold rounded-full px-2 py-0.5 text-xs ${
                        p.stock === 0 ? 'bg-red-100 text-red-700' :
                        p.stock <= 3 ? 'bg-orange-100 text-orange-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setEditingProduct(p)}
                          className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-100"
                        >
                          ✏️ 編集
                        </button>
                        <button
                          onClick={() => toggleProductStatus(p)}
                          disabled={loading}
                          className={`text-xs font-bold px-3 py-1 rounded-lg border ${
                            p.is_active
                              ? 'text-red-600 border-red-200 hover:bg-red-50'
                              : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                          }`}
                        >
                          {p.is_active ? '廃盤' : '再開'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredProducts.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">該当する商品がありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
