'use client'

import { createClient } from '@supabase/supabase-js'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

// 型定義
type Product = {
  id: number
  name: string
  price: number
  stock: number
  is_active: boolean // ★追加
}
type UserBalance = {
    id: number
    name: string
    grade: string
    currentBalance: number
    ic_card_uid?: string
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

export default function AdminClient({ 
    initialProducts, 
    initialUsers,
    initialFund,
    initialHistory
}: { 
    initialProducts: Product[], 
    initialUsers: UserBalance[],
    initialFund: number,
    initialHistory: Transaction[]
}) {
  const router = useRouter()
  const [products, setProducts] = useState(initialProducts)
  const [users, setUsers] = useState(initialUsers) 
  const [fund, setFund] = useState(initialFund)
  const [activeTab, setActiveTab] = useState<'manage' | 'report'>('manage')
  const [loading, setLoading] = useState(false)
  const [chargeAmount, setChargeAmount] = useState(1000)
  
  // 新規商品入力用State
  const [newProduct, setNewProduct] = useState({ name: '', price: 0, category: 'その他', stock: 0 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

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


  // --- 各種操作関数 ---

  // 商品追加
  const handleAddProduct = async () => {
    if (!newProduct.name || newProduct.price <= 0) {
        alert('商品名と価格を正しく入力してください')
        return
    }
    if(!confirm(`新商品「${newProduct.name}」を追加しますか？`)) return

    setLoading(true)
    const { data, error } = await supabase
        .from('products')
        .insert([{ ...newProduct, is_active: true }])
        .select()
        .single()

    if (error) alert('エラー: ' + error.message)
    else {
        alert('商品を追加しました！')
        setProducts([...products, data]) // リストに追加
        setNewProduct({ name: '', price: 0, category: 'その他', stock: 0 }) // フォームリセット
    }
    setLoading(false)
    router.refresh()
  }

  // 商品の廃盤/復帰 (論理削除)
  const toggleProductStatus = async (product: Product) => {
    const action = product.is_active ? '廃盤（非表示）' : '販売再開'
    if (!confirm(`「${product.name}」を${action}にしますか？`)) return
    
    setLoading(true)
    const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id)

    if (error) alert('エラー: ' + error.message)
    else {
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_active: !product.is_active } : p))
    }
    setLoading(false)
    router.refresh()
  }

  // 在庫更新
  const updateStock = (id: number, newStock: number) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, stock: newStock } : p))
  }
  const saveStock = async (product: Product) => {
    await supabase.from('products').update({ stock: product.stock }).eq('id', product.id)
    alert('在庫更新しました')
    router.refresh()
  }

  // チャージ
  const handleCharge = async (userToCharge: UserBalance) => {
    if (chargeAmount <= 0) return
    if (!confirm(`${userToCharge.name}さんに ${chargeAmount} 円をチャージしますか？`)) return
    setLoading(true)
    const { data, error } = await supabase.from('user_balances').upsert({ 
        user_id: userToCharge.id, balance: userToCharge.currentBalance + chargeAmount 
      }, { onConflict: 'user_id' }).select().single()
    
    if (!error) {
        await supabase.from('lab_fund').update({ current_balance: fund + chargeAmount }).eq('id', 1)
        setUsers(prev => prev.map(u => u.id === userToCharge.id ? { ...u, currentBalance: data?.balance } : u))
        setFund(prev => prev + chargeAmount)
        alert('チャージしました')
    }
    setLoading(false)
    router.refresh()
  }

  // ICカード登録
  const handleRegisterCard = async (user: UserBalance) => {
    if (!confirm('カードを登録します。リーダーにかざしてOKを押してください。')) return
    try {
        const res = await fetch('http://localhost:5001/scan')
        const data = await res.json()
        if (data.status === 'found' && data.uid) {
            await supabase.from('users').update({ ic_card_uid: data.uid }).eq('id', user.id)
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ic_card_uid: data.uid } : u))
            alert(`登録成功: ${data.uid}`)
        } else alert('カードが見つかりませんでした')
    } catch { alert('Pythonサーバーエラー') }
  }

  const updateFundManually = async () => {
    if (!confirm(`金庫残高を ${fund} 円に修正しますか？`)) return
    await supabase.from('lab_fund').update({ current_balance: fund }).eq('id', 1)
    alert('修正しました')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      
      {/* タブ切り替え */}
      <div className="flex border-b border-gray-300 bg-white sticky top-0 z-20">
        <button onClick={() => setActiveTab('manage')} className={`px-6 py-3 font-bold text-sm ${activeTab === 'manage' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>
            ⚙️ 在庫・チャージ管理
        </button>
        <button onClick={() => setActiveTab('report')} className={`px-6 py-3 font-bold text-sm ${activeTab === 'report' ? 'border-b-4 border-indigo-600 text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}>
            📊 売上レポート
        </button>
      </div>

      {/* === 管理タブ === */}
      {activeTab === 'manage' && (
        <div className="space-y-10 animate-fade-in">
            {/* 金庫管理 */}
            <section className="bg-white p-6 rounded-xl shadow-sm border border-yellow-300">
                <h2 className="text-lg font-bold text-gray-900 mb-4">💰 金庫（現金箱）</h2>
                <div className="flex items-center gap-4">
                    <input type="number" value={fund} onChange={(e) => setFund(Number(e.target.value))} className="text-3xl font-bold p-2 border border-gray-300 rounded w-40 text-right bg-white text-gray-900 shadow-inner" />
                    <span className="text-xl font-bold text-gray-900">円</span>
                    <button onClick={updateFundManually} disabled={loading} className="bg-yellow-500 text-white px-4 py-2 rounded font-bold hover:bg-yellow-600 shadow-md">棚卸し修正</button>
                </div>
            </section>

            {/* ユーザー管理 */}
            <section className="bg-white p-6 rounded-xl shadow-sm border border-blue-200">
                <h2 className="text-lg font-bold text-gray-900 mb-4">💳 ユーザー管理 (チャージ・カード)</h2>
                <div className="flex items-center gap-4 mb-4 bg-blue-50 p-3 rounded border border-blue-100">
                    <span className="font-bold text-sm text-gray-800">一括設定金額:</span>
                    <input type="number" value={chargeAmount} onChange={(e) => setChargeAmount(Number(e.target.value))} className="font-bold p-2 border border-gray-300 rounded w-28 text-right bg-white text-gray-900" />
                    <span className="font-bold text-sm text-gray-800">円</span>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-scroll border border-gray-300 rounded bg-white">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="p-3 font-bold text-gray-700 border-b">名前</th>
                                <th className="p-3 font-bold text-gray-700 border-b">残高</th>
                                <th className="p-3 font-bold text-gray-700 border-b">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {users.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50">
                                    <td className="p-3 font-bold text-gray-900">{u.name} <span className="text-xs font-normal text-gray-500">({u.grade})</span>{u.ic_card_uid && <span className="ml-1 text-xs text-green-600">✅</span>}</td>
                                    <td className="p-3 font-bold text-blue-700 text-lg">{u.currentBalance.toLocaleString()}</td>
                                    <td className="p-3 flex gap-2">
                                        <button onClick={() => handleCharge(u)} disabled={loading} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-700 shadow">チャージ</button>
                                        <button onClick={() => handleRegisterCard(u)} disabled={loading} className="bg-gray-700 text-white px-3 py-1 rounded text-xs font-bold hover:bg-gray-800 shadow">🆔 登録</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 在庫管理（商品追加・廃盤機能付き） */}
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-300">
                <h2 className="text-lg font-bold text-gray-900 mb-4">📦 在庫管理・商品追加</h2>
                
                {/* 商品追加フォーム */}
                <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">✨ 新しい商品を追加</h3>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-gray-600 block mb-1">商品名</label>
                            <input type="text" placeholder="例: 新発売ポテチ" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-gray-900" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 block mb-1">価格</label>
                            <input type="number" placeholder="0" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: Number(e.target.value)})} className="w-full p-2 border border-gray-300 rounded text-gray-900 text-right" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 block mb-1">カテゴリ</label>
                            <select value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} className="w-full p-2 border border-gray-300 rounded text-gray-900">
                                <option>ごはん</option><option>麺類</option><option>ドリンク</option><option>軽食</option><option>おかず</option><option>アイス</option><option>その他</option>
                            </select>
                        </div>
                        <button onClick={handleAddProduct} disabled={loading} className="bg-green-600 text-white font-bold p-2 rounded hover:bg-green-700 shadow-md">追加する</button>
                    </div>
                </div>

                {/* 商品リスト */}
                <div className="overflow-x-auto max-h-[500px] overflow-y-scroll border border-gray-300 rounded bg-white">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="p-3 font-bold text-gray-700 border-b">商品名</th>
                                <th className="p-3 font-bold text-gray-700 border-b w-20">価格</th>
                                <th className="p-3 font-bold text-gray-700 border-b">在庫数</th>
                                <th className="p-3 font-bold text-gray-700 border-b text-center">状態</th>
                                <th className="p-3 font-bold text-gray-700 border-b">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {products.map(p => (
                                <tr key={p.id} className={`hover:bg-gray-50 ${!p.is_active ? 'bg-gray-100 opacity-60' : ''}`}>
                                    <td className="p-3 font-bold text-gray-900">{p.name}</td>
                                    <td className="p-3 text-gray-900">¥{p.price}</td>
                                    <td className="p-3 flex items-center gap-1">
                                        <button onClick={() => updateStock(p.id, p.stock - 1)} className="bg-red-100 text-red-700 border border-red-200 w-7 h-7 rounded font-bold hover:bg-red-200">-</button>
                                        <input type="number" value={p.stock} onChange={(e) => updateStock(p.id, Number(e.target.value))} className="w-14 text-center border border-gray-300 rounded p-1 font-bold text-gray-900 bg-white" />
                                        <button onClick={() => updateStock(p.id, p.stock + 1)} className="bg-green-100 text-green-700 border border-green-200 w-7 h-7 rounded font-bold hover:bg-green-200">+</button>
                                        <button onClick={() => saveStock(p)} className="ml-2 text-blue-600 text-xs font-bold underline hover:text-blue-800">保存</button>
                                    </td>
                                    <td className="p-3 text-center">
                                        {p.is_active 
                                            ? <span className="text-green-600 text-xs font-bold border border-green-200 bg-green-50 px-2 py-1 rounded-full">販売中</span> 
                                            : <span className="text-gray-500 text-xs font-bold border border-gray-300 bg-gray-200 px-2 py-1 rounded-full">廃盤</span>
                                        }
                                    </td>
                                    <td className="p-3 text-center">
                                        <button 
                                            onClick={() => toggleProductStatus(p)} 
                                            className={`text-xs font-bold px-2 py-1 rounded border ${p.is_active ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-blue-600 border-blue-200 hover:bg-blue-50'}`}
                                        >
                                            {p.is_active ? '廃盤にする' : '再販する'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
      )}

      {/* === レポートタブ (文字色を濃く修正) === */}
      {activeTab === 'report' && (
        <div className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 人気商品ランキング */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-indigo-200">
                    <h3 className="text-md font-bold text-indigo-900 mb-4">🏆 人気商品ランキング (Top 5)</h3>
                    <ul className="space-y-3">
                        {stats.productRanking.map(([name, count], i) => (
                            <li key={name} className="flex items-center justify-between border-b border-indigo-50 pb-2">
                                <span className="font-bold text-gray-800"><span className="text-indigo-600 mr-2 font-extrabold">#{i+1}</span> {name}</span>
                                <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-xs font-bold">{count} 個</span>
                            </li>
                        ))}
                    </ul>
                </section>

                {/* ユーザー利用額ランキング */}
                <section className="bg-white p-6 rounded-xl shadow-sm border border-green-200">
                    <h3 className="text-md font-bold text-green-900 mb-4">👑 ヘビーユーザー (Top 5)</h3>
                    <ul className="space-y-3">
                        {stats.userRanking.map(([name, amount], i) => (
                            <li key={name} className="flex items-center justify-between border-b border-green-50 pb-2">
                                <span className="font-bold text-gray-800"><span className="text-green-600 mr-2 font-extrabold">#{i+1}</span> {name}</span>
                                <span className="font-bold text-gray-900">¥{amount.toLocaleString()}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>

            {/* 取引履歴リスト */}
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-300">
                <h3 className="text-md font-bold text-gray-900 mb-4">📜 直近の取引履歴 (100件)</h3>
                <div className="overflow-x-auto max-h-96 overflow-y-scroll border border-gray-300 rounded">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100 text-gray-700 sticky top-0">
                            <tr>
                                <th className="p-3 border-b">日時</th>
                                <th className="p-3 border-b">購入者</th>
                                <th className="p-3 border-b">商品</th>
                                <th className="p-3 border-b">個数</th>
                                <th className="p-3 border-b">金額</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {initialHistory.map((t) => (
                                <tr key={t.id} className="hover:bg-gray-50">
                                    <td className="p-3 text-gray-600 text-xs whitespace-nowrap">
                                        {new Date(t.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="p-3 font-bold text-gray-900">{t.user_name}</td>
                                    <td className="p-3 text-gray-800">{t.product_name}</td>
                                    <td className="p-3 text-gray-800">x{t.quantity}</td>
                                    <td className="p-3 font-bold text-gray-900">¥{t.total_amount}</td>
                                </tr>
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