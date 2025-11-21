import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { userName, amount, currentFund } = await request.json()
  const webhookUrl = process.env.SLACK_WEBHOOK_URL

  if (!webhookUrl) {
    return NextResponse.json({ error: 'Slack URL not set' }, { status: 500 })
  }

  // Slackに送るメッセージ内容
  const payload = {
    text: `💰 *チャージ報告* 💰\n\n` +
          `👤 *${userName}* さんに *${amount.toLocaleString()}円* チャージしました。\n` +
          `────────────────\n` +
          `🏦 現在の金庫残高: *${currentFund.toLocaleString()}円*`,
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