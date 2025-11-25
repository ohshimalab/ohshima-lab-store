'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { verifyKioskPassword } from './actions'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
type Product = {
    id: number
    name: string
    price: number
    stock: number
    category: string
}

export default function HomeClient({ users, history, products }: { users: User[], history: Transaction[], products: Product[] }) {
  const router = useRouter()
  const [scannedUser, setScannedUser] = useState<User | null>(null)
  const [isKioskMode, setIsKioskMode] = useState(false)
  const [isScreensaverActive, setIsScreensaverActive] = useState(false)

  useEffect(() => {
    const savedMode = localStorage.getItem('kiosk_mode')
    if (savedMode === 'true') setIsKioskMode(true)
  }, [])

  // --- スクリーンセーバー制御 ---
  useEffect(() => {
    if (!isKioskMode) return
    let timeoutId: NodeJS.Timeout
    const startTimer = () => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => setIsScreensaverActive(true), 180000) // 3分
    }
    startTimer()
    const handleActivity = () => {
        if (isScreensaverActive) setIsScreensaverActive(false)
        startTimer()
    }
    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('touchstart', handleActivity)
    window.addEventListener('click', handleActivity)
    return () => {
        clearTimeout(timeoutId)
        window.removeEventListener('mousemove', handleActivity)
        window.removeEventListener('touchstart', handleActivity)
        window.removeEventListener('click', handleActivity)
    }
  }, [isKioskMode, isScreensaverActive])

  const toggleKioskMode = async () => {
    const input = window.prompt(isKioskMode ? "レジモードを解除するパスワード:" : "レジモードを開始するパスワード:")
    if (input === null) return
    const isValid = await verifyKioskPassword(input)
    if (isValid) {
        const newMode = !isKioskMode
        setIsKioskMode(newMode)
        localStorage.setItem('kiosk_mode', String(newMode))
        alert(newMode ? "レジモードを開始しました。" : "レジモードを解除しました。")
    } else {
        alert("パスワードが違います")
    }
  }

  // ランキング計算
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

  const menuByCategory = useMemo(() => {
    const grouped: Record<string, Product[]> = {}
    products.forEach(p => {
        if (!grouped[p.category]) grouped[p.category] = []
        grouped[p.category].push(p)
    })
    return grouped
  }, [products])

  useEffect(() => {
    if (!isKioskMode) return
    console.log("📡 [Kiosk Active] Listening for card scans...")
    const channel = supabase
      .channel('scans')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'realtime_scans' },
        (payload) => {
          const newScan = payload.new as { uid: string, scanned_at: string }
          const matchedUser = users.find(u => u.ic_card_uid === newScan.uid)
          if (matchedUser) {
            const scanTime = new Date(newScan.scanned_at).getTime()
            const now = new Date().getTime()
            if (now - scanTime < 10000) {
                setIsScreensaverActive(false) 
                setScannedUser(matchedUser)
                setTimeout(() => { router.push(`/shop/${matchedUser.id}`) }, 800)
            }
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [users, router, isKioskMode])

  return (
    <div className="max-w-md mx-auto relative space-y-8 pb-20">
      
      {/* ★スクリーンセーバー（デザイン修正版） */}
      {isScreensaverActive && isKioskMode && (
        <div 
            className="fixed inset-0 bg-black z-[9999] cursor-none flex flex-col items-center justify-center overflow-hidden"
            onClick={() => setIsScreensaverActive(false)}
        >
            {/* 動く文字 */}
            <div className="text-white font-bold text-4xl tracking-widest opacity-80 animate-bounce duration-[3000ms]">
                OHSHIMA LAB STORE
            </div>
            <div className="mt-4 text-blue-500 text-sm animate-pulse">
                Touch ID Card to Login
            </div>
            
            {/* 装飾用の浮遊する円（雰囲気を出すため） */}
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-900 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-indigo-900 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
        </div>
      )}

      <div className="absolute top-0 right-0">
        <button onClick={toggleKioskMode} className={`text-[10px] px-2 py-1 rounded border font-bold ${isKioskMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-200 text-gray-500 border-gray-300'}`}>
            {isKioskMode ? '📱 レジモード中' : '管理者用'}
        </button>
      </div>

      {scannedUser && (
        <div className="fixed inset-0 bg-blue-600/95 z-50 flex flex-col items-center justify-center text-white animate-fade-in">
            <div className="text-6xl mb-4">📱⚡️</div>
            <h2 className="text-3xl font-bold mb-2">Hello!</h2>
            <p className="text-xl">{scannedUser.name} さん</p>
            <p className="mt-4 text-sm opacity-80">ログインしました</p>
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-center mb-2 text-gray-800">大島研 Food Store 🛒</h1>
        {isKioskMode ? (
            <div className="bg-blue-600 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-6 text-center shadow-lg animate-pulse">
                <p className="text-4xl mb-2">📡</p>
                <p className="text-lg font-bold">リーダーにタッチしてください</p>
                <p className="text-xs text-blue-100 mt-2">iPad専用レジモード稼働中</p>
            </div>
        ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
                <p className="text-gray-500 font-bold">👀 閲覧モード</p>
                <p className="text-xs text-gray-400 mt-1">購入するにはiPadレジを使ってください</p>
            </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 shadow-sm">
                <h3 className="text-xs font-bold text-yellow-800 text-center mb-3 uppercase tracking-wider">Top Spenders</h3>
                <ul className="space-y-2">
                    {rankings.topUsers.map(([name, amount], index) => (
                        <li key={name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <span className={`font-bold ${index === 0 ? 'text-2xl' : index === 1 ? 'text-xl' : 'text-lg'}`}>{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</span>
                                <span className="font-bold text-gray-700 text-xs truncate max-w-[80px]">{name}</span>
                            </div>
                            <span className="font-bold text-gray-900">¥{amount.toLocaleString()}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="bg-red-50 p-4 rounded-xl border border-red-200 shadow-sm">
                <h3 className="text-xs font-bold text-red-800 text-center mb-3 uppercase tracking-wider">Trending Items</h3>
                <ul className="space-y-2">
                    {rankings.topProducts.map(([name, count], index) => (
                        <li key={name} className="flex items-center justify-between text-sm">
                             <div className="flex items-center gap-2">
                                <span className={`font-bold ${index === 0 ? 'text-red-600' : 'text-red-400'}`}>{index + 1}.</span>
                                <span className="font-medium text-gray-700 text-xs truncate max-w-[90px]">{name}</span>
                            </div>
                            <span className="font-bold text-gray-500 text-xs">x{count}</span>
                        </li>
                    ))}
                </ul>
            </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-center font-bold text-gray-800 flex items-center justify-center gap-2">📦 現在の販売メニュー</h2>
        {Object.entries(menuByCategory).map(([category, items]) => (
            <div key={category} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 font-bold text-gray-600 text-sm">{category}</div>
                <div className="divide-y divide-gray-100">
                    {items.map(product => (
                        <div key={product.id} className="flex justify-between items-center p-3">
                            <div>
                                <p className={`font-bold text-sm ${product.stock > 0 ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{product.name}</p>
                                <p className="text-xs text-blue-600 font-bold">¥{product.price}</p>
                            </div>
                            <div>
                                {product.stock > 0 ? (<span className={`text-xs px-2 py-1 rounded-full font-bold ${product.stock <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>残 {product.stock}</span>) : (<span className="text-xs bg-gray-200 text-gray-500 px-2 py-1 rounded-full font-bold">売切</span>)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-600 mb-3">🕒 最近の購入履歴</h3>
            <div className="space-y-3">
                {history.slice(0, 5).map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2">
                            <div className="bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold text-gray-500">{t.user_name.slice(0, 1)}</div>
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
            </div>
        </div>

    </div>
  )
}