'use server'

export async function verifyKioskPassword(input: string) {
  // 環境変数と照合
  // 設定がない場合はデフォルトで 'admin' になります
  const correctPassword = process.env.KIOSK_PASSWORD || 'admin'
  return input === correctPassword
}