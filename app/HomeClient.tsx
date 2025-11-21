'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type User = {
  id: number
  name: string
  grade: string
  ic_card_uid?: string // カードID
}

export default function HomeClient({ users }: { users: User[] }) {
  const router = useRouter()
  const grades = ['D3', 'D2', 'D1', 'M2', 'M1', 'B4', '研究生']
  const [scannedUser, setScannedUser] = useState<User | null>(null)

  // カード監視エフェクト
  useEffect(() => {
    let intervalId: NodeJS.Timeout

    const checkCard = async () => {
      try {
        // Pythonサーバーに問い合わせ
        const res = await fetch('http://localhost:5001/scan')
        const data = await res.json()

        if (data.status === 'found' && data.uid) {
          // 読み取ったUIDを持つユーザーを探す
          const matchedUser = users.find(u => u.ic_card_uid === data.uid)
          
          if (matchedUser) {
            // ★発見！ログイン処理
            setScannedUser(matchedUser)
            // 少し遅延させてジャンプ（演出のため）
            setTimeout(() => {
                router.push(`/shop/${matchedUser.id}`)
            }, 500)
          }
        }
      } catch (e) {
        // Pythonサーバーが動いていない時は静かに無視
      }
    }

    // 1秒ごとにチェック
    intervalId = setInterval(checkCard, 1000)

    // 画面を離れる時に停止
    return () => clearInterval(intervalId)
  }, [users, router])

  return (
    <div className="max-w-md mx-auto relative">
      
      {/* タッチ反応時のオーバーレイ演出 */}
      {scannedUser && (
        <div className="fixed inset-0 bg-blue-600/90 z-50 flex flex-col items-center justify-center text-white animate-fade-in">
            <div className="text-6xl mb-4">🪪✨</div>
            <h2 className="text-3xl font-bold mb-2">Welcome!</h2>
            <p className="text-xl">{scannedUser.name} さん</p>
            <p className="mt-4 text-sm opacity-80">ログイン中...</p>
        </div>
      )}

      <h1 className="text-xl font-bold text-center mb-2 text-gray-800">
        大島研 Food Store 🛒
      </h1>
      
      {/* カードリーダーの状態表示 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-center">
        <p className="text-blue-800 font-bold animate-pulse">
            📡 ICカードをタッチしてください
        </p>
        <p className="text-xs text-blue-500 mt-1">
            または名前を選択して購入
        </p>
      </div>

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
                {gradeUsers.map((user) => (
                  <Link 
                    key={user.id} 
                    href={`/shop/${user.id}`} 
                    className="block text-center bg-white border border-gray-200 p-3 rounded-lg shadow-sm hover:bg-blue-50 hover:border-blue-300 hover:shadow-md transition duration-200 font-medium text-gray-700"
                  >
                    {user.name}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}