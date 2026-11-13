// Сборка: src/block.html → index.html (GitHub Pages) и docs/КОД-для-Тильды-taplink.html (вставить в один блок T123)
import fs from "node:fs"; import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const block = fs.readFileSync(path.join(ROOT, "src/block.html"), "utf8");
const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Kinezio Fitness · таплинк</title>
<style>html,body{margin:0;background:#f5f5f5}</style>
</head>
<body>
${block}
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "index.html"), page);
fs.writeFileSync(path.join(ROOT, "docs/КОД-для-Тильды-taplink.html"), block);
for (const bad of ["Фундмент", "tg://"]) if (block.includes(bad)) { console.error("Ошибка: в коде осталось " + bad); process.exit(1); }
console.log("ok: index.html, docs/КОД-для-Тильды-taplink.html", block.length, "байт");
