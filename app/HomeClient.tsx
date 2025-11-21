'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'

type User = {
  id: number
  name: string
  grade: string
  ic_card_uid?: string
}

type Transaction = {
    id: number
    created_at: string
    user_name: string
    product_name: string
    total_amount: number
    quantity: number
}

export default function HomeClient({ users, history }: { users: User[], history: Transaction[] }) {
  const router = useRouter()
  const grades = ['D3', 'D2', 'D1', 'M2', 'M1', 'B4', '研究生']
  const [scannedUser, setScannedUser] = useState<User | null>(null)

  // --- ランキング計算 (既存のまま) ---
  const rankings = useMemo(() => {
    const userSpending: Record<string, number> = {}
    history.forEach(t => {
        const name = t.user_name || '不明'
        userSpending[name] = (userSpending[name] || 0) + (t.total_amount || 0)
    })
    const topUsers = Object.entries(userSpending).sort(([, a], [, b]) => b - a).slice(0, 3)

    const productCount: Record<string, number> = {}
    history.forEach(t => {
        const name = t.product_name || '不明'
        productCount[name] = (productCount[name] || 0) + (t.quantity || 0)
    })
    const topProducts = Object.entries(productCount).sort(([, a], [, b]) => b - a).slice(0, 3)

    return { topUsers, topProducts }
  }, [history])


  // --- ICカード監視エフェクト (既存のまま) ---
  useEffect(() => {
    let intervalId: NodeJS.Timeout
    const checkCard = async () => {
      try {
        const res = await fetch('http://localhost:5001/scan')
        const data = await res.json()
        if (data.status === 'found' && data.uid) {
          const matchedUser = users.find(u => u.ic_card_uid === data.uid)
          if (matchedUser) {
            setScannedUser(matchedUser)
            // 0.5秒後に遷移
            setTimeout(() => { router.push(`/shop/${matchedUser.id}`) }, 500)
          }
        }
      } catch (e) {
        // サーバーが動いていない場合は無視
      }
    }
    intervalId = setInterval(checkCard, 1000)
    return () => clearInterval(intervalId)
  }, [users, router])

  return (
    <div className="max-w-md mx-auto relative space-y-8">
      
      {/* タッチ反応時の演出 */}
      {scannedUser && (
        <div className="fixed inset-0 bg-blue-600/90 z-50 flex flex-col items-center justify-center text-white animate-fade-in">
            <div className="text-6xl mb-4">🪪✨</div>
            <h2 className="text-3xl font-bold mb-2">Welcome!</h2>
            <p className="text-xl">{scannedUser.name} さん</p>
            <p className="mt-4 text-sm opacity-80">ログインしています...</p>
        </div>
      )}

      {/* ヘッダーエリア */}
      <div>
        <h1 className="text-xl font-bold text-center mb-2 text-gray-800">
            大島研 Food Store 🛒
        </h1>
        <div className="bg-blue-600 text-white border border-blue-700 rounded-xl p-6 text-center shadow-lg">
            <p className="text-4xl mb-2">📡</p>
            <p className="text-lg font-bold animate-pulse">
                カードをタッチしてください
            </p>
            <p className="text-xs text-blue-200 mt-2">
                ※購入にはICカードの登録が必要です
            </p>
        </div>
      </div>

      {/* === ユーザーリスト (クリック無効化・ステータス表示のみ) === */}
      <div className="space-y-6">
        {grades.map((grade) => {
          const gradeUsers = users.filter((u) => u.grade === grade)
          if (gradeUsers.length === 0) return null
          return (
            <div key={grade}>
              <h2 className="text-sm font-bold text-gray-400 border-b border-gray-300 mb-2 pb-1">
                {grade}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {gradeUsers.map((user) => {
                  // カード登録済みかどうか
                  const isRegistered = !!user.ic_card_uid

                  return (
                    <div 
                      key={user.id} 
                      className={`
                        block text-center border p-3 rounded-lg shadow-sm transition duration-200 relative
                        ${isRegistered 
                            ? 'bg-white border-gray-200' 
                            : 'bg-gray-100 border-gray-200 opacity-70'
                        }
                      `}
                    >
                      <div className="font-bold text-gray-700">
                        {user.name}
                      </div>
                      
                      {/* ステータスバッジ */}
                      <div className="mt-1 text-[10px] font-bold">
                        {isRegistered ? (
                            <span className="text-blue-600 flex items-center justify-center gap-1">
                                🔒 タッチ待ち
                            </span>
                        ) : (
                            <span className="text-orange-500 flex items-center justify-center gap-1">
                                ⚠️ カード未登録
                            </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* === 競争心を煽るランキングエリア (既存のまま) === */}
      <div className="pt-8 border-t border-gray-300">
        <h2 className="text-center font-bold text-gray-800 mb-4 flex items-center justify-center gap-2">
            👑 今月の長者番付 <span className="text-xs font-normal text-gray-500">(直近50件)</span>
        </h2>
        
        <div className="grid grid-cols-2 gap-4 mb-8">
            {/* ユーザーランキング */}
            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 shadow-sm">
                <h3 className="text-xs font-bold text-yellow-800 text-center mb-3 uppercase tracking-wider">Top Spenders</h3>
                <ul className="space-y-2">
                    {rankings.topUsers.map(([name, amount], index) => (
                        <li key={name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <span className={`font-bold ${index === 0 ? 'text-2xl' : index === 1 ? 'text-xl' : 'text-lg'}`}>
                                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                </span>
                                <span className="font-bold text-gray-700 text-xs truncate max-w-[80px]">{name}</span>
                            </div>
                            <span className="font-bold text-gray-900">¥{amount.toLocaleString()}</span>
                        </li>
                    ))}
                    {rankings.topUsers.length === 0 && <li className="text-xs text-gray-400 text-center">データなし</li>}
                </ul>
            </div>

            {/* 商品ランキング */}
            <div className="bg-red-50 p-4 rounded-xl border border-red-200 shadow-sm">
                <h3 className="text-xs font-bold text-red-800 text-center mb-3 uppercase tracking-wider">Trending Items</h3>
                <ul className="space-y-2">
                    {rankings.topProducts.map(([name, count], index) => (
                        <li key={name} className="flex items-center justify-between text-sm">
                             <div className="flex items-center gap-2">
                                <span className={`font-bold ${index === 0 ? 'text-red-600' : 'text-red-400'}`}>
                                    {index + 1}.
                                </span>
                                <span className="font-medium text-gray-700 text-xs truncate max-w-[90px]">{name}</span>
                            </div>
                            <span className="font-bold text-gray-500 text-xs">x{count}</span>
                        </li>
                    ))}
                    {rankings.topProducts.length === 0 && <li className="text-xs text-gray-400 text-center">データなし</li>}
                </ul>
            </div>
        </div>

        {/* === 🕒 直近の購入ログ (既存のまま) === */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-600 mb-3">🕒 最近の購入履歴</h3>
            <div className="space-y-3">
                {history.slice(0, 5).map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2">
                            <div className="bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold text-gray-500">
                                {t.user_name.slice(0, 1)}
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 text-xs">{t.user_name}</p>
                                <p className="text-gray-500 text-[10px]">{new Date(t.created_at).toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'})}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="font-medium text-gray-700 text-xs">{t.product_name}</p>
                            <p className="font-bold text-blue-600 text-xs">¥{t.total_amount}</p>
                        </div>
                    </div>
                ))}
                {history.length === 0 && <p className="text-center text-xs text-gray-400">まだ履歴がありません</p>}
            </div>
        </div>
      </div>

    </div>
  )
}