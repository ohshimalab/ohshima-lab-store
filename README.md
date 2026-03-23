# Ohshima Lab Food Store - 保守運用ガイド

このドキュメントは、他社・他チームへの引き継ぎを前提に作成しています。
本サービスの運用、保守、障害切り分けに必要な情報をまとめています。

## 1. 機能概要

- 目的: 研究室内フードストアの管理と購入
- 利用者機能: 商品閲覧、購入決済
- 管理者機能: 在庫管理、メンバー管理、チャージ/返金、買い出し記録、レポート
- 基盤: Next.js App Router + Supabase
- 通知: Slack Webhook

## 2. 技術スタック

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase JS / Supabase SSR
- Three.js（キオスク用スクリーンセーバー）

## 3. 主要ルート

- `/`: トップ画面、商品一覧、ランキング、キオスクモード
- `/shop/[userId]`: 指定ユーザーの購入画面
- `/login`: 管理者ログイン画面
- `/admin`: 管理ダッシュボード（Inventory / Members / Shopping / Report）
- `/admin/archive`（POST）: 月次アーカイブ実行
- `/api/slack`（POST）: 在庫低下通知
- `/api/slack/charge`（POST）: チャージ通知

## 4. 重要ファイル

```text
app/page.tsx
app/HomeClient.tsx
app/Screensaver.tsx
app/actions.ts
app/login/page.tsx
app/admin/page.tsx
app/admin/AdminClient.tsx
app/admin/components/tabs/InventoryTab.tsx
app/admin/components/tabs/MembersTab.tsx
app/admin/components/tabs/ShoppingTab.tsx
app/admin/components/tabs/ReportTab.tsx
app/admin/archive/route.ts
app/shop/[userId]/page.tsx
app/shop/[userId]/ShopClient.tsx
app/shop/[userId]/PresenceGuard.tsx
app/api/slack/route.ts
app/api/slack/charge/route.ts
lib/supabase.ts
middleware.ts
```

補足:

- `app/admin/AdminClient.old.tsx` と `app/admin/AdminClient.new.tsx` は現行ルーティングで未使用です。
- 実運用で有効な管理画面コンテナは `app/admin/AdminClient.tsx` です。

## 5. 必須環境変数

`.env.local` に以下を設定してください。

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SLACK_WEBHOOK_URL=...
KIOSK_PASSWORD=...
```

本番環境の補足:

- 本番の環境変数は Vercel の Environment Variables に設定されています。
- 本番値の変更は Vercel プロジェクト設定で実施し、変更後は反映先（Production / Preview / Development）を確認してください。

注意:

- `KIOSK_PASSWORD` 未設定時は `admin` がフォールバックされます。本番では必ず設定してください。
- クライアント側に Service Role キーを露出しないでください。

## 6. Supabase 要件

### 6.1 必須テーブル

- `users`
- `user_balances`
- `products`
- `transactions`
- `transaction_details`
- `lab_fund`
- `product_logs`
- `charge_logs`
- `expenses`
- `kiosk_status`

### 6.2 必須 RPC

- `purchase_cart(p_user_id, p_items)`
- `register_expense(p_shopper_name, p_store_name, p_items)`

### 6.3 Realtime 依存

- `kiosk_status` の UPDATE イベントを購読します。
- 利用箇所: トップ画面のキオスク遷移、購入画面の PresenceGuard、管理画面 Members タブのカード登録。
- カードスキャンして UUID を取得する処理自体は本リポジトリには含まれていません。別リポジトリ `ohshima-lab-store-pasori` 側の責務です。

## 7. ローカルセットアップ

前提:

- Node.js 20 以上推奨
- npm

セットアップ:

```bash
npm ci
npm run dev
```

品質確認:

```bash
npm run lint
npm run build
```

ローカル URL:

- 利用者画面: http://localhost:3000
- 管理画面: http://localhost:3000/admin

## 8. 日次運用 SOP

### 開店前

1. `/` を開き、商品一覧が表示されることを確認する。
2. キオスクモードを有効化し、カード待機 UI が表示されることを確認する。
3. テストカードで `/shop/[userId]` へ遷移できることを確認する。
4. `/admin` にログインし、金庫・在庫・メンバー情報が読み込まれることを確認する。

### 営業中

- 在庫変更は Inventory タブで実施。
- チャージ/返金、カード登録は Members タブで実施。
- 買い出し記録と在庫/金庫反映は Shopping タブで実施。

### 閉店時

1. 取引ログとチャージログを確認する。
2. 必要に応じて棚卸しを行う。
3. キオスク端末ブラウザをトップ待機状態に戻す。

## 9. 月次運用

Report タブから以下を実施します。

1. CSV を出力する。
2. 定められた保管先へ保存する。
3. リセット/アーカイブを実行する。
4. アーカイブ API 成功を確認する。

現在の実装挙動:

- `/admin/archive` は `transactions.is_archived` を false から true に更新します。

注意:

- UI 上では実質的に取り消し不可です。
- リセット前に必ず CSV を出力・保管してください。

## 10. 障害切り分け

### 管理画面にログインできない

- `/login` の認証フローを確認する。
- Supabase URL/Key の環境変数を確認する。
- Supabase Auth の管理者ユーザー状態を確認する。
- middleware のリダイレクト動作を確認する。

### カードタッチしても遷移しない

- `kiosk_status.current_uid` が更新されているか確認する。
- Supabase Realtime 設定を確認する。
- 長時間バックグラウンド後はブラウザを再読み込みする。
- カード読み取り機器側で UUID を取得できているか、別リポジトリ `ohshima-lab-store-pasori` のログ/状態も確認する。

### 決済に失敗する

- RPC `purchase_cart` の存在を確認する。
- 関連テーブルの RLS/権限を確認する。
- ブラウザ DevTools の Network でエラーペイロードを確認する。

### 買い出し登録に失敗する

- RPC `register_expense` の存在を確認する。
- expenses/lab_fund/products の更新権限を確認する。

### Slack 通知が届かない

- `SLACK_WEBHOOK_URL` を確認する。
- `/api/slack` と `/api/slack/charge` のレスポンスを確認する。
- Slack 側の Webhook 設定やチャンネル設定を確認する。

## 11. セキュリティ注意点

- デフォルトパスワードフォールバックで本番運用しない。
- `.env.local` をソース管理に含めない。
- Webhook 漏えい時は即時ローテーションする。
- 管理者アカウントを定期棚卸しする。

## 12. 変更・デプロイ手順

この章では、ローカル作業から GitHub PR、マージ、デプロイ確認までを実際の操作ベースで説明します。

### 12.1 事前準備（初回または久しぶりの作業時）

```bash
# 1) 作業ディレクトリへ移動
cd /path/to/ohshima-lab-store

