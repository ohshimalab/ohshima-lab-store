'use client'

import { useState } from 'react'
import { UserBalance, GRADES } from '../../types'

type EditUserModalProps = {
  user: UserBalance
  onSave: (updated: { name: string; grade: string }) => void
  onDeleteCard: () => void
  onAdjustBalance: (newBalance: number) => void
  onClose: () => void
  loading: boolean
}

export default function EditUserModal({ user, onSave, onDeleteCard, onAdjustBalance, onClose, loading }: EditUserModalProps) {
  const [form, setForm] = useState({
    name: user.name,
    grade: user.grade,
  })
  const [balanceInput, setBalanceInput] = useState(user.currentBalance)
  const [showBalanceAdjust, setShowBalanceAdjust] = useState(false)

  const handleSubmit = () => {
    if (!form.name.trim()) return
    onSave({ name: form.name.trim(), grade: form.grade })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[9997] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">👤 メンバーを編集</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl">✕</button>
        </div>

        {/* フォーム */}
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">名前</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">学年</label>
            <select
              value={form.grade}
              onChange={e => setForm({ ...form, grade: e.target.value })}
              className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500"
            >
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* ICカード */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <label className="block text-xs font-bold text-gray-500 mb-2">ICカード</label>
            {user.ic_card_uid ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 text-sm">✅</span>
                  <code className="bg-gray-200 px-2 py-1 rounded text-xs text-gray-700 font-mono">{user.ic_card_uid}</code>
                </div>
                <button
                  onClick={onDeleteCard}
                  disabled={loading}
                  className="text-xs font-bold text-red-600 hover:text-red-800 underline disabled:text-gray-400"
                >
                  登録解除
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">未登録</p>
            )}
          </div>

          {/* 残高 */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-500">現在の残高</label>
              <span className="text-lg font-bold text-blue-700">{user.currentBalance.toLocaleString()} $SHM</span>
            </div>
            {!showBalanceAdjust ? (
              <button
                onClick={() => setShowBalanceAdjust(true)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
              >
                残高を直接修正する
              </button>
            ) : (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  value={balanceInput}
                  onChange={e => setBalanceInput(Number(e.target.value))}
                  onFocus={e => e.target.select()}
                  className="flex-1 p-2 border border-blue-300 rounded-lg text-right font-bold text-gray-900 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-bold text-gray-600">$SHM</span>
                <button
                  onClick={() => onAdjustBalance(balanceInput)}
                  disabled={loading}
                  className="px-3 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  修正
                </button>
              </div>
            )}
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
            className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
          >
            {loading ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  )
}
