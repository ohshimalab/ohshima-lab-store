'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { UserBalance, GRADES } from '../../types'
import EditUserModal from '../modals/EditUserModal'
import { showToast } from '../Toast'
import { useConfirmDialog } from '../ConfirmDialog'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Props = {
  initialUsers: UserBalance[]
  fund: number
  onFundChange: (newFund: number) => void
}

export default function MembersTab({ initialUsers, fund, onFundChange }: Props) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [loading, setLoading] = useState(false)
  const [chargeAmount, setChargeAmount] = useState(1000)
  const [showAllUsers, setShowAllUsers] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingUser, setEditingUser] = useState<UserBalance | null>(null)
  const [registeringUser, setRegisteringUser] = useState<UserBalance | null>(null)
  const [newUser, setNewUser] = useState({ name: '', grade: 'B4' })
  const { confirm, DialogComponent } = useConfirmDialog()

  // カード登録用 Realtime
  useEffect(() => {
    if (!registeringUser) return
    const channel = supabase.channel('admin_card_register')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kiosk_status', filter: 'id=eq.1' }, async (payload) => {
        const newUid = payload.new.current_uid
        if (newUid) await executeRegisterCard(registeringUser, newUid)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [registeringUser])

  const executeRegisterCard = async (user: UserBalance, uid: string) => {
    const isDuplicate = users.some(u => u.ic_card_uid === uid && u.id !== user.id)
    if (isDuplicate) { showToast('error', 'このカードは既に他のユーザーに登録されています'); setRegisteringUser(null); return }
    setLoading(true)
    const { error } = await supabase.from('users').update({ ic_card_uid: uid }).eq('id', user.id)
    if (!error) {
      showToast('success', `カード登録成功: ${uid}`)
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ic_card_uid: uid } : u))
    } else {
      showToast('error', 'カード登録に失敗しました')
    }
    setLoading(false)
    setRegisteringUser(null)
    router.refresh()
  }

  // フィルタリング
  const displayedUsers = useMemo(() => {
    let result = showAllUsers ? users : users.filter(u => u.is_active !== false)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(u => u.name.toLowerCase().includes(q) || u.grade.toLowerCase().includes(q))
    }
    return result
  }, [users, showAllUsers, searchQuery])

  const handleCharge = async (userToCharge: UserBalance) => {
    if (chargeAmount === 0) return
    const isRefund = chargeAmount < 0
    const ok = await confirm({
      title: isRefund ? '減額' : 'チャージ',
      message: `${userToCharge.name}さんに ${Math.abs(chargeAmount)} $SHM ${isRefund ? '減額' : 'チャージ'}しますか？`,
      confirmLabel: isRefund ? '減額する' : 'チャージする',
      variant: isRefund ? 'danger' : 'default',
    })
    if (!ok) return
    setLoading(true)
    const { data: balanceData, error } = await supabase.from('user_balances').upsert({ user_id: userToCharge.id, balance: userToCharge.currentBalance + chargeAmount }, { onConflict: 'user_id' }).select().single()
    if (!error) {
      const newFundAmount = fund + chargeAmount
      await supabase.from('lab_fund').update({ current_balance: newFundAmount }).eq('id', 1)
      await supabase.from('charge_logs').insert([{ user_id: userToCharge.id, amount: chargeAmount }])
      fetch('/api/slack/charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userName: userToCharge.name, amount: chargeAmount, currentFund: newFundAmount }) })
      setUsers(prev => prev.map(u => u.id === userToCharge.id ? { ...u, currentBalance: balanceData?.balance } : u))
      onFundChange(newFundAmount)
      showToast('success', `${userToCharge.name}さんに ${chargeAmount > 0 ? '+' : ''}${chargeAmount} $SHM`)
    } else {
      showToast('error', 'エラー: ' + error.message)
    }
    setLoading(false)
    router.refresh()
  }

  const handleAddUser = async () => {
    if (!newUser.name) return
    const ok = await confirm({ title: 'メンバー追加', message: `「${newUser.name}」(${newUser.grade})を追加しますか？`, confirmLabel: '追加する' })
    if (!ok) return
    setLoading(true)
    const { data: user, error } = await supabase.from('users').insert([{ name: newUser.name, grade: newUser.grade, is_active: true }]).select().single()
    if (!error && user) {
      await supabase.from('user_balances').insert([{ user_id: user.id, balance: 0 }])
      showToast('success', `「${newUser.name}」を追加しました`)
      setUsers(prev => [...prev, { ...user, currentBalance: 0 }])
      setNewUser({ name: '', grade: 'B4' })
    } else {
      showToast('error', 'エラー: ' + error?.message)
    }
    setLoading(false)
    router.refresh()
  }

  const toggleUserStatus = async (u: UserBalance) => {
    const action = u.is_active !== false ? '卒業' : '復帰'
    const ok = await confirm({
      title: `${action}にする`,
      message: `${u.name}さんを${action}にしますか？`,
      confirmLabel: `${action}にする`,
      variant: u.is_active !== false ? 'danger' : 'default',
    })
    if (!ok) return
    setLoading(true)
    const { error } = await supabase.from('users').update({ is_active: !(u.is_active !== false) }).eq('id', u.id)
    if (!error) {
      setUsers(prev => prev.map(user => user.id === u.id ? { ...user, is_active: !(u.is_active !== false) } : user))
      showToast('success', `${u.name}さんを${action}にしました`)
    }
    setLoading(false)
    router.refresh()
  }

  const handleEditSave = async (updated: { name: string; grade: string }) => {
    if (!editingUser) return
    setLoading(true)
    const { error } = await supabase.from('users').update({ name: updated.name, grade: updated.grade }).eq('id', editingUser.id)
    if (!error) {
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, name: updated.name, grade: updated.grade } : u))
      showToast('success', `「${updated.name}」の情報を更新しました`)
      setEditingUser(null)
    } else {
      showToast('error', 'エラー: ' + error.message)
    }
    setLoading(false)
    router.refresh()
  }

  const handleDeleteCard = async () => {
    if (!editingUser) return
    const ok = await confirm({
      title: 'ICカード登録解除',
      message: `${editingUser.name}さんのICカード登録を解除しますか？\n再度カードをかざして登録し直す必要があります。`,
      confirmLabel: '解除する',
      variant: 'danger',
    })
    if (!ok) return
    setLoading(true)
    const { error } = await supabase.from('users').update({ ic_card_uid: null }).eq('id', editingUser.id)
    if (!error) {
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ic_card_uid: undefined } : u))
      setEditingUser(prev => prev ? { ...prev, ic_card_uid: undefined } : null)
      showToast('success', 'ICカード登録を解除しました')
    }
    setLoading(false)
    router.refresh()
  }

  const handleAdjustBalance = async (newBalance: number) => {
    if (!editingUser) return
    const ok = await confirm({
      title: '残高修正',
      message: `${editingUser.name}さんの残高を\n${editingUser.currentBalance} → ${newBalance} $SHM\nに修正しますか？`,
      confirmLabel: '修正する',
      variant: 'danger',
    })
    if (!ok) return
    setLoading(true)
    const { error } = await supabase.from('user_balances').upsert({ user_id: editingUser.id, balance: newBalance }, { onConflict: 'user_id' })
    if (!error) {
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, currentBalance: newBalance } : u))
      setEditingUser(prev => prev ? { ...prev, currentBalance: newBalance } : null)
      showToast('success', `残高を ${newBalance} $SHM に修正しました`)
    }
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {DialogComponent}

      {/* カード登録モーダル */}
      {registeringUser && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex flex-col items-center justify-center text-white">
          <div className="text-6xl mb-6 animate-pulse">📡</div>
          <h2 className="text-2xl font-bold mb-2">{registeringUser.name} さん</h2>
          <p className="text-lg text-white/80 mb-8">ICカードをリーダーにかざしてください</p>
          <button onClick={() => setRegisteringUser(null)} className="bg-gray-600 hover:bg-gray-500 px-8 py-3 rounded-full font-bold">キャンセル</button>
        </div>
      )}

      {/* ユーザー編集モーダル */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onSave={handleEditSave}
          onDeleteCard={handleDeleteCard}
          onAdjustBalance={handleAdjustBalance}
          onClose={() => setEditingUser(null)}
          loading={loading}
        />
      )}

      {/* メンバー追加 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">👤 新メンバー追加</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-bold text-gray-500">氏名</label>
            <input type="text" placeholder="氏名" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg text-gray-900" />
          </div>
          <div className="w-28">
            <label className="text-xs font-bold text-gray-500">学年</label>
            <select value={newUser.grade} onChange={e => setNewUser({ ...newUser, grade: e.target.value })} className="w-full p-2.5 border border-gray-300 rounded-lg text-gray-900">
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button onClick={handleAddUser} disabled={loading || !newUser.name.trim()} className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-blue-700 shadow-md disabled:bg-gray-400">
            追加
          </button>
        </div>
      </div>

      {/* フィルターバー */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-gray-700">チャージ額:</span>
          <input
            type="number"
            value={chargeAmount}
            onChange={e => setChargeAmount(Number(e.target.value))}
            onFocus={e => e.target.select()}
            className={`font-bold p-2 border border-gray-300 rounded-lg w-28 text-right text-sm ${chargeAmount < 0 ? 'bg-red-50 text-red-600 border-red-300' : 'bg-white text-gray-900'}`}
          />
          <span className="font-bold text-sm text-gray-700">$SHM</span>
        </div>
        <div className="flex-1" />
        <input
          type="text"
          placeholder="🔍 名前で検索..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 w-40 focus:ring-2 focus:ring-blue-500"
        />
        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={showAllUsers} onChange={e => setShowAllUsers(e.target.checked)} />
          卒業生も表示
        </label>
      </div>

      {/* メンバー一覧 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="p-3 font-bold text-gray-600 border-b">名前</th>
                <th className="p-3 font-bold text-gray-600 border-b">学年</th>
                <th className="p-3 font-bold text-gray-600 border-b text-right">残高</th>
                <th className="p-3 font-bold text-gray-600 border-b text-center">カード</th>
                <th className="p-3 font-bold text-gray-600 border-b text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayedUsers.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${u.is_active === false ? 'bg-gray-50 opacity-60' : ''}`}>
                  <td className="p-3 font-bold text-gray-900">{u.name}</td>
                  <td className="p-3">
                    <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">{u.grade}</span>
                  </td>
                  <td className="p-3 text-right font-bold text-blue-700 text-base">{u.currentBalance.toLocaleString()} $SHM</td>
                  <td className="p-3 text-center">
                    {u.ic_card_uid ? (
                      <span className="text-green-600 text-sm" title={u.ic_card_uid}>✅</span>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleCharge(u)}
                        disabled={loading || u.is_active === false}
                        className={`text-white px-3 py-1 rounded-lg text-xs font-bold shadow disabled:bg-gray-400 ${chargeAmount < 0 ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                      >
                        {chargeAmount < 0 ? '返金' : 'チャージ'}
                      </button>
                      <button
                        onClick={() => setRegisteringUser(u)}
                        disabled={loading}
                        className="bg-gray-700 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-gray-800 shadow"
                      >
                        🆔
                      </button>
                      <button
                        onClick={() => setEditingUser(u)}
                        className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-lg hover:bg-indigo-100"
                      >
                        ✏️ 編集
                      </button>
                      <button
                        onClick={() => toggleUserStatus(u)}
                        disabled={loading}
                        className={`text-xs font-bold underline ${u.is_active === false ? 'text-blue-600' : 'text-red-400 hover:text-red-600'}`}
                      >
                        {u.is_active === false ? '復帰' : '卒業'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {displayedUsers.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">該当するメンバーがいません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
