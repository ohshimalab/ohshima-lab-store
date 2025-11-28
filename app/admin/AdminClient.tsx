'use client'

import { createClient } from '@supabase/supabase-js'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 型定義
type Product = {
  id: number
  name: string
  price: number
  stock: number
  category: string
  is_active: boolean
  cost_price?: number
}
type UserBalance = { id: number, name: string, grade: string, currentBalance: number, ic_card_uid?: string, is_active?: boolean }
type Transaction = { id: number, created_at: string, user_name: string, user_grade: string, product_name: string, product_category: string, quantity: number, total_amount: number }
type ProductLog = { id: number, created_at: string, product_name: string, action_type: string, details: string }
type ChargeLog = { id: number, created_at: string, amount: number, user_name: string, user_grade: string }
// ★追加: 買い出しログの型
type ExpenseLog = {
    id: number
    created_at: string
    shopper_name: string
    store_name: string
    total_cost: number
    items: any // JSONデータ
}

type ExpenseItem = {
    tempId: number
    product_id: number | null
    name: string
    cost: number
    quantity: number
    is_stock: boolean
}

export default function AdminClient({ 
    initialProducts, initialUsers, initialFund, initialHistory, initialProductLogs, initialChargeLogs, initialExpenseLogs // ★追加
}: { 
    initialProducts: Product[], initialUsers: UserBalance[], initialFund: number, initialHistory: Transaction[], initialProductLogs: ProductLog[], initialChargeLogs: ChargeLog[], initialExpenseLogs: ExpenseLog[] // ★追加
}) {
  const router = useRouter()
  const [products, setProducts] = useState(initialProducts)
  const [users, setUsers] = useState(initialUsers) 
  const [fund, setFund] = useState(initialFund)
  const [activeTab, setActiveTab] = useState<'manage' | 'shopping' | 'report'>('manage')
  const [loading, setLoading] = useState(false)
  const [chargeAmount, setChargeAmount] = useState(1000)
  
  const [newProduct, setNewProduct] = useState({ name: '', price: 0, category: 'その他', stock: 0, cost_price: 0 })
  const [newUser, setNewUser] = useState({ name: '', grade: 'B4' })
  const [showAllUsers, setShowAllUsers] = useState(false)
  const [registeringUser, setRegisteringUser] = useState<UserBalance | null>(null)

  const [expenseCart, setExpenseCart] = useState<ExpenseItem[]>([])
  const [shopperName, setShopperName] = useState('庶務係')
  const [storeName, setStoreName] = useState('スーパー')
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [buyCost, setBuyCost] = useState<number>(0)
  const [buyQty, setBuyQty] = useState<number>(1)
  const [supplyName, setSupplyName] = useState("")
  const [supplyCost, setSupplyCost] = useState<number>(0)
  const [supplyQty, setSupplyQty] = useState<number>(1)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // --- 買い出し機能 ---
  const addStockItemToCart = () => {
      if (!selectedProductId) return
      const product = products.find(p => p.id === Number(selectedProductId))
      if (!product) return
      const newItem: ExpenseItem = { tempId: Date.now(), product_id: product.id, name: product.name, cost: buyCost, quantity: buyQty, is_stock: true }
      setExpenseCart([...expenseCart, newItem])
      setBuyQty(1)
  }
  const handleProductSelect = (idStr: string) => {
      setSelectedProductId(idStr)
      const p = products.find(p => p.id === Number(idStr))
      if (p) setBuyCost(p.cost_price || 0)
  }
  const addSupplyToCart = () => {
      if (!supplyName || supplyCost <= 0) return
      const newItem: ExpenseItem = { tempId: Date.now(), product_id: null, name: `(備品) ${supplyName}`, cost: supplyCost, quantity: supplyQty, is_stock: false }
      setExpenseCart([...expenseCart, newItem])
      setSupplyName(""); setSupplyCost(0); setSupplyQty(1)
  }
  const removeCartItem = (tempId: number) => {
      setExpenseCart(expenseCart.filter(i => i.tempId !== tempId))
  }
  const submitExpense = async () => {
      const total = expenseCart.reduce((sum, item) => sum + (item.cost * item.quantity), 0)
      if (total === 0) return
      if (!confirm(`買い出しを記録しますか？\n\n場所: ${storeName}\n合計: ${total} $SHM\n\n※金庫から引き落とされ、在庫が反映されます。`)) return
      setLoading(true)
      const { error } = await supabase.rpc('register_expense', { p_shopper_name: shopperName, p_store_name: storeName, p_items: expenseCart })
      if (error) alert('エラー: ' + error.message)
      else {
          alert('買い出しを記録しました！')
          setExpenseCart([]); setFund(fund - total); router.refresh()
      }
      setLoading(false)
  }

  // --- 集計ロジック ---
  const stats = useMemo(() => {
    const productSales: Record<string, number> = {}
    initialHistory.forEach(t => { const key = t.product_name || '不明'; productSales[key] = (productSales[key] || 0) + (t.quantity || 0) })
    const productRanking = Object.entries(productSales).sort(([, a], [, b]) => b - a).slice(0, 5)
    const userSpending: Record<string, number> = {}
    initialHistory.forEach(t => { const key = t.user_name || '不明'; userSpending[key] = (userSpending[key] || 0) + (t.total_amount || 0) })
    const userRanking = Object.entries(userSpending).sort(([, a], [, b]) => b - a).slice(0, 5)
    return { productRanking, userRanking }
  }, [initialHistory])

  // --- カード登録用 Realtime ---
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

  // --- 各種ハンドラ ---
  const executeRegisterCard = async (user: UserBalance, uid: string) => {
    const isDuplicate = users.some(u => u.ic_card_uid === uid && u.id !== user.id)
    if (isDuplicate) { alert('このカードは既に登録済みです'); setRegisteringUser(null); return }
    setLoading(true)
    const { error } = await supabase.from('users').update({ ic_card_uid: uid }).eq('id', user.id)
    if (!error) { alert(`登録成功: ${uid}`); setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ic_card_uid: uid } : u)) }
    setLoading(false); setRegisteringUser(null); router.refresh()
  }
  const handleCharge = async (userToCharge: UserBalance) => {
    if (chargeAmount === 0) return
    const isRefund = chargeAmount < 0
    if (!confirm(`${userToCharge.name}さんに ${chargeAmount} $SHM ${isRefund ? '減額' : 'チャージ'}しますか？`)) return
    setLoading(true)
    const { data: balanceData, error } = await supabase.from('user_balances').upsert({ user_id: userToCharge.id, balance: userToCharge.currentBalance + chargeAmount }, { onConflict: 'user_id' }).select().single()
    if (!error) {
        const newFundAmount = fund + chargeAmount
        await supabase.from('lab_fund').update({ current_balance: newFundAmount }).eq('id', 1)
        await supabase.from('charge_logs').insert([{ user_id: userToCharge.id, amount: chargeAmount }])
        fetch('/api/slack/charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userName: userToCharge.name, amount: chargeAmount, currentFund: newFundAmount }) })
        setUsers(prev => prev.map(u => u.id === userToCharge.id ? { ...u, currentBalance: balanceData?.balance } : u))
        setFund(newFundAmount)
        alert('完了しました')
    }
    setLoading(false); router.refresh()
  }
  const handleRegisterCardButton = (user: UserBalance) => setRegisteringUser(user)
  const downloadCSV = () => {
    if (initialHistory.length === 0) { alert('履歴がないためダウンロードできません'); return }
    const headers = ['日時', '購入者', '学年', '商品名', 'カテゴリ', '個数', '金額']
    const rows = initialHistory.map(t => [`"${new Date(t.created_at).toLocaleString('ja-JP')}"`, `"${t.user_name}"`, `"${t.user_grade}"`, `"${t.product_name}"`, `"${t.product_category}"`, t.quantity, t.total_amount])
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF])
    const blob = new Blob([bom, csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `売上履歴_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }
  const handleResetHistory = async () => {
    if (!confirm('⚠️ 【重要】月次リセットを行いますか？\nCSVダウンロード後に画面の履歴をクリアします。')) return
    setLoading(true); downloadCSV()
    if (!confirm('CSVはダウンロードされましたか？\nOKを押すと履歴をアーカイブします。')) { setLoading(false); return }
    try {
        const res = await fetch('/api/admin/archive', { method: 'POST' })
        if (res.ok) { alert('リセット完了'); router.refresh() } else alert('失敗')
    } catch { alert('通信エラー') } finally { setLoading(false) }
  }
  const handleAddUser = async () => {
    if (!newUser.name) return
    if (!confirm(`「${newUser.name}」を追加しますか？`)) return
    setLoading(true)
    const { data: user, error } = await supabase.from('users').insert([{ name: newUser.name, grade: newUser.grade, is_active: true }]).select().single()
    if (!error) {
        await supabase.from('user_balances').insert([{ user_id: user.id, balance: 0 }])
        alert('追加しました')
        setUsers(prev => [...prev, { ...user, currentBalance: 0 }])
        setNewUser({ name: '', grade: 'B4' })
    }
    setLoading(false); router.refresh()
  }
  const toggleUserStatus = async (u: UserBalance) => {
    if (!confirm(`ステータスを変更しますか？`)) return
    setLoading(true)
    const { error } = await supabase.from('users').update({ is_active: !u.is_active }).eq('id', u.id)
    if (!error) setUsers(prev => prev.map(user => user.id === u.id ? { ...user, is_active: !u.is_active } : user))
    setLoading(false); router.refresh()
  }
  const logAction = async (n: string, t: string, d: string) => { await supabase.from('product_logs').insert([{ product_name: n, action_type: t, details: d }]) }
  const handleAddProduct = async () => {
    if (!newProduct.name) return
    if(!confirm(`追加しますか？`)) return
    setLoading(true)
    const { data, error } = await supabase.from('products').insert([{ ...newProduct, is_active: true }]).select().single()
    if (!error) {
        await logAction(data.name, '新規追加', `売価:${data.price}, 原価:${data.cost_price || 0}`)
        setProducts([...products, data])
        setNewProduct({ name: '', price: 0, category: 'その他', stock: 0, cost_price: 0 })
    }
    setLoading(false); router.refresh()
  }
  const toggleProductStatus = async (p: Product) => {
    if (!confirm(`状態を変更しますか？`)) return
    setLoading(true)
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    if (!error) {
        await logAction(p.name, p.is_active ? '廃盤' : '再販', '')
        setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, is_active: !p.is_active } : prod))
    }
    setLoading(false); router.refresh()
  }
  const handleProductChange = (id: number, field: string, value: number) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }
  const saveProduct = async (p: Product) => {
    setLoading(true)
    await supabase.from('products').update({ stock: p.stock, price: p.price }).eq('id', p.id)
    await logAction(p.name, '情報変更', '')
    alert('更新しました')
    setLoading(false); router.refresh()
  }
  const updateFundManually = async () => {
    if (!confirm(`金庫残高を ${fund} $SHM に修正しますか？`)) return
    await supabase.from('lab_fund').update({ current_balance: fund }).eq('id', 1)
    alert('修正しました'); router.refresh()
  }
  const showDetails = (items: any) => {
      const detailStr = items.map((i: any) => `・${i.name} (x${i.quantity})`).join('\n')
      alert(`【内訳】\n${detailStr}`)
  }
  const displayedUsers = showAllUsers ? users : users.filter(u => u.is_active !== false)

  return (
    <div className="space-y-6">
      
      {registeringUser && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex flex-col items-center justify-center text-white animate-fade-in">
            <h2 className="text-2xl font-bold mb-8">📡 {registeringUser.name} さんのカードをかざしてください</h2>
            <button onClick={() => setRegisteringUser(null)} className="bg-gray-600 px-6 py-2 rounded-full">キャンセル</button>
        </div>
      )}

      {/* タブ切り替え */}
      <div className="flex border-b border-gray-300 bg-white sticky top-0 z-20 overflow-x-auto">
        <button onClick={() => setActiveTab('manage')} className={`px-4 py-3 font-bold text-sm whitespace-nowrap ${activeTab === 'manage' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-600'}`}>⚙️ 在庫・メンバー</button>
        <button onClick={() => setActiveTab('shopping')} className={`px-4 py-3 font-bold text-sm whitespace-nowrap ${activeTab === 'shopping' ? 'border-b-4 border-green-600 text-green-600' : 'text-gray-600'}`}>🛍️ 買い出し登録</button>
        <button onClick={() => setActiveTab('report')} className={`px-4 py-3 font-bold text-sm whitespace-nowrap ${activeTab === 'report' ? 'border-b-4 border-indigo-600 text-indigo-600' : 'text-gray-600'}`}>📊 レポート</button>
      </div>

      {/* 買い出しタブ (既存) */}
      {activeTab === 'shopping' && (
        <div className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="bg-white p-6 rounded-xl shadow-sm border border-green-200">
                    <h3 className="text-lg font-bold text-green-800 mb-4">🛒 在庫商品の仕入れ</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500">商品選択</label>
                            <select value={selectedProductId} onChange={(e) => handleProductSelect(e.target.value)} className="w-full p-2 border rounded text-gray-900 bg-gray-50">
                                <option value="">選択してください</option>
                                {products.filter(p => p.is_active).map(p => (<option key={p.id} value={p.id}>{p.name} (在庫: {p.stock})</option>))}
                            </select>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="text-xs font-bold text-gray-500">仕入れ単価 ($SHM)</label><input type="number" value={buyCost} onChange={(e) => setBuyCost(Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-full p-2 border rounded text-right font-bold text-gray-900" /></div>
                            <div className="flex-1"><label className="text-xs font-bold text-gray-500">個数</label><input type="number" value={buyQty} onChange={(e) => setBuyQty(Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-full p-2 border rounded text-right font-bold text-gray-900" /></div>
                        </div>
                        <button onClick={addStockItemToCart} disabled={!selectedProductId} className="w-full bg-green-600 text-white py-2 rounded font-bold hover:bg-green-700 disabled:bg-gray-300">カートに追加</button>
                    </div>
                </section>
                <section className="bg-white p-6 rounded-xl shadow-sm border border-orange-200">
                    <h3 className="text-lg font-bold text-orange-800 mb-4">🧻 備品・その他の購入</h3>
                    <div className="space-y-4">
                        <div><label className="text-xs font-bold text-gray-500">品名</label><input type="text" placeholder="例: キッチンペーパー" value={supplyName} onChange={(e) => setSupplyName(e.target.value)} className="w-full p-2 border rounded text-gray-900" /></div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="text-xs font-bold text-gray-500">単価 ($SHM)</label><input type="number" value={supplyCost} onChange={(e) => setSupplyCost(Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-full p-2 border rounded text-right font-bold text-gray-900" /></div>
                            <div className="flex-1"><label className="text-xs font-bold text-gray-500">個数</label><input type="number" value={supplyQty} onChange={(e) => setSupplyQty(Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-full p-2 border rounded text-right font-bold text-gray-900" /></div>
                        </div>
                        <button onClick={addSupplyToCart} disabled={!supplyName || supplyCost <= 0} className="w-full bg-orange-500 text-white py-2 rounded font-bold hover:bg-orange-600 disabled:bg-gray-300">備品を追加</button>
                    </div>
                </section>
            </div>
            <section className="bg-white p-6 rounded-xl shadow-md border-t-4 border-gray-600">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">🧾 買い出しリスト</h3>
                    <div className="text-right"><span className="text-sm text-gray-500">合計支出:</span><span className="text-2xl font-extrabold text-red-600 ml-2">{expenseCart.reduce((sum, i) => sum + (i.cost * i.quantity), 0).toLocaleString()} $SHM</span></div>
                </div>
                <div className="mb-4 flex gap-4">
                    <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="border p-2 rounded text-sm w-40 text-gray-900" placeholder="店名 (スーパーXX)" />
                    <input type="text" value={shopperName} onChange={(e) => setShopperName(e.target.value)} className="border p-2 rounded text-sm w-40 text-gray-900" placeholder="担当者" />
                </div>
                <div className="border rounded overflow-hidden mb-4">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100"><tr><th className="p-2 text-gray-700">品名</th><th className="p-2 text-gray-700">種類</th><th className="p-2 text-right text-gray-700">単価</th><th className="p-2 text-right text-gray-700">個数</th><th className="p-2 text-right text-gray-700">小計</th><th className="p-2 text-center text-gray-700">削除</th></tr></thead>
                        <tbody>
                            {expenseCart.map(item => (
                                <tr key={item.tempId} className="border-t hover:bg-gray-50">
                                    <td className="p-2 font-bold text-gray-800">{item.name}</td>
                                    <td className="p-2">{item.is_stock ? <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">在庫</span> : <span className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded">備品</span>}</td>
                                    <td className="p-2 text-right text-gray-900">{item.cost}</td>
                                    <td className="p-2 text-right text-gray-900">{item.quantity}</td>
                                    <td className="p-2 text-right font-bold text-gray-900">{item.cost * item.quantity}</td>
                                    <td className="p-2 text-center"><button onClick={() => removeCartItem(item.tempId)} className="text-red-500 hover:text-red-700">✕</button></td>
                                </tr>
                            ))}
                            {expenseCart.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">リストは空です</td></tr>}
                        </tbody>
                    </table>
                </div>
                <button onClick={submitExpense} disabled={expenseCart.length === 0 || loading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-blue-700 disabled:bg-gray-400 shadow-lg">買い出しを確定する (在庫反映・金庫出金)</button>
            </section>
        </div>
      )}

      {/* === 管理タブ (既存) === */}
      {activeTab === 'manage' && (
        <div className="space-y-10 animate-fade-in">
            <section className="bg-white p-6 rounded-xl shadow-sm border border-yellow-300">
                <h2 className="text-lg font-bold text-gray-900 mb-4">💰 金庫（現金箱）</h2>
                <div className="flex items-center gap-4">
                    <input type="number" value={fund} onChange={(e) => setFund(Number(e.target.value))} onFocus={(e) => e.target.select()} className="text-3xl font-bold p-2 border border-gray-300 rounded w-40 text-right bg-white text-gray-900 shadow-inner" />
                    <span className="text-xl font-bold text-gray-900">$SHM</span>
                    <button onClick={updateFundManually} disabled={loading} className="bg-yellow-500 text-white px-4 py-2 rounded font-bold hover:bg-yellow-600 shadow-md">棚卸し修正</button>
                </div>
            </section>

            <section className="bg-white p-6 rounded-xl shadow-sm border border-blue-200">
                <h2 className="text-lg font-bold text-gray-900 mb-4">💳 メンバー管理・チャージ</h2>
                <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <h3 className="text-sm font-bold text-blue-800 mb-3">👤 新メンバー追加</h3>
                    <div className="flex gap-3 items-end">
                        <div className="flex-1"><input type="text" placeholder="氏名" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-white" /></div>
                        <div className="w-24"><select value={newUser.grade} onChange={e => setNewUser({...newUser, grade: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-white">{['B4', 'M1', 'M2', 'D1', 'D2', 'D3', '研究生', '教員', '秘書', 'OB'].map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                        <button onClick={handleAddUser} disabled={loading} className="bg-blue-600 text-white font-bold p-2 rounded hover:bg-blue-700 shadow-md">追加</button>
                    </div>
                </div>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2"><span className="font-bold text-sm text-gray-800">一括チャージ額:</span><input type="number" value={chargeAmount} onChange={(e) => setChargeAmount(Number(e.target.value))} onFocus={(e) => e.target.select()} className={`font-bold p-1 border border-gray-300 rounded w-24 text-right ${chargeAmount < 0 ? 'bg-red-50 text-red-600' : 'bg-white text-gray-900'}`} /><span className="font-bold text-sm text-gray-800">$SHM</span></div>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={showAllUsers} onChange={e => setShowAllUsers(e.target.checked)} /> 卒業生も含めて表示</label>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-scroll border border-gray-300 rounded bg-white">
                    <table className="min-w-full text-sm text-left"><thead className="bg-gray-100 sticky top-0 z-10"><tr><th className="p-3 font-bold text-gray-700 border-b">名前</th><th className="p-3 font-bold text-gray-700 border-b">残高</th><th className="p-3 font-bold text-gray-700 border-b">操作</th></tr></thead>
                        <tbody className="divide-y divide-gray-200">
                            {displayedUsers.map(u => (
                                <tr key={u.id} className={`hover:bg-gray-50 ${u.is_active === false ? 'bg-gray-100 opacity-60' : ''}`}>
                                    <td className="p-3 font-bold text-gray-900">{u.name} <span className="text-xs font-normal text-gray-500">({u.grade})</span>{u.ic_card_uid && <span className="ml-1 text-xs text-green-600">✅</span>}</td>
                                    <td className="p-3 font-bold text-blue-700 text-lg">{u.currentBalance.toLocaleString()} $SHM</td>
                                    <td className="p-3 flex gap-2 items-center">
                                        <button onClick={() => handleCharge(u)} disabled={loading || u.is_active === false} className={`text-white px-3 py-1 rounded text-xs font-bold shadow disabled:bg-gray-400 ${chargeAmount < 0 ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}>{chargeAmount < 0 ? '返金' : 'チャージ'}</button>
                                        <button onClick={() => handleRegisterCardButton(u)} disabled={loading} className="bg-gray-700 text-white px-3 py-1 rounded text-xs font-bold hover:bg-gray-800 shadow">🆔</button>
                                        <button onClick={() => toggleUserStatus(u)} disabled={loading} className={`ml-2 text-xs underline ${u.is_active === false ? 'text-blue-600' : 'text-red-400 hover:text-red-600'}`}>{u.is_active === false ? '復帰' : '卒業'}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-300">
                <h2 className="text-lg font-bold text-gray-900 mb-4">📦 商品管理</h2>
                <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">✨ 新しい商品を追加</h3>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                        <div className="col-span-2"><input type="text" placeholder="商品名" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-gray-900" /></div>
                        <div><input type="number" placeholder="売価" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: Number(e.target.value)})} className="w-full p-2 border border-gray-300 rounded text-gray-900 text-right" /></div>
                        <div><select value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-gray-900"><option>ごはん</option><option>麺類</option><option>ドリンク</option><option>軽食</option><option>おかず</option><option>アイス</option><option>その他</option></select></div>
                        <button onClick={handleAddProduct} disabled={loading} className="bg-green-600 text-white font-bold p-2 rounded hover:bg-green-700 shadow-md">追加</button>
                    </div>
                    <div className="mt-2 flex items-center gap-2"><span className="text-xs text-gray-500 font-bold">参考原価:</span><input type="number" placeholder="0" value={newProduct.cost_price} onChange={e => setNewProduct({...newProduct, cost_price: Number(e.target.value)})} className="w-24 p-1 border rounded text-xs text-right text-gray-900" /><span className="text-xs text-gray-400">(利益計算用)</span></div>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-scroll border border-gray-300 rounded bg-white">
                    <table className="min-w-full text-sm text-left"><thead className="bg-gray-100 sticky top-0 z-10"><tr><th className="p-3 font-bold text-gray-700 border-b">商品名</th><th className="p-3 font-bold text-gray-700 border-b">カテゴリ</th><th className="p-3 font-bold text-gray-700 border-b w-20">売価</th><th className="p-3 font-bold text-gray-700 border-b text-xs text-gray-500">利益</th><th className="p-3 font-bold text-gray-700 border-b">在庫数</th><th className="p-3 font-bold text-gray-700 border-b">操作</th></tr></thead>
                        <tbody className="divide-y divide-gray-200">
                            {products.map(p => {
                                const profit = p.price - (p.cost_price || 0)
                                return (
                                <tr key={p.id} className={`hover:bg-gray-50 ${!p.is_active ? 'bg-gray-100 opacity-60' : ''}`}>
                                    <td className="p-3 font-bold text-gray-900">{p.name}</td>
                                    <td className="p-3 text-gray-700"><span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">{p.category}</span></td>
                                    <td className="p-3"><div className="flex items-center"><input type="number" value={p.price} onChange={(e) => handleProductChange(p.id, 'price', Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-16 p-1 border border-gray-300 rounded font-bold text-gray-900 text-right" /><span className="text-gray-500 mr-1">$SHM</span></div></td>
                                    <td className={`p-3 text-xs font-bold ${profit > 0 ? 'text-green-600' : 'text-red-500'}`}>{profit > 0 ? '+' : ''}{profit}</td>
                                    <td className="p-3 flex items-center gap-1">
                                        <button onClick={() => handleProductChange(p.id, 'stock', p.stock - 1)} className="bg-red-100 text-red-700 border border-red-200 w-7 h-7 rounded font-bold hover:bg-red-200">-</button>
                                        <input type="number" value={p.stock} onChange={(e) => handleProductChange(p.id, 'stock', Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-14 text-center border border-gray-300 rounded p-1 font-bold text-gray-900 bg-white" />
                                        <button onClick={() => handleProductChange(p.id, 'stock', p.stock + 1)} className="bg-green-100 text-green-700 border border-green-200 w-7 h-7 rounded font-bold hover:bg-green-200">+</button>
                                        <button onClick={() => saveProduct(p)} className="ml-3 bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-200 text-xs font-bold hover:bg-blue-100">保存</button>
                                    </td>
                                    <td className="p-3"><button onClick={() => toggleProductStatus(p)} className={`text-xs font-bold px-2 py-1 rounded border ${p.is_active ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-blue-600 border-blue-200 hover:bg-blue-50'}`}>{p.is_active ? '廃盤' : '再開'}</button></td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
      )}

      {/* レポートタブ */}
      {activeTab === 'report' && (
        <div className="space-y-8 animate-fade-in">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-300 flex items-center justify-between"><div><h3 className="text-lg font-bold text-gray-800">🗓 月次締め・リセット</h3><p className="text-sm text-gray-500">現在の取引履歴をCSV保存し、画面をリセットします。</p></div><button onClick={handleResetHistory} disabled={loading || initialHistory.length === 0} className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold shadow hover:bg-red-700 disabled:bg-gray-400">CSV出力してリセット</button></div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><section className="bg-white p-6 rounded-xl shadow-sm border border-indigo-200"><h3 className="text-md font-bold text-indigo-900 mb-4">🏆 人気商品ランキング</h3><ul className="space-y-3">{stats.productRanking.map(([name, count], i) => (<li key={name} className="flex items-center justify-between border-b border-indigo-50 pb-2"><span className="font-bold text-gray-800"><span className="text-indigo-600 mr-2 font-extrabold">#{i+1}</span> {name}</span><span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-xs font-bold">{count} 個</span></li>))}</ul></section><section className="bg-white p-6 rounded-xl shadow-sm border border-green-200"><h3 className="text-md font-bold text-green-900 mb-4">👑 ヘビーユーザー</h3><ul className="space-y-3">{stats.userRanking.map(([name, amount], i) => (<li key={name} className="flex items-center justify-between border-b border-green-50 pb-2"><span className="font-bold text-gray-800"><span className="text-green-600 mr-2 font-extrabold">#{i+1}</span> {name}</span><span className="font-bold text-gray-900">{amount.toLocaleString()} $SHM</span></li>))}</ul></section></div>
            <section className="bg-white p-6 rounded-xl shadow-sm border border-blue-300"><h3 className="text-md font-bold text-blue-900 mb-4">💰 チャージ履歴 (直近50件)</h3><div className="overflow-x-auto max-h-60 overflow-y-scroll border border-blue-100 rounded"><table className="min-w-full text-sm text-left"><thead className="bg-blue-50 text-gray-700 sticky top-0"><tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">ユーザー</th><th className="p-3 border-b">チャージ額</th></tr></thead><tbody className="divide-y divide-gray-100">{initialChargeLogs.map((log) => (<tr key={log.id} className="hover:bg-blue-50/30"><td className="p-3 text-gray-500 text-xs">{new Date(log.created_at).toLocaleString('ja-JP')}</td><td className="p-3 font-bold text-gray-800">{log.user_name}</td><td className="p-3 font-bold text-blue-600">{log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()} $SHM</td></tr>))}</tbody></table></div></section>
            {/* ★NEW: 買い出し履歴 */}
            <section className="bg-white p-6 rounded-xl shadow-sm border border-green-300"><h3 className="text-md font-bold text-green-900 mb-4">🧾 買い出し・経費履歴</h3><div className="overflow-x-auto max-h-60 overflow-y-scroll border border-green-100 rounded"><table className="min-w-full text-sm text-left"><thead className="bg-green-50 text-gray-700 sticky top-0"><tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">場所/担当</th><th className="p-3 border-b">支出額</th><th className="p-3 border-b">詳細</th></tr></thead><tbody className="divide-y divide-gray-100">{initialExpenseLogs.map((log) => (<tr key={log.id} className="hover:bg-green-50/30"><td className="p-3 text-gray-500 text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString('ja-JP')}</td><td className="p-3 font-bold text-gray-800">{log.store_name}<br/><span className="text-xs font-normal text-gray-500">{log.shopper_name}</span></td><td className="p-3 font-bold text-red-600">-{log.total_cost.toLocaleString()} $SHM</td><td className="p-3"><button onClick={() => showDetails(log.items)} className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-gray-700">内訳を見る</button></td></tr>))}</tbody></table></div></section>
            <section className="bg-white p-6 rounded-xl shadow-sm border border-orange-200"><h3 className="text-md font-bold text-orange-900 mb-4">🛠️ 商品管理ログ</h3><div className="overflow-x-auto max-h-60 overflow-y-scroll border border-orange-100 rounded"><table className="min-w-full text-sm text-left"><thead className="bg-orange-50 text-gray-700 sticky top-0"><tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">商品</th><th className="p-3 border-b">操作</th><th className="p-3 border-b">詳細</th></tr></thead><tbody className="divide-y divide-gray-100">{initialProductLogs.map((log) => (<tr key={log.id} className="hover:bg-orange-50/30"><td className="p-3 text-gray-500 text-xs">{new Date(log.created_at).toLocaleString('ja-JP')}</td><td className="p-3 font-bold text-gray-800">{log.product_name}</td><td className="p-3"><span className="text-xs font-bold px-2 py-1 rounded bg-gray-50 text-gray-600">{log.action_type}</span></td><td className="p-3 text-gray-600 text-xs">{log.details}</td></tr>))}</tbody></table></div></section>
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-300"><h3 className="text-md font-bold text-gray-900 mb-4">📜 直近の取引履歴</h3><div className="overflow-x-auto max-h-80 overflow-y-scroll border border-gray-300 rounded"><table className="min-w-full text-sm text-left"><thead className="bg-gray-100 text-gray-700 sticky top-0"><tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">購入者</th><th className="p-3 border-b">商品</th><th className="p-3 border-b">個数</th><th className="p-3 border-b">金額</th></tr></thead><tbody className="divide-y divide-gray-200">{initialHistory.map((t) => (<tr key={t.id} className="hover:bg-gray-50"><td className="p-3 text-gray-600 text-xs">{new Date(t.created_at).toLocaleString('ja-JP')}</td><td className="p-3 font-bold text-gray-900">{t.user_name}</td><td className="p-3 text-gray-800">{t.product_name}</td><td className="p-3 text-gray-800">x{t.quantity}</td><td className="p-3 font-bold text-gray-900">{t.total_amount} $SHM</td></tr>))}</tbody></table></div></section>
        </div>
      )}
    </div>
  )
}