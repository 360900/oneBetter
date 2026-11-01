// Downloads icons for alternatives into data/icons/ID.webp from Flathub, or from the URL in
// data/icons/sources.json for alternatives not on Flathub. Needs ImageMagick.
// Existing icons are kept unless --force is given; icons of removed alternatives are deleted.
import { load } from "./data.ts";

const dir = new URL("../data/icons/", import.meta.url);
const force = Deno.args.includes("--force");
const { data } = await load();
await Deno.mkdir(dir, { recursive: true });
const sources: Record<string, string> = JSON.parse(await Deno.readTextFile(new URL("sources.json", dir)).catch(() => "{}"));

const have = new Set<string>();
for await (const e of Deno.readDir(dir)) if (e.name.endsWith(".webp")) have.add(e.name.slice(0, -5));

for (const id of have) {
  if (!data.alts[id]) {
    await Deno.remove(new URL(`${id}.webp`, dir));
    console.log(`removed ${id}`);
  }
}

const todo = Object.entries(data.alts).filter(([id, a]) => (a.flathub || sources[id]) && (force || !have.has(id)));
const failed: string[] = [];
let done = 0;

async function iconUrls(id: string, flathub?: string): Promise<string[]> {
  if (sources[id]) return [sources[id]];
  const res = await fetch(`https://flathub.org/api/v2/appstream/${flathub}`);
  if (!res.ok) throw new Error(`appstream ${res.status}`);
  const info = await res.json();
  const icons: { url: string; width: number; scale: number | null }[] = info.icons ?? [];
  const urls = icons.sort((a, b) => b.width * (b.scale ?? 1) - a.width * (a.scale ?? 1)).map((i) => i.url);
  if (info.icon) urls.push(info.icon);
  return urls;
}

async function fetchIcon(id: string, flathub?: string) {
  const urls = await iconUrls(id, flathub);
  let img: Response | undefined;
  for (const url of urls) {
    img = await fetch(url);
    if (img.ok) break;
    await img.body?.cancel();
  }
  if (!img?.ok) throw new Error(urls.length ? `icon ${img?.status}` : "no icon");
  const bytes = new Uint8Array(await img.arrayBuffer());
  const out = new URL(`${id}.webp`, dir).pathname;
  // SVGs are rendered at their nominal size on a white background unless told otherwise.
  const svg = /<svg[\s>]/.test(new TextDecoder().decode(bytes.subarray(0, 4096)));
  const input = svg ? ["-background", "none", "-density", "384", "svg:-"] : ["-"];
  const cmd = new Deno.Command("magick", {
    args: [...input, "-background", "none", "-resize", "144x144", "-quality", "90", "-define", "webp:method=6", out],
    stdin: "piped",
    stderr: "piped",
  }).spawn();
  const writer = cmd.stdin.getWriter();
  await writer.write(bytes);
  await writer.close();
  const { success, stderr } = await cmd.output();
  if (!success) throw new Error(new TextDecoder().decode(stderr).trim());
}

async function worker() {
  for (let job = todo.shift(); job; job = todo.shift()) {
    const [id, a] = job;
    try {
      await fetchIcon(id, a.flathub);
      done++;
    } catch (e) {
      failed.push(`${id}: ${(e as Error).message}`);
    }
  }
}

await Promise.all(Array.from({ length: 12 }, worker));
for (const f of failed) console.error(f);
console.log(`${done} icons downloaded, ${failed.length} failed`);
