// Keeps "Continue anyway" choices for the browser session and the global pause switch.
const api = globalThis.browser ?? globalThis.chrome;

async function getDismissed() {
  const { dismissed = [] } = await api.storage.session.get("dismissed");
  return dismissed;
}

async function handle(msg) {
  switch (msg?.type) {
    case "state": {
      const [{ paused = false }, dismissed] = await Promise.all([api.storage.local.get("paused"), getDismissed()]);
      return { paused, dismissed: dismissed.includes(msg.app) };
    }
    case "dismiss": {
      const dismissed = await getDismissed();
      if (!dismissed.includes(msg.app)) await api.storage.session.set({ dismissed: [...dismissed, msg.app] });
      return true;
    }
    case "reset":
      await api.storage.session.set({ dismissed: [] });
      return true;
  }
  return null;
}

api.runtime.onMessage.addListener((msg, _sender, reply) => {
  handle(msg).then(reply, () => reply(null));
  return true;
});
