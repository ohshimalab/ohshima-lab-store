import { supabase } from '@/lib/supabase'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

async function getData() {
    // 1. ユーザーと残高 (既存)
    const { data: usersWithBalance } = await supabase
        .from('users')
        .select(`*, balance:user_balances(balance)`)
        .order('id')

    // 2. 商品一覧 (既存)
    const { data: products } = await supabase
        .from('products')
        .select('*')
        .order('id')

    // 3. 金庫残高 (既存)
    const { data: fundData } = await supabase
        .from('lab_fund')
        .select('current_balance')
        .single()

    // 4. 取引履歴 (★NEW: 直近100件を取得)
    const { data: history } = await supabase
        .from('transaction_details') // さっき作ったView
        .select('*')
        .limit(100) // 多すぎると重いので制限

    // ユーザーデータの整形
    const usersData = usersWithBalance?.map((u: any) => {
        let currentBalance = 0;
        if (Array.isArray(u.balance)) {
            currentBalance = u.balance[0]?.balance || 0;
        } else if (u.balance && typeof u.balance === 'object') {
            currentBalance = u.balance.balance || 0;
        }
        return {
            id: u.id,
            name: u.name,
            grade: u.grade,
            currentBalance: currentBalance,
            ic_card_uid: u.ic_card_uid
        };
    }) || []
    
    return { 
        usersData, 
        products,
        currentFund: fundData?.current_balance || 0,
        history: history || [] // ★追加
    }
}

export default async function AdminPage() {
    const { usersData, products, currentFund, history } = await getData()

    return (
        <main className="min-h-screen bg-gray-100 p-6 pb-20">
            <div className="max-w-4xl mx-auto"> {/* 幅を少し広げました */}
                <h1 className="text-2xl font-bold text-gray-800 mb-6">
                    🛠️ 管理者ダッシュボード
                </h1>
                <AdminClient 
                    initialProducts={products || []} 
                    initialUsers={usersData}
                    initialFund={currentFund}
                    initialHistory={history} // ★追加
                />
            </div>
        </main>
    )
}