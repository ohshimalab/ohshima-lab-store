'use client'

import { useState } from 'react'
import { Product, CATEGORIES } from '../../types'

type EditProductModalProps = {
  product: Product
  onSave: (updated: Product) => void
  onClose: () => void
  loading: boolean
}

export default function EditProductModal({ product, onSave, onClose, loading }: EditProductModalProps) {
  const [form, setForm] = useState({
    name: product.name,
    price: product.price,
    cost_price: product.cost_price || 0,
    stock: product.stock,
    category: product.category,
  })

  const profit = form.price - form.cost_price

  const handleSubmit = () => {
    if (!form.name.trim()) return
    onSave({
      ...product,
      name: form.name.trim(),
      price: form.price,
      cost_price: form.cost_price,
      stock: form.stock,
      category: form.category,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[9997] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">📦 商品を編集</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl">✕</button>
        </div>

        {/* フォーム */}
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">商品名</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">カテゴリ</label>
            <select
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">売価 ($SHM)</label>
              <input
                type="number"
                value={form.price}
                onChange={e => setForm({ ...form, price: Number(e.target.value) })}
                onFocus={e => e.target.select()}
                className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 text-right font-bold focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">原価 ($SHM)</label>
              <input
                type="number"
                value={form.cost_price}
                onChange={e => setForm({ ...form, cost_price: Number(e.target.value) })}
                onFocus={e => e.target.select()}
                className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 text-right font-bold focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
            <span className="text-xs font-bold text-gray-500">利益:</span>
            <span className={`font-bold ${profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-600' : 'text-gray-500'}`}>
              {profit > 0 ? '+' : ''}{profit} $SHM
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">在庫数</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setForm({ ...form, stock: Math.max(0, form.stock - 1) })}
                className="w-10 h-10 flex items-center justify-center bg-red-100 text-red-700 border border-red-200 rounded-lg font-bold text-lg hover:bg-red-200"
              >
                −
              </button>
              <input
                type="number"
                value={form.stock}
                onChange={e => setForm({ ...form, stock: Math.max(0, Number(e.target.value)) })}
                onFocus={e => e.target.select()}
                className="w-20 text-center p-3 border border-gray-300 rounded-lg font-bold text-lg text-gray-900 focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => setForm({ ...form, stock: form.stock + 1 })}
                className="w-10 h-10 flex items-center justify-center bg-green-100 text-green-700 border border-green-200 rounded-lg font-bold text-lg hover:bg-green-200"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100">
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.name.trim()}
            className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  )
}
