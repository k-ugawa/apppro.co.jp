#!/usr/bin/env node
// build-site — content/ から全ページ・サイトマップ・llms.txt を生成する
//
// 実行: npm run build の prebuild（手元でも Cloudflare のビルドでも同じ経路で走る）
// 出力: public/<path>/index.html ・ public/sitemap.xml ・ public/llms.txt
//       トップ（/）だけは Vite のエントリなのでリポジトリ直下の index.html が正。
//
// 設計（apppro-web と同じ考え方）:
//   型1: 記事を作る ↔ 一覧・サイトマップ・llms.txt に載る（このスクリプトが全部まとめて出す）
//   型2: CSSは src/style.css だけが正（機械コピーで各ページに埋め込む）
//   型3: 必須項目の欠落・壊れた参照は「ビルドを落とす」（壊れたページを本番に出さない）
//
// 記法（md-lite。これ以外は使わない。生のHTMLはエスケープされて文字のまま出る）:
//   ## 見出し ／ ### 小見出し ／ - 箇条書き ／ 1. 番号 ／ > 引用 ／ --- 区切り
//   | 表 | 形式 |  ／ ![説明](/images/…) ／ **強調** ／ [文字](リンク)
//   %% で始まる行は原稿用のメモ（出力されない）
//   「**Q. …**」の段落はFAQとして構造化データにも載る

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.apppro.co.jp";
const ORG_ID = `${SITE}/#organization`;
const PUB = path.join(ROOT, "public");

const die = (m) => { console.error(`❌ build-site: ${m}`); process.exit(1); };

const esc = (s) => String(s ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|#[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

// ---------- frontmatter ----------
function parseFrontmatter(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) die(`${file}: 冒頭の --- 区間がありません`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const mm = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (!mm) die(`${file}: 冒頭区間の書式が不正です → 「${line}」`);
    meta[mm[1]] = mm[2].trim();
  }
  for (const k of ["path", "title", "description"]) {
    if (!meta[k]) die(`${file}: ${k} がありません`);
  }
  if (!/^\/([a-z0-9/-]*\/)?$/.test(meta.path)) die(`${file}: path は / で始まり / で終わる（今: ${meta.path}）`);
  if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) die(`${file}: date は YYYY-MM-DD`);
  return { meta, body: m[2] };
}

// ---------- 本文 md-lite → HTML（+ 目次 + FAQ抽出） ----------
function renderBody(body, file) {
  const lines = body.split(/\r?\n/);
  const out = [];
  const toc = [];
  const faq = [];
  let list = null;       // "ul" | "ol"
  let table = null;      // 収集中の表の行
  let secN = 0;
  let curQ = null;

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !/^\|[\s:-]+\|$/.test(r.replace(/\s/g, "")));
    const cells = rows.map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    const head = cells.shift();
    const th = head.map((c) => `<th>${inline(c)}</th>`).join("");
    const tb = cells.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("");
    out.push(`<div class="tbl-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
    table = null;
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith("%%")) continue;                 // 原稿メモ
    if (!t) { closeList(); flushTable(); continue; }

    if (/^\|.*\|$/.test(t)) { closeList(); (table ||= []).push(t); continue; }
    flushTable();

    if (t === "---") { closeList(); out.push("<hr>"); continue; }

    let m;
    if ((m = t.match(/^##\s+(.+)$/))) {
      closeList(); secN++;
      const id = `sec-${secN}`;
      toc.push({ id, text: m[1] });
      curQ = null;
      out.push(`<h2 id="${id}">${inline(m[1])}</h2>`);
      continue;
    }
    if ((m = t.match(/^###\s+(.+)$/))) { closeList(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      closeList();
      const abs = path.join(PUB, m[2].replace(/^\//, ""));
      if (!fs.existsSync(abs)) die(`${file}: 画像がありません: public${m[2]}`);
      out.push(`<figure class="fig"><img src="${m[2]}" alt="${esc(m[1])}" loading="lazy" />${m[1] ? `<figcaption>${inline(m[1])}</figcaption>` : ""}</figure>`);
      continue;
    }
    if ((m = t.match(/^>\s?(.*)$/))) { closeList(); out.push(`<blockquote><p>${inline(m[1])}</p></blockquote>`); continue; }
    if ((m = t.match(/^-\s+(.+)$/))) {
      if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
      out.push(`<li>${inline(m[1])}</li>`);
      if (curQ) faq[faq.length - 1].a += (faq[faq.length - 1].a ? " " : "") + m[1].replace(/\*\*/g, "");
      continue;
    }
    if ((m = t.match(/^\d+\.\s+(.+)$/))) {
      if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
      out.push(`<li>${inline(m[1])}</li>`);
      if (curQ) faq[faq.length - 1].a += (faq[faq.length - 1].a ? " " : "") + m[1].replace(/\*\*/g, "");
      continue;
    }

    closeList();
    const q = t.match(/^\*\*Q\.\s*(.+?)\*\*$/);
    if (q) {
      curQ = q[1];
      faq.push({ q: curQ, a: "" });
      out.push(`<p class="q"><strong>Q. ${inline(curQ).replace(/<\/?strong>/g, "")}</strong></p>`);
      continue;
    }
    out.push(`<p>${inline(t)}</p>`);
    if (curQ) faq[faq.length - 1].a += (faq[faq.length - 1].a ? " " : "") + t.replace(/\*\*/g, "");
  }
  closeList(); flushTable();
  for (const f of faq) if (!f.a) die(`${file}: FAQ「${f.q}」の答えがありません`);
  return { html: out.join("\n"), toc, faq };
}

// ---------- テンプレート ----------
const baseCss = () => fs.readFileSync(path.join(ROOT, "src", "style.css"), "utf8");

function shell({ title, description, canonical, jsonld, bodyHtml, ogImage = `${SITE}/images/ogp.png` }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${canonical}" />
<meta property="og:site_name" content="合同会社アプローズプロモーション" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:locale" content="ja_JP" />
<link rel="icon" href="/images/favicon.png" />
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
<style>${baseCss()}</style>
</head>
<body>
<header class="site-nav">
  <a class="brand" href="/">アプローズプロモーション</a>
  <nav aria-label="サイト内リンク">
    <a href="/service/">サービス</a>
    <a href="/it-subsidy-support/">IT導入補助金</a>
    <a href="/hojo-gate/">ホジョゲート</a>
    <a href="/news/">コラム</a>
    <a href="/company/">会社概要</a>
    <a class="nav-cta" href="/contact/">お問い合わせ</a>
  </nav>
</header>
${bodyHtml}
<footer class="site-foot">
  <div class="foot-in">
    <p class="foot-name">合同会社アプローズプロモーション</p>
    <p>〒460-0008　愛知県名古屋市中区栄1-16-26 バードヒル伏見801<br />TEL 052-990-2399／info@apppro.co.jp</p>
    <p><a href="https://apppro-web.com/">事業サイト：AI業務ツール・DXツール開発（apppro-web.com）</a></p>
    <p class="copy">&copy; 2026 Applause Promotion LLC</p>
  </div>
</footer>
</body>
</html>
`;
}

