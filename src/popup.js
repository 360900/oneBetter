const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

async function render() {
  const [{ paused = false }, { dismissed = [] }] = await Promise.all([
    api.storage.local.get("paused"),
    api.storage.session.get("dismissed"),
  ]);
  $("count").textContent = `Knows ${globalThis.BetterHereDB.apps.length} apps`;
  $("enabled").checked = !paused;
  $("dismissed").textContent = dismissed.length === 1
    ? "1 app skipped this session"
    : `${dismissed.length} apps skipped this session`;
  $("reset").disabled = dismissed.length === 0;
}

$("enabled").addEventListener("change", async (e) => {
  await api.storage.local.set({ paused: !e.target.checked });
});

$("reset").addEventListener("click", async () => {
  await api.runtime.sendMessage({ type: "reset" });
  render();
});

render();
