import { SupabaseClient } from '@supabase/supabase-js'

export type Product = {
  id: number
  name: string
  price: number
  stock: number
  category: string
  is_active: boolean
  cost_price?: number
}

export type UserBalance = {
  id: number
  name: string
  grade: string
  currentBalance: number
  ic_card_uid?: string
  is_active?: boolean
}

export type Transaction = {
  id: number
  created_at: string
  user_name: string
  user_grade: string
  product_name: string
  product_category: string
  quantity: number
  total_amount: number
}

export type ProductLog = {
  id: number
  created_at: string
  product_name: string
  action_type: string
  details: string
}

export type ChargeLog = {
  id: number
  created_at: string
  amount: number
  user_name: string
  user_grade: string
}

export type ExpenseLog = {
  id: number
  created_at: string
  shopper_name: string
  store_name: string
  total_cost: number
  items: any
}

export type ExpenseItem = {
  tempId: number
  product_id: number | null
  name: string
  cost: number
  quantity: number
  is_stock: boolean
}

export const CATEGORIES = ['ごはん', '麺類', 'ドリンク', '軽食', 'おかず', 'アイス', 'その他'] as const
export const GRADES = ['B4', 'M1', 'M2', 'D1', 'D2', 'D3', '研究生', '教員', '秘書', 'OB'] as const