# 2) 最新状態を取得
git fetch origin

# 3) main を最新化
git switch main
git pull origin main
```

### 12.2 作業ブランチ作成

ブランチ名は「何を直すか」が分かる名前にしてください。

```bash
# 例: README更新の場合
git switch -c docs/update-handover-readme
```

命名規則:

- 形式: `<種別>/<短い説明>`
- 英小文字・数字・ハイフンのみ使用（スペースは使わない）
- 1ブランチ1目的にする（複数目的を混ぜない）

種別（プレフィックス）:

- `feature/`: 機能追加
- `fix/`: 不具合修正
- `docs/`: ドキュメント変更
- `chore/`: 雑多なメンテナンス（依存更新など）

命名例:

- `feature/add-monthly-report-export`
- `fix/card-routing-timeout`
- `docs/update-handover-readme`

### 12.3 実装とローカル確認

変更後、最低限以下を実行します。

```bash
# 依存が未導入なら
npm ci

# 静的チェック
npm run lint

# 本番ビルド確認
npm run build
```

補足:

- lint や build が失敗した場合は、解消してから次に進みます。
- 大きい変更では必要に応じて手動確認（画面操作）も実施します。

### 12.4 コミット

```bash
# 変更ファイル確認
git status

# 変更をステージ
git add .

# コミット
git commit -m "docs: update maintenance and handover guide"
```

コミットメッセージ規則:

- 形式: `<種別>: <変更内容>`
- 先頭種別は次のいずれかを使用
	- `feat`: 機能追加
	- `fix`: 不具合修正
	- `docs`: ドキュメント変更
	- `refactor`: 振る舞いを変えない内部改善
	- `chore`: 雑多な作業（設定、依存更新など）
- 1コミット1目的にする
- 何をしたかが一目で分かる文にする

コミットメッセージ例:

- `feat: add monthly archive validation step`
- `fix: handle missing kiosk uid update`
- `docs: clarify vercel env var management`

### 12.5 GitHubへPushしてPR作成

```bash
# 初回 push（追跡ブランチ設定）
git push -u origin docs/update-handover-readme
```

1人運用時の推奨:

- 変更履歴を残すため、1人運用でも PR を作成することを推奨します（レビュー担当の指定は不要）。

その後 GitHub 上で以下を実施します。

1. Compare & pull request を開く。
2. Base を `main`、Compare を作業ブランチにする。
3. PRタイトルと説明を記載する。
4. 変更内容、確認手順、影響範囲を明記する。
5. セルフチェック後にマージする。

PR説明テンプレート（例）:

```text
## 変更内容
- READMEの運用手順を具体化
- Vercel環境変数と外部リポジトリ依存の注意書きを追記

## 確認項目
- [ ] npm run lint
- [ ] npm run build
- [ ] READMEのリンクと手順記述を目視確認

## 影響範囲
- ドキュメントのみ（実装コード変更なし）
```

### 12.6 セルフチェック後の修正対応

1人運用では、レビューコメントの代わりにセルフチェックで修正点を確認します。
修正が発生した場合は、同じブランチで追加コミットして再Pushします。

```bash
git add .
git commit -m "docs: address self-check findings"
git push
```

### 12.7 マージ

セルフチェック完了後、GitHub上で次を確認してからマージします。

- PR画面の自動チェック（Checks）がすべて緑色（成功）になっていること
- 失敗表示（赤）がないこと

推奨:

- Squash and merge（PR単位で履歴をまとめる）

マージ後のローカル整理:

```bash
git switch main
git pull origin main
git branch -d docs/update-handover-readme
```

### 12.8 デプロイ（Vercel）

本リポジトリは Vercel 連携を前提とし、通常は main マージで自動デプロイされます。

確認手順:

1. Vercel Dashboard で対象プロジェクトを開く。
2. Deployments で最新デプロイが Success になっていることを確認する。
3. Production URL で動作確認する。

デプロイ失敗時:

- Vercel の Build Logs を確認する。
- 必要なら該当コミットを修正して再PRまたは再デプロイする。

### 12.9 デプロイ後スモークテスト

以下の導線を最低限確認します。

1. `/` が表示される。
2. `/shop/[userId]` の購入導線が動く。
3. `/admin` にログインできる。
4. チャージ処理が実行できる。
5. 買い出し処理で在庫/金庫反映される。

確認時に問題があれば、障害切り分け（第10章）に従って原因を特定してください。