function articleJsonLd(meta, url, faq) {
  const j = [
    {
      "@context": "https://schema.org",
      "@type": meta.date ? "Article" : "WebPage",
      headline: meta.title,
      name: meta.title,
      description: meta.description,
      inLanguage: "ja",
      mainEntityOfPage: url,
      ...(meta.date ? { datePublished: meta.date, dateModified: meta.updated || meta.date } : {}),
      ...(meta.image ? { image: `${SITE}${meta.image}` } : {}),
      author: { "@type": "Organization", "@id": ORG_ID, name: "合同会社アプローズプロモーション", url: `${SITE}/` },
      publisher: { "@type": "Organization", "@id": ORG_ID, name: "合同会社アプローズプロモーション" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ホーム", item: `${SITE}/` },
        ...(meta.date ? [{ "@type": "ListItem", position: 2, name: "コラム", item: `${SITE}/news/` }] : []),
        { "@type": "ListItem", position: meta.date ? 3 : 2, name: meta.title, item: url },
      ],
    },
  ];
  if (faq.length) {
    j.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }
  return j;
}

function pageHtml(item) {
  const url = `${SITE}${item.meta.path}`;
  const crumb = item.meta.date
    ? `<p class="bc"><a href="/">ホーム</a> › <a href="/news/">コラム</a> › ${esc(item.meta.title)}</p>`
    : `<p class="bc"><a href="/">ホーム</a> › ${esc(item.meta.title)}</p>`;
  const toc = item.toc.length >= 3
    ? `<nav class="toc"><b>目次</b><ol>${item.toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ol></nav>`
    : "";
  const date = item.meta.date
    ? `<p class="date">公開 ${item.meta.date.replaceAll("-", "/")}${item.meta.updated ? ` ／ 更新 ${item.meta.updated.replaceAll("-", "/")}` : ""}</p>`
    : "";
  const body = `<main class="page">
${crumb}
<article>
<h1>${esc(item.meta.title)}</h1>
${date}
${toc}
<div class="body">
${item.html}
</div>
</article>
<div class="cta">
<p>補助金の活用や、ツール導入のご相談はお気軽に。お見積り・ご相談は無料です。</p>
<a class="btn" href="/contact/">お問い合わせ</a>
</div>
</main>`;
  return shell({
    title: `${item.meta.title}｜合同会社アプローズプロモーション`,
    description: item.meta.description,
    canonical: url,
    jsonld: articleJsonLd(item.meta, url, item.faq),
    bodyHtml: body,
  });
}

