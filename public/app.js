import { metricCards, charts, reportDocument } from "./analytics.js";
import { mountChat, resetChat } from "./chat.js";
const clientPortal = /^\/cliente\/?$/.test(location.pathname);
const app = document.querySelector("#app"),
  overlay = document.querySelector("#mx-overlay");
let config,
  csrf,
  user,
  tickets = [],
  companies = [],
  contacts = [],
  users = [],
  view = "overview",
  mode = "list",
  selected = null,
  lastFocus,
  guide = false;
const statuses = ["Abierto", "En curso", "Resuelto", "Cerrado"],
  priorities = ["Baja", "Media", "Alta", "Crítica"],
  categories = [
    "Conectividad",
    "Equipos",
    "Facturación",
    "Accesos",
    "Servicio",
  ];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const $ = (s) => document.querySelector(s);
const roleLabel = (r) =>
  ({
    platform_admin: "Superadministrador",
    admin: "Administrador",
    manager: "Gerente",
    agent: "Técnico de soporte",
    client: "Cliente",
  })[r];
const isGlobal = () =>
  ["platform_admin", "admin", "manager"].includes(user?.role);
const holdingLogo = () =>
  `<a class="o7-brand" href="https://www.o7digitalgroup.com/" target="_blank" rel="noopener noreferrer" aria-label="O7 Digital Group Holding"><span class="o7-mark"><b>O</b><i>7</i></span><span class="o7-copy"><strong>O7 DIGITAL GROUP</strong><small>HOLDING ↗</small></span></a>`;
const date = (v) =>
  new Date(v).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  });
const option = (values, current) =>
  values
    .map(
      (v) =>
        `<option value="${esc(v)}" ${v === current ? "selected" : ""}>${esc(v)}</option>`,
    )
    .join("");
const badge = (label) =>
  `<span class="badge ${["Crítica", "Vencido"].includes(label) ? "red" : label === "Alta" ? "amber" : ["Resuelto", "Cerrado"].includes(label) ? "green" : ""}">${esc(label)}</span>`;
const sla = (t) =>
  ["Resuelto", "Cerrado"].includes(t.status)
    ? "Atendido"
    : new Date(t.due_at) < new Date()
      ? "Vencido"
      : `${Math.ceil((new Date(t.due_at) - Date.now()) / 60000)} min`;
const company = (t) =>
  companies.find((c) => c.id === t.company_id)?.name || t.company;
