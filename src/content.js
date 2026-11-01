// Shows the suggestion card on pages of apps that have a better option on Linux.
(function () {
  if (!/Linux/.test(navigator.userAgent) || /Android/.test(navigator.userAgent)) return;
  if (window.top !== window) return;

  const api = globalThis.browser ?? globalThis.chrome;
  const db = globalThis.BetterHereDB;
  const { lookup } = globalThis.BetterHereMatch;

  let host = null;
  let root = null;
  let shownFor = -1;
  let lastUrl = "";

  function send(msg) {
    return api.runtime.sendMessage(msg).catch(() => null);
  }

  function altHref(alt) {
    return alt.flathub ? `appstream://${alt.flathub}` : alt.url;
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c) node.append(c);
    return node;
  }

  function monogram(name) {
    const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean);
    const text = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?")[0];
    let hue = 0;
    for (const ch of name) hue = (hue * 31 + ch.codePointAt(0)) % 360;
    const tile = el("div", { class: "tile", text: text.toUpperCase() });
    tile.style.setProperty("--tile-hue", String(hue));
    return tile;
  }

  // Largest icon the page declares, so the app we're comparing shows with its own icon.
  function pageIcon() {
    let best = null;
    let bestSize = 0;
    for (const link of document.querySelectorAll("link[rel~='icon'], link[rel~='apple-touch-icon']")) {
      if (!link.href) continue;
      const sizes = link.getAttribute("sizes") || "";
      let size = /svg/.test(link.type) || /\.svg(\?|$)/.test(link.href) || sizes === "any" ? 512 : 0;
      for (const m of sizes.matchAll(/(\d+)x\d+/g)) size = Math.max(size, +m[1]);
      if (!size) size = /apple-touch-icon/.test(link.rel) ? 180 : 16;
      if (size > bestSize) [best, bestSize] = [link.href, size];
    }
    return bestSize >= 32 ? best : null;
  }

  function icon(name, src, framed) {
    const box = el("div", { class: framed ? "icon framed" : "icon" });
    const fallback = () => box.replaceChildren(monogram(name));
    if (!src) fallback();
    else {
      const img = el("img", { src, alt: "", draggable: "false", referrerpolicy: "no-referrer" });
      img.addEventListener("error", fallback, { once: true });
      box.append(img);
    }
    return el("figure", {}, box, el("figcaption", { text: name }));
  }

  function command(text) {
    const code = el("code", { text });
    const button = el("button", {
      class: "copy",
      "aria-label": "Copy command",
      title: "Copy command",
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const range = document.createRange();
          range.selectNodeContents(code);
          getSelection().removeAllRanges();
          getSelection().addRange(range);
          document.execCommand("copy");
        }
        button.classList.add("done");
        button.setAttribute("aria-label", "Copied");
        setTimeout(() => {
          button.classList.remove("done");
          button.setAttribute("aria-label", "Copy command");
        }, 1500);
      },
    });
    return el("div", { class: "command" }, code, button);
  }

  function hide() {
    if (!host) return;
    root.querySelector(".scrim").classList.add("leaving");
    const h = host;
    host = null;
    setTimeout(() => h.remove(), 220);
  }

  function show(n) {
    const [name, linux, altIds, , why] = db.apps[n];
    const alts = altIds.map((i) => db.alts[i]);
    const main = alts[0];
    const title = linux ? `${main.name} works better on oneOS` : `${name} doesn't work on Linux`;
    const lead = why || (linux ? `${main.summary}.` : `${main.name} does. ${main.summary}.`);
    const previousFocus = document.activeElement;

    host = el("better-here");
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    root = host.attachShadow({ mode: "closed" });
    root.append(el("style", { text: globalThis.BetterHereCSS }));

    const others = alts.slice(1);
    const primary = el("a", {
      class: "btn suggested",
      href: altHref(main),
      target: main.flathub ? "_self" : "_blank",
      rel: "noopener",
      title: main.flathub ? "Opens your software center" : main.url,
      text: main.flathub ? `Install ${main.name}` : `Get ${main.name}`,
    });
    const dialog = el(
      "section",
      { class: "dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "title", tabindex: "-1" },
      el(
        "div",
        { class: "hero", "aria-hidden": "true" },
        icon(name, pageIcon(), true),
        el("div", { class: "arrow" }),
        icon(main.name, main.icon && api.runtime.getURL(main.icon)),
      ),
      el("h2", { id: "title", text: title }),
      el("p", { class: "lead", text: lead }),
      main.flathub ? command(`flatpak install flathub ${main.flathub}`) : null,
      el(
        "footer",
        {},
        el("button", { class: "btn", onclick: dismiss, text: "Continue anyway" }),
        primary,
      ),
      others.length
        ? el(
          "p",
          { class: "also" },
          "Also good: ",
          ...others.flatMap((a, i) => [
            i ? ", " : "",
            el("a", { href: altHref(a), title: a.summary, target: "_blank", rel: "noopener", text: a.name }),
          ]),
        )
        : null,
    );
    const scrim = el("div", { class: "scrim" }, dialog);
    scrim.addEventListener("click", (e) => {
      if (e.target === scrim) dismiss();
    });
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") dismiss();
      if (e.key !== "Tab") return;
      const items = [...dialog.querySelectorAll("a, button")];
      const i = items.indexOf(root.activeElement);
      if (e.shiftKey && i <= 0) items.at(-1).focus();
      else if (!e.shiftKey && i === items.length - 1) items[0].focus();
      else return;
      e.preventDefault();
    });
    root.append(scrim);
    document.documentElement.append(host);
    dialog.focus({ preventScroll: true });

    function dismiss() {
      send({ type: "dismiss", app: db.apps[n][3] });
      hide();
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    }
  }

  async function update() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    const n = lookup(db.index, location.href);
    if (n === shownFor) return;
    shownFor = n;
    hide();
    if (n < 0) return;
    const state = await send({ type: "state", app: db.apps[n][3] });
    if (state && (state.paused || state.dismissed)) return;
    if (n === shownFor && !host) show(n);
  }

  update();
  // Single page apps change the URL without a navigation.
  addEventListener("popstate", update);
  setInterval(update, 1000);
})();
