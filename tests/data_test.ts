import { assertEquals } from "jsr:@std/assert@1";
import { load } from "../scripts/data.ts";
import "../src/match.js";

const { buildIndex, lookup } = (globalThis as any).BetterHereMatch;
const { data, errors } = await load();

Deno.test("data is valid", () => {
  assertEquals(errors, []);
});

Deno.test("every rule resolves to its own app", () => {
  const index = buildIndex(data.apps);
  const wrong = data.apps.flatMap((app, n) =>
    app.match
      .map((rule) => [rule, lookup(index, `https://${rule}`)] as const)
      .filter(([, got]) => got !== n)
      .map(([rule, got]) => `${app.id}: ${rule} -> ${data.apps[got]?.id ?? "nothing"}`)
  );
  assertEquals(wrong, []);
});

Deno.test("examples from the brief", () => {
  const index = buildIndex(data.apps);
  const first = (url: string) => data.apps[lookup(index, url)]?.alts[0];
  assertEquals(first("https://anydesk.com/en/downloads/windows"), "rustdesk");
  assertEquals(first("https://www.teamviewer.com/en/download/"), "rustdesk");
  assertEquals(first("https://discord.com/download"), "vesktop");
  assertEquals(first("https://www.logitech.com/en-us/software/logi-options-plus.html"), "solaar");
  assertEquals(first("https://www.microsoft.com/en-us/microsoft-365/onedrive/download"), "rclone-ui");
  assertEquals(first("https://www.adobe.com/products/photoshop.html"), "photocraft");
  assertEquals(first("https://www.adobe.com/products/premiere.html"), "filmcraft");
});

Deno.test("Store ids resolve to their apps", () => {
  const index = buildIndex(data.apps);
  const app = (url: string) => data.apps[lookup(index, url)]?.id;
  assertEquals(app("https://apps.microsoft.com/detail/9nksqgp7f2nh?hl=en-US&gl=US"), "whatsapp-desktop");
  assertEquals(app("https://apps.microsoft.com/store/detail/whatsapp/9NKSQGP7F2NH"), "whatsapp-desktop");
});
