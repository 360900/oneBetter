import { assertEquals } from "jsr:@std/assert@1";
import "../src/match.js";

const { buildIndex, lookup } = (globalThis as any).BetterHereMatch;

const apps = [
  { match: ["teamviewer.com"] },
  { match: ["adobe.com/products/photoshop", "photoshop.adobe.com"] },
  { match: ["adobe.com/products/premiere"] },
  { match: ["adobe.com/products/photoshop/elements"] },
  { match: ["microsoft.com/microsoft-365/onedrive/download"] },
  { match: ["developer.arm.com/tools%20and%20software/keil%20mdk"] },
  { match: ["apps.microsoft.com/detail/9nksqgp7f2nh", "apps.microsoft.com/detail/xpfd4t9n395qn6"] },
];
const index = buildIndex(apps);
const at = (url: string) => lookup(index, url);

Deno.test("host rules match the host and subdomains", () => {
  assertEquals(at("https://teamviewer.com/"), 0);
  assertEquals(at("https://www.teamviewer.com/en/download/windows/"), 0);
  assertEquals(at("https://get.teamviewer.com/x"), 0);
  assertEquals(at("https://teamviewer.com.evil.example/"), -1);
  assertEquals(at("https://notteamviewer.com/"), -1);
});

Deno.test("path rules match at segment boundaries", () => {
  assertEquals(at("https://www.adobe.com/products/photoshop.html"), 1);
  assertEquals(at("https://www.adobe.com/products/photoshop/"), 1);
  assertEquals(at("https://www.adobe.com/products/photoshop/free-trial-download.html"), 1);
  assertEquals(at("https://www.adobe.com/products/photoshopx"), -1);
  assertEquals(at("https://www.adobe.com/products/premiere.html"), 2);
  assertEquals(at("https://www.adobe.com/"), -1);
});

Deno.test("longest path wins", () => {
  assertEquals(at("https://www.adobe.com/products/photoshop/elements.html"), 3);
});

Deno.test("up to two leading locale segments are ignored", () => {
  assertEquals(at("https://www.adobe.com/de/products/photoshop.html"), 1);
  assertEquals(at("https://www.adobe.com/pt-br/products/photoshop.html"), 1);
  assertEquals(at("https://www.microsoft.com/en-us/microsoft-365/onedrive/download"), 4);
  assertEquals(at("https://www.adobe.com/us/en/products/photoshop.html"), 1);
  assertEquals(at("https://www.adobe.com/de/de/de/products/photoshop.html"), -1);
  assertEquals(at("https://www.adobe.com/download/products/photoshop"), -1);
});

Deno.test("case, encoding, query and hash do not matter", () => {
  assertEquals(at("https://WWW.Adobe.com/Products/Photoshop.html?promo=1#top"), 1);
  assertEquals(at("https://www.adobe.com/products/photo%73hop"), 1);
  assertEquals(at("https://photoshop.adobe.com./"), 1);
  assertEquals(at("https://developer.arm.com/Tools%20and%20Software/Keil%20MDK"), 5);
});

Deno.test("only http and https", () => {
  assertEquals(at("ftp://teamviewer.com/"), -1);
  assertEquals(at("not a url"), -1);
});

Deno.test("Store links resolve to the product id", () => {
  assertEquals(at("https://apps.microsoft.com/detail/9NKSQGP7F2NH?hl=en-US&gl=US"), 6);
  assertEquals(at("https://apps.microsoft.com/store/detail/whatsapp/9NKSQGP7F2NH"), 6);
  assertEquals(at("https://apps.microsoft.com/store/detail/9nksqgp7f2nh"), 6);
  assertEquals(at("https://apps.microsoft.com/detail/adobe-photoshop/XPFD4T9N395QN6"), 6);
  assertEquals(at("https://apps.microsoft.com/de-de/detail/9nksqgp7f2nh"), 6);
  assertEquals(at("https://apps.microsoft.com/detail/9nksqgp7f2nx"), -1);
  assertEquals(at("https://apps.microsoft.com/"), -1);
});
