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
    const tile = el("div", { class: "tile", "aria-hidden": "true", text: text.toUpperCase() });
    tile.style.setProperty("--tile-hue", String(hue));
    return tile;
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
    root.querySelector(".card").classList.add("leaving");
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

    host = el("better-here");
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; top: 16px; right: 16px;";
    root = host.attachShadow({ mode: "closed" });
    root.append(el("style", { text: globalThis.BetterHereCSS }));

    const others = alts.slice(1);
    const card = el(
      "section",
      { class: "card", role: "dialog", "aria-label": title },
      el(
        "header",
        {},
        monogram(main.name),
        el("h2", { text: title }),
        el("button", {
          class: "close",
          "aria-label": "Close",
          title: "Close",
          onclick: dismiss,
        }),
      ),
      el("p", { class: "lead", text: lead }),
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
      main.flathub ? command(`flatpak install flathub ${main.flathub}`) : null,
      el(
        "footer",
        {},
        el("button", { class: "btn", onclick: dismiss, text: "Continue anyway" }),
        el("a", {
          class: "btn suggested",
          href: altHref(main),
          target: main.flathub ? "_self" : "_blank",
          rel: "noopener",
          title: main.flathub ? "Opens your software center" : main.url,
          text: main.flathub ? `Install ${main.name}` : `Get ${main.name}`,
        }),
      ),
    );
    root.append(card);
    document.documentElement.append(host);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Escape") dismiss();
    });

    function dismiss() {
      send({ type: "dismiss", app: db.apps[n][3] });
      hide();
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
