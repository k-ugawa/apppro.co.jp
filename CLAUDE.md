# apppro.co.jp — WordPress → Cloudflare Pages 移行プロジェクト

## これは何

合同会社アプローズプロモーションの**コーポレートサイト（補助金・IT導入支援の顔）を、現行 WordPress から Cloudflare Pages の静的サイトへ移行する**ための受け皿リポジトリ。2026-08-28 に箱を作成（クラウドセッション）。

- 現本番：WordPress（https://www.apppro.co.jp/ ・レンタルサーバー上）
- 移行後：このリポジトリ → Vite ビルド → Cloudflare Pages（apppro-web.com と同じ方式）
- **⚠️ この repo はまだ本番に接続されていない（Pages プロジェクト未作成）。それまでは main への push は安全。**
  Pages 接続後は apppro-web と同じ鉄則に切替：未検証の変更は preview/<topic> → プレビューURL確認 → **宇川さん承認後に main マージ**。

## なぜ移行するか

1. WP の保守（更新・セキュリティ・手作業）をやめ、Claude Code から直接編集できる体制にする
2. AIO：ChatGPT はこのドメインを会社の「公式サイト」として扱っている（2026-08-27 計測）。静的化・schema 整備・apppro-web.com との相互紐付けでエンティティを統一する

## 移行チェックリスト

1. ☐ **コンテンツ移植**：WP の全ページを棚卸しし、本リポジトリへ。index.html の【WPから移植】マーカーを実文言で置換。
   - Claude が実施するには：この環境のネットワーク許可に `apppro.co.jp` / `www.apppro.co.jp` を追加してもらう（サイトを直接読んで移植）、または WP エクスポート（ツール→エクスポート→XML）をもらう
2. ☐ **URLマップ**：旧URL→新URLの対応表を作る。**原則は同一URL維持**（ChatGPT が正典と見なしているサイトのため）。変えるものは `public/_redirects` で301。
   - 判明している旧URL：`/company/`（会社概要）← 単一ページ構成にするなら `/company/ → /#company` の301
3. ☐ **Pages プロジェクト作成**（宇川さん・ダッシュボード）：Workers & Pages → Create → このリポジトリを接続 → Build command `npm run build` / Output `dist` → *.pages.dev で確認
4. ☐ **本番切替＝カスタムドメイン設定**。⚠️⚠️ **最重要注意：apppro.co.jp の DNS を動かす際、メール（k-ugawa@apppro.co.jp）の MX / SPF / DKIM レコードを現状のまま持ち込むこと。ここを壊すと会社の受信メールが全部止まる。** 切替前に現 DNS のレコード一式を控える（どこのレンタルサーバー/DNSかを先に確認）。
5. ☐ 切替後：Search Console / Bing の継続確認・sitemap.xml 送信・IndexNow・旧 WP サーバーの扱い（**メールが同居しているなら解約しない**。メール移転計画を立ててから）

## 事実の正（エンティティ統一）

- **会社情報の表記は apppro-web.com の会社概要と一字一句一致させる**（住所：愛知県名古屋市中区栄1丁目16番26号）。ビル名（バードヒル伏見801）を載せるかは要確認・載せるなら両サイト同時に。
- 電話 052-990-2399 は現WPサイト掲載の番号。継続掲載の可否・現役かを要確認。
- Organization schema は @id + sameAs で apppro-web.com と相互参照（apppro-web 側は実装済み・2026-08-27 マージ）。

## 鉄則（全プロジェクト共通）

- 日時は JST。YAGNI。建設的異論を歓迎。事実は検証して出典を付ける。
- 母艦とノートで同時作業しない。作業前 git pull、区切りで git push。
- デザインは移行後に整える（現時点は「読める仮スタイル」。旧WPのデザインは踏襲しない方針・2026-08-28 宇川さん決定）。

## 技術構成

- Vite + 素の HTML/CSS（JSなし）。`npm run build` → `dist/`
- スタイル：`src/style.css`（ブランド濃青 #0056AA は apppro-web と共通）