function notify(message) {
  const el = $("#mx-toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (el.hidden = true), 5000);
}
async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf || "",
      ...(clientPortal ? { "X-Client-Portal": "1" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && user) {
      user = null;
      resetChat();
      closeDialog();
      await bootstrap();
      welcome();
    }
    throw new Error(data.error || "Operación no disponible");
  }
  return data;
}
async function bootstrap() {
  config = await api("/bootstrap");
  csrf = config.csrf;
  document.title = `${config.brand} — ${config.subtitle}`;
}
function welcome() {
  app.classList.toggle("client-experience", clientPortal);
  if (clientPortal) {
    clientWelcome();
    return;
  }
  app.innerHTML = `<div class="login"><div class="row welcome-heading"><div><h2>${esc(config.brand)} ↗</h2><p class="subtitle">${esc(config.subtitle)}</p></div>${holdingLogo()}<span class="demo-tag">ENTORNO ${esc(config.environment).toUpperCase()} · DATOS FICTICIOS</span></div><div class="welcome-grid"><div class="hero"><div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> ATENCIÓN CON CONTINUIDAD</div><h1>Cada solicitud.<br>Una respuesta<br><em>con contexto.</em></h1><p>Un espacio compartido para clientes, agentes y responsables. Del primer contacto a la resolución, sin perder el hilo.</p><div class="actions"><button class="btn lime" data-action="guide">Recorrido guiado ↗</button><button class="btn" data-action="try">Probar la plataforma</button>${config.clientDemo ? '<a class="btn demo-entry-link" href="/demo">Demo cliente · móvil / tablet / desktop ↗</a>' : ""}</div></div></div><div class="panel"><div class="eyebrow">TU ESPACIO DE SERVICIO</div><h2>Iniciar sesión</h2><p class="subtitle">Usa los accesos de demostración compartidos por el equipo. Cada perfil tiene permisos propios.</p><form id="login"><label for="email">Correo electrónico</label><input id="email" name="email" type="email" autocomplete="username" required placeholder="nombre@example.test"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required><p id="login-error" role="alert"></p><button class="btn primary" type="submit">Entrar a mi espacio ↗</button></form><p class="notice">20 empresas ficticias · equipo interno ilustrativo de 25 cuentas por defecto. La distribución no constituye un acuerdo de licencias.</p></div></div><div id="guide" class="guide" ${guide ? "" : "hidden"}><div class="eyebrow">RECORRIDO GUIADO · 5 MINUTOS</div><h2>Una solicitud, tres perspectivas.</h2><p>1. <b>Cliente:</b> inicia sesión y registra una solicitud con sede y prioridad.<br>2. <b>Responsable:</b> entra con tu cuenta y asigna la solicitud a Ana López.<br>3. <b>Agente:</b> revisa el historial, solicita un borrador a Olivia y valida la respuesta.<br>4. <b>Cliente:</b> vuelve al portal para leer y responder.<br>5. <b>Agente:</b> documenta la resolución, cierra y prueba la reapertura.</p><p class="subtitle">Cierra la sesión antes de cambiar de cuenta. Olivia trabaja en modo demo: ninguna sugerencia se publica automáticamente.</p></div></div>`;
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      const data = await api(
        "/login",
        "POST",
        Object.fromEntries(new FormData(e.target)),
      );
      user = data.user;
      csrf = data.csrf;
      view = "overview";
      await load();
      shell();
    } catch (err) {
      $("#login-error").textContent = err.message;
    } finally {
      b.disabled = false;
    }
  });
}
async function load() {
  const [t, c, u] = await Promise.all([
    api("/tickets"),
    api("/companies"),
    isGlobal() ? api("/users") : Promise.resolve({ users: [] }),
  ]);
  tickets = t.tickets;
  companies = c.companies;
  contacts = c.contacts;
  users = u.users;
}
function shell() {
  app.classList.toggle("client-experience", user.role === "client");
  if (user.role === "client") {
    clientShell();
    return;
  }
  app.innerHTML = `<div class="shell"><aside><div class="brand">${esc(config.brand)}<b>↗</b></div><div class="brand-sub">${esc(config.subtitle)}</div><div class="workspace"><span class="mini-logo">S</span><div><strong>Centro de servicio</strong>${roleLabel(user.role)}</div></div><div class="side-label">MI ESPACIO</div><nav aria-label="Navegación principal">${[
    ["overview", "◫", "Panel de control"],
    ["tickets", "▤", user.role === "agent" ? "Mi fila" : "Solicitudes"],
    ...(isGlobal()
      ? [
          ["clients", "▦", "Empresas"],
          ["team", "◉", "Administración"],
        ]
      : []),
    ["reports", "▧", "Informes"],
    ...(config.clientDemo ? [["demo", "▣", "Demo cliente"]] : []),
    ...(user.role !== "client" ? [["olivia", "✦", "Olivia IA"]] : []),
  ]
    .map(
      ([v, i, l]) =>
        `<button data-view="${v}" class="${view === v ? "active" : ""}"><span class="nav-icon">${i}</span>${l}${v === "tickets" ? `<span class="nav-count">${tickets.length}</span>` : ""}</button>`,
    )
    .join(
      "",
    )}</nav><div class="side-bottom">${holdingLogo()}<div class="side-ai"><b>Inteligencia en cada caso.</b><p>Seguimiento claro.<br>Respuestas con contexto.</p>${user.role !== "client" ? '<button data-view="olivia">Conoce a Olivia ↗</button>' : ""}</div><div class="profile"><span class="avatar">${esc(
    user.name
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join(""),
  )}</span><div>${esc(user.name)}<small>${roleLabel(user.role)}</small></div></div></div></aside><section><header class="top"><div class="breadcrumb">Centro de servicio / <b>${roleLabel(user.role)}</b></div><div class="top-right"><span class="demo-tag">${esc(config.environment).toUpperCase()} · DATOS FICTICIOS</span><button class="btn" data-action="refresh">Actualizar</button><button class="btn" data-action="logout">Cerrar sesión</button></div></header><main class="body" id="content"></main></section></div>`;
  render();
  mountChat(user, api, () => selected, notify);
}
function table(list) {
  if (user.role === "client") return clientTicketCards(list);
  return list.length
    ? `<div class="table-wrap"><table><thead><tr><th>SOLICITUD</th><th>EMPRESA / SEDE</th><th>AGENTE</th><th>PRIORIDAD</th><th>ESTADO / SLA</th></tr></thead><tbody>${list.map((t) => `<tr><td><span class="ticket-id">SH-${t.id}</span><button class="ticket-title" data-ticket="${t.id}">${esc(t.title)}</button><small>${esc(t.category)}</small></td><td>${esc(company(t))}<small>${esc(t.site)}</small></td><td>${esc(t.agent || "Sin asignar")}</td><td>${badge(t.priority)}</td><td>${badge(t.status)}<small class="${sla(t) === "Vencido" ? "sla-over" : ""}">${esc(sla(t))}</small></td></tr>`).join("")}</tbody></table></div>`
    : '<div class="empty">No hay solicitudes con estos filtros.</div>';
}
function render() {
  const el = $("#content");
  if (!el) return;
  if (view === "demo") {
    location.href = "/demo";
    return;
  }
  if (view === "overview") {
    if (user.role === "client") {
      renderClientHome(el);
      return;
    }
    renderDashboard(el, false);
    return;
  } else if (view === "reports") {
    renderDashboard(el, true);
    return;
  } else if (view === "tickets") {
    el.innerHTML = `<div class="row"><div><div class="eyebrow">${user.role === "client" ? "PORTAL CLIENTE" : "CENTRO DE SERVICIO"}</div><h1>${user.role === "agent" ? "Mi fila de atención" : "Solicitudes"}</h1><p class="subtitle">${user.role === "client" ? "Consulta y responde a los casos de tu empresa." : "Cada caso, su responsable y su siguiente paso."}</p></div><div class="actions">${user.role !== "agent" ? '<button class="btn primary" data-action="new">+ Nueva solicitud</button>' : ""}<button class="btn" data-action="export">Exportar CSV</button></div></div><div class="toolbar"><input id="search" aria-label="Buscar solicitudes" placeholder="Buscar asunto, empresa o número…"><select id="status" aria-label="Filtrar por estado">${option(["Todos los estados", ...statuses])}</select><select id="priority" aria-label="Filtrar por prioridad">${option(["Todas las prioridades", ...priorities])}</select>${
      isGlobal()
        ? `<select id="company-filter" aria-label="Filtrar por empresa"><option value="">Todas las empresas</option>${companies.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select><select id="agent-filter" aria-label="Filtrar por agente"><option value="">Todos los agentes</option><option value="none">Sin asignar</option>${users
            .filter((u) => u.role === "agent")
            .map((u) => `<option value="${u.id}">${esc(u.name)}</option>`)
            .join("")}</select>`
        : ""
    }</div><div class="row"><p class="subtitle" id="result-count"></p><div class="mode-switch"><button class="btn ${mode === "list" ? "primary" : ""}" data-mode="list">Lista</button><button class="btn ${mode === "board" ? "primary" : ""}" data-mode="board">Kanban</button></div></div><div id="ticket-results"></div>`;
    for (const s of [
      "#search",
      "#status",
      "#priority",
      "#company-filter",
      "#agent-filter",
    ])
      $(s)?.addEventListener("input", renderResults);
    renderResults();
  } else if (view === "clients") {
    el.innerHTML = `<div class="eyebrow">RELACIONES DE SERVICIO</div><h1>Empresas</h1><p class="subtitle">20 organizaciones ficticias. Contactos y seguimiento por sede.</p><div class="client-grid">${companies
      .map((c) => {
        const ts = tickets.filter((t) => t.company_id === c.id);
        return `<div class="panel"><div class="client-banner"><div class="big-client">${esc(c.name)}</div><small>${esc(c.sector)} · EMPRESA FICTICIA</small></div><p>${esc(c.site)}</p><p class="subtitle">${ts.length} solicitudes · ${ts.filter((t) => !["Resuelto", "Cerrado"].includes(t.status)).length} activas</p>${contacts
          .filter((n) => n.company_id === c.id)
          .map(
            (n) =>
              `<p class="subtitle">${esc(n.name)} · ${esc(n.function)}<br>${esc(n.email)}</p>`,
          )
          .join(
            "",
          )}<button class="btn" data-company="${c.id}">Ver solicitudes ↗</button></div>`;
      })
      .join("")}</div>`;
  } else if (view === "team") {
    renderUsers(el);
    return;
  } else if (view === "olivia") {
    el.innerHTML = `<div class="eyebrow">OLIVIA IA V3.5 · ASISTENCIA DE SERVICIO</div><h1>Contexto para tu criterio.</h1><p class="subtitle">Abre el chat flotante de Olivia para conversar con el asistente. Los borradores de ticket de este espacio siguen identificados como demostración.</p><div class="olivia-stage"><div class="orb">✦</div><h2>Una buena respuesta empieza por <em>entender el caso.</em></h2><p>Elige una solicitud para generar su resumen, sugerir prioridad y categoría, preparar una respuesta, proponer la siguiente acción y sintetizar la resolución.</p><label for="olivia-ticket">Solicitud autorizada</label><select id="olivia-ticket">${tickets.map((t) => `<option value="${t.id}">SH-${t.id} · ${esc(t.title)}</option>`).join("")}</select><div class="actions"><button class="btn primary" data-action="open-olivia" ${tickets.length ? "" : "disabled"}>Abrir espacio Olivia ↗</button></div><p class="notice">Las propuestas requieren validación humana. El chat no publica respuestas ni modifica solicitudes.</p></div>`;
  }
}
function filtered() {
  const q = ($("#search")?.value || "").toLowerCase(),
    s = $("#status")?.value,
    p = $("#priority")?.value,
    c = $("#company-filter")?.value,
    a = $("#agent-filter")?.value;
  return tickets.filter(
    (t) =>
      (!q || `${t.title} ${company(t)} ${t.id}`.toLowerCase().includes(q)) &&
      (!s || s === "Todos los estados" || t.status === s) &&
      (!p || p === "Todas las prioridades" || t.priority === p) &&
      (!c || t.company_id === Number(c)) &&
      (!a || (a === "none" ? t.agent_id === null : t.agent_id === Number(a))),
  );
}
function renderResults() {
  const list = filtered();
  $("#result-count").textContent =
    `${list.length} de ${tickets.length} solicitudes autorizadas`;
  $("#ticket-results").innerHTML =
    mode === "list"
      ? `<div class="panel">${table(list)}</div>`
      : `<div class="kanban">${statuses
          .map(
            (s) =>
              `<div class="kanban-col"><div class="kanban-head">${s} · ${list.filter((t) => t.status === s).length}</div>${list
                .filter((t) => t.status === s)
                .map(
                  (t) =>
                    `<div class="ticket-card"><span class="ticket-id">SH-${t.id}</span>${badge(t.priority)}<button class="ticket-title" data-ticket="${t.id}">${esc(t.title)}</button><p>${esc(company(t))}<br>${esc(t.site)}</p><div class="card-bottom"><span>${esc(t.agent || "Sin asignar")}</span><span>${esc(sla(t))}</span></div></div>`,
                )
                .join("")}</div>`,
          )
          .join("")}</div>`;
}
function showDialog(html) {
  lastFocus = document.activeElement;
  overlay.hidden = false;
  overlay.className = "overlay";
  overlay.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">${html}</div>`;
  document.body.style.overflow = "hidden";
  $(".dialog").focus();
}
function closeDialog() {
  overlay.hidden = true;
  overlay.innerHTML = "";
  document.body.style.overflow = "";
  selected = null;
  lastFocus?.focus();
}
function newTicket(category) {
  showDialog(
    `<div class="row"><div><div class="eyebrow">PORTAL DE ATENCIÓN</div><h2 id="dialog-title">Nueva solicitud</h2></div><button class="btn" data-action="close">Cerrar ×</button></div><p class="subtitle">Describe lo que ocurre. El equipo validará la prioridad y te dará seguimiento.</p><form id="new-ticket"><label for="title">Asunto</label><input name="title" id="title" maxlength="160" required><div class="field-row"><div><label for="company">Empresa</label><select name="company_id" id="company" required>${companies.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div><div><label for="site">Sede</label><input name="site" id="site" maxlength="160" value="${esc(companies[0]?.site)}" required></div></div><div class="field-row"><div><label for="category">Categoría</label><select name="category" id="category">${option(categories, category)}</select></div><div><label for="new-priority">Prioridad deseada</label><select name="priority" id="new-priority">${option(priorities, "Media")}</select></div></div><label for="description">Descripción</label><textarea name="description" id="description" maxlength="4000" rows="5" required></textarea><p class="subtitle">No incluyas contraseñas ni datos bancarios. Las piezas adjuntas no están habilitadas en esta demostración.</p><button type="submit" class="btn primary">Registrar solicitud ↗</button></form>`,
  );
  $("#company").addEventListener(
    "change",
    () =>
      ($("#site").value =
        companies.find((c) => c.id === Number($("#company").value))?.site ||
        ""),
  );
  $("#new-ticket").addEventListener("submit", async (e) => {
    e.preventDefault();
    e.submitter.disabled = true;
    try {
      const { ticket } = await api(
        "/tickets",
        "POST",
        Object.fromEntries(new FormData(e.target)),
      );
      await load();
      view = "tickets";
      shell();
      await openTicket(ticket.id);
      notify("Solicitud registrada y guardada");
    } catch (err) {
      notify(err.message);
      e.submitter.disabled = false;
    }
  });
}
async function openTicket(ticketId, focusOlivia = false) {
  const data = await api(`/tickets/${ticketId}`),
    t = data.ticket;
  selected = t.id;
  const isInternal = user.role !== "client",
    active = !["Resuelto", "Cerrado"].includes(t.status);
  showDialog(
    `<div class="row"><div><div class="eyebrow">SH-${t.id} · ${esc(company(t))}</div><h2 id="dialog-title">${esc(t.title)}</h2></div><button class="btn" data-action="close">Cerrar ×</button></div><p class="subtitle">${esc(t.site)} · ${esc(t.category)} · Creada ${date(t.created_at)}</p><div class="row"><div>${badge(t.status)} ${badge(t.priority)}</div><span class="subtitle">SLA: ${esc(sla(t))} · ${date(t.due_at)}</span></div><div class="dialog-grid"><div><div class="panel"><h3>Descripción</h3><div class="text-block">${esc(t.description)}</div><p class="subtitle">Prioridad solicitada: ${esc(t.requested_priority)}</p></div><div class="panel chart-panel"><h3>Conversación e historial</h3><div class="timeline">${data.events.map((e) => `<div class="event ${e.internal ? "internal" : ""}"><small>${date(e.created_at)} · ${esc(e.actor)} · ${e.kind === "note" ? "Nota interna · solo equipo" : e.kind === "reply" ? "Respuesta" : e.kind === "resolution" ? "Resolución" : "Historial"}</small><p>${esc(e.body)}</p></div>`).join("")}</div>${active ? `<form id="reply-form"><label for="reply">${isInternal ? "Respuesta para el cliente" : "Responder al equipo"}</label><textarea id="reply" name="body" required maxlength="4000" rows="4"></textarea>${isInternal ? '<label class="check"><input type="checkbox" id="approval" required> Revisé el contenido y autorizo publicarlo en el portal cliente.</label>' : ""}<button class="btn primary">${isInternal ? "Validar y publicar respuesta" : "Enviar respuesta"}</button></form>` : '<p class="subtitle">Este caso está atendido. El equipo puede reabrirlo si requiere seguimiento.</p>'}</div>${isInternal ? `<div class="panel chart-panel"><h3>Trabajo interno</h3><form id="note-form"><label for="note">Nota interna (oculta al cliente)</label><textarea id="note" name="body" maxlength="4000" required></textarea><button class="btn">Guardar nota interna</button></form>${active ? '<form id="resolution-form"><label for="resolution">Resolución verificada</label><textarea id="resolution" name="body" required maxlength="4000" placeholder="Causa, acciones realizadas y verificación con la sede…"></textarea><button class="btn primary">Documentar y resolver</button></form>' : ""}<div class="actions">${t.status === "Resuelto" ? '<button class="btn primary" data-action="close-ticket">Cerrar solicitud</button>' : ""}${!active ? '<button class="btn" data-action="reopen">Reabrir con motivo</button>' : ""}</div></div>` : ""}</div><div>${
      isGlobal() && active
        ? `<div class="panel"><h3>Responsable del caso</h3><form id="assign-form"><label for="assigned-agent">Agente</label><select id="assigned-agent" name="agent_id" required><option value="">Seleccionar agente…</option>${users
            .filter((u) => u.role === "agent")
            .map(
              (u) =>
                `<option value="${u.id}" ${u.id === t.agent_id ? "selected" : ""}>${esc(u.name)}</option>`,
            )
            .join(
              "",
            )}</select><div class="actions"><button class="btn primary">Asignar agente</button></div></form></div>`
        : ""
    }${isInternal ? `<div class="panel ai chart-panel"><div class="ai-head"><div class="orb">✦</div><div><b>Olivia IA V3.5</b><div class="muted">MODO DEMO · SIMULADO</div></div></div><p>Propuestas adaptadas al caso. Revisa todos los datos antes de usarlas.</p><button class="btn primary" data-action="suggest">Preparar con Olivia ↗</button><div id="suggestions"></div></div><div class="panel chart-panel"><h3>Clasificación validada</h3><form id="classification-form"><label for="edit-priority">Prioridad</label><select id="edit-priority" name="priority">${option(priorities, t.priority)}</select><label for="edit-category">Categoría</label><select id="edit-category" name="category">${option(categories, t.category)}</select><label class="check"><input type="checkbox" required> Confirmo esta clasificación.</label><button class="btn">Validar clasificación</button></form></div>` : '<div class="panel ai"><h3>Seguimiento compartido</h3><p>Las respuestas validadas y la resolución de tu equipo aparecen en este historial.</p></div>'}</div></div>`,
  );
  selected = t.id;
  for (const [selector, action] of [
    ["#reply-form", "reply"],
    ["#note-form", "note"],
    ["#resolution-form", "resolve"],
    ["#assign-form", "assign"],
    ["#classification-form", "classify"],
  ])
    $(selector)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const button = e.submitter;
      button.disabled = true;
      try {
        await perform(action, {
          ...Object.fromEntries(new FormData(e.target)),
          approved:
            action === "reply"
              ? $("#approval")?.checked || false
              : action === "classify",
        });
      } catch (err) {
        notify(err.message);
        button.disabled = false;
      }
    });
  if (focusOlivia) await suggest();
}
async function perform(action, body = {}) {
  const current = selected;
  await api(`/tickets/${current}/actions`, "POST", { action, ...body });
  await load();
  render();
  await openTicket(current);
  notify("Cambios guardados");
}
let suggestion;
async function suggest() {
  const current = selected;
  const button = $('[data-action="suggest"]');
  if (button) button.disabled = true;
  try {
    suggestion = await api(`/tickets/${current}/olivia`, "POST", {});
    if (selected !== current) return;
    const s = suggestion;
    $("#suggestions").innerHTML =
      `<p class="badge amber">SIMULACIÓN · REVISIÓN HUMANA</p><h3>Resumen</h3><p>${esc(s.summary)}</p><h3>Clasificación sugerida</h3><p>${esc(s.category)} · ${esc(s.priority)}</p><button class="btn" data-action="copy-classification">Preparar clasificación</button><h3>Borrador de respuesta</h3><p class="text-block">${esc(s.draft)}</p>${$("#reply") ? '<button class="btn" data-action="copy-draft">Copiar al editor para revisar</button>' : ""}<h3>Próxima acción</h3><p>${esc(s.nextAction)}</p><h3>Síntesis de resolución</h3><p>${esc(s.resolution)}</p>${$("#resolution") ? '<button class="btn" data-action="copy-resolution">Preparar resolución para revisar</button>' : ""}`;
  } finally {
    if (button) button.disabled = false;
  }
}
function exportCSV() {
  const rows = [
    [
      "ID",
      "Asunto",
      "Empresa",
      "Sede",
      "Prioridad",
      "Estado",
      "Agente",
      "Vencimiento",
    ],
    ...filtered().map((t) => [
      t.id,
      t.title,
      company(t),
      t.site,
      t.priority,
      t.status,
      t.agent || "",
      t.due_at,
    ]),
  ];
  const quote = (v) =>
    '"' +
    String(v)
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const blob = new Blob(
    ["\uFEFF" + rows.map((r) => r.map(quote).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "service-hub-solicitudes.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.view) {
      view = b.dataset.view;
      shell();
      return;
    }
    if (b.dataset.ticket) {
      await openTicket(Number(b.dataset.ticket));
      return;
    }
    if (b.dataset.mode) {
      mode = b.dataset.mode;
      renderResults();
      document
        .querySelectorAll("[data-mode]")
        .forEach((n) => n.classList.toggle("primary", n.dataset.mode === mode));
      return;
    }
    if (b.dataset.company) {
      view = "tickets";
      shell();
      $("#company-filter").value = b.dataset.company;
      renderResults();
      return;
    }
    switch (b.dataset.action) {
      case "guide":
        guide = true;
        $("#guide").hidden = false;
        $("#guide").scrollIntoView({ behavior: "smooth" });
        break;
      case "try":
        $("#email").focus();
        break;
      case "logout":
        await api("/logout", "POST", {});
        user = null;
        resetChat();
        closeDialog();
        await bootstrap();
        welcome();
        break;
      case "refresh":
        await load();
        shell();
        notify("Datos actualizados");
        break;
      case "new":
        newTicket();
        break;
      case "close":
        closeDialog();
        break;
      case "export":
        exportCSV();
        break;
      case "suggest":
        await suggest();
        break;
      case "open-olivia":
        await openTicket(Number($("#olivia-ticket").value), true);
        break;
      case "copy-draft":
        $("#reply").value = suggestion.draft;
        $("#approval").checked = false;
        $("#reply").focus();
        notify("Borrador preparado: revisa y valida antes de publicar");
        break;
      case "copy-classification":
        $("#edit-priority").value = suggestion.priority;
        $("#edit-category").value = suggestion.category;
        $('#classification-form input[type="checkbox"]').checked = false;
        $("#edit-priority").focus();
        break;
      case "copy-resolution":
        $("#resolution").value = suggestion.resolution;
        $("#resolution").focus();
        break;
      case "close-ticket":
        await perform("close");
        break;
      case "reopen": {
        const body = prompt(
          "Motivo de la reapertura (visible en el historial):",
        );
        if (body?.trim()) await perform("reopen", { body });
        break;
      }
    }
  } catch (err) {
    notify(err.message);
  }
});
document.addEventListener("keydown", (e) => {
  if (overlay.hidden) return;
  if (e.key === "Escape") {
    closeDialog();
    return;
  }
  if (e.key === "Tab") {
    const nodes = [
      ...overlay.querySelectorAll("button,input,select,textarea,[tabindex]"),
    ].filter((n) => !n.disabled && n.tabIndex >= 0);
    const first = nodes[0],
      last = nodes.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
try {
  await bootstrap();
  try {
    user = (await api("/me")).user;
  } catch {}
  if (user) {
    await load();
    view = "overview";
    shell();
  } else if (
    clientPortal &&
    config.clientDemo &&
    new URLSearchParams(location.search).get("preview") === "1"
  )
    await enterClientDemo();
  else welcome();
} catch (err) {
  app.innerHTML =
    '<p class="empty">No fue posible cargar la plataforma. Actualiza la página.</p>';
  notify(err.message);
}
let analyticsData = null,
  reportList = [];
async function renderDashboard(el, reporting) {
  const activeView = view;
  el.innerHTML = '<p class="empty">Preparando tus indicadores…</p>';
  try {
    const [data, integration, saved] = await Promise.all([
      api("/analytics"),
      api("/integrations"),
      reporting ? api("/reports") : Promise.resolve({ reports: [] }),
    ]);
    if (!el.isConnected || view !== activeView) return;
    analyticsData = data;
    reportList = saved.reports;
    el.innerHTML = `<div class="row page-heading"><div><div class="eyebrow">${reporting ? "INTELIGENCIA DE SERVICIO" : user.role === "client" ? "TU PANEL CLIENTE" : "CONTROL DE OPERACIONES"}</div><h1>${reporting ? "Informes con perspectiva." : `Hola, ${esc(user.name.split(" ")[0])}.`}</h1><p class="subtitle">${reporting ? "Datos guardados, lectura clara y decisiones documentadas." : user.role === "client" ? `La atención de ${esc(companies[0]?.name)}. Todo tu seguimiento en un solo espacio.` : "Tu operación, en una sola mirada. Del volumen al siguiente paso."}</p></div><div class="actions">${!reporting && user.role !== "agent" ? '<button class="btn primary" data-action="new">+ Nueva solicitud</button>' : ""}<button class="btn" id="export-analytics">Exportar indicadores ↗</button></div></div>${!reporting ? `<div class="hero premium-hero"><div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> ${user.role === "client" ? "SERVICIO CON CONTINUIDAD" : "LA PERSPECTIVA COMPLETA"}</div><h2>Más claridad.<br>Mejores <em>decisiones.</em></h2><p>Una visión del servicio que conecta a tu equipo, tus solicitudes y cada compromiso de atención.</p><button class="btn lime" data-view="${user.role === "client" ? "tickets" : "reports"}">${user.role === "client" ? "Ver mis solicitudes" : "Explorar informes"} ↗</button></div><div class="hero-art"><div class="hero-orbit"></div><div class="orb">✦</div><span class="orbit-tag">Olivia IA · V3.5</span></div></div>` : ""}<form class="report-filters" id="report-filters"><div><label for="report-start">Desde</label><input type="date" id="report-start" name="start" value="${data.filters.start}" required></div><div><label for="report-end">Hasta</label><input type="date" id="report-end" name="end" value="${data.filters.end}" required></div>${isGlobal() ? `<div><label for="report-company">Empresa</label><select id="report-company" name="company_id"><option value="">Todas las empresas</option>${companies.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>` : ""}<button class="btn primary">Aplicar periodo</button><span class="period-caption">Alcance ${esc(data.scope)} · Ciudad de México</span></form><div id="analytics-data">${metricCards(data)}${charts(data)}</div>${reporting ? `<div class="panel report-actions"><div><div class="eyebrow">TU REPORTE EJECUTIVO</div><h2>Guarda una fotografía del servicio.</h2><p class="subtitle">El informe conserva los indicadores de este periodo, incluso cuando los tickets cambien.</p></div><div class="actions"><button class="btn primary" id="save-report">Guardar informe</button><button class="btn" id="ai-report" ${integration.huggingface.configured ? "" : "disabled"}>Síntesis con Hugging Face ✦</button><button class="btn" id="print-report">Imprimir / PDF ↗</button></div><p class="integration-note">${integration.huggingface.configured ? "Hugging Face configurado · síntesis bajo demanda con datos agregados autorizados." : "Hugging Face pendiente de API y modelo. Los gráficos, la exportación y los informes de datos están disponibles."}</p></div><div class="panel saved-reports"><div class="panel-head"><h2>Mis informes guardados</h2><span class="subtitle" id="report-count">${reportList.length} informes</span></div><div id="saved-report-list"></div></div><div id="saved-report-preview"></div>` : `<div class="panel recent-panel"><div class="panel-head"><div><div class="eyebrow">EL SIGUIENTE PASO</div><h2>Solicitudes recientes</h2></div><button class="small-link" data-view="tickets">Ver todas ↗</button></div>${table(tickets.slice(0, 5))}</div>`}`;
    $("#report-filters").addEventListener("submit", async (evt) => {
      evt.preventDefault();
      evt.submitter.disabled = true;
      try {
        const params = new URLSearchParams(
          Object.fromEntries(new FormData(evt.target)),
        );
        const next = await api("/analytics?" + params);
        if (view !== activeView) return;
        analyticsData = next;
        $("#analytics-data").innerHTML = metricCards(next) + charts(next);
        notify("Indicadores actualizados");
      } catch (err) {
        notify(err.message);
      } finally {
        evt.submitter.disabled = false;
      }
    });
    $("#export-analytics").onclick = () => {
      const m = analyticsData.metrics;
      downloadCSV("service-hub-indicadores.csv", [
        ["Indicador", "Valor"],
        ...Object.entries(m),
        ["Desde", analyticsData.filters.start],
        ["Hasta", analyticsData.filters.end],
        ["Alcance", analyticsData.scope],
      ]);
    };
    if (reporting) {
      drawSavedReports();
      $("#save-report").onclick = () => saveReport(false);
      $("#ai-report").onclick = () => saveReport(true);
      $("#print-report").onclick = () => window.print();
    }
  } catch (err) {
    if (el.isConnected)
      el.innerHTML =
        '<p class="empty">No fue posible cargar los indicadores.</p>';
    notify(err.message);
  }
}
function downloadCSV(name, rows) {
  const quote = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((r) => r.map(quote).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function drawSavedReports() {
  const el = $("#saved-report-list");
  if (!el) return;
  $("#report-count").textContent = `${reportList.length} informes`;
  el.innerHTML = reportList.length
    ? reportList
        .map(
          (r) =>
            `<button class="report-entry" data-report-id="${r.id}"><span><b>${r.filters.start} — ${r.filters.end}</b><small>${new Date(r.created_at).toLocaleString("es-MX")} · ${r.snapshot.metrics.total} solicitudes</small></span><span>${r.provider === "huggingface" ? "Síntesis IA" : "Informe de datos"} ↗</span></button>`,
        )
        .join("")
    : '<p class="subtitle">Guarda tu primer informe para consultarlo después.</p>';
  el.querySelectorAll("[data-report-id]").forEach(
    (b) =>
      (b.onclick = () => {
        $("#saved-report-preview").innerHTML = reportDocument(
          reportList.find((r) => r.id === b.dataset.reportId),
        );
        $("#saved-report-preview").scrollIntoView({ behavior: "smooth" });
      }),
  );
}
async function saveReport(ai) {
  const button = $(ai ? "#ai-report" : "#save-report");
  button.disabled = true;
  try {
    const { report } = await api("/reports", "POST", {
      filters: analyticsData.filters,
      ai,
    });
    reportList.unshift(report);
    drawSavedReports();
    $("#saved-report-preview").innerHTML = reportDocument(report);
    notify("Informe guardado");
  } catch (err) {
    notify(err.message);
  } finally {
    button.disabled = false;
  }
}
function renderUsers(el) {
  const allowed =
    user.role === "platform_admin"
      ? ["platform_admin", "admin", "manager", "agent", "client"]
      : user.role === "admin"
        ? ["manager", "agent", "client"]
        : ["agent", "client"];
  el.innerHTML = `<div class="row page-heading"><div><div class="eyebrow">PERSONAS Y PERMISOS</div><h1>Administración</h1><p class="subtitle">Admins y gerentes: todas las empresas. Técnicos: solicitudes asignadas. Clientes: su empresa.</p></div><button class="btn primary" id="create-user">+ Nuevo usuario</button></div><div class="panel"><div class="panel-head"><h2>Usuarios de la plataforma</h2><span class="subtitle">${users.length} cuentas</span></div><div class="table-wrap"><table><thead><tr><th>USUARIO</th><th>ROL</th><th>ALCANCE</th><th>ESTADO</th><th>ACCESO</th></tr></thead><tbody>${users.map((u) => `<tr><td><b>${esc(u.name)}</b><small>${esc(u.email)}</small></td><td>${roleLabel(u.role)}</td><td>${u.role === "client" ? esc(companies.find((c) => c.id === u.company_id)?.name) : u.role === "agent" ? "Solicitudes asignadas" : "Todas las empresas"}</td><td>${badge(u.active ? "Activo" : "Desactivado")}</td><td>${u.id !== user.id && allowed.includes(u.role) ? `<button class="btn" data-user-access="${u.id}" data-enabled="${u.active}">${u.active ? "Desactivar" : "Activar"}</button>` : "—"}</td></tr>`).join("")}</tbody></table></div></div>`;
  el.querySelectorAll("[data-user-access]").forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          await api("/users/" + b.dataset.userAccess + "/access", "POST", {
            active: b.dataset.enabled !== "true",
          });
          await load();
          renderUsers(el);
          notify("Acceso actualizado");
        } catch (err) {
          notify(err.message);
          b.disabled = false;
        }
      }),
  );
  $("#create-user").onclick = () => {
    showDialog(
      `<div class="row"><div><div class="eyebrow">ADMINISTRACIÓN</div><h2 id="dialog-title">Nuevo usuario</h2></div><button class="btn" data-action="close">Cerrar ×</button></div><form id="user-form"><label for="user-name">Nombre completo</label><input id="user-name" name="name" maxlength="100" required><label for="user-email">Correo electrónico</label><input id="user-email" name="email" type="email" required><label for="user-role">Rol</label><select id="user-role" name="role">${allowed.map((r) => `<option value="${r}">${roleLabel(r)}</option>`).join("")}</select><div id="user-company-field" hidden><label for="user-company">Empresa del cliente</label><select id="user-company" name="company_id">${companies.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div><label for="user-password">Contraseña inicial (12 caracteres mínimo)</label><input id="user-password" name="password" type="password" minlength="12" maxlength="72" autocomplete="new-password" required><p class="subtitle">Comparte el acceso por un canal privado. No se envía ningún correo automáticamente.</p><button class="btn primary">Crear cuenta</button></form>`,
    );
    $("#user-role").onchange = () =>
      ($("#user-company-field").hidden = $("#user-role").value !== "client");
    $("#user-form").onsubmit = async (evt) => {
      evt.preventDefault();
      evt.submitter.disabled = true;
      try {
        await api(
          "/users",
          "POST",
          Object.fromEntries(new FormData(evt.target)),
        );
        closeDialog();
        await load();
        renderUsers(el);
        notify("Usuario creado");
      } catch (err) {
        notify(err.message);
        evt.submitter.disabled = false;
      }
    };
  };
}
function clientWelcome() {
  app.classList.add("client-experience");
  app.innerHTML = `<div class="portal-welcome"><header class="portal-entry-header"><a class="portal-wordmark" href="/cliente">${esc(config.brand)}<span>↗</span><small>Tu espacio de atención</small></a>${holdingLogo()}</header><div class="portal-entry-grid"><div class="portal-entry-copy"><div class="eyebrow">SERVICIO A TU RITMO</div><h1>Tu equipo de soporte.<br><em>Siempre a mano.</em></h1><p>Desde tu teléfono, iPad o computadora. Crea solicitudes, sigue cada respuesta y consulta tus indicadores.</p><div class="portal-entry-cards"><span>◫<b>Tu dashboard</b></span><span>▤<b>Tus solicitudes</b></span><span>✦<b>Tu asistente Olivia</b></span></div></div><div class="panel portal-entry-form"><div class="eyebrow">PORTAL CLIENTE</div><h2>Bienvenido a tu espacio.</h2>${config.clientDemo ? `<div class="demo-client-card"><span class="avatar">CV</span><div><b>Camila Vega</b><small>Aurora Salud · empresa ficticia</small></div></div><button class="btn primary" id="enter-client-demo">Entrar a la demo cliente ↗</button><p class="subtitle">Prueba el recorrido sin introducir credenciales. Las solicitudes se guardan en el entorno de demostración.</p><a class="portal-preview-link" href="/demo">Ver móvil, iPad / tablet y desktop ↗</a><details class="real-client-login"><summary>Entrar con mi cuenta cliente</summary>` : "<div>"}<form id="login"><label for="email">Correo electrónico</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required><p id="login-error" role="alert"></p><button class="btn">Entrar a mi espacio ↗</button></form>${config.clientDemo ? "</details>" : "</div>"}</div></div><footer>Service Hub · ${esc(config.subtitle)}<a href="https://www.o7digitalgroup.com/" target="_blank" rel="noopener noreferrer">O7 Digital Group Holding ↗</a></footer></div>`;
  $("#enter-client-demo")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try {
      await enterClientDemo();
    } catch (err) {
      notify(err.message);
      e.target.disabled = false;
    }
  });
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    e.submitter.disabled = true;
    try {
      const data = await api(
        "/login",
        "POST",
        Object.fromEntries(new FormData(e.target)),
      );
      user = data.user;
      csrf = data.csrf;
      await load();
      view = "overview";
      shell();
    } catch (err) {
      $("#login-error").textContent = err.message;
      e.submitter.disabled = false;
    }
  });
}
async function enterClientDemo() {
  const data = await api("/demo/client-login", "POST", {});
  user = data.user;
  csrf = data.csrf;
  await load();
  view = "overview";
  shell();
}
function clientShell() {
  app.classList.add("client-experience");
  app.innerHTML = `<div class="client-shell"><header class="client-top"><a class="portal-wordmark" href="${clientPortal ? "/cliente" : "/"}">${esc(config.brand)}<span>↗</span><small>Portal de atención</small></a><div class="client-company"><b>${esc(companies[0]?.name)}</b><small>${esc(user.name)}</small></div><div class="client-header-actions">${config.clientDemo ? '<a class="btn client-preview-link" href="/demo" target="_blank" rel="noopener noreferrer">Ver dispositivos ↗</a>' : ""}<button class="btn" data-action="logout">Cerrar sesión</button><span class="avatar">${esc(
    user.name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join(""),
  )}</span></div></header><div class="client-layout"><aside class="client-menu"><div class="client-menu-title">TU ESPACIO</div><nav aria-label="Navegación principal">${[
    ["overview", "◫", "Inicio"],
    ["tickets", "▤", "Solicitudes"],
    ["reports", "▧", "Informes"],
  ]
    .map(
      ([v, i, label]) =>
        `<button data-view="${v}" class="${view === v ? "active" : ""}"><span class="nav-icon">${i}</span><span>${label}</span></button>`,
    )
    .join(
      "",
    )}</nav><div class="client-menu-footer">${holdingLogo()}<p>Atención con continuidad.<br>Contexto en cada respuesta.</p></div></aside><main class="body client-content" id="content"></main></div></div>`;
  render();
  mountChat(user, api, () => selected, notify);
}
function clientTicketCards(list) {
  return list.length
    ? `<div class="client-ticket-cards">${list.map((t) => `<button class="client-ticket-card" data-ticket="${t.id}" aria-label="${esc(t.title)}"><div class="row"><span class="ticket-id">SH-${t.id} · ${esc(t.category)}</span>${badge(t.status)}</div><h3>${esc(t.title)}</h3><p>${esc(t.site)}</p><div class="row"><span class="client-card-priority">${esc(t.priority)} · ${esc(sla(t))}</span><span class="client-card-arrow">↗</span></div></button>`).join("")}</div>`
    : '<div class="panel empty">Tu primera solicitud empieza aquí. Cuéntanos cómo podemos ayudarte.</div>';
}
async function renderClientHome(el) {
  el.innerHTML = '<p class="empty">Preparando tu espacio…</p>';
  try {
    const data = await api("/analytics");
    if (!el.isConnected || view !== "overview") return;
    const m = data.metrics;
    el.innerHTML = `<div class="client-welcome-line"><div><div class="eyebrow">TU SERVICIO, CON CONTINUIDAD</div><h1>Hola, ${esc(user.name.split(" ")[0])}.</h1><p>Estamos contigo en cada solicitud.</p></div><span class="client-demo-pill">${esc(config.environment).toUpperCase()} · datos ficticios</span></div><div class="client-service-hero"><div><span class="eyebrow">CUÉNTANOS QUÉ NECESITAS</span><h2>Una solicitud.<br><em>El siguiente paso, claro.</em></h2><p>Tu equipo tiene el contexto. Tú tienes el seguimiento.</p><button class="btn lime" data-action="new">+ Nueva solicitud</button></div><div class="client-hero-graphic" aria-hidden="true"><div class="client-hero-ring"></div><span>↗</span><i>Todo en un solo lugar</i></div></div><div class="client-metrics">${[
      ["En atención", m.active, "Solicitudes activas"],
      ["Atendidas", m.resolved, "Resueltas o cerradas"],
      [
        "Cumplimiento SLA",
        m.sla_percent === null ? "—" : m.sla_percent + "%",
        "Casos atendidos",
      ],
      [
        "Tiempo promedio",
        m.average_resolution_hours === null
          ? "—"
          : m.average_resolution_hours + " h",
        "Hasta la resolución",
      ],
    ]
      .map(
        ([label, value, caption]) =>
          `<div><small>${label}</small><strong>${value}</strong><span>${caption}</span></div>`,
      )
      .join(
        "",
      )}</div><div class="client-home-columns"><section><div class="panel-head"><div><div class="eyebrow">TU SEGUIMIENTO</div><h2>Solicitudes recientes</h2></div><button class="small-link" data-view="tickets">Ver todas ↗</button></div>${clientTicketCards(tickets.slice(0, 3))}</section><section class="panel client-help-panel"><div class="eyebrow">¿EN QUÉ TE AYUDAMOS?</div><h2>Empieza por aquí.</h2><div class="client-category-list">${[
      ["Conectividad", "⌁", "Conexión y red"],
      ["Equipos", "▣", "Equipos y terminales"],
      ["Facturación", "▤", "Facturas y cargos"],
      ["Accesos", "◉", "Acceso a tu portal"],
    ]
      .map(
        ([category, icon, label]) =>
          `<button data-client-category="${category}"><span>${icon}</span><b>${label}</b><i>↗</i></button>`,
      )
      .join(
        "",
      )}</div><p>¿Necesitas orientación? Abre Olivia, tu asistente de servicio.</p><button class="btn" id="client-open-olivia">Hablar con Olivia ✦</button></section></div><div class="client-home-report"><div><div class="eyebrow">TU PERSPECTIVA</div><h2>El servicio también se ve en los datos.</h2><p>Consulta tus gráficos, exporta indicadores y guarda un informe de tu empresa.</p></div><button class="btn" data-view="reports">Explorar mis informes ↗</button></div>`;
    el.querySelectorAll("[data-client-category]").forEach(
      (b) => (b.onclick = () => newTicket(b.dataset.clientCategory)),
    );
    $("#client-open-olivia").onclick = () =>
      document.querySelector(".olivia-launcher").click();
  } catch (err) {
    if (el.isConnected)
      el.innerHTML = '<p class="empty">No fue posible cargar tu espacio.</p>';
    notify(err.message);
  }
}
