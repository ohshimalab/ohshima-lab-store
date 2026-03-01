'use client'

import { useState, useMemo } from 'react'
import { Product } from '../../types'

type StocktakingModalProps = {
  products: Product[]
  onSave: (adjustments: { productId: number; newStock: number }[]) => void
  onClose: () => void
  loading: boolean
}

export default function StocktakingModal({ products, onSave, onClose, loading }: StocktakingModalProps) {
  const activeProducts = useMemo(() => products.filter(p => p.is_active), [products])

  const [counts, setCounts] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {}
    activeProducts.forEach(p => { initial[p.id] = p.stock })
    return initial
  })

  const diffs = useMemo(() => {
    const result: { product: Product; systemStock: number; actualStock: number; diff: number }[] = []
    activeProducts.forEach(p => {
      const actual = counts[p.id] ?? p.stock
      const diff = actual - p.stock
      result.push({ product: p, systemStock: p.stock, actualStock: actual, diff })
    })
    return result
  }, [activeProducts, counts])

  const hasChanges = diffs.some(d => d.diff !== 0)
  const totalDiff = diffs.reduce((sum, d) => sum + d.diff, 0)
  const changedCount = diffs.filter(d => d.diff !== 0).length

  const handleSubmit = () => {
    const adjustments = diffs
      .filter(d => d.diff !== 0)
      .map(d => ({ productId: d.product.id, newStock: d.actualStock }))
    onSave(adjustments)
  }

  // カテゴリ別にグルーピング
  const grouped = useMemo(() => {
    const groups: Record<string, typeof diffs> = {}
    diffs.forEach(d => {
      const cat = d.product.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(d)
    })
    return groups
  }, [diffs])

  return (
    <div className="fixed inset-0 bg-black/50 z-[9997] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold text-white">📋 棚卸し</h3>
            <p className="text-xs text-white/80">実在庫数を入力して一括で反映します</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl">✕</button>
        </div>

        {/* テーブル */}
        <div className="flex-1 overflow-y-auto p-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-6">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">{category}</h4>
              <div className="space-y-1">
                {items.map(({ product, systemStock, actualStock, diff }) => (
                  <div
                    key={product.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${diff !== 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}
                  >
                    <span className="font-bold text-gray-800 text-sm flex-1 truncate">{product.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400 w-16 text-right">システム: {systemStock}</span>
                      <span className="text-gray-300">→</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCounts({ ...counts, [product.id]: Math.max(0, (counts[product.id] ?? systemStock) - 1) })}
                          className="w-7 h-7 flex items-center justify-center bg-red-100 text-red-700 border border-red-200 rounded font-bold hover:bg-red-200 text-sm"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={actualStock}
                          onChange={e => setCounts({ ...counts, [product.id]: Math.max(0, Number(e.target.value)) })}
                          onFocus={e => e.target.select()}
                          className="w-14 text-center border border-gray-300 rounded p-1 font-bold text-gray-900 text-sm"
                        />
                        <button
                          onClick={() => setCounts({ ...counts, [product.id]: (counts[product.id] ?? systemStock) + 1 })}
                          className="w-7 h-7 flex items-center justify-center bg-green-100 text-green-700 border border-green-200 rounded font-bold hover:bg-green-200 text-sm"
                        >
                          +
                        </button>
                      </div>
                      <span className={`w-12 text-right text-xs font-bold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                        {diff === 0 ? '±0' : (diff > 0 ? `+${diff}` : `${diff}`)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* フッター */}
        <div className="px-6 py-4 bg-gray-50 border-t shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-600">
              変更: <span className="font-bold text-gray-900">{changedCount}件</span>
              {hasChanges && (
                <span className={`ml-3 font-bold ${totalDiff > 0 ? 'text-green-600' : totalDiff < 0 ? 'text-red-600' : ''}`}>
                  合計差分: {totalDiff > 0 ? '+' : ''}{totalDiff}
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100">
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !hasChanges}
              className="px-5 py-2.5 text-sm font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:bg-gray-400"
            >
              {loading ? '反映中...' : `${changedCount}件を一括反映する`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
