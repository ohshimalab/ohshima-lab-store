import { supabase } from '@/lib/supabase'
import Link from 'next/link'

// データベースからメンバーを取得する処理（サーバー側で実行されます）
async function getUsers() {
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true) // 在籍中の人のみ
    .order('id') // ID順
  
  return users || []
}

export default async function Home() {
  const users = await getUsers()
  
  // 学年リスト（表示順序の制御用）
  const grades = ['D3', 'D2', 'D1', 'M2', 'M1', 'B4', '研究生']

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-20">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold text-center mb-6 text-gray-800">
          大島研 Food Store 🛒
        </h1>
        
        <p className="text-center text-gray-600 mb-4">購入者を選択してください</p>

        <div className="space-y-6">
          {grades.map((grade) => {
            // その学年のユーザーだけ抽出
            const gradeUsers = users.filter((u) => u.grade === grade)
            
            // その学年の人がいなければスキップ
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
                      href={`/shop/${user.id}`} // ここをクリックすると次のページへ
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
    </main>
  )
}