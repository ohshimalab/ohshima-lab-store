'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function PresenceGuard({ currentUserId }: { currentUserId: string }) {
  const router = useRouter()

  useEffect(() => {
    // 監視開始
    const channel = supabase
      .channel('kiosk_watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'kiosk_status', filter: 'id=eq.1' },
        (payload) => {
          const newUid = payload.new.current_uid
          
          // カードが離された(null) または 別のカードに変わった場合
          if (!newUid) {
            console.log('Card removed. Redirecting home...')
            router.push('/') // トップへ戻る
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [router])

  return null // 画面には何も表示しない（裏方）
}