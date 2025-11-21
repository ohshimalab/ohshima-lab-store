import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { productName, stock } = await request.json()
  const webhookUrl = process.env.SLACK_WEBHOOK_URL

  if (!webhookUrl) {
    return NextResponse.json({ error: 'Slack URL not set' }, { status: 500 })
  }

  // Slackに送るメッセージ内容
  const payload = {
    text: `⚠️ *在庫切れ注意報* ⚠️\n\n商品名: *${productName}*\n現在の在庫: *${stock}個*\n\nそろそろ買い出しの時期かもしれません！🏃💨`,
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (!res.ok) throw new Error('Slack send failed')
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}