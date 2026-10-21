import { localizedHtml, translateText, ensureLocale } from "./localization.js";
const e = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let conversation = null,
  owner = null,
  messages = [],
  busy = false,
  status = null,
  open = false,
  api,
  selected,
  announce,
  draft = "";
export function resetChat() {
  owner = null;
  conversation = null;
  messages = [];
  open = false;
  busy = false;
  draft = "";
  status = null;
  document.querySelector("#olivia-widget")?.remove();
}
export function mountChat(user, request, getSelected, notify) {
  api = request;
  selected = getSelected;
  announce = notify;
  if (owner !== user.id) {
    conversation = null;
    messages = [];
    owner = user.id;
  }
  let widget = document.querySelector("#olivia-widget");
  if (!widget) {
    widget = document.createElement("div");
    widget.id = "olivia-widget";
    document.querySelector("#mx-demo").append(widget);
  }
  render();
}
function render() {
  const widget = document.querySelector("#olivia-widget");
  if (!widget) return;
  widget.innerHTML = localizedHtml`<div class="olivia-widget-shell">${open ? localizedHtml`<section class="olivia-float-panel" role="dialog" aria-labelledby="chat-title"><header><div class="row"><div class="olivia-identity"><span class="chat-spark">✦</span><div><b id="chat-title">Olivia IA</b><span class="olivia-live-status"><i class="presence-dot ${status?.configured ? "live" : ""}"></i> V3.5 · ${status?.configured ? translateText("Conectada") : translateText("Modo demo")}</span></div></div><button class="chat-close" aria-label="Cerrar chat Olivia">×</button></div></header><div class="chat-context">Tu espacio autorizado · ${selected() ? "SH-" + selected() : translateText("orientación y seguimiento")}</div><div class="chat-messages" role="log" aria-live="polite">${messages.length ? messages.map((m) => localizedHtml`<div class="chat-bubble ${m.role === "user" ? "from-user" : ""}">${e(m.body)}</div>`).join("") : localizedHtml`<div class="chat-bubble">Hola, soy Olivia. Te ayudo a entender el dashboard, preparar el seguimiento y revisar tus solicitudes.</div><div class="chat-starters"><button data-prompt="Resume los indicadores y los casos que requieren seguimiento.">Mi resumen de servicio ↗</button><button data-prompt="¿Qué debo incluir para registrar una buena solicitud de soporte?">Preparar una solicitud ↗</button></div>`}${busy ? localizedHtml('<div class="chat-bubble typing">Olivia está preparando tu respuesta…</div>') : ""}</div><form id="floating-chat-form"><label class="sr-only" for="chat-message">Mensaje para Olivia</label><textarea id="chat-message" maxlength="2000" rows="2" required placeholder="Escribe a Olivia…" ${busy ? "disabled" : ""}>${e(draft)}</textarea><button aria-label="Enviar mensaje a Olivia" ${busy ? "disabled" : ""}>↗</button></form><footer>Las sugerencias requieren tu revisión. Ninguna respuesta se publica automáticamente.</footer><div class="chat-bottom"><a href="https://www.o7digitalgroup.com/" target="_blank" rel="noopener noreferrer">O7 Digital Group Holding ↗</a><button id="chat-new" ${busy ? "disabled" : ""}>Nueva conversación</button></div></section>` : ""}<div class="olivia-launcher-wrap"><span class="olivia-hover-tip">Habla con Olivia · tu asistente de servicio</span><button class="olivia-launcher" aria-label="${open ? translateText("Cerrar") : translateText("Abrir")} chat Olivia" aria-expanded="${open}"><span>✦</span>${open ? "×" : translateText("Olivia")}</button></div></div>`;
  widget.querySelector(".olivia-launcher").onclick = toggle;
  widget.querySelector(".chat-close")?.addEventListener("click", toggle);
  widget.querySelector("#chat-new")?.addEventListener("click", () => {
    conversation = null;
    messages = [];
    render();
    widget.querySelector("#chat-message")?.focus();
  });
  widget
    .querySelectorAll("[data-prompt]")
    .forEach((b) => (b.onclick = () => send(b.dataset.prompt)));
  widget
    .querySelector("#floating-chat-form")
    ?.addEventListener("submit", (evt) => {
      evt.preventDefault();
      send(widget.querySelector("#chat-message").value);
    });
  widget.querySelector("#chat-message")?.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      if (evt.target.value.trim()) send(evt.target.value);
    }
  });
  const scroll = widget.querySelector(".chat-messages");
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
}
async function toggle() {
  open = !open;
  if (!open) {
    render();
    return;
  }
  busy = true;
  render();
  const activeOwner = owner;
  try {
    status = (await api("/integrations")).olivia;
    if (!conversation) {
      const history = (await api("/chat/conversations")).conversations;
      if (history.length) {
        conversation = history[0].id;
        messages = (await api("/chat/conversations/" + conversation)).messages;
      }
    }
  } catch (err) {
    announce(err.message);
  } finally {
    if (owner === activeOwner) {
      busy = false;
      render();
      document.querySelector("#chat-message")?.focus();
    }
  }
}
async function send(value) {
  if (busy || !value.trim()) return;
  busy = true;
  const message = value.trim();
  draft = "";
  messages.push({ role: "user", body: message });
  render();
  try {
    if (!conversation)
      conversation = (await api("/chat/conversations", "POST", {})).conversation
        .id;
    const response = await api(
      "/chat/conversations/" + conversation + "/messages",
      "POST",
      { message, ...(selected() ? { ticket_id: selected() } : {}) },
    );
    messages.push({ role: "assistant", body: response.answer });
  } catch (err) {
    messages.pop();
    draft = message;
    announce(err.message);
  } finally {
    busy = false;
    render();
  }
}
document.addEventListener("keydown", (evt) => {
  if (evt.key === "Escape" && open) {
    open = false;
    render();
    document.querySelector(".olivia-launcher")?.focus();
  }
});
