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
}
type UserBalance = {
    id: number
    name: string
    grade: string
    currentBalance: number
    ic_card_uid?: string
    is_active?: boolean
}
type Transaction = {
    id: number
    created_at: string
    user_name: string
    user_grade: string
    product_name: string
    product_category: string
    quantity: number
    total_amount: number
}
type ProductLog = {
    id: number
    created_at: string
    product_name: string
    action_type: string
    details: string
}
type ChargeLog = {
    id: number
    created_at: string
    amount: number
    user_name: string
    user_grade: string
}

export default function AdminClient({ 
    initialProducts, 
    initialUsers,
    initialFund,
    initialHistory,
    initialProductLogs,
    initialChargeLogs
}: { 
    initialProducts: Product[], 
    initialUsers: UserBalance[],
    initialFund: number,
    initialHistory: Transaction[],
    initialProductLogs: ProductLog[],
    initialChargeLogs: ChargeLog[]
}) {
  const router = useRouter()
  const [products, setProducts] = useState(initialProducts)
  const [users, setUsers] = useState(initialUsers) 
  const [fund, setFund] = useState(initialFund)
  const [activeTab, setActiveTab] = useState<'manage' | 'report'>('manage')
  const [loading, setLoading] = useState(false)
  const [chargeAmount, setChargeAmount] = useState(1000)
  
  const [newProduct, setNewProduct] = useState({ name: '', price: 0, category: 'その他', stock: 0 })
  const [newUser, setNewUser] = useState({ name: '', grade: 'B4' })
  const [showAllUsers, setShowAllUsers] = useState(false)

  const [registeringUser, setRegisteringUser] = useState<UserBalance | null>(null)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // --- ★修正: カード登録用 Realtime 監視 (kiosk_status対応版) ---
  useEffect(() => {
    if (!registeringUser) return

    console.log(`📡 Waiting for card scan for user: ${registeringUser.name}...`)

    const channel = supabase
      .channel('admin_card_register')
      .on(
        'postgres_changes',
        // ★ここを変更: realtime_scans(INSERT) ではなく kiosk_status(UPDATE) を監視
        { event: 'UPDATE', schema: 'public', table: 'kiosk_status', filter: 'id=eq.1' },
        async (payload) => {
          const newUid = payload.new.current_uid
          
          // カードが置かれた時(UIDがある時)だけ反応
          if (newUid) {
              console.log("⚡️ Card detected:", newUid)
              // 登録実行
              await executeRegisterCard(registeringUser, newUid)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [registeringUser]) 

  // 実際の登録処理
  const executeRegisterCard = async (user: UserBalance, uid: string) => {
    // 重複チェック
    const isDuplicate = users.some(u => u.ic_card_uid === uid && u.id !== user.id)
    if (isDuplicate) {
        alert('エラー: このカードは既に他のメンバーに登録されています。')
        setRegisteringUser(null)
        return
    }

    setLoading(true)
    const { error } = await supabase
        .from('users')
        .update({ ic_card_uid: uid })
        .eq('id', user.id)

    if (error) {
        alert('登録エラー: ' + error.message)
    } else {
        alert(`✅ ${user.name}さんのカードを登録しました！\nUID: ${uid}`)
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ic_card_uid: uid } : u))
    }
    setLoading(false)
    setRegisteringUser(null)
    router.refresh()
  }


  // --- 集計ロジック ---
  const stats = useMemo(() => {
    const productSales: Record<string, number> = {}
    initialHistory.forEach(t => {
        const key = t.product_name || '不明'
        productSales[key] = (productSales[key] || 0) + (t.quantity || 0)
    })
    const productRanking = Object.entries(productSales).sort(([, a], [, b]) => b - a).slice(0, 5)

    const userSpending: Record<string, number> = {}
    initialHistory.forEach(t => {
        const key = t.user_name || '不明'
        userSpending[key] = (userSpending[key] || 0) + (t.total_amount || 0)
    })
    const userRanking = Object.entries(userSpending).sort(([, a], [, b]) => b - a).slice(0, 5)
    return { productRanking, userRanking }
  }, [initialHistory])


  // --- チャージ (マイナス対応・入力改善) ---
  const handleCharge = async (userToCharge: UserBalance) => {
    if (chargeAmount === 0) return

    const isRefund = chargeAmount < 0
    const confirmMsg = isRefund 
        ? `⚠️【返金・訂正】\n${userToCharge.name}さんの残高を ${Math.abs(chargeAmount)} $OSH 減らしますか？\n(金庫からも減算されます)`
        : `${userToCharge.name}さんに ${chargeAmount} $OSH をチャージしますか？\n(金庫も+${chargeAmount} $OSH されます)`

    if (!confirm(confirmMsg)) return
    
    setLoading(true)

    const { data: balanceData, error: balanceError } = await supabase
      .from('user_balances')
      .upsert({ 
        user_id: userToCharge.id, balance: userToCharge.currentBalance + chargeAmount 
      }, { onConflict: 'user_id' })
      .select().single()

    if (balanceError) {
        alert('残高更新エラー: ' + balanceError.message)
        setLoading(false)
        return
    }

    const newFundAmount = fund + chargeAmount
    const { error: fundError } = await supabase
        .from('lab_fund')
        .update({ current_balance: newFundAmount })
        .eq('id', 1)

    if (fundError) {
        alert('金庫更新エラー')
    } else {
        await supabase.from('charge_logs').insert([{
            user_id: userToCharge.id,
            amount: chargeAmount
        }])

        fetch('/api/slack/charge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userName: userToCharge.name, 
                amount: chargeAmount,
                currentFund: newFundAmount
            })
        })

        setUsers(prev => prev.map(u => u.id === userToCharge.id ? { ...u, currentBalance: balanceData?.balance } : u))
        setFund(newFundAmount)
        alert(isRefund ? '返金(減額)処理を行いました。' : 'チャージしました！')
    }
    
    setLoading(false)
    router.refresh()
  }

  const handleRegisterCardButton = (user: UserBalance) => {
    setRegisteringUser(user)
  }

  const downloadCSV = () => {
    if (initialHistory.length === 0) {
        alert('履歴がないためダウンロードできません')
        return
    }
    const headers = ['日時', '購入者', '学年', '商品名', 'カテゴリ', '個数', '金額']
    const rows = initialHistory.map(t => [
        `"${new Date(t.created_at).toLocaleString('ja-JP')}"`,
        `"${t.user_name}"`,
        `"${t.user_grade}"`,
        `"${t.product_name}"`,
        `"${t.product_category}"`,
        t.quantity,
        t.total_amount
    ])
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
    if (!confirm('⚠️ 【重要】月次リセットを行いますか？\n\n・現在の取引履歴をCSVとしてダウンロードします。\n・その後、画面上の履歴をクリアします。\n・ユーザーの残高や在庫はそのまま残ります。')) return
    setLoading(true)
    downloadCSV()
    if (!confirm('CSVのダウンロードは開始されましたか？\n「OK」を押すと、画面上の履歴をリセット(アーカイブ)します。\nこの操作は取り消せません。')) {
        setLoading(false)
        return
    }
    try {
        const res = await fetch('/api/admin/archive', { method: 'POST' })
        if (res.ok) {
            alert('履歴をリセットしました！\n新しい月のスタートです。')
            router.refresh()
        } else {
            alert('リセットに失敗しました。')
        }
    } catch (e) { alert('通信エラー') }
    finally { setLoading(false) }
  }

  const handleAddUser = async () => {
    if (!newUser.name) { alert('名前を入力してください'); return }
    if (!confirm(`新メンバー「${newUser.name}」を追加しますか？`)) return
    setLoading(true)
    const { data: user, error } = await supabase.from('users').insert([{ name: newUser.name, grade: newUser.grade, is_active: true }]).select().single()
    if (error) { alert('エラー'); setLoading(false); return }
    await supabase.from('user_balances').insert([{ user_id: user.id, balance: 0 }])
    alert('追加しました')
    setUsers(prev => [...prev, { ...user, currentBalance: 0 }])
    setNewUser({ name: '', grade: 'B4' })
    setLoading(false)
    router.refresh()
  }
  const toggleUserStatus = async (user: UserBalance) => {
    if (!confirm(`ステータスを変更しますか？`)) return
    setLoading(true)
    const { error } = await supabase.from('users').update({ is_active: !user.is_active }).eq('id', user.id)
    if (!error) setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !user.is_active } : u))
    setLoading(false)
    router.refresh()
  }
  const handleAddProduct = async () => {
    if (!newProduct.name) return
    if(!confirm(`商品を追加しますか？`)) return
    setLoading(true)
    const { data, error } = await supabase.from('products').insert([{ ...newProduct, is_active: true }]).select().single()
    if (!error) {
        await logAction(data.name, '新規追加', `価格:${data.price}`)
        setProducts([...products, data])
        setNewProduct({ name: '', price: 0, category: 'その他', stock: 0 })
    }
    setLoading(false)
    router.refresh()
  }
  const logAction = async (name: string, type: string, details: string) => {
    await supabase.from('product_logs').insert([{ product_name: name, action_type: type, details: details }])
  }
  const toggleProductStatus = async (product: Product) => {
    if (!confirm(`状態を変更しますか？`)) return
    setLoading(true)
    const { error } = await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id)
    if (!error) {
        await logAction(product.name, product.is_active ? '廃盤' : '再販', '')
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_active: !product.is_active } : p))
    }
    setLoading(false)
    router.refresh()
  }
  const handleProductChange = (id: number, field: 'price' | 'stock', value: number) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }
  const saveProduct = async (product: Product) => {
    setLoading(true)
    await supabase.from('products').update({ stock: product.stock, price: product.price }).eq('id', product.id)
    await logAction(product.name, '情報変更', '')
    alert('更新しました')
    setLoading(false)
    router.refresh()
  }
  const updateFundManually = async () => {
    if (!confirm(`金庫残高を ${fund} $OSH に修正しますか？`)) return
    await supabase.from('lab_fund').update({ current_balance: fund }).eq('id', 1)
    alert('修正しました')
    router.refresh()
  }
  const displayedUsers = showAllUsers ? users : users.filter(u => u.is_active !== false)

  return (
    <div className="space-y-6">
      
      {registeringUser && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex flex-col items-center justify-center text-white animate-fade-in">
            <div className="text-6xl mb-4 animate-bounce">📡</div>
            <h2 className="text-2xl font-bold mb-2">{registeringUser.name} さんのカード登録</h2>
            <p className="text-lg mb-8">リーダーにカードをかざしてください...</p>
            <button 
                onClick={() => setRegisteringUser(null)}
                className="bg-gray-600 px-6 py-2 rounded-full font-bold hover:bg-gray-500"
            >
                キャンセル
            </button>
        </div>
      )}

      <div className="flex border-b border-gray-300 bg-white sticky top-0 z-20">
        <button onClick={() => setActiveTab('manage')} className={`px-6 py-3 font-bold text-sm ${activeTab === 'manage' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>⚙️ 在庫・商品・メンバー</button>
        <button onClick={() => setActiveTab('report')} className={`px-6 py-3 font-bold text-sm ${activeTab === 'report' ? 'border-b-4 border-indigo-600 text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}>📊 売上・履歴・ログ</button>
      </div>

      {activeTab === 'manage' && (
        <div className="space-y-10 animate-fade-in">
            <section className="bg-white p-6 rounded-xl shadow-sm border border-yellow-300">
                <h2 className="text-lg font-bold text-gray-900 mb-4">💰 金庫（現金箱）</h2>
                <div className="flex items-center gap-4">
                    <input type="number" value={fund} onChange={(e) => setFund(Number(e.target.value))} onFocus={(e) => e.target.select()} className="text-3xl font-bold p-2 border border-gray-300 rounded w-40 text-right bg-white text-gray-900 shadow-inner" />
                    <span className="text-xl font-bold text-gray-900">$OSH</span>
                    <button onClick={updateFundManually} disabled={loading} className="bg-yellow-500 text-white px-4 py-2 rounded font-bold hover:bg-yellow-600 shadow-md">棚卸し修正</button>
                </div>
            </section>

            <section className="bg-white p-6 rounded-xl shadow-sm border border-blue-200">
                <h2 className="text-lg font-bold text-gray-900 mb-4">💳 メンバー管理・チャージ</h2>
                <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <h3 className="text-sm font-bold text-blue-800 mb-3">👤 新メンバー追加</h3>
                    <div className="flex gap-3 items-end">
                        <div className="flex-1"><input type="text" placeholder="氏名" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-white" /></div>
                        <div className="w-24">
                            <select value={newUser.grade} onChange={e => setNewUser({...newUser, grade: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-white">
                                {['B4', 'M1', 'M2', 'D1', 'D2', 'D3', '研究生', '教員', '秘書', 'OB'].map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                        <button onClick={handleAddUser} disabled={loading} className="bg-blue-600 text-white font-bold p-2 rounded hover:bg-blue-700 shadow-md">追加</button>
                    </div>
                </div>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-800">一括チャージ額:</span>
                        <input type="number" value={chargeAmount} onChange={(e) => setChargeAmount(Number(e.target.value))} onFocus={(e) => e.target.select()} className={`font-bold p-1 border border-gray-300 rounded w-24 text-right ${chargeAmount < 0 ? 'bg-red-50 text-red-600' : 'bg-white text-gray-900'}`} />
                        <span className="font-bold text-sm text-gray-800">$OSH</span>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={showAllUsers} onChange={e => setShowAllUsers(e.target.checked)} /> 卒業生も含めて表示</label>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-scroll border border-gray-300 rounded bg-white">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr><th className="p-3 font-bold text-gray-700 border-b">名前</th><th className="p-3 font-bold text-gray-700 border-b">残高</th><th className="p-3 font-bold text-gray-700 border-b">操作</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {displayedUsers.map(u => (
                                <tr key={u.id} className={`hover:bg-gray-50 ${u.is_active === false ? 'bg-gray-100 opacity-60' : ''}`}>
                                    <td className="p-3 font-bold text-gray-900">{u.name} <span className="text-xs font-normal text-gray-500">({u.grade})</span>{u.ic_card_uid && <span className="ml-1 text-xs text-green-600">✅</span>}</td>
                                    <td className="p-3 font-bold text-blue-700 text-lg">{u.currentBalance.toLocaleString()} $OSH</td>
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
                        <div><input type="number" placeholder="価格" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: Number(e.target.value)})} className="w-full p-2 border border-gray-300 rounded text-gray-900 text-right" /></div>
                        <div>
                            <select value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-gray-900">
                                <option>ごはん</option><option>麺類</option><option>ドリンク</option><option>軽食</option><option>おかず</option><option>アイス</option><option>その他</option>
                            </select>
                        </div>
                        <button onClick={handleAddProduct} disabled={loading} className="bg-green-600 text-white font-bold p-2 rounded hover:bg-green-700 shadow-md">追加</button>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-scroll border border-gray-300 rounded bg-white">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr><th className="p-3 font-bold text-gray-700 border-b">商品名</th><th className="p-3 font-bold text-gray-700 border-b">カテゴリ</th><th className="p-3 font-bold text-gray-700 border-b w-28">価格</th><th className="p-3 font-bold text-gray-700 border-b">在庫数</th><th className="p-3 font-bold text-gray-700 border-b">操作</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {products.map(p => (
                                <tr key={p.id} className={`hover:bg-gray-50 ${!p.is_active ? 'bg-gray-100 opacity-60' : ''}`}>
                                    <td className="p-3 font-bold text-gray-900">{p.name}</td>
                                    <td className="p-3 text-gray-700"><span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">{p.category}</span></td>
                                    <td className="p-3"><div className="flex items-center"><span className="text-gray-500 mr-1">$</span><input type="number" value={p.price} onChange={(e) => handleProductChange(p.id, 'price', Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-20 p-1 border border-gray-300 rounded font-bold text-gray-900 text-right" /></div></td>
                                    <td className="p-3 flex items-center gap-1">
                                        <button onClick={() => handleProductChange(p.id, 'stock', p.stock - 1)} className="bg-red-100 text-red-700 border border-red-200 w-7 h-7 rounded font-bold hover:bg-red-200">-</button>
                                        <input type="number" value={p.stock} onChange={(e) => handleProductChange(p.id, 'stock', Number(e.target.value))} onFocus={(e) => e.target.select()} className="w-14 text-center border border-gray-300 rounded p-1 font-bold text-gray-900 bg-white" />
                                        <button onClick={() => handleProductChange(p.id, 'stock', p.stock + 1)} className="bg-green-100 text-green-700 border border-green-200 w-7 h-7 rounded font-bold hover:bg-green-200">+</button>
                                        <button onClick={() => saveProduct(p)} className="ml-3 bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-200 text-xs font-bold hover:bg-blue-100">保存</button>
                                    </td>
                                    <td className="p-3"><button onClick={() => toggleProductStatus(p)} className={`text-xs font-bold px-2 py-1 rounded border ${p.is_active ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-blue-600 border-blue-200 hover:bg-blue-50'}`}>{p.is_active ? '廃盤' : '再開'}</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
      )}

      {activeTab === 'report' && (
        <div className="space-y-8 animate-fade-in">
            {/* レポートタブは変更なし（元のコードを保持） */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-300 flex items-center justify-between">
                <div><h3 className="text-lg font-bold text-gray-800">🗓 月次締め・リセット</h3><p className="text-sm text-gray-500">現在の取引履歴をCSV保存し、画面をリセットします。</p></div>
                <button onClick={handleResetHistory} disabled={loading || initialHistory.length === 0} className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold shadow hover:bg-red-700 disabled:bg-gray-400">CSV出力してリセット</button>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="bg-white p-6 rounded-xl shadow-sm border border-indigo-200">
                    <h3 className="text-md font-bold text-indigo-900 mb-4">🏆 人気商品ランキング</h3>
                    <ul className="space-y-3">
                        {stats.productRanking.map(([name, count], i) => (
                            <li key={name} className="flex items-center justify-between border-b border-indigo-50 pb-2"><span className="font-bold text-gray-800"><span className="text-indigo-600 mr-2 font-extrabold">#{i+1}</span> {name}</span><span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-xs font-bold">{count} 個</span></li>
                        ))}
                    </ul>
                </section>
                <section className="bg-white p-6 rounded-xl shadow-sm border border-green-200">
                    <h3 className="text-md font-bold text-green-900 mb-4">👑 ヘビーユーザー</h3>
                    <ul className="space-y-3">
                        {stats.userRanking.map(([name, amount], i) => (
                            <li key={name} className="flex items-center justify-between border-b border-green-50 pb-2"><span className="font-bold text-gray-800"><span className="text-green-600 mr-2 font-extrabold">#{i+1}</span> {name}</span><span className="font-bold text-gray-900">{amount.toLocaleString()} $OSH</span></li>
                        ))}
                    </ul>
                </section>
            </div>
            <section className="bg-white p-6 rounded-xl shadow-sm border border-blue-300">
                <h3 className="text-md font-bold text-blue-900 mb-4">💰 チャージ履歴</h3>
                <div className="overflow-x-auto max-h-60 overflow-y-scroll border border-blue-100 rounded">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-blue-50 text-gray-700 sticky top-0"><tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">ユーザー</th><th className="p-3 border-b">チャージ額</th></tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {initialChargeLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-blue-50/30"><td className="p-3 text-gray-500 text-xs">{new Date(log.created_at).toLocaleString('ja-JP')}</td><td className="p-3 font-bold text-gray-800">{log.user_name}</td><td className="p-3 font-bold text-blue-600">{log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()} $OSH</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            <section className="bg-white p-6 rounded-xl shadow-sm border border-orange-200">
                <h3 className="text-md font-bold text-orange-900 mb-4">🛠️ 商品管理ログ</h3>
                <div className="overflow-x-auto max-h-60 overflow-y-scroll border border-orange-100 rounded">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-orange-50 text-gray-700 sticky top-0"><tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">商品</th><th className="p-3 border-b">操作</th><th className="p-3 border-b">詳細</th></tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {initialProductLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-orange-50/30"><td className="p-3 text-gray-500 text-xs">{new Date(log.created_at).toLocaleString('ja-JP')}</td><td className="p-3 font-bold text-gray-800">{log.product_name}</td><td className="p-3"><span className="text-xs font-bold px-2 py-1 rounded bg-gray-50 text-gray-600">{log.action_type}</span></td><td className="p-3 text-gray-600 text-xs">{log.details}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-300">
                <h3 className="text-md font-bold text-gray-900 mb-4">📜 直近の取引履歴</h3>
                <div className="overflow-x-auto max-h-80 overflow-y-scroll border border-gray-300 rounded">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100 text-gray-700 sticky top-0"><tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">購入者</th><th className="p-3 border-b">商品</th><th className="p-3 border-b">個数</th><th className="p-3 border-b">金額</th></tr></thead>
                        <tbody className="divide-y divide-gray-200">
                            {initialHistory.map((t) => (
                                <tr key={t.id} className="hover:bg-gray-50"><td className="p-3 text-gray-600 text-xs">{new Date(t.created_at).toLocaleString('ja-JP')}</td><td className="p-3 font-bold text-gray-900">{t.user_name}</td><td className="p-3 text-gray-800">{t.product_name}</td><td className="p-3 text-gray-800">x{t.quantity}</td><td className="p-3 font-bold text-gray-900">{t.total_amount} $OSH</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
      )}
    </div>
  )
}