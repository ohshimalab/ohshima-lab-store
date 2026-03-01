'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Transaction, ProductLog, ChargeLog, ExpenseLog } from '../../types'
import { showToast } from '../Toast'
import { useConfirmDialog } from '../ConfirmDialog'

type Props = {
  initialHistory: Transaction[]
  initialProductLogs: ProductLog[]
  initialChargeLogs: ChargeLog[]
  initialExpenseLogs: ExpenseLog[]
  fund: number
  onFundChange: (newFund: number) => void
}

export default function ReportTab({ initialHistory, initialProductLogs, initialChargeLogs, initialExpenseLogs, fund, onFundChange }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fundInput, setFundInput] = useState(fund)
  const { confirm, DialogComponent } = useConfirmDialog()

  // 集計
  const stats = useMemo(() => {
    const productSales: Record<string, number> = {}
    initialHistory.forEach(t => { const key = t.product_name || '不明'; productSales[key] = (productSales[key] || 0) + (t.quantity || 0) })
    const productRanking = Object.entries(productSales).sort(([, a], [, b]) => b - a).slice(0, 5)
    const userSpending: Record<string, number> = {}
    initialHistory.forEach(t => { const key = t.user_name || '不明'; userSpending[key] = (userSpending[key] || 0) + (t.total_amount || 0) })
    const userRanking = Object.entries(userSpending).sort(([, a], [, b]) => b - a).slice(0, 5)
    const totalSales = initialHistory.reduce((sum, t) => sum + t.total_amount, 0)
    const totalItems = initialHistory.reduce((sum, t) => sum + t.quantity, 0)
    return { productRanking, userRanking, totalSales, totalItems }
  }, [initialHistory])

  const downloadCSV = () => {
    if (initialHistory.length === 0) { showToast('warning', '履歴がないためダウンロードできません'); return }
    const headers = ['日時', '購入者', '学年', '商品名', 'カテゴリ', '個数', '金額']
    const rows = initialHistory.map(t => [`"${new Date(t.created_at).toLocaleString('ja-JP')}"`, `"${t.user_name}"`, `"${t.user_grade}"`, `"${t.product_name}"`, `"${t.product_category}"`, t.quantity, t.total_amount])
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
    const ok = await confirm({
      title: '⚠️ 月次リセット',
      message: '月次リセットを行いますか？\nCSVダウンロード後に画面の履歴をクリアします。\n\nこの操作は取り消せません。',
      confirmLabel: 'CSVダウンロード & リセット',
      variant: 'danger',
    })
    if (!ok) return
    setLoading(true)
    downloadCSV()
    const ok2 = await confirm({
      title: '確認',
      message: 'CSVはダウンロードされましたか？\nOKを押すと履歴をアーカイブします。',
      confirmLabel: 'アーカイブする',
      variant: 'danger',
    })
    if (!ok2) { setLoading(false); return }
    try {
      const res = await fetch('/admin/archive', { method: 'POST' })
      if (res.ok) {
        showToast('success', 'リセット完了')
        router.refresh()
      } else {
        showToast('error', 'リセットに失敗しました')
      }
    } catch { showToast('error', '通信エラー') } finally { setLoading(false) }
  }

  const updateFundManually = async () => {
    const ok = await confirm({
      title: '金庫残高の修正',
      message: `金庫残高を ${fundInput.toLocaleString()} $SHM に修正しますか？`,
      confirmLabel: '修正する',
    })
    if (!ok) return

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    await supabase.from('lab_fund').update({ current_balance: fundInput }).eq('id', 1)
    onFundChange(fundInput)
    showToast('success', '金庫残高を修正しました')
    router.refresh()
  }

  const showDetails = (items: any) => {
    const detailStr = items.map((i: any) => `・${i.name} (x${i.quantity})`).join('\n')
    alert(`【内訳】\n${detailStr}`)
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {DialogComponent}

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs font-bold text-gray-500 mb-1">💰 金庫残高</p>
          <p className="text-2xl font-extrabold text-gray-900">{fund.toLocaleString()}</p>
          <p className="text-xs text-gray-400">$SHM</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs font-bold text-gray-500 mb-1">📊 累計売上</p>
          <p className="text-2xl font-extrabold text-blue-600">{stats.totalSales.toLocaleString()}</p>
          <p className="text-xs text-gray-400">$SHM</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs font-bold text-gray-500 mb-1">📦 販売数</p>
          <p className="text-2xl font-extrabold text-green-600">{stats.totalItems.toLocaleString()}</p>
          <p className="text-xs text-gray-400">個</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs font-bold text-gray-500 mb-1">🧾 取引数</p>
          <p className="text-2xl font-extrabold text-indigo-600">{initialHistory.length.toLocaleString()}</p>
          <p className="text-xs text-gray-400">件</p>
        </div>
      </div>

      {/* 金庫 & 月次リセット */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-yellow-300">
          <h3 className="text-sm font-bold text-gray-800 mb-3">💰 金庫残高の修正</h3>
          <div className="flex items-center gap-3">
            <input type="number" value={fundInput} onChange={(e) => setFundInput(Number(e.target.value))} onFocus={(e) => e.target.select()} className="text-2xl font-bold p-2 border border-gray-300 rounded-lg w-36 text-right bg-white text-gray-900" />
            <span className="font-bold text-gray-700">$SHM</span>
            <button onClick={updateFundManually} disabled={loading} className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-yellow-600 shadow-md text-sm">修正</button>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-red-200">
          <h3 className="text-sm font-bold text-gray-800 mb-2">🗓 月次締め・リセット</h3>
          <p className="text-xs text-gray-500 mb-3">現在の取引履歴をCSV保存し、画面をリセットします。</p>
          <div className="flex gap-2">
            <button onClick={downloadCSV} className="bg-gray-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-700 shadow-md text-sm">📥 CSV出力のみ</button>
            <button onClick={handleResetHistory} disabled={loading || initialHistory.length === 0} className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-red-700 disabled:bg-gray-400 text-sm">CSV出力 & リセット</button>
          </div>
        </div>
      </div>

      {/* ランキング */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white p-5 rounded-xl shadow-sm border border-indigo-200">
          <h3 className="text-sm font-bold text-indigo-900 mb-4">🏆 人気商品ランキング</h3>
          <ul className="space-y-3">
            {stats.productRanking.map(([name, count], i) => (
              <li key={name} className="flex items-center justify-between border-b border-indigo-50 pb-2">
                <span className="font-bold text-gray-800"><span className="text-indigo-600 mr-2 font-extrabold">#{i + 1}</span> {name}</span>
                <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-xs font-bold">{count} 個</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="bg-white p-5 rounded-xl shadow-sm border border-green-200">
          <h3 className="text-sm font-bold text-green-900 mb-4">👑 ヘビーユーザー</h3>
          <ul className="space-y-3">
            {stats.userRanking.map(([name, amount], i) => (
              <li key={name} className="flex items-center justify-between border-b border-green-50 pb-2">
                <span className="font-bold text-gray-800"><span className="text-green-600 mr-2 font-extrabold">#{i + 1}</span> {name}</span>
                <span className="font-bold text-gray-900">{amount.toLocaleString()} $SHM</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* チャージ履歴 */}
      <section className="bg-white p-5 rounded-xl shadow-sm border border-blue-200">
        <h3 className="text-sm font-bold text-blue-900 mb-4">💳 チャージ履歴 (直近50件)</h3>
        <div className="overflow-x-auto max-h-60 overflow-y-auto border border-blue-100 rounded-lg">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-blue-50 text-gray-700 sticky top-0">
              <tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">ユーザー</th><th className="p-3 border-b text-right">チャージ額</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialChargeLogs.map((log) => (
                <tr key={log.id} className="hover:bg-blue-50/30">
                  <td className="p-3 text-gray-500 text-xs">{new Date(log.created_at).toLocaleString('ja-JP')}</td>
                  <td className="p-3 font-bold text-gray-800">{log.user_name}</td>
                  <td className="p-3 font-bold text-right text-blue-600">{log.amount > 0 ? '+' : ''}{log.amount.toLocaleString()} $SHM</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 買い出し履歴 */}
      <section className="bg-white p-5 rounded-xl shadow-sm border border-green-200">
        <h3 className="text-sm font-bold text-green-900 mb-4">🧾 買い出し・経費履歴</h3>
        <div className="overflow-x-auto max-h-60 overflow-y-auto border border-green-100 rounded-lg">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-green-50 text-gray-700 sticky top-0">
              <tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">場所/担当</th><th className="p-3 border-b text-right">支出額</th><th className="p-3 border-b text-center">詳細</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialExpenseLogs.map((log) => (
                <tr key={log.id} className="hover:bg-green-50/30">
                  <td className="p-3 text-gray-500 text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString('ja-JP')}</td>
                  <td className="p-3 font-bold text-gray-800">{log.store_name}<br /><span className="text-xs font-normal text-gray-500">{log.shopper_name}</span></td>
                  <td className="p-3 font-bold text-right text-red-600">-{log.total_cost.toLocaleString()} $SHM</td>
                  <td className="p-3 text-center"><button onClick={() => showDetails(log.items)} className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-gray-700">内訳</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 商品管理ログ */}
      <section className="bg-white p-5 rounded-xl shadow-sm border border-orange-200">
        <h3 className="text-sm font-bold text-orange-900 mb-4">🛠️ 商品管理ログ</h3>
        <div className="overflow-x-auto max-h-60 overflow-y-auto border border-orange-100 rounded-lg">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-orange-50 text-gray-700 sticky top-0">
              <tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">商品</th><th className="p-3 border-b">操作</th><th className="p-3 border-b">詳細</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialProductLogs.map((log) => (
                <tr key={log.id} className="hover:bg-orange-50/30">
                  <td className="p-3 text-gray-500 text-xs">{new Date(log.created_at).toLocaleString('ja-JP')}</td>
                  <td className="p-3 font-bold text-gray-800">{log.product_name}</td>
                  <td className="p-3"><span className="text-xs font-bold px-2 py-1 rounded bg-gray-100 text-gray-600">{log.action_type}</span></td>
                  <td className="p-3 text-gray-600 text-xs">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 取引履歴 */}
      <section className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-sm font-bold text-gray-900 mb-4">📜 直近の取引履歴</h3>
        <div className="overflow-x-auto max-h-80 overflow-y-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-700 sticky top-0">
              <tr><th className="p-3 border-b">日時</th><th className="p-3 border-b">購入者</th><th className="p-3 border-b">商品</th><th className="p-3 border-b text-center">個数</th><th className="p-3 border-b text-right">金額</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialHistory.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="p-3 text-gray-600 text-xs">{new Date(t.created_at).toLocaleString('ja-JP')}</td>
                  <td className="p-3 font-bold text-gray-900">{t.user_name}</td>
                  <td className="p-3 text-gray-800">{t.product_name}</td>
                  <td className="p-3 text-gray-800 text-center">x{t.quantity}</td>
                  <td className="p-3 font-bold text-gray-900 text-right">{t.total_amount} $SHM</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
