import { supabase } from '@/lib/supabase'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

async function getData() {
    // 1. 全ユーザーと残高を取得
    const { data: usersWithBalance, error } = await supabase
        .from('users')
        .select(`
            *,
            balance:user_balances(balance)
        `)
        .order('id')

    if (error) console.error("Adminデータ取得エラー:", error)

    // 2. 商品一覧を取得
    const { data: products } = await supabase
        .from('products')
        .select('*')
        .order('id')

    // 3. 金庫残高を取得
    const { data: fundData } = await supabase
        .from('lab_fund')
        .select('current_balance')
        .single()
    
    // ★ここを修正: ic_card_uid をAdminClientに渡すように追加
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
            ic_card_uid: u.ic_card_uid // ★追加！これで「連携済」マークが出ます
        };
    }) || []
    
    return { 
        usersData, 
        products,
        currentFund: fundData?.current_balance || 0
    }
}

export default async function AdminPage() {
    const { usersData, products, currentFund } = await getData()

    return (
        <main className="min-h-screen bg-gray-100 p-6 pb-20">
            <div className="max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">
                    🛠️ 管理者ダッシュボード
                </h1>
                <AdminClient 
                    initialProducts={products || []} 
                    initialUsers={usersData}
                    initialFund={currentFund}
                />
            </div>
        </main>
    )
}