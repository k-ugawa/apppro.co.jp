#!/usr/bin/env node
// check_site — 生成物の検査。ビルド後に走らせる。
//
//   node test/check_site.mjs            … 静的検査だけ（速い・常にこれは通す）
//   node test/check_site.mjs --browser  … 実ブラウザ検査も（要 vite preview 起動 / 既定 4321番）
//
// 見るもの:
//   1. 想定URLがすべて生成されているか（URLは移行の資産。落とすと301の手当てが必要になる）
//   2. JSON-LD が壊れていないか
//   3. 内部リンクの行き先が実在するか（WPからの移植で slug 直打ちリンクが実際に混ざっていた）
//   4. 生成物に移植の残骸が無いか（wp-content・未記入プレースホルダ・原稿メモ）
//   5. （--browser）横はみ出し・consoleエラー・h1の数

import fs from "node:fs";
import path from "node:path";

const EXPECT = ["/", "/company/", "/service/", "/it-subsidy-support/", "/hojo-gate/", "/faq/", "/contact/", "/news/",
  "/2026/02/09/it-subsidy-2026-digital-ai/", "/2026/02/20/it-hojyokin-2026-news-digital-ai/", "/2026/02/22/homepage-creation-cost-subsidy/",
  "/2026/03/25/career-up-subsidy-permanent-employment-guide/", "/2026/03/28/ai-robot-subsidy-guide-small-business/",
  "/2026/04/13/ai-subsidies-small-business-guide/", "/2026/04/13/carbon-neutral-subsidies-guide-small-business/",
  "/2026/04/13/digital-talent-training-subsidies-guide/"];

const fileFor = (u) => (u === "/" ? "index.html" : path.join("public", u.replace(/^\/|\/$/g, ""), "index.html"));
let bad = 0;
const ng = (m) => { console.error("  ❌ " + m); bad++; };

console.log("1) 全URLの存在");
for (const u of EXPECT) fs.existsSync(fileFor(u)) ? null : ng(`${u} が生成されていない`);
console.log(`  ${bad ? "" : "✅ "}${EXPECT.length}件`);

console.log("2) JSON-LD");
for (const u of EXPECT) {
  if (!fs.existsSync(fileFor(u))) continue;
  const h = fs.readFileSync(fileFor(u), "utf8");
  for (const b of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(b[1]); } catch (e) { ng(`${u} JSON-LD パース失敗: ${e.message}`); }
  }
}
console.log("  ✅ 全ページ");

console.log("3) 内部リンク");
const known = new Set(EXPECT);
for (const u of EXPECT) {
  if (!fs.existsSync(fileFor(u))) continue;
  const h = fs.readFileSync(fileFor(u), "utf8");
  for (const m of h.matchAll(/href="(\/[^"#]*)"/g)) {
    const t = m[1];
    if (/^\/(images|src|assets)\//.test(t)) {
      if (!fs.existsSync(path.join("public", t.replace(/^\//, ""))) && !fs.existsSync(t.replace(/^\//, ""))) ng(`${u} → ${t}（実体なし）`);
      continue;
    }
    if (!known.has(t)) ng(`${u} → ${t}（未知のURL。_redirects で受けるか、リンクを直す）`);
  }
}
console.log("  ✅ 行き先はすべて実在");

console.log("4) 移植の残骸");
for (const u of EXPECT) {
  if (!fs.existsSync(fileFor(u))) continue;
  const h = fs.readFileSync(fileFor(u), "utf8");
  if (h.includes("wp-content")) ng(`${u} に wp-content が残っている`);
  if (/○○○/.test(h)) ng(`${u} に未記入プレースホルダ（○○○）が残っている`);
  if (h.includes("%%")) ng(`${u} に原稿メモ（%%）が残っている`);
  if (/href="#section\d+"/.test(h)) ng(`${u} に存在しないアンカー（#sectionN）が残っている`);
}
console.log("  ✅ 残骸なし");

if (process.argv.includes("--browser")) {
  const { chromium } = await import("playwright-core");
  const exe = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome"]
    .find((p) => fs.existsSync(p));
  if (!exe) { console.error("  ⚠️ Chromium が見つからないのでブラウザ検査は飛ばす"); }
  else {
    console.log("5) 実ブラウザ（375px / 1280px）");
    const b = await chromium.launch({ executablePath: exe });
    for (const vp of [{ w: 375, n: "スマホ" }, { w: 1280, n: "PC" }]) {
      const ctx = await b.newContext({ viewport: { width: vp.w, height: 900 } });
      for (const p of EXPECT) {
        const page = await ctx.newPage();
        const errs = [];
        page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
        page.on("pageerror", (e) => errs.push(String(e)));
        const res = await page.goto("http://localhost:4321" + p, { waitUntil: "networkidle" }).catch(() => null);
        if (!res) { ng(`${vp.n} ${p} 到達不可（vite preview --port 4321 は動いている？）`); await page.close(); continue; }
        const m = await page.evaluate(() => ({
          over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          h1: document.querySelectorAll("h1").length,
        }));
        if (res.status() !== 200) ng(`${vp.n} ${p} HTTP ${res.status()}`);
        if (m.over) ng(`${vp.n} ${p} 横にはみ出している`);
        if (m.h1 !== 1) ng(`${vp.n} ${p} h1 が ${m.h1} 個`);
        if (errs.length) ng(`${vp.n} ${p} console エラー: ${errs[0].slice(0, 70)}`);
        await page.close();
      }
      await ctx.close();
      console.log(`  ✅ ${vp.n}（${vp.w}px）`);
    }
    await b.close();
  }
}

console.log(bad ? `\n🔴 ${bad}件の問題` : "\n✅ すべて合格");
process.exit(bad ? 1 : 0);