function newsIndexHtml(posts) {
  const url = `${SITE}/news/`;
  const cards = posts.map((p) => `<a class="card" href="${p.meta.path}">
<span class="d">${p.meta.date.replaceAll("-", "/")}</span>
<span class="t">${esc(p.meta.title)}</span>
<span class="s">${esc(p.meta.description)}</span>
</a>`).join("\n");
  const body = `<main class="page">
<p class="bc"><a href="/">ホーム</a> › コラム</p>
<h1>コラム</h1>
<p class="lede">補助金・助成金とデジタル化について、支援事業者の視点で解説しています。</p>
<div class="cards">
${cards}
</div>
</main>`;
  return shell({
    title: "コラム｜補助金・助成金とデジタル化の解説｜合同会社アプローズプロモーション",
    description: "IT導入補助金（デジタル化・AI導入補助金）、キャリアアップ助成金、人材開発支援助成金など、中小企業が使える制度の解説記事。名古屋の支援事業者が実務の視点で書いています。",
    canonical: url,
    jsonld: [{
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "コラム",
      url,
      isPartOf: { "@type": "WebSite", "@id": `${SITE}/#website`, name: "合同会社アプローズプロモーション", url: `${SITE}/` },
    }],
    bodyHtml: body,
  });
}

// ---------- 読み込み ----------
function load(dir, kind) {
  const d = path.join(ROOT, "content", dir);
  if (!fs.existsSync(d)) die(`${dir} がありません`);
  const files = fs.readdirSync(d).filter((f) => f.endsWith(".md")).sort();
  if (!files.length) die(`${dir} に .md がありません`);
  return files.map((f) => {
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(d, f), "utf8"), `${dir}/${f}`);
    const { html, toc, faq } = renderBody(body, `${dir}/${f}`);
    return { file: f, kind, meta, html, toc, faq, draft: meta.draft === "true" };
  });
}

const pages = load("pages", "page");
const posts = load("posts", "post").sort((a, b) => b.meta.date.localeCompare(a.meta.date));
for (const p of posts) if (!p.meta.date) die(`posts/${p.file}: date がありません`);

const live = [...pages, ...posts].filter((x) => !x.draft);
const drafts = [...pages, ...posts].filter((x) => x.draft);

// path 重複チェック
const seen = new Set();
for (const x of live) {
  if (seen.has(x.meta.path)) die(`path 重複: ${x.meta.path}`);
  seen.add(x.meta.path);
}

// ---------- 書き出し ----------
for (const x of live) {
  const dir = path.join(PUB, x.meta.path.replace(/^\/|\/$/g, ""));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), pageHtml(x), "utf8");
}
fs.mkdirSync(path.join(PUB, "news"), { recursive: true });
fs.writeFileSync(path.join(PUB, "news", "index.html"), newsIndexHtml(posts.filter((p) => !p.draft)), "utf8");

// sitemap（トップ＋公開ページ＋コラム一覧）
const latest = posts.length ? posts[0].meta.date : "2026-08-28";
const urls = [
  { loc: `${SITE}/`, lastmod: latest },
  { loc: `${SITE}/news/`, lastmod: latest },
  ...live.map((x) => ({ loc: `${SITE}${x.meta.path}`, lastmod: x.meta.updated || x.meta.date || latest })),
];
fs.writeFileSync(path.join(PUB, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join("\n")}\n</urlset>\n`, "utf8");

// llms.txt
const llms = `# 合同会社アプローズプロモーション (APPLAUSE PROMOTION LLC)

> 名古屋の中小企業向けに、IT導入補助金・助成金の活用支援、AI/DX人材育成、クラウドツール導入を行う会社。

## 基本情報

- 所在地: 愛知県名古屋市中区栄1-16-26 バードヒル伏見801
- 設立: 2019年6月 / 法人番号: 2180003020109 / 代表社員: 宇川 和樹
- 連絡: info@apppro.co.jp / 052-990-2399
- サイト: ${SITE}/
- 事業サイト（AI業務ツール・DXツール開発）: https://apppro-web.com/

## 主なページ

${pages.filter((p) => !p.draft).map((p) => `- ${p.meta.title}: ${SITE}${p.meta.path}`).join("\n")}

## コラム（補助金・助成金の解説記事）

${posts.map((p) => `- ${p.meta.title}: ${SITE}${p.meta.path}`).join("\n")}
`;
fs.writeFileSync(path.join(PUB, "llms.txt"), llms, "utf8");

console.log(`build-site: 固定 ${pages.filter((p) => !p.draft).length}ページ ／ 記事 ${posts.length}本 ／ コラム一覧 ／ sitemap ／ llms.txt を生成しました`);
for (const x of live) console.log(`  ${x.meta.path}  （FAQ ${x.faq.length}問・見出し ${x.toc.length}）`);
if (drafts.length) {
  console.log(`\n⚠️ 下書き（生成せず・sitemapにも載せない）: ${drafts.length}件`);
  for (const d of drafts) console.log(`  ${d.meta.path}  ${d.kind}/${d.file}`);
}
