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

type UserBalance = {
    id: number
    name: string
    grade: string
    currentBalance: number
    ic_card_uid?: string // ★追加
}

export default function AdminClient({ 
    initialProducts, 
    initialUsers,
    initialFund 
}: { 
    initialProducts: Product[], 
    initialUsers: UserBalance[],
    initialFund: number
}) {
  const router = useRouter()
  const [products, setProducts] = useState(initialProducts)
  const [users, setUsers] = useState(initialUsers) 
  const [fund, setFund] = useState(initialFund)
  const [loading, setLoading] = useState(false)
  const [chargeAmount, setChargeAmount] = useState(1000) 

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // --- 機能1: ユーザーへのチャージ ---
  const handleCharge = async (userToCharge: UserBalance) => {
    if (chargeAmount <= 0 || !Number.isInteger(chargeAmount)) {
        alert('チャージ金額は正の整数である必要があります。')
        return
    }

    if (!confirm(`${userToCharge.name}さんに ${chargeAmount} 円をチャージしますか？\n\n※金庫の残高も +${chargeAmount} 円されます。`)) return
    
    setLoading(true)

    const { data: newBalanceData, error: balanceError } = await supabase
      .from('user_balances')
      .upsert({ 
        user_id: userToCharge.id, 
        balance: userToCharge.currentBalance + chargeAmount 
      }, { onConflict: 'user_id' })
      .select('balance')
      .single()

    if (balanceError) {
        alert('残高更新エラー: ' + balanceError.message)
        setLoading(false)
        return
    }

    const { error: fundError } = await supabase
        .from('lab_fund')
        .update({ current_balance: fund + chargeAmount })
        .eq('id', 1)

    if (fundError) {
        alert('注意: ユーザー残高は増えましたが、金庫残高の更新に失敗しました。')
    } else {
        alert(`${userToCharge.name}さんにチャージしました！`)
        
        const newBalance = newBalanceData?.balance ?? (userToCharge.currentBalance + chargeAmount)
        setUsers(prev => 
            prev.map(u => u.id === userToCharge.id ? { ...u, currentBalance: newBalance } : u)
        )
        setFund(prev => prev + chargeAmount)
    }
    
    setLoading(false)
    router.refresh()
  }

  // --- 機能2: ICカード登録 (★NEW) ---
  const handleRegisterCard = async (user: UserBalance) => {
    const confirmMsg = user.ic_card_uid 
        ? `${user.name}さんは既にカード登録済みです。\n上書き登録しますか？` 
        : `${user.name}さんのカードを登録します。\n\nリーダーにカードをかざしてから「OK」を押してください。`
    
    if (!confirm(confirmMsg)) return

    setLoading(true)

    try {
        // 1. ローカルのPythonサーバーに聞きに行く
        // ※ブラウザが直接 localhost:5001 にアクセスします
        const res = await fetch('http://localhost:5001/scan')
        const data = await res.json()

        if (data.status === 'found' && data.uid) {
            // 2. SupabaseにUIDを保存
            const { error } = await supabase
                .from('users')
                .update({ ic_card_uid: data.uid })
                .eq('id', user.id)

            if (error) {
                alert('登録エラー: ' + error.message)
            } else {
                alert(`✅ 登録成功！\nUID: ${data.uid}`)
                // 画面更新
                setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ic_card_uid: data.uid } : u))
            }
        } else {
            alert('カードが読み取れませんでした。\nしっかりかざしてから試してください。')
        }
    } catch (e) {
        console.error(e)
        alert('リーダーサーバーと通信できません。\nPythonサーバー (server.py) が起動しているか確認してください。')
    } finally {
        setLoading(false)
        router.refresh()
    }
  }


  // --- 機能3: 金庫残高の直接修正 ---
  const updateFundManually = async () => {
    if (!confirm(`金庫の残高を【 ${fund} 円 】で上書き修正しますか？`)) return
    setLoading(true)
    const { error } = await supabase.from('lab_fund').update({ current_balance: fund }).eq('id', 1)
    if (error) alert('エラー: ' + error.message)
    else alert('金庫残高を修正しました。')
    setLoading(false)
    router.refresh()
  }

  // --- 機能4: 在庫管理 ---
  const updateStock = (id: number, newStock: number) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, stock: newStock } : p))
  }
  const saveStock = async (product: Product) => {
    setLoading(true)
    const { error } = await supabase.from('products').update({ stock: product.stock }).eq('id', product.id)
    if (error) alert('エラー: ' + error.message)
    else alert(`在庫を更新しました。`)
    setLoading(false)
    router.refresh()
  }


  return (
    <div className="space-y-10">
      
      {/* エリアA: 金庫管理 */}
      <section className="bg-white p-6 rounded-xl shadow-md border-l-4 border-yellow-400">
        <h2 className="text-lg font-bold text-gray-800 mb-4">💰 現金箱（金庫）の管理</h2>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={fund}
            onChange={(e) => setFund(Number(e.target.value))}
            className="text-3xl font-bold p-2 border rounded w-40 text-right text-gray-900 bg-white border-gray-300"
          />
          <span className="text-xl font-bold text-gray-700">円</span>
          <button 
            onClick={updateFundManually}
            disabled={loading}
            className="bg-yellow-500 text-white px-6 py-2 rounded-lg font-bold hover:bg-yellow-600 disabled:opacity-50"
          >
            残高を修正
          </button>
        </div>
      </section>

      {/* エリアB: プリペイドチャージ & カード登録 */}
      <section className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
        <h2 className="text-lg font-bold text-gray-800 mb-4">💳 チャージ & ICカード登録</h2>
        
        <div className="flex items-center gap-4 mb-4 bg-blue-50 p-3 rounded-lg">
          <label className="text-sm font-bold text-gray-700">一括設定金額:</label>
          <input
            type="number"
            value={chargeAmount}
            onChange={(e) => setChargeAmount(Number(e.target.value))}
            className="text-xl font-bold p-2 border rounded w-32 text-right text-gray-900 bg-white border-gray-300"
          />
          <span className="text-xl font-bold text-gray-700">円</span>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-scroll border rounded bg-white">
            <table className="min-w-full text-left text-sm relative">
                <thead className="bg-gray-100 text-gray-700 border-b sticky top-0 shadow-sm z-10">
                    <tr>
                        <th className="p-3 font-bold">メンバー</th>
                        <th className="p-3 font-bold">現在の残高</th>
                        <th className="p-3 font-bold">操作</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                            <td className="p-3 font-bold text-gray-800">
                                {user.name} <span className="text-xs font-normal text-gray-500">({user.grade})</span>
                                {user.ic_card_uid && (
                                    <div className="text-xs text-green-600 font-bold mt-1">✅ カード連携済</div>
                                )}
                            </td>
                            <td className="p-3 text-lg font-bold text-blue-700">
                                {user.currentBalance.toLocaleString()} 円
                            </td>
                            <td className="p-3">
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleCharge(user)}
                                        disabled={loading || chargeAmount <= 0}
                                        className="bg-blue-600 text-white px-3 py-1 rounded shadow hover:bg-blue-700 disabled:opacity-50 text-sm font-bold whitespace-nowrap"
                                    >
                                        +{chargeAmount} チャージ
                                    </button>
                                    {/* カード登録ボタン */}
                                    <button 
                                        onClick={() => handleRegisterCard(user)}
                                        disabled={loading}
                                        className="bg-gray-700 text-white px-3 py-1 rounded shadow hover:bg-gray-800 disabled:opacity-50 text-sm font-bold whitespace-nowrap flex items-center gap-1"
                                    >
                                        🆔 登録
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </section>

      {/* エリアC: 在庫管理 */}
      <section className="bg-white p-6 rounded-xl shadow-md border-l-4 border-gray-500">
        <h2 className="text-lg font-bold text-gray-800 mb-4">📦 商品在庫の棚卸し・補充</h2>
        {/* テーブル部分は変更なしのため省略...AdminClient全体をコピペしてください */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3 font-bold">商品名</th>
                <th className="p-3 font-bold">現在在庫</th>
                <th className="p-3 font-bold">保存</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="p-3 font-bold text-gray-800">
                    {product.name}
                    <div className="text-xs text-gray-500 font-normal">¥{product.price}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                        <button onClick={() => updateStock(product.id, product.stock - 1)} className="bg-red-100 text-red-600 w-8 h-8 rounded hover:bg-red-200 font-bold">-</button>
                        <input
                            type="number"
                            value={product.stock}
                            onChange={(e) => updateStock(product.id, Number(e.target.value))}
                            className="w-16 text-center border border-gray-300 rounded p-1 font-bold text-gray-900 bg-white"
                        />
                        <button onClick={() => updateStock(product.id, product.stock + 1)} className="bg-green-100 text-green-600 w-8 h-8 rounded hover:bg-green-200 font-bold">+</button>
                    </div>
                  </td>
                  <td className="p-3">
                    <button onClick={() => saveStock(product)} disabled={loading} className="text-blue-600 font-bold hover:underline disabled:opacity-50">
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