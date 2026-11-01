// Loads and validates data/. Used by check.ts and build.ts.

export interface Alt {
  name: string;
  summary: string;
  url: string;
  flathub?: string;
}

export interface App {
  id: string;
  name: string;
  match: string[];
  linux: boolean;
  alts: string[];
  why?: string;
  file?: string;
}

export interface Data {
  apps: App[];
  alts: Record<string, Alt>;
}

const root = new URL("../data/", import.meta.url);

// Hosts that serve many unrelated products. Rules on them must carry a path.
export const SHARED_HOSTS = new Set([
  "microsoft.com", "apps.microsoft.com", "learn.microsoft.com", "support.microsoft.com", "store.microsoft.com",
  "adobe.com", "apple.com", "google.com", "amazon.com", "github.com", "gitlab.com", "sourceforge.net",
  "bitbucket.org", "codeberg.org", "store.steampowered.com", "steampowered.com", "itch.io", "softpedia.com",
  "majorgeeks.com", "filehippo.com", "uptodown.com", "cnet.com", "download.cnet.com", "techspot.com",
  "chip.de", "heise.de", "ninite.com", "chocolatey.org", "community.chocolatey.org", "winget.run",
  "autodesk.com", "corel.com", "logitech.com", "logi.com", "razer.com", "corsair.com", "asus.com", "msi.com",
  "dell.com", "hp.com", "lenovo.com", "samsung.com", "intel.com", "amd.com", "nvidia.com", "sony.com",
  "nero.com", "avast.com", "avg.com", "norton.com", "mcafee.com", "kaspersky.com", "bitdefender.com",
  "eset.com", "malwarebytes.com", "ea.com", "ubisoft.com", "epicgames.com", "blizzard.com",
  "ashampoo.com", "magix.com", "wondershare.com", "cyberlink.com", "easeus.com", "aomeitech.com",
  "minitool.com", "iobit.com", "piriform.com", "ccleaner.com", "nirsoft.net", "sysinternals.com",
  "siemens.com", "sw.siemens.com", "dassault.com", "3ds.com", "solidworks.com", "ptc.com", "bentley.com",
  "oracle.com", "ibm.com", "sap.com", "intuit.com", "sage.com", "zoho.com", "atlassian.com",
  "jetbrains.com", "steelseries.com", "elgato.com", "roccat.com", "turtlebeach.com", "nzxt.com",
  "gigabyte.com", "aorus.com", "asrock.com", "evga.com", "creative.com", "realtek.com", "huawei.com",
  "xiaomi.com", "mi.com", "canon.com", "epson.com", "brother.com", "garmin.com", "fitbit.com",
  "roland.com", "yamaha.com", "native-instruments.com", "steinberg.net", "avid.com", "pinnaclesys.com",
  "techsmith.com", "foxit.com", "nitro.com", "nitropdf.com", "pdf-xchange.com", "tracker-software.com",
  "winzip.com", "rarlab.com", "win-rar.com", "7-zip.org",
]);

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const PATH = /^(?:\/[a-z0-9._~%+@!$&'()*,;=:-]+)+$/;
const FLATHUB = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2,}$/;
const DASH = /[\u2013\u2014]/;

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await Deno.readTextFile(url));
}

async function listJson(dir: URL): Promise<URL[]> {
  const out: URL[] = [];
  for await (const e of Deno.readDir(dir)) if (e.isFile && e.name.endsWith(".json")) out.push(new URL(e.name, dir));
  return out.sort((a, b) => a.pathname.localeCompare(b.pathname));
}

