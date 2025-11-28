import { supabase } from '@/lib/supabase'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

async function getData() {
    // 1. ユーザーと残高
    const { data: usersWithBalance } = await supabase
        .from('users')
        .select(`*, balance:user_balances(balance)`)
        .order('id')

    // 2. 商品一覧
    const { data: products } = await supabase
        .from('products')
        .select('*')
        .order('id')

    // 3. 金庫残高
    const { data: fundData } = await supabase
        .from('lab_fund')
        .select('current_balance')
        .single()

    // 4. 取引履歴 (購入ログ)
    const { data: history } = await supabase
        .from('transaction_details')
        .select('*')
        .eq('is_archived', false)
        .limit(200)
        .order('created_at', { ascending: false })

    // 5. 商品操作ログ
    const { data: productLogs } = await supabase
        .from('product_logs')
        .select('*')
        .limit(50)
        .order('created_at', { ascending: false })

    // 6. チャージ履歴
    const { data: chargeLogs } = await supabase
        .from('charge_logs')
        .select(`id, created_at, amount, users ( name, grade )`)
        .limit(50)
        .order('created_at', { ascending: false })

    // 7. ★追加: 買い出し履歴 (expenses)
    const { data: expenseLogs } = await supabase
        .from('expenses')
        .select('*')
        .limit(50)
        .order('created_at', { ascending: false })

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
            ic_card_uid: u.ic_card_uid,
            is_active: u.is_active
        };
    }) || []
    
    // チャージログの整形
    const formattedChargeLogs = chargeLogs?.map((log: any) => ({
        id: log.id,
        created_at: log.created_at,
        amount: log.amount,
        user_name: log.users?.name || '不明',
        user_grade: log.users?.grade || ''
    })) || []
    
    return { 
        usersData, 
        products,
        currentFund: fundData?.current_balance || 0,
        history: history || [],
        productLogs: productLogs || [],
        chargeLogs: formattedChargeLogs,
        expenseLogs: expenseLogs || [] // ★追加
    }
}

export default async function AdminPage() {
    const { usersData, products, currentFund, history, productLogs, chargeLogs, expenseLogs } = await getData()

    return (
        <main className="min-h-screen bg-gray-100 p-6 pb-20">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-800 mb-6">
                    🛠️ 管理者ダッシュボード
                </h1>
                <AdminClient 
                    initialProducts={products || []} 
                    initialUsers={usersData}
                    initialFund={currentFund}
                    initialHistory={history}
                    initialProductLogs={productLogs}
                    initialChargeLogs={chargeLogs}
                    initialExpenseLogs={expenseLogs} // ★追加
                />
            </div>
        </main>
    )
}