# apppro.co.jp — WordPress → Cloudflare Pages 移行プロジェクト

## これは何

合同会社アプローズプロモーションの**コーポレートサイト（補助金・IT導入支援の顔）を、現行 WordPress から Cloudflare Pages の静的サイトへ移行する**リポジトリ。

- 現本番：WordPress（https://www.apppro.co.jp/ ・**XSERVER** 上。NSは ns1〜5.xserver.jp）
- 移行後：このリポジトリ → Vite ビルド → Cloudflare Pages（apppro-web.com と同じ方式）
- **⚠️ この repo はまだ本番に接続されていない（Pages プロジェクト未作成）。それまでは main への push は安全。**
  Pages 接続後は apppro-web と同じ鉄則に切替：未検証の変更は preview/<topic> → プレビューURLで確認 → **宇川さん承認後に main マージ**。

## なぜ移行するか

1. WP の保守（更新・セキュリティ・手作業）をやめ、Claude Code から直接編集できる体制にする
2. AIO：ChatGPT はこのドメインを会社の「公式サイト」として扱っている（2026-08-27 計測）。静的化・schema 整備・apppro-web.com との相互紐付けでエンティティを統一する

## 現状（2026-08-28 時点）

**移植は完了している。** 全16URLを生成し、静的検査＋実ブラウザ検査に合格。あとは下の「切替の手順」と「保留事項」。

- 固定6ページ：`/` `/company/` `/service/` `/it-subsidy-support/` `/hojo-gate/` `/faq/` `/contact/`（※ `/customer/` は下書き・後述）
- 記事8本：`/2026/MM/DD/<slug>/`（**旧URLをそのまま維持**＝移行で301が要らない）
- コラム一覧 `/news/`・sitemap.xml・llms.txt・_redirects を自動生成

## 技術構成

- Vite + 素の HTML/CSS（JSなし）。`npm run build`（prebuild で `tools/build-site.mjs` が走る）→ `dist/`
- **トップ（/）だけは `index.html`（Vite のエントリ）が正。** 他のページは `content/` から生成される
- CSSの正は `src/style.css` だけ（生成ページには機械コピーで埋め込まれる）

### 仕組み（apppro-web と同じ考え方）

- 型1: 記事を作る ↔ 一覧・サイトマップ・llms.txt に載る（`tools/build-site.mjs` が全部まとめて出す）
- 型2: CSSは `src/style.css` だけが正（写しを持たない）
- 型3: 必須項目の欠落・壊れた画像参照は**ビルドを落とす**

### 原稿の書き方（md-lite）

`content/pages/*.md`（固定ページ）と `content/posts/*.md`（記事）。冒頭の `---` 区間に `path` `title` `description`（記事は `date` も）。本文の記法は
`## 見出し` `### 小見出し` `- 箇条書き` `1. 番号` `> 引用` `---` `| 表 |` `![説明](/images/…)` `**強調**` `[文字](リンク)`。
`%%` で始まる行は原稿メモ（出力されない）。`**Q. …**` の段落は FAQ として構造化データにも載る。
frontmatter に `draft: true` を書くと生成されない（sitemapにも載らない）。

### 検査

```
npm run build
node test/check_site.mjs              # URL・JSON-LD・内部リンク・移植残骸
npx vite preview --port 4321 &
node test/check_site.mjs --browser    # 横はみ出し・consoleエラー・h1
```
**内容を触ったら必ず `check_site.mjs` を通す。**（実際にこれで、WPから引き継いだ slug 直打ちリンク3本と、二重になった目次を検出して直した）

## 🔴 保留事項（宇川さんの判断待ち。切替前に必ず片付ける）