export async function load(): Promise<{ data: Data; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);

  const alts: Record<string, Alt> = {};
  const altFile: Record<string, string> = {};
  for (const url of await listJson(new URL("alternatives/", root))) {
    const file = url.pathname.split("/").pop()!;
    const obj = await readJson(url) as Record<string, Alt>;
    for (const [id, a] of Object.entries(obj)) {
      const at = `${file}: alternative "${id}"`;
      if (!ID.test(id)) err(`${at}: id must be kebab-case`);
      if (typeof a.name !== "string" || !a.name.trim()) err(`${at}: missing name`);
      if (typeof a.summary !== "string" || !a.summary.trim()) err(`${at}: missing summary`);
      else if (a.summary.length > 90) err(`${at}: summary over 90 chars`);
      else if (/[.!]$/.test(a.summary)) err(`${at}: summary is a phrase, drop the final period`);
      if (typeof a.url !== "string" || !/^https:\/\/[^\s]+$/.test(a.url)) err(`${at}: url must be https`);
      if (a.flathub !== undefined && !FLATHUB.test(a.flathub)) err(`${at}: bad flathub id`);
      for (const k of Object.keys(a)) if (!["name", "summary", "url", "flathub"].includes(k)) err(`${at}: unknown key ${k}`);
      if (DASH.test(JSON.stringify(a))) err(`${at}: contains an en/em dash`);
      if (alts[id]) {
        const p = alts[id];
        if (p.name !== a.name || p.url !== a.url || p.flathub !== a.flathub) {
          err(`${at}: conflicts with the one in ${altFile[id]}`);
        }
        continue;
      }
      alts[id] = { name: a.name, summary: a.summary, url: a.url, ...(a.flathub ? { flathub: a.flathub } : {}) };
      altFile[id] = file;
    }
  }

  const apps: App[] = [];
  const seenId = new Map<string, string>();
  const seenRule = new Map<string, string>();
  const used = new Set<string>();
  for (const url of await listJson(new URL("apps/", root))) {
    const file = url.pathname.split("/").pop()!;
    const list = await readJson(url) as App[];
    if (!Array.isArray(list)) { err(`${file}: must be an array`); continue; }
    for (const a of list) {
      const at = `${file}: app "${a.id}"`;
      if (typeof a.id !== "string" || !ID.test(a.id)) err(`${at}: id must be kebab-case`);
      if (seenId.has(a.id)) err(`${at}: duplicate id (also in ${seenId.get(a.id)})`);
      seenId.set(a.id, file);
      if (typeof a.name !== "string" || !a.name.trim()) err(`${at}: missing name`);
      if (typeof a.linux !== "boolean") err(`${at}: linux must be true or false`);
      if (a.why !== undefined && (typeof a.why !== "string" || a.why.length > 120)) err(`${at}: why must be a string under 120 chars`);
      for (const k of Object.keys(a)) if (!["id", "name", "match", "linux", "alts", "why"].includes(k)) err(`${at}: unknown key ${k}`);
      if (DASH.test(JSON.stringify(a))) err(`${at}: contains an en/em dash`);
      if (!Array.isArray(a.match) || !a.match.length) err(`${at}: match must be a non-empty array`);
      for (const rule of a.match ?? []) {
        const i = rule.indexOf("/");
        const host = i < 0 ? rule : rule.slice(0, i);
        const path = i < 0 ? "" : rule.slice(i);
        if (!HOST.test(host)) err(`${at}: bad host in "${rule}"`);
        if (host.startsWith("www.")) err(`${at}: drop "www." from "${rule}"`);
        if (path && !PATH.test(path)) err(`${at}: bad path in "${rule}" (lowercase, no trailing slash, no query)`);
        if (SHARED_HOSTS.has(host) && !path) err(`${at}: "${host}" is shared, the rule needs a path`);
        if (seenRule.has(rule)) err(`${at}: rule "${rule}" also used by ${seenRule.get(rule)}`);
        seenRule.set(rule, a.id);
      }
      if (!Array.isArray(a.alts) || !a.alts.length) err(`${at}: alts must be a non-empty array`);
      for (const id of a.alts ?? []) {
        if (!alts[id]) err(`${at}: unknown alternative "${id}"`);
        used.add(id);
      }
      if (new Set(a.alts).size !== a.alts?.length) err(`${at}: duplicate alternatives`);
      apps.push({ id: a.id, name: a.name, match: a.match, linux: a.linux, alts: a.alts, ...(a.why ? { why: a.why } : {}), file });
    }
  }

  for (const id of Object.keys(alts)) if (!used.has(id)) warnings.push(`alternative "${id}" (${altFile[id]}) is unused`);

  return { data: { apps, alts }, errors, warnings };
}

export async function flathubIds(): Promise<Set<string>> {
  const res = await fetch("https://flathub.org/api/v2/appstream");
  if (!res.ok) throw new Error(`flathub: HTTP ${res.status}`);
  return new Set(await res.json() as string[]);
}
