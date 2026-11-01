// Builds dist/chromium and dist/firefox from src/ and data/.
import { load } from "./data.ts";
import "../src/match.js";

const { buildIndex, parseRule } = (globalThis as any).BetterHereMatch;
const repo = new URL("../", import.meta.url);
const pkg = JSON.parse(await Deno.readTextFile(new URL("deno.json", repo)));

const { data, errors } = await load();
if (errors.length) {
  for (const e of errors) console.error(e);
  Deno.exit(1);
}
const { apps: list, alts } = data;

const iconDir = new URL("data/icons/", repo);
const altIcons = new Set<string>();
for await (const e of Deno.readDir(iconDir)) if (e.name.endsWith(".webp")) altIcons.add(e.name.slice(0, -5));

// Compact form: apps are [name, linux, [alt indexes], id, why?], alts are {name, summary, url, flathub?, icon?}.
const altIds = [...new Set(list.flatMap((a) => a.alts))];
const altIndex = new Map(altIds.map((id, i) => [id, i]));
const db = {
  apps: list.map((a) => [a.name, a.linux, a.alts.map((id) => altIndex.get(id)), a.id, ...(a.why ? [a.why] : [])]),
  alts: altIds.map((id) => {
    const { name, summary, url, flathub } = alts[id];
    return {
      name,
      summary,
      url,
      ...(flathub ? { flathub } : {}),
      ...(altIcons.has(id) ? { icon: `icons/alts/${id}.webp` } : {}),
    };
  }),
  index: buildIndex(list),
};
const css = await Deno.readTextFile(new URL("src/card.css", repo));
const dbJs = `globalThis.BetterHereDB = ${JSON.stringify(db)};\nglobalThis.BetterHereCSS = ${JSON.stringify(css)};\n`;

const hosts = [...new Set(list.flatMap((a) => a.match.map((r) => parseRule(r).host)))].sort();
const matches = hosts.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);

function manifest(target: "chromium" | "firefox") {
  const m: Record<string, unknown> = {
    manifest_version: 3,
    name: "Better Here",
    version: pkg.version,
    description: "Suggests apps that work on Linux when you visit the site of one that doesn't.",
    icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
    permissions: ["storage"],
    action: { default_popup: "popup.html", default_icon: { 16: "icons/16.png", 32: "icons/32.png" } },
    content_scripts: [{ matches, js: ["db.js", "match.js", "content.js"], run_at: "document_idle" }],
    web_accessible_resources: [{ resources: ["icons/alts/*"], matches }],
  };
  if (target === "chromium") {
    m.background = { service_worker: "background.js" };
    m.minimum_chrome_version = "120";
  } else {
    m.background = { scripts: ["background.js"] };
    m.browser_specific_settings = {
      gecko: {
        id: "better-here@oneos",
        strict_min_version: "128.0",
        data_collection_permissions: { required: ["none"] },
      },
    };
  }
  return m;
}

const files = ["background.js", "content.js", "match.js", "popup.html", "popup.css", "popup.js"];
const icons = ["16.png", "32.png", "48.png", "128.png"];

for (const target of ["chromium", "firefox"] as const) {
  const out = new URL(`dist/${target}/`, repo);
  await Deno.remove(out, { recursive: true }).catch(() => {});
  await Deno.mkdir(new URL("icons/alts/", out), { recursive: true });
  for (const f of files) await Deno.copyFile(new URL(`src/${f}`, repo), new URL(f, out));
  for (const f of icons) await Deno.copyFile(new URL(`src/icons/${f}`, repo), new URL(`icons/${f}`, out));
  for (const id of altIds) {
    if (altIcons.has(id)) await Deno.copyFile(new URL(`${id}.webp`, iconDir), new URL(`icons/alts/${id}.webp`, out));
  }
  await Deno.writeTextFile(new URL("db.js", out), dbJs);
  await Deno.writeTextFile(new URL("manifest.json", out), JSON.stringify(manifest(target), null, 2) + "\n");
}

console.log(`Built ${list.length} apps, ${altIds.length} alternatives, ${hosts.length} hosts into dist/`);