1. **`/customer/`（お客様の声）を `draft: true` にして生成から外している。**
   20件すべてが五つ星・イニシャル表記・文体が似ており、**実在のお客様の声か確認できなかった**。
   仮に創作なら、2023年10月施行のステマ規制（景品表示法）や優良誤認にあたる可能性がある。
   実在するなら `content/pages/customer.md` の `draft: true` 行を消せば公開される。
   実在しないなら、ページごと削除するか「導入イメージ」等と明示した内容に作り替える。
2. **FAQの料金が未記入だった。** 元サイトは「月額○○○○円（税込）」「月額○○○円〜」と**プレースホルダのまま公開されていた**。
   移植版では「お問い合わせください」に書き換えている（`content/pages/faq.md` の `%% TODO` 参照）。実際の金額が決まれば差し替える。
3. **動画本数の記載が食い違う。** サービス紹介は「600本以上」、FAQは「100本以上」。元サイトの時点で不一致。正しい方に統一する。
4. **お問い合わせフォームが無い。** 元サイトは WP プラグインのフォーム。移植版はメール導線のみ。
   フォームが要るなら Pages Functions ＋ Resend で実装する（apppro-web と同じ方式）。
5. **ホジョゲートの数値表現。** 「採択率75%」「営業利益率750%」等は根拠資料の保管を推奨（景表法の合理的根拠）。モデルケースである旨の注記は移植時に追記済み。

## 切替の手順（この順で）

1. ☐ 上の保留事項を片付ける
2. ☐ **Pages プロジェクト作成**（宇川さん・ダッシュボード）：Workers & Pages → Create → このリポジトリを接続 →
   Build command `npm run build` / Output `dist` → `*.pages.dev` で全ページ確認
3. ☐ **本番切替＝カスタムドメイン設定**
   ⚠️⚠️ **最重要：apppro.co.jp の DNS を動かす際、メール（info@apppro.co.jp・k-ugawa@apppro.co.jp）の MX / SPF / DKIM を現状のまま持ち込むこと。ここを壊すと会社の受信メールが全部止まる。**
   現状は XSERVER にWebもDNSもメールも同居している。切替前に現DNSレコード一式を控える。
   - A案：DNS を XSERVER に残し、www の CNAME だけ Pages に向ける（メール無風・最安全）
   - B案：DNSゾーンごと Cloudflare へ移管（apppro-web と管理一元化。MX/SPF/DKIM を正確に写せば無風）
4. ☐ 切替後：Search Console / Bing に sitemap 送信、`_redirects` が効いているか確認（`/category/…` `/tag/…` `/feed/`）、
   **旧 WP サーバーはメールが同居している間は解約しない**

## 事実の正（エンティティ統一）

- 会社情報の表記は **apppro-web.com の会社概要と一致させる**。正式住所は登記どおり
  「〒460-0008 愛知県名古屋市中区栄1-16-26 バードヒル伏見801」。
  ※ apppro-web.com 側は現在ビル名なし。**どちらかに揃える判断が要る**（NAP統一の観点では両方にビル名を入れるのが綺麗）
- 代表社員 宇川 和樹／法人番号 2180003020109／設立 2019年6月19日／資本金100万円
- 電話 052-990-2399（現行サイト掲載・稼働中）／公開メール info@apppro.co.jp
- 商標登録第6942756号／IT導入補助金2025 支援事業者
- Organization schema は `@id` + `sameAs` で apppro-web.com と相互参照（両サイトとも実装済み）

## 移植元スナップショット

`content/wp-export/` に現行WP全17ページの本文（.html と .txt）を収録。移植の答え合わせ用。
変換に使った道具は `tools/wp-to-md.mjs`（一度きりの道具。**再実行すると手で直した内容が消えるので原則使わない**）。

## 鉄則（全プロジェクト共通）

- 日時は JST。YAGNI。建設的異論を歓迎。事実は検証して出典を付ける。
- 母艦とノートで同時作業しない。作業前 git pull、区切りで git push。
- デザインは旧WPを踏襲しない（2026-08-28 宇川さん決定）。ブランド濃青 #0056AA だけ apppro-web と共通。
