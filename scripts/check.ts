// Validates data/. Flags: --flathub checks Flathub ids online, --dns resolves every host.
import { flathubIds, load } from "./data.ts";

const { data, errors, warnings } = await load();

if (Deno.args.includes("--flathub")) {
  const ids = await flathubIds();
  for (const [id, a] of Object.entries(data.alts)) {
    if (a.flathub && !ids.has(a.flathub)) errors.push(`alternative "${id}": "${a.flathub}" is not on Flathub`);
  }
}

if (Deno.args.includes("--dns")) {
  const hosts = new Set(data.apps.flatMap((a) => a.match.map((r) => r.split("/")[0])));
  const owner = new Map(data.apps.flatMap((a) => a.match.map((r) => [r.split("/")[0], a.id] as const)));
  const queue = [...hosts];
  const worker = async () => {
    for (let h = queue.pop(); h; h = queue.pop()) {
      let ok = false;
      for (const name of [h, `www.${h}`]) {
        for (const type of ["A", "AAAA", "CNAME"] as const) {
          try { if ((await Deno.resolveDns(name, type)).length) { ok = true; break; } } catch { /* next */ }
        }
        if (ok) break;
      }
      if (!ok) errors.push(`host "${h}" (${owner.get(h)}) does not resolve`);
    }
  };
  await Promise.all(Array.from({ length: 24 }, worker));
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
const files = new Set(data.apps.map((a) => a.file)).size;
console.log(`${data.apps.length} apps in ${files} files, ${Object.keys(data.alts).length} alternatives, ${errors.length} errors`);
if (errors.length) Deno.exit(1);
