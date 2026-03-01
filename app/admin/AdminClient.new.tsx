'use client'

import { useState } from 'react'
import { Product, UserBalance, Transaction, ProductLog, ChargeLog, ExpenseLog } from './types'
import ToastContainer from './components/Toast'
import InventoryTab from './components/tabs/InventoryTab'
import MembersTab from './components/tabs/MembersTab'
import ShoppingTab from './components/tabs/ShoppingTab'
import ReportTab from './components/tabs/ReportTab'

type TabKey = 'inventory' | 'members' | 'shopping' | 'report'

const TABS: { key: TabKey; label: string; icon: string; color: string }[] = [
  { key: 'inventory', label: '商品管理', icon: '📦', color: 'blue' },
  { key: 'members', label: 'メンバー', icon: '👤', color: 'indigo' },
  { key: 'shopping', label: '買い出し', icon: '🛍️', color: 'green' },
  { key: 'report', label: 'レポート', icon: '📊', color: 'gray' },
]

const TAB_COLORS: Record<string, string> = {
  blue: 'border-blue-600 text-blue-600',
  indigo: 'border-indigo-600 text-indigo-600',
  green: 'border-green-600 text-green-600',
  gray: 'border-gray-600 text-gray-600',
}

export default function AdminClient({
  initialProducts,
  initialUsers,
  initialFund,
  initialHistory,
  initialProductLogs,
  initialChargeLogs,
  initialExpenseLogs,
}: {
  initialProducts: Product[]
  initialUsers: UserBalance[]
  initialFund: number
  initialHistory: Transaction[]
  initialProductLogs: ProductLog[]
  initialChargeLogs: ChargeLog[]
  initialExpenseLogs: ExpenseLog[]
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('inventory')
  const [fund, setFund] = useState(initialFund)

  return (
    <div className="space-y-6">
      <ToastContainer />

      {/* タブ切り替え */}
      <div className="flex border-b border-gray-300 bg-white sticky top-0 z-20 overflow-x-auto rounded-t-lg">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? `border-b-4 ${TAB_COLORS[tab.color]}`
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'inventory' && (
        <InventoryTab initialProducts={initialProducts} />
      )}

      {activeTab === 'members' && (
        <MembersTab
          initialUsers={initialUsers}
          fund={fund}
          onFundChange={setFund}
        />
      )}

      {activeTab === 'shopping' && (
        <ShoppingTab
          products={initialProducts}
          fund={fund}
          onFundChange={setFund}
        />
      )}

      {activeTab === 'report' && (
        <ReportTab
          initialHistory={initialHistory}
          initialProductLogs={initialProductLogs}
          initialChargeLogs={initialChargeLogs}
          initialExpenseLogs={initialExpenseLogs}
          fund={fund}
          onFundChange={setFund}
        />
      )}
    </div>
  )
}
