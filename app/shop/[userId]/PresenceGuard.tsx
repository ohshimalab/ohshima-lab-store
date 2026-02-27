'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, type RealtimeChannel } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function PresenceGuard({ currentUserId }: { currentUserId: string }) {
  const router = useRouter()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null)

  const setupChannel = useCallback(() => {
    // 既存チャンネルがあれば破棄
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    console.log("🛡️ [Guard] チャンネル接続を開始...")
    const channel = supabase
      .channel('kiosk_watch_' + Date.now())
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'kiosk_status', filter: 'id=eq.1' },
        (payload) => {
          const newUid = payload.new.current_uid
          
          // カードが離された(null) の場合
          if (!newUid) {
            console.log('Card removed. Redirecting home...')
            router.push('/')
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log("✅ [Guard] Realtime 接続OK")
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn("⚠️ [Guard] Realtime 接続エラー。3秒後に再接続...")
          reconnectTimerRef.current = setTimeout(() => setupChannel(), 3000)
        }
      })

    channelRef.current = channel
  }, [router])

  useEffect(() => {
    setupChannel()

    // 画面復帰時に再接続
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("👁️ [Guard] 画面復帰を検知。チャンネル再接続...")
        setupChannel()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [setupChannel])

  return null // 画面には何も表示しない（裏方）
}