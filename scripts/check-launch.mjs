#!/usr/bin/env node
/*
 * Проверка таплинка Kinezio (запуск 16.11.2026) без ИИ: вид по времени, тексты и ссылки каждого вида, передача utm, ширина 390.
 * Только чтение: GET/HEAD-запросы и открытие страницы в headless-браузере; t.me не открывается, сверяются только href.
 *
 * Запуск:   node scripts/check-launch.mjs
 * Флаги:    --url=https://...                  другой адрес (по умолчанию GitHub Pages)
 *           --at "2026-11-16T10:05:00+03:00"   подменить текущее время (ожидание и часы в браузере)
 *           --sales=open|before|after          добавить ?sales= к адресу
 *           --no-browser                       только код (разметка и локальный файл), без рендера
 *           --timeout=40000                    таймаут одного запроса, мс
 * Выход: 0 — нет ❌ (⚠️ допустимы), 1 — есть ❌, 2 — неверные аргументы.
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OPEN = 1794812400000;   // 16.11.2026 10:00 МСК
const CLOSE = 1796590800000;  // 07.12.2026 00:00 МСК
const DEFAULT_URL = "https://elenasamanchuk.github.io/kinezio-taplink/index.html";
const LOCAL_CODE = join(ROOT, "docs/КОД-для-Тильды-taplink.html");
const CHANNEL = "https://t.me/+jEUoHcbCU8xlNWUy";
const BOT = "https://t.me/kineziofitnesscourse_bot";
const OLD_CHANNEL = "t.me/+jD2efeMN-5szMmZi";

const argv = process.argv.slice(2);
const opt = (n) => {
  const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i < 0) return null;
  if (argv[i].includes("=")) return argv[i].split("=").slice(1).join("=");
  const nx = argv[i + 1];
  return nx && !nx.startsWith("--") ? nx : "";
};
const atArg = opt("at");
const salesArg = opt("sales");
const BASE = opt("url") || DEFAULT_URL;
const noBrowser = argv.includes("--no-browser");
const TIMEOUT = Number(opt("timeout")) || 40000;
const NOW = atArg ? Date.parse(atArg) : Date.now();
if (Number.isNaN(NOW)) { console.error("Не разобрал --at: " + atArg); process.exit(2); }
if (salesArg && !["before", "open", "after"].includes(salesArg)) { console.error("--sales: before|open|after"); process.exit(2); }

let fails = 0, warns = 0, oks = 0;
const ok = (m) => { oks++; console.log("  ✅ " + m); };
const bad = (m) => { fails++; console.log("  ❌ " + m); };
const warn = (m) => { warns++; console.log("  ⚠️  " + m); };
const head = (m) => console.log("\n" + m);
const fmt = (ms) => new Date(ms).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) + " МСК";
const stateAt = (n) => (n < OPEN ? "before" : n < CLOSE ? "open" : "after");
const withQuery = (u, q) => u + (u.includes("?") ? "&" : "?") + q;

async function req(url, method = "GET", tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT);
    try {
      const r = await fetch(url, { method, signal: ac.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 check-launch" } });
      const body = method === "GET" ? await r.text() : "";
      clearTimeout(t);
      if (method === "HEAD" && (r.status === 405 || r.status === 403)) return req(url, "GET", 1);
      return { status: r.status, body, tries: i };
    } catch (e) {
      clearTimeout(t);
      await new Promise((r) => setTimeout(r, 1500 * i));
      last = e.name === "AbortError" ? `таймаут ${TIMEOUT / 1000} с` : e.message;
    }
  }
  return { status: 0, body: "", error: last, tries };
}

async function launchBrowser() {
  if (noBrowser) return { skip: "отключён флагом --no-browser" };
  const cands = [ROOT, join(homedir(), "Projects/bi13-highlevel"), join(homedir(), "Projects/qa-kit"), join(homedir(), "Projects/popovichfit-site"), join(homedir(), "Projects/platformax-autotests")];
  let pw = null;
  for (const c of cands) { try { pw = createRequire(join(c, "x.js"))("playwright"); break; } catch {} }
  if (!pw) return { skip: "Playwright не найден" };
  try { return { browser: await pw.chromium.launch({ headless: true }) }; } catch (e1) {
    const base = join(homedir(), "Library/Caches/ms-playwright");
    const list = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().reverse() : [];
    for (const d of list) {
      const root = join(base, d);
      for (const sub of readdirSync(root)) {
        for (const exe of ["Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "Chromium.app/Contents/MacOS/Chromium"]) {
          const p = join(root, sub, exe);
          if (existsSync(p)) { try { return { browser: await pw.chromium.launch({ headless: true, executablePath: p }) }; } catch {} }
        }
      }
    }
    return { skip: "браузер не запустился: " + e1.message.split("\n")[0] };
  }
}

async function openPage(browser, url, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: "ru-RU" });
  const page = await ctx.newPage();
  if (atArg) await page.clock.install({ time: NOW });
  await page.goto(url, { waitUntil: "load", timeout: TIMEOUT });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

// общие запреты для любого текста страницы
function checkForbidden(text, label) {
  const bads = [];
  if (text.includes(OLD_CHANNEL)) bads.push("старый канал " + OLD_CHANNEL);
  if (/Фундмент/.test(text)) bads.push("опечатка «Фундмент»");
  if (/tg:\/\//.test(text)) bads.push("ссылка tg://");
  bads.length ? bad(`${label}: найдено ${bads.join(", ")}`) : ok(`${label}: нет старого канала, «Фундмент», tg://`);
}

// ---------- локальный файл ----------
function checkLocal() {
  head("Локальный код для Тильды: docs/КОД-для-Тильды-taplink.html");
  if (!existsSync(LOCAL_CODE)) { bad("файл не найден"); return; }
  const code = readFileSync(LOCAL_CODE, "utf8");
  const need = [
    ['id="ktl-root"', "корень #ktl-root"], ["OPEN_MS=1794812400000", "OPEN_MS=1794812400000 (16.11.2026 10:00 МСК)"],
    ["CLOSE_MS=1796590800000", "CLOSE_MS=1796590800000 (07.12.2026 00:00 МСК)"], ["data-when", "элементы data-when"],
    ["a[data-pass]", "передача параметров a[data-pass]"], [CHANNEL, "канал " + CHANNEL], [BOT, "бот " + BOT],
  ];
  for (const [s, n] of need) code.includes(s) ? ok("маркер на месте: " + n) : bad("нет маркера: " + n);
  checkForbidden(code, "локальный код");
}

// ---------- живая страница ----------
async function checkPage(br) {
  const url = salesArg ? withQuery(BASE, "sales=" + salesArg) : BASE;
  head(`Страница: ${url}`);
  const r = await req(url);
  if (r.status !== 200) { bad(`страница отвечает ${r.status || "без ответа"} ${r.error || ""}`); return; }
  ok("страница отвечает 200");
  const hasCode = /id=["']ktl-root["']/.test(r.body) && /OPEN_MS\s*=\s*1794812400000/.test(r.body) && /CLOSE_MS\s*=\s*1796590800000/.test(r.body);
  if (!hasCode) { warn("код таплинка (ktl-root, OPEN_MS, CLOSE_MS) в HTML не найден; если код ещё не вставлен на этот адрес — ожидаемо"); return; }
  ok("код таплинка на месте (ktl-root, OPEN_MS=1794812400000, CLOSE_MS=1796590800000)");
  checkForbidden(r.body, "разметка страницы");
  const expected = salesArg || stateAt(NOW);
  console.log(`     ожидаемый вид на ${fmt(NOW)}${salesArg ? " (принудительно ?sales=" + salesArg + ")" : ""}: ${expected}`);

  if (br.browser) await checkRender(br.browser, url, expected);
  else warn("рендер не проверен: " + br.skip);

  const hrefs = new Set([...r.body.matchAll(/href=["'](https:\/\/kineziofitness\.online[^"'#]*)["']/g)].map((m) => m[1]));
  if (!hrefs.size) { warn("ссылок на kineziofitness.online в коде не найдено"); return; }
  head("Ссылки на kineziofitness.online (HEAD/GET, 200)");
  let badN = 0;
  for (const l of [...hrefs].sort()) {
    const x = await req(l, "HEAD");
    if (x.status !== 200) { badN++; bad(`${l} — ${x.status || "нет ответа"} ${x.error || ""}`); }
  }
  if (!badN) ok(`все ${hrefs.size} ссылок отвечают 200`);
  console.log("     t.me не открываются, сверяются только href");
}

async function checkRender(browser, url, expected) {
  head("Рендер в браузере (1280)");
  const { ctx, page } = await openPage(browser, url);
  try {
    const got = await page.locator("#ktl-root").getAttribute("data-sales");
    got === expected ? ok(`#ktl-root[data-sales] = ${got}`) : bad(`#ktl-root[data-sales] = ${got}, ожидалось ${expected}`);
    const isVis = async (sel) => { const l = page.locator(sel); for (let i = 0; i < await l.count(); i++) if (await l.nth(i).isVisible()) return true; return false; };
    const must = async (sel, name) => (await isVis(sel)) ? ok("виден " + name) : bad("не виден " + name);
    const mustNot = async (sel, name) => (await isVis(sel)) ? bad("виден, а не должен: " + name) : ok("скрыт: " + name);
    const hrefOf = async (sel) => { const l = page.locator(sel); for (let i = 0; i < await l.count(); i++) if (await l.nth(i).isVisible()) return await l.nth(i).getAttribute("href"); return null; };
    const card = (title) => `article.ktl__card:has(h3:text-is("${title}"))`;
    const trial = card("Бесплатный пробный курс");

    if (expected === "open") {
      await must(`p:text-is("Практикум")`, "«Практикум» над логотипом");
      // «Практикум» должен быть выше логотипа
      const ky = await page.locator(`p:text-is("Практикум")`).first().boundingBox(), ly = await page.locator("h1.ktl__logo").boundingBox();
      ky && ly && ky.y < ly.y ? ok("«Практикум» стоит над логотипом") : bad("«Практикум» не над логотипом");
      await must(`text=Бесплатно. Старт 23 ноября`, "«Бесплатно. Старт 23 ноября»");
      await must(`text=Научимся находить причины боли`, "«Научимся находить причины боли…»");
      await must(`a:has-text("Вступить в канал")`, "кнопка «Вступить в канал»");
      const h = await hrefOf(`a:has-text("Вступить в канал")`);
      h === CHANNEL ? ok("«Вступить в канал» → " + h) : bad(`«Вступить в канал» ведёт на ${h}, ожидалось ${CHANNEL}`);
      await must(`${trial} .ktl__badge:has-text("Старт 23 ноября")`, "плашка «Старт 23 ноября» у пробного курса");
      const th = await hrefOf(`${trial} a`);
      th === CHANNEL ? ok("пробный курс → " + th) : bad(`ссылка пробного курса ${th}, ожидалось ${CHANNEL}`);
      await must(`article.ktl__card:has(.ktl__badge:has-text("Старт 7 декабря"))`, "плашка «Старт 7 декабря» (ФД)");
      await mustNot(`a:has-text("Перейти в бот")`, "«Перейти в бот» в шапке");
      await mustNot(`text=Институт движения`, "«Институт движения…»");
    } else {
      await must(`text=Институт движения`, "«Институт движения…»");
      await must(`a:has-text("Перейти в бот")`, "кнопка «Перейти в бот»");
      const h = await hrefOf(`a:has-text("Перейти в бот")`);
      h === BOT ? ok("«Перейти в бот» → " + h) : bad(`«Перейти в бот» ведёт на ${h}, ожидалось ${BOT}`);
      await must(`${trial} .ktl__badge:has-text("Старт после регистрации")`, "плашка «Старт после регистрации» у пробного курса");
      await mustNot(`${trial} .ktl__badge:has-text("Старт 23 ноября")`, "плашка «Старт 23 ноября» у пробного курса");
      await mustNot(`p:text-is("Практикум")`, "«Практикум»");
      await mustNot(`a:has-text("Вступить в канал")`, "«Вступить в канал»");
      await mustNot(`text=Бесплатно. Старт 23 ноября`, "«Бесплатно. Старт 23 ноября»");
      await mustNot(`.ktl__badge:has-text("Старт 7 декабря")`, "плашка «Старт 7 декабря»");
    }
    checkForbidden(await page.content(), "DOM после рендера");
  } catch (e) { bad("ошибка рендера: " + e.message.split("\n")[0]); } finally { await ctx.close(); }

  head("Передача utm (?utm_source=qa&r=1)");
  const u = withQuery(url, "utm_source=qa&r=1");
  const p2 = await openPage(browser, u);
  try {
    const hs = await p2.page.$$eval("a[data-pass]", (as) => as.map((a) => a.getAttribute("href")));
    if (!hs.length) bad("нет ссылок a[data-pass]");
    else {
      const miss = hs.filter((h) => { try { const q = new URL(h).searchParams; return q.get("utm_source") !== "qa" || q.get("r") !== "1"; } catch { return true; } });
      miss.length ? bad(`${miss.length} из ${hs.length} a[data-pass] без utm_source=qa&r=1: ${miss[0]}`) : ok(`все ${hs.length} a[data-pass] получили utm_source=qa и r=1`);
    }
  } catch (e) { bad("ошибка проверки utm: " + e.message.split("\n")[0]); } finally { await p2.ctx.close(); }

  head("Ширина 390 без горизонтальной прокрутки");
  const p3 = await openPage(browser, url, 390);
  try {
    const m = await p3.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
    Math.max(m.sw, m.bw) <= m.cw ? ok(`scrollWidth ${Math.max(m.sw, m.bw)} ≤ ${m.cw}`) : bad(`горизонтальная прокрутка: scrollWidth ${Math.max(m.sw, m.bw)} > ${m.cw}`);
  } catch (e) { bad("ошибка проверки ширины: " + e.message.split("\n")[0]); } finally { await p3.ctx.close(); }
}

console.log(`Проверка таплинка Kinezio · сейчас: ${fmt(NOW)}${atArg ? " (подмена --at)" : ""}${salesArg ? " · ?sales=" + salesArg : ""}`);
console.log(`Ожидание по времени: ${stateAt(NOW)}. Адрес: ${BASE}. Режим: только чтение.`);
const br = await launchBrowser();
if (!br.browser) console.log("Браузер: нет — " + br.skip);
try {
  checkLocal();
  await checkPage(br);
} finally { if (br.browser) await br.browser.close(); }

head(`ИТОГ: ✅ ${oks}  ⚠️ ${warns}  ❌ ${fails}`);
console.log(fails ? "Есть ошибки (❌) — выход 1." : warns ? "Ошибок нет; предупреждения ⚠️ — прочтите выше." : "Всё в порядке.");
process.exit(fails ? 1 : 0);
