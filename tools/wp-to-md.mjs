#!/usr/bin/env node
// wp-to-md — WordPress から回収した記事HTML（content/wp-export/）を md-lite に変換する。
//
// 移行時に一度だけ使う道具（結果は content/posts/*.md として人が読める形で残る）。
// 変換後の正は content/posts/ 側。以後この変換器は再実行しない前提だが、
// 「どこからどう作ったか」を残すためリポジトリに置く。
//
// 使い方: node tools/wp-to-md.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "content", "wp-export");
const OUT = path.join(ROOT, "content", "posts");
const FULL = process.env.FULLPAGES || "";  // meta取得用の元ページ置き場（任意）

const die = (m) => { console.error("❌ " + m); process.exit(1); };

// 記事ファイル（日付始まり）だけを対象にする
const files = fs.readdirSync(SRC).filter((f) => /^2026_.*\.html$/.test(f)).sort();
if (!files.length) die("記事HTMLがありません");
fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// インライン: 強調とリンクだけ md に戻す
function inline($, el) {
  let out = "";
  $(el).contents().each((_, n) => {
    if (n.type === "text") { out += n.data.replace(/\s+/g, " "); return; }
    const $n = $(n);
    const tag = n.name;
    if (tag === "strong" || tag === "b") out += `**${inline($, n).trim()}**`;
    else if (tag === "a") {
      const href = $n.attr("href") || "";
      const txt = inline($, n).trim();
      // 内部リンクは相対パスに寄せる（ドメイン移行後も生きるように）
      const h = href.replace(/^https?:\/\/(www\.)?apppro\.co\.jp/, "");
      out += h && txt ? `[${txt}](${h})` : txt;
    }
    else if (tag === "br") out += " ";
    else out += inline($, n);
  });
  return out;
}

function tableToMd($, el) {
  const rows = [];
  $(el).find("tr").each((_, tr) => {
    const cells = [];
    $(tr).find("th,td").each((_, td) => cells.push(inline($, td).trim().replace(/\|/g, "／")));
    if (cells.length) rows.push(cells);
  });
  if (!rows.length) return "";
  const head = rows.shift();
  const lines = [`| ${head.join(" | ")} |`, `|${head.map(() => " --- ").join("|")}|`];
  for (const r of rows) {
    while (r.length < head.length) r.push("");
    lines.push(`| ${r.slice(0, head.length).join(" | ")} |`);
  }
  return lines.join("\n");
}

for (const f of files) {
  const slug = f.replace(/\.html$/, "");
  // 2026_02_09_it-subsidy-… → 日付とスラッグに分解（元URLを保つため）
  const m = slug.match(/^(\d{4})_(\d{2})_(\d{2})_(.+)$/);
  if (!m) die(`${f}: ファイル名から日付が読めません`);
  const [, y, mo, d, name] = m;

  const $ = cheerio.load(fs.readFileSync(path.join(SRC, f), "utf8"));

  // 記事本文の入れ物を絞る（SWELLの構造。無ければ全体）
  let $body = $(".post_content");
  if (!$body.length) $body = $("article");
  if (!$body.length) $body = $.root();
  // 目次・共有・関連・広告など、本文でないものを落とす
  $body.find(".p-toc,.c-share,.c-copyed,.related-articles,.p-article__ad,.p-articleThumb,.c-postThumb,.p-articleFoot,.u-thin,script,style,noscript").remove();

  const out = [];
  const push = (s) => { if (s && s.trim()) out.push(s.trim()); };

  $body.children().each((_, el) => {
    const tag = el.name;
    const $el = $(el);
    if (tag === "h2") push(`## ${inline($, el).trim()}`);
    else if (tag === "h3") push(`### ${inline($, el).trim()}`);
    else if (tag === "h4") push(`### ${inline($, el).trim()}`);
    else if (tag === "p") push(inline($, el).trim());
    else if (tag === "ul") { const li = []; $el.children("li").each((_, l) => li.push(`- ${inline($, l).trim()}`)); push(li.join("\n")); }
    else if (tag === "ol") { const li = []; $el.children("li").each((i, l) => li.push(`${i + 1}. ${inline($, l).trim()}`)); push(li.join("\n")); }
    else if (tag === "blockquote") { const q = []; $el.find("p").each((_, p) => q.push(`> ${inline($, p).trim()}`)); push(q.join("\n")); }
    else if (tag === "table") push(tableToMd($, el));
    else if (tag === "figure") {
      const $t = $el.find("table");
      if ($t.length) { push(tableToMd($, $t[0])); return; }
      const src = $el.find("img").attr("src") || "";
      const alt = esc($el.find("figcaption").text() || $el.find("img").attr("alt") || "");
      if (src) push(`![${alt}](/images/${path.basename(src.split("?")[0])})`);
    }
    else if (tag === "hr") push("---");
    else {
      // div等の入れ子: 中の見出し・段落・リストを拾う
      $el.find("h2,h3,h4,p,ul,ol,table").each((_, c) => {
        const t = c.name;
        if (t === "h2") push(`## ${inline($, c).trim()}`);
        else if (t === "h3" || t === "h4") push(`### ${inline($, c).trim()}`);
        else if (t === "p") push(inline($, c).trim());
        else if (t === "ul") { const li = []; $(c).children("li").each((_, l) => li.push(`- ${inline($, l).trim()}`)); push(li.join("\n")); }
        else if (t === "ol") { const li = []; $(c).children("li").each((i, l) => li.push(`${i + 1}. ${inline($, l).trim()}`)); push(li.join("\n")); }
        else if (t === "table") push(tableToMd($, c));
      });
    }
  });

  // meta（元の完全ページから拾えれば）
  let title = "", desc = "", ogimg = "";
  if (FULL) {
    const fp = path.join(FULL, "page_" + slug + ".html");
    if (fs.existsSync(fp)) {
      const $f = cheerio.load(fs.readFileSync(fp, "utf8"));
      title = esc($f("meta[property='og:title']").attr("content") || $f("title").text()).replace(/\s*[–|｜|]\s*合同会社アプローズプロモーション\s*$/, "");
      desc = esc($f("meta[name='description']").attr("content") || "");
      ogimg = $f("meta[property='og:image']").attr("content") || "";
    }
  }
  if (!title) title = esc($body.find("h1").first().text()) || name;

  const fm = [
    "---",
    `slug: ${name}`,
    `path: /${y}/${mo}/${d}/${name}/`,
    `title: ${title}`,
    `description: ${desc}`,
    `date: ${y}-${mo}-${d}`,
    ogimg ? `image: /images/${path.basename(ogimg.split("?")[0])}` : "",
    "---",
    "",
  ].filter((l) => l !== "").join("\n");

  fs.writeFileSync(path.join(OUT, name + ".md"), fm + "\n" + out.join("\n\n") + "\n", "utf8");
  console.log(`  ${name}.md  ${out.length}ブロック  「${title.slice(0, 40)}」`);
}
console.log(`変換完了: ${files.length}本 → content/posts/`);
