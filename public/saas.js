import { createStaffUI } from "./staff.js";
import { inFrench } from "./french.js";
import { countries, languages, countryName } from "./international.js";
const translations = {
  es: {
    login: "Iniciar sesión",
    signup: "Crear mi espacio",
    trial: "Comenzar 7 días gratis",
    pricing: "Planes y precios",
    tag: "TU SERVICIO. TUS REGLAS.",
    headline: "Un gran servicio empieza con un equipo conectado.",
    intro:
      "Configura tu operación, conecta a tus clientes y convierte cada solicitud en un siguiente paso claro. A tu manera, desde el primer día.",
    name: "Tu nombre",
    company: "Nombre de tu empresa",
    email: "Correo de trabajo",
    password: "Contraseña",
    passwordHint: "Mínimo 12 caracteres",
    terms: "Acepto las condiciones y la política de privacidad.",
    create: "Crear espacio · 7 días gratis",
    nocard: "Sin tarjeta. Sin cargos automáticos durante la prueba.",
    welcome: "Bienvenido de nuevo.",
    signin: "Entra a tu espacio de Service Hub.",
    enter: "Entrar a mi espacio ↗",
    configure: "Hazlo tuyo.",
    onboarding: "Tu operación, lista en cinco pasos.",
    save: "Guardar cambios",
    next: "Continuar ↗",
    back: "Anterior",
    finish: "Abrir mi espacio ↗",
    settings: "Configuración",
    billing: "Suscripción",
    admin: "Administración O7",
    import: "Importar datos",
    saveSuccess: "Cambios guardados",
    choose: "Elegir plan",
    monthly: "Mensual",
    quarterly: "Trimestral",
    semester: "Semestral",
    annual: "Anual",
    license: "Licencia de plataforma",
    licenseDetail:
      "399 USD cada 12 meses, además del plan de usuarios. Renovación anual.",
    trialStatus: "Tu prueba gratuita",
    readonly:
      "Tu espacio está en modo lectura. Tus datos se conservan. Activa tu suscripción para continuar.",
    brand: "O7 Digital Group",
    billingConsent:
      "Acepto los importes, la renovación automática y las condiciones de cancelación indicadas.",
    manage: "Gestionar tarjetas, facturas y cancelación",
    loading: "Preparando tu espacio…",
  },
  en: {
    login: "Sign in",
    signup: "Create workspace",
    trial: "Start 7 days free",
    pricing: "Plans and pricing",
    tag: "YOUR SERVICE. YOUR RULES.",
    headline: "Great service starts with a connected team.",
    intro:
      "Shape your operation, connect with your customers and give every request a clear next step. Your way, from day one.",
    name: "Your name",
    company: "Company name",
    email: "Work email",
    password: "Password",
    passwordHint: "At least 12 characters",
    terms: "I accept the terms and privacy policy.",
    create: "Create workspace · 7 days free",
    nocard: "No card required. No automatic charges during your trial.",
    welcome: "Welcome back.",
    signin: "Sign in to your Service Hub workspace.",
    enter: "Enter my workspace ↗",
    configure: "Make it yours.",
    onboarding: "Your operation, ready in five steps.",
    save: "Save changes",
    next: "Continue ↗",
    back: "Back",
    finish: "Open my workspace ↗",
    settings: "Settings",
    billing: "Subscription",
    admin: "O7 administration",
    import: "Import data",
    saveSuccess: "Changes saved",
    choose: "Choose plan",
    monthly: "Monthly",
    quarterly: "Quarterly",
    semester: "Every 6 months",
    annual: "Annual",
    license: "Platform license",
    licenseDetail:
      "399 USD every 12 months, in addition to your user plan. Renews annually.",
    trialStatus: "Your free trial",
    readonly:
      "Your workspace is read only. Your data is retained. Activate your subscription to continue.",
    brand: "O7 Digital Group",
    billingConsent:
      "I accept the displayed amounts, automatic renewals and cancellation terms.",
    manage: "Manage cards, invoices and cancellation",
    loading: "Preparing your workspace…",
  },
};
translations.fr = Object.fromEntries(
  Object.entries(translations.en).map(([key, value]) => [key, inFrench(value)]),
);
export function createSaas({
  api,
  esc: e,
  app,
  notify,
  onLogin,
  getUser,
  getWorkspace,
  reload,
}) {
  let lang = localStorage.getItem("servicehub-language") || "es";
  if (!translations[lang]) lang = "es";
  const t = (k) => translations[lang][k] || k;
  const tr = (es, en) =>
    lang === "fr"
      ? Array.isArray(en)
        ? en.map(inFrench)
        : inFrench(en)
      : lang === "en"
        ? en
        : es;
  const language = () =>
    `<select id="language" aria-label="Language">${Object.entries(languages)
      .filter(([code]) => translations[code])
      .map(
        ([code, label]) =>
          `<option value="${code}" ${lang === code ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select>`;
  const bindLanguage = (render) => {
    const node = document.querySelector("#language");
    if (node)
      node.onchange = (event) => {
        lang = event.target.value;
        localStorage.setItem("servicehub-language", lang);
        document.documentElement.lang = lang;
        render();
      };
  };
  const header = () =>
    `<header class="commercial-header"><a class="commercial-brand" href="/">Service Hub<span>↗</span><small>O7 Digital Group</small></a><nav><a href="/pricing">${t("pricing")}</a><a href="/login">${t("login")}</a>${language()}<a class="btn primary" href="/signup">${t("trial")} ↗</a></nav></header>`;
  const footer = () =>
    `<footer class="commercial-footer"><span>© ${new Date().getFullYear()} O7 Digital Group · Service Hub</span><a href="/terms">${tr("Condiciones", "Terms")}</a><a href="/privacy">${tr("Privacidad", "Privacy")}</a><a href="https://www.o7digitalgroup.com/" target="_blank" rel="noopener noreferrer">O7 Digital Group ↗</a></footer>`;
  const input = (key, label, type = "text", value = "", required = true) =>
    `<label for="${key}">${label}</label><input id="${key}" name="${key}" type="${type}" value="${e(value)}" ${required ? "required" : ""} ${type === "password" ? 'minlength="12" autocomplete="new-password"' : 'maxlength="160"'}>`;
  const safe = (fn) => async (event) => {
    event?.preventDefault();
    const button = event?.submitter || event?.currentTarget;
    if (button?.tagName === "BUTTON") button.disabled = true;
    try {
      await fn(event);
    } catch (err) {
      notify(err.message);
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  };
  const money = (c) =>
    new Intl.NumberFormat(lang, {
      style: "currency",
      currency: "USD",
    }).format(c / 100) + " USD";
  async function publicPage() {
    document.documentElement.lang = lang;
    const path = location.pathname;
    app.classList.remove("client-experience");
    app.classList.add("commercial");
    if (["/login", "/signup", "/invitation"].includes(path)) {
      const signup = path === "/signup",
        invitation = path === "/invitation";
      app.innerHTML =
        header() +
        `<div class="auth-layout"><section class="auth-copy"><span class="eyebrow">${t("tag")}</span><h1>${signup ? t("configure") : invitation ? tr("Tu equipo te espera.", "Your team is waiting.") : t("welcome")}</h1><p>${signup ? tr("Cinco minutos para dar forma a tu operación. Un solo espacio para trabajar mejor.", "Five minutes to shape your operation. One workspace to work better.") : t("signin")}</p><div class="auth-feature">◫ ${tr("Solicitudes, equipos e indicadores. Conectados.", "Requests, teams and insights. Connected.")}</div><div class="auth-feature">✦ ${tr("Olivia prepara. Tu equipo decide.", "Olivia prepares. Your team decides.")}</div><span class="auth-note">${t("nocard")}</span></section><section class="panel auth-panel"><div class="eyebrow">SERVICE HUB</div><h2>${signup ? t("signup") : invitation ? tr("Aceptar invitación", "Accept invitation") : t("login")}</h2><form id="auth-form">${signup ? input("name", t("name")) + input("company", t("company")) : ""}${!invitation ? input("email", t("email"), "email") : ""}${input("password", t("password"), "password")}${signup ? `<small>${t("passwordHint")}</small><label class="check"><input name="accepted_terms" type="checkbox" required><span>${t("terms")} <a href="/terms" target="_blank">↗</a></span></label>` : ""}<p id="login-error" role="alert"></p><button class="btn primary">${signup ? t("create") : invitation ? tr("Unirme al equipo ↗", "Join workspace ↗") : t("enter")}</button></form><p class="subtitle">${signup ? `<a href="/login">${t("login")} ↗</a>` : `<a href="/signup">${t("trial")} ↗</a> · <a href="/forgot-password">${tr("Recuperar contraseña", "Forgot password")}</a>`}</p></section></div>` +
        footer();
      const passwordInput = document.querySelector("#password");
      if (!signup && !invitation) {
        passwordInput.removeAttribute("minlength");
        passwordInput.autocomplete = "current-password";
      }
      document.querySelector("#auth-form").onsubmit = safe(async (event) => {
        const body = Object.fromEntries(new FormData(event.target));
        if (signup) {
          body.accepted_terms = true;
          body.language = lang;
        }
        if (invitation) body.token = location.hash.slice(1);
        try {
          const data = await api(
            signup
              ? "/register"
              : invitation
                ? "/invitations/accept"
                : "/login",
            "POST",
            body,
          );
          history.replaceState({}, "", "/");
          await onLogin(data);
        } catch (err) {
          document.querySelector("#login-error").textContent = err.message;
        }
      });
    } else if (
      ["/forgot-password", "/reset-password", "/verify-email"].includes(path)
    ) {
      const verify = path === "/verify-email",
        reset = path === "/reset-password";
      app.innerHTML =
        header() +
        `<section class="panel legal"><h1>${verify ? tr("Confirma tu correo", "Confirm your email") : reset ? tr("Nueva contraseña", "New password") : tr("Recuperar acceso", "Recover access")}</h1><form id="account-form">${verify ? "" : reset ? input("password", t("password"), "password") : input("email", t("email"), "email")}<p id="account-result" role="status"></p><button class="btn primary">${verify ? tr("Confirmar correo", "Confirm email") : reset ? t("save") : tr("Enviar enlace", "Send link")} ↗</button></form></section>` +
        footer();
      document.querySelector("#account-form").onsubmit = safe(async (event) => {
        const body = Object.fromEntries(new FormData(event.target));
        if (verify || reset) body.token = location.hash.slice(1);
        await api(
          verify
            ? "/account/verify"
            : reset
              ? "/account/reset"
              : "/account/recover",
          "POST",
          body,
        );
        history.replaceState({}, "", path);
        document.querySelector("#account-form").innerHTML =
          `<p>${verify ? tr("Correo confirmado.", "Email confirmed.") : reset ? tr("Contraseña actualizada.", "Password updated.") : tr("Si la cuenta existe, recibirás un enlace por correo.", "If the account exists, you will receive an email link.")}</p><a class="btn primary" href="/login">${t("login")} ↗</a>`;
      });
    } else if (["/terms", "/privacy"].includes(path)) {
      app.innerHTML =
        header() +
        `<article class="legal panel"><div class="eyebrow">SERVICE HUB · O7 DIGITAL GROUP</div><h1>${path === "/terms" ? tr("Condiciones de servicio", "Terms of service") : tr("Privacidad", "Privacy")}</h1>${path === "/terms" ? `<h2>${tr("Tu espacio y tu prueba", "Your workspace and trial")}</h2><p>${tr("Prueba gratuita de 7 días desde la creación de tu cuenta. No se requiere tarjeta. Al finalizar, el espacio pasa a modo lectura y los datos se conservan.", "Your free trial lasts 7 days from registration. No card required. At expiry, your workspace becomes read only and your data is retained.")}</p><h2>${tr("Suscripción y renovaciones", "Subscriptions and renewals")}</h2><p>${tr("La licencia de plataforma cuesta 399 USD y se renueva cada 12 meses. El plan de usuarios se factura por adelantado cada 1, 3, 6 o 12 meses según tu selección. Los importes y descuentos se muestran antes de confirmar. No se realiza ningún cargo sin tu consentimiento.", "The platform license costs 399 USD and renews every 12 months. Your user plan is billed in advance every 1, 3, 6 or 12 months, as selected. Amounts and discounts appear before confirmation. No charge is made without consent.")}</p><p>${tr("Puedes cancelar antes de la siguiente renovación desde Suscripción. Una cancelación detiene futuras renovaciones; no elimina inmediatamente tus datos. Los cambios de plan pueden generar ajustes prorrateados que requieren confirmación.", "You can cancel before renewal from Subscription. Cancellation stops future renewals and does not immediately erase your data. Plan changes may result in prorated adjustments that require confirmation.")}</p><h2>${tr("Uso responsable y asistencia IA", "Responsible use and AI assistance")}</h2><p>${tr("Protege tus credenciales y administra los permisos de tu equipo. Las sugerencias de Olivia requieren revisión humana; no sustituyen tu criterio ni se publican automáticamente.", "Protect your credentials and manage your team permissions. Olivia suggestions require human review, do not replace your judgment and are never published automatically.")}</p>` : `<p>${tr("Service Hub trata los datos de tu cuenta, empresa, usuarios, solicitudes y facturación para prestar el servicio. Cada espacio abono mantiene sus propios datos y permisos.", "Service Hub processes account, company, user, request and billing data to provide the service. Each subscriber workspace has separate data and permissions.")}</p><p>${tr("La aplicación y sus datos se alojan en Vercel y Railway/PostgreSQL. Los pagos se procesan mediante Stripe; Service Hub no almacena números de tarjeta. Si utilizas asistencia IA, el contexto autorizado de la solicitud se envía a Olivia.", "The application and its data are hosted on Vercel and Railway/PostgreSQL. Stripe processes payments; Service Hub does not store card numbers. When you use AI assistance, the authorized request context is sent to Olivia.")}</p><p>${tr("Las cookies de sesión son necesarias para iniciar sesión. No se utilizan cookies publicitarias en esta aplicación. Puedes contactar con O7 Digital Group para solicitar acceso, corrección, exportación o eliminación de tus datos. Los plazos de conservación y las obligaciones aplicables deben acordarse antes de la apertura comercial.", "Session cookies are required to sign in. This application uses no advertising cookies. Contact O7 Digital Group to request access, correction, export or deletion of your data. Retention periods and applicable obligations must be agreed before commercial launch.")}</p>`}<p><a href="https://www.o7digitalgroup.com/">O7 Digital Group ↗</a></p></article>` +
        footer();
    } else {
      app.innerHTML =
        header() +
        `<section class="commercial-hero"><div class="commercial-hero-copy"><div class="eyebrow"><span class="live-dot"></span> ${t("tag")}</div><h1>${t("headline")}</h1><p>${t("intro")}</p><div class="actions"><a class="btn lime" href="/signup">${t("trial")} ↗</a><a class="btn" href="/login">${t("login")}</a></div><small>${t("nocard")}</small></div><div class="product-map"><div class="product-map-header"><span class="mini-logo">S</span><div><b>Service Hub</b><small>${tr("Tu centro de operaciones", "Your operations center")}</small></div><span class="map-dot"></span></div><div class="map-ticket"><span class="eyebrow">01 · ${tr("CAPTURA", "CAPTURE")}</span><h3>${tr("Cada solicitud, con contexto.", "Every request, with context.")}</h3><p>${tr("Formularios propios · Clientes · Contactos", "Custom forms · Customers · Contacts")}</p></div><div class="map-connector">↓</div><div class="map-ticket"><span class="eyebrow">02 · ${tr("COORDINA", "COORDINATE")}</span><h3>${tr("El equipo correcto. El paso claro.", "The right team. A clear next step.")}</h3><p>Workflows · SLA · Olivia IA</p></div><div class="map-connector">↓</div><div class="map-ticket map-ticket-last"><span class="eyebrow">03 · ${tr("MEJORA", "IMPROVE")}</span><h3>${tr("Decisiones con perspectiva.", "Decisions with perspective.")}</h3><p>Dashboards · ${tr("Informes · Seguimiento", "Reports · Follow-up")}</p></div></div></section><section class="commercial-values">${[
          [
            tr("A tu manera.", "Your way."),
            tr(
              "Configura servicios, formularios y etapas desde tu espacio.",
              "Configure services, forms and stages from your workspace.",
            ),
          ],
          [
            tr("Tu información, conectada.", "Your information, connected."),
            tr(
              "Solicitudes, clientes y equipo en un solo lugar.",
              "Requests, customers and your team in one place.",
            ),
          ],
          [
            tr("Empieza con lo que tienes.", "Start with what you have."),
            tr(
              "Importa desde CSV o Excel y adopta el sistema a tu ritmo.",
              "Import CSV or Excel and adopt the system at your pace.",
            ),
          ],
        ]
          .map(
            ([a, b]) =>
              `<article><span>↗</span><h3>${a}</h3><p>${b}</p></article>`,
          )
          .join(
            "",
          )}</section><section class="commercial-pricing" id="pricing"><div class="row"><div><span class="eyebrow">${tr("CRECE CON TU EQUIPO", "GROW WITH YOUR TEAM")}</span><h2>${t("pricing")}</h2></div><div class="license-note"><b>${t("license")}</b><p>${t("licenseDetail")}</p></div></div><div id="public-plans" class="plan-grid"><p>${t("loading")}</p></div><p class="subtitle">${tr("Más de 50 usuarios: una propuesta a tu medida.", "More than 50 users: a plan tailored to you.")} <a href="https://www.o7digitalgroup.com/">O7 Digital Group ↗</a></p></section>` +
        footer();
      bindLanguage(publicPage);
      const plansTarget = document.querySelector("#public-plans");
      try {
        const { plans } = await api("/plans");
        plansTarget.innerHTML = plans
          .map(
            (p) =>
              `<article class="panel plan-card"><span class="eyebrow">${e(p.name)}</span><h3>${p.seat_limit} <small>${tr("usuarios", "users")}</small></h3><div class="plan-price">${p.monthly_cents ? money(p.monthly_cents) : tr("Próximamente", "Coming soon")}</div><p>${p.monthly_cents ? tr("al mes + licencia anual", "per month + annual license") : tr("Tarifa pendiente de publicación", "Pricing pending publication")}</p><p>✦ ${p.ai_limit} ${tr("consultas IA / mes", "AI requests / month")}</p><a class="btn ${p.seat_limit === 10 ? "primary" : ""}" href="/signup">${t("trial")} ↗</a></article>`,
          )
          .join("");
        if (path === "/pricing")
          document.querySelector("#pricing").scrollIntoView();
      } catch (err) {
        notify(err.message);
      }
    }
    bindLanguage(publicPage);
  }
  function logoPicker(url) {
    return `<div class="logo-picker"><label for="logo-file">${tr("Logo de tu empresa", "Company logo")}</label><img id="logo-preview" class="logo-preview" ${url ? `src="${e(url)}"` : "hidden"} alt="${tr("Tu logo", "Your logo")}"><input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG, WebP · ${tr("máximo 1 MB", "up to 1 MB")}</small><p id="logo-status" role="status"></p><button type="button" class="btn" id="remove-logo" ${url ? "" : "hidden"}>${tr("Quitar logo", "Remove logo")}</button></div>`;
  }
  function bindLogoPicker(el, settings) {
    const fileInput = el.querySelector("#logo-file");
    if (!fileInput) return;
    let busy = false;
    const run = async (callback) => {
      if (busy) return;
      busy = true;
      const buttons = [
        ...el.querySelectorAll(
          "#wizard .wizard-actions button,.sticky-save button",
        ),
      ].map((button) => ({ button, disabled: button.disabled }));
      buttons.forEach(({ button }) => (button.disabled = true));
      fileInput.disabled = true;
      const remove = el.querySelector("#remove-logo");
      remove.disabled = true;
      try {
        await callback();
      } catch (err) {
        notify(err.message);
        el.querySelector("#logo-status").textContent = err.message;
      } finally {
        busy = false;
        fileInput.disabled = false;
        remove.disabled = false;
        fileInput.value = "";
        buttons.forEach(({ button, disabled }) => (button.disabled = disabled));
      }
    };
    fileInput.onchange = () =>
      run(async () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (
          !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          file.size > 1000000
        )
          throw new Error(
            tr(
              "Selecciona un PNG, JPG o WebP de hasta 1 MB",
              "Choose a PNG, JPG or WebP up to 1 MB",
            ),
          );
        el.querySelector("#logo-status").textContent = tr(
          "Guardando logo…",
          "Saving logo…",
        );
        const encoded = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = () =>
            reject(
              new Error(
                tr("No se pudo leer la imagen", "Could not read image"),
              ),
            );
          reader.readAsDataURL(file);
        });
        const { url } = await api("/workspace/logo", "PUT", {
          file: encoded,
          type: file.type,
        });
        settings.logo = url;
        if (getWorkspace()) getWorkspace().settings.logo = url;
        if (!document.querySelector(".workspace-logo")) {
          const brand = document.querySelector(".shell>aside>.brand");
          if (brand) {
            const img = document.createElement("img");
            img.className = "workspace-logo";
            img.alt = "";
            img.src = url;
            brand.prepend(img);
          }
        }
        const preview = el.querySelector("#logo-preview");
        preview.src = url;
        preview.hidden = false;
        el.querySelector("#remove-logo").hidden = false;
        document
          .querySelectorAll(".workspace-logo")
          .forEach((img) => (img.src = url));
        el.querySelector("#logo-status").textContent = tr(
          "Logo guardado",
          "Logo saved",
        );
      });
    el.querySelector("#remove-logo").onclick = () =>
      run(async () => {
        await api("/workspace/logo", "DELETE");
        settings.logo = "";
        if (getWorkspace()) getWorkspace().settings.logo = "";
        el.querySelector("#logo-preview").hidden = true;
        el.querySelector("#remove-logo").hidden = true;
        document
          .querySelectorAll(".workspace-logo")
          .forEach((img) => img.remove());
        el.querySelector("#logo-status").textContent = tr(
          "Logo eliminado",
          "Logo removed",
        );
      });
  }
  async function onboarding(el) {
    let step = 0;
    const data = await api("/workspace"),
      { templates } = await api("/templates");
    let current = {
      name: data.workspace.name,
      settings: structuredClone(data.workspace.settings),
    };
    const steps = tr(
      ["Tu empresa", "Tu modelo", "Tu equipo", "Tu servicio", "Todo listo"],
      ["Company", "Template", "Team", "Service", "Ready"],
    );
    async function draw() {
      el.innerHTML = `<div class="onboarding-heading"><div class="eyebrow">${tr("BIENVENIDO A SERVICE HUB", "WELCOME TO SERVICE HUB")}</div><h1>${t("configure")}</h1><p class="subtitle">${t("onboarding")}</p></div><div class="wizard-steps">${steps.map((label, i) => `<span class="${i === step ? "current" : i < step ? "done" : ""}"><b>${i < step ? "✓" : i + 1}</b>${label}</span>`).join("")}</div><div class="panel wizard-panel"><form id="wizard"><div id="wizard-content"></div><div class="wizard-actions">${step ? `<button type="button" class="btn" id="wizard-back">${t("back")}</button>` : ""}<button class="btn primary">${step === 4 ? t("finish") : t("next")}</button></div></form></div>`;
      const content = el.querySelector("#wizard-content");
      if (step === 0)
        content.innerHTML = `<h2>${tr("Un espacio con tu identidad.", "A workspace with your identity.")}</h2>${input("business", t("company"), "text", current.name)}${input("sector", tr("Sector de actividad", "Industry"), "text", current.settings.sector, false)}${logoPicker(current.settings.logo)}<div class="field-row"><div><label for="workspace-language">${tr("Idioma", "Language")}</label><select id="workspace-language">${Object.entries(
          languages,
        )
          .filter(([code]) => translations[code])
          .map(
            ([code, label]) =>
              `<option value="${code}" ${current.settings.language === code ? "selected" : ""}>${label}</option>`,
          )
          .join(
            "",
          )}</select></div><div>${input("timezone", tr("Zona horaria", "Time zone"), "text", current.settings.timezone)}</div></div>`;
      if (step === 1)
        content.innerHTML = `<h2>${tr("Empieza con una buena base.", "Start with a good foundation.")}</h2><p class="subtitle">${tr("Podrás cambiar todos los ajustes después.", "You can change every setting later.")}</p><div class="template-grid">${templates.map((template, i) => `<label class="template-option"><input type="radio" name="template" value="${e(template.id)}" ${i === 0 ? "checked" : ""}><b>${e(template.name)}</b><small>${e((template.settings.categories || []).join(" · "))}</small></label>`).join("")}</div>`;
      if (step === 2) {
        content.innerHTML = `<h2>${tr("Trabajar bien empieza juntos.", "Good work starts together.")}</h2><p>${tr("Crea tu primer equipo. Podrás invitar colaboradores desde Configuración. Tu prueba incluye hasta 5 usuarios.", "Create your first team. Invite collaborators from Settings. Your trial includes up to 5 users.")}</p>${input("team", tr("Nombre del equipo (opcional)", "Team name (optional)"), "text", "", false)}<div class="notice">${e(getUser().name)} · ${tr("Administrador del espacio", "Workspace administrator")}</div>`;
      }
      if (step === 3)
        content.innerHTML = `<h2>${tr("Tu primer servicio, listo.", "Your first service, ready.")}</h2><label for="categories">${tr("Servicios y categorías (una por línea)", "Services and categories (one per line)")}</label><textarea id="categories" rows="5" required>${e(current.settings.categories.join("\n"))}</textarea><label for="sites">${tr("Sedes (una por línea)", "Sites (one per line)")}</label><textarea id="sites" rows="2">${e(current.settings.sites.join("\n"))}</textarea><p class="subtitle">${tr("Se inicia con cuatro etapas: abierto, en curso, resuelto y cerrado. Personaliza etapas, formularios y SLA en Configuración.", "Start with four stages: open, in progress, resolved and closed. Customize stages, forms and SLAs in Settings.")}</p>`;
      if (step === 4)
        content.innerHTML = `<div class="wizard-ready"><div class="ready-icon">↗</div><h2>${tr("Todo empieza aquí.", "It all starts here.")}</h2><p>${e(current.name)} · ${current.settings.categories.length} ${tr("servicios configurados", "services configured")}</p><p>${tr("Crea tu primera solicitud, invita a tu equipo o importa tus clientes. Tu espacio ya está conectado.", "Create your first request, invite your team or import your customers. Your workspace is connected.")}</p><div class="notice">${t("nocard")}</div></div>`;
      if (step === 0) bindLogoPicker(el, current.settings);
      el.querySelector("#wizard-back")?.addEventListener("click", () => {
        step--;
        draw();
      });
      el.querySelector("#wizard").onsubmit = safe(async (event) => {
        if (step === 0) {
          current.name = el.querySelector("#business").value;
          current.settings = {
            ...current.settings,
            sector: el.querySelector("#sector").value,
            logo: current.settings.logo,
            timezone: el.querySelector("#timezone").value,
            language: el.querySelector("#workspace-language").value,
          };
        }
        if (step === 1) {
          const selected = templates.find(
            (t) => t.id === new FormData(event.target).get("template"),
          );
          const identity = {
            logo: current.settings.logo,
            sector: current.settings.sector,
            language: current.settings.language,
            timezone: current.settings.timezone,
          };
          current.settings = {
            ...current.settings,
            ...selected.settings,
            ...identity,
          };
        }
        if (step === 2) {
          const team = el.querySelector("#team").value.trim();
          if (team) await api("/teams", "POST", { name: team });
        }
        if (step === 3) {
          current.settings.categories = el
            .querySelector("#categories")
            .value.split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          current.settings.sites = el
            .querySelector("#sites")
            .value.split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        await api("/workspace", "PUT", {
          ...current,
          onboarding_completed: step === 4,
        });
        if (step === 4) {
          lang = current.settings.language;
          localStorage.setItem("servicehub-language", lang);
          history.replaceState({}, "", "/");
          await reload();
        } else {
          step++;
          await draw();
        }
      });
    }
    await draw();
  }
  async function settings(el) {
    const data = await api("/workspace"),
      w = data.workspace;
    let fields = structuredClone(w.settings.fields),
      workflow = structuredClone(w.settings.workflow),
      rules = structuredClone(w.settings.rules),
      escalations = structuredClone(w.settings.escalations);
    const [{ users }, { companies: customerCompanies }, integrations] =
      await Promise.all([
        api("/users"),
        api("/companies"),
        api("/integrations"),
      ]);
    el.innerHTML = `<div class="row"><div><div class="eyebrow">${tr("A TU MANERA", "YOUR WAY")}</div><h1>${t("settings")}</h1><p class="subtitle">${tr("Tus cambios se aplican a las solicitudes reales.", "Your changes apply to real requests.")}</p></div></div><section class="panel config-assistant"><div class="eyebrow">OLIVIA IA · ${w.ai_used} / ${w.ai_limit}</div><h2>${tr("Dale forma a tu servicio con Olivia.", "Shape your service with Olivia.")}</h2><p>${tr("Describe tu operación. Revisa los servicios y campos sugeridos antes de aplicar cualquier cambio.", "Describe your operation. Review suggested services and fields before applying any changes.")}</p><label for="configuration-goal">${tr("¿Cómo trabaja tu equipo?", "How does your team work?")}</label><textarea id="configuration-goal" maxlength="1000" rows="2" ${integrations.olivia.configured ? "" : "disabled"}></textarea><button type="button" class="btn" id="suggest-configuration" ${integrations.olivia.configured ? "" : "disabled"}>${tr("Preparar propuesta con Olivia", "Prepare proposal with Olivia")} ✦</button>${!integrations.olivia.configured ? `<p class="subtitle">${tr("La asistencia IA todavía no está disponible para este espacio. Puedes configurar todo manualmente.", "AI assistance is not yet available for this workspace. You can configure everything manually.")}</p>` : ""}<div id="configuration-proposal"></div></section><form id="workspace-settings"><div class="settings-grid"><section class="panel"><h2>${tr("Identidad y organización", "Identity and organization")}</h2>${input("business", t("company"), "text", w.name)}${input("sector", tr("Sector", "Industry"), "text", w.settings.sector, false)}${logoPicker(w.settings.logo)}${input("timezone", tr("Zona horaria", "Time zone"), "text", w.settings.timezone)}<label>${tr("Idioma del espacio", "Workspace language")}<select id="workspace-language">${Object.entries(
      languages,
    )
      .filter(([code]) => translations[code])
      .map(
        ([code, label]) =>
          `<option value="${code}" ${w.settings.language === code ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label>${["categories", "departments", "sites"].map((key, i) => `<label for="config-${key}">${tr(["Servicios / categorías", "Departamentos", "Sedes"][i], ["Services / categories", "Departments", "Sites"][i])}</label><textarea id="config-${key}" rows="3">${e(w.settings[key].join("\n"))}</textarea>`).join("")}</section><section class="panel"><h2>SLA · ${tr("Horas de atención", "Service hours")}</h2>${Object.entries(
      w.settings.sla,
    )
      .map(([p, h]) => input("sla-" + p, p, "number", h))
      .join(
        "",
      )}<h3>${tr("Tu dashboard", "Your dashboard")}</h3>${["active", "critical", "overdue", "sla_percent", "total", "resolved"].map((key, i) => `<label class="check"><input type="checkbox" data-metric="${key}" ${w.settings.dashboard.includes(key) ? "checked" : ""}>${tr(["Activas", "Críticas", "Vencidas", "Cumplimiento SLA", "Total", "Resueltas"][i], ["Active", "Critical", "Overdue", "SLA compliance", "Total", "Resolved"][i])}</label>`).join("")}<p class="notice">${tr("Los SLA se calculan en horas corridas. Los cambios se aplican a nuevas solicitudes y reclasificaciones.", "SLAs use elapsed hours. Changes apply to new requests and reclassifications.")}</p></section><section class="panel"><h2>${tr("Constructor de formularios", "Form builder")}</h2><p>${tr("Añade campos a todas las solicitudes de tu espacio.", "Add fields to every request in your workspace.")}</p><div id="fields-builder"></div><button type="button" class="btn" id="add-field">+ ${tr("Añadir campo", "Add field")}</button></section><section class="panel"><h2>${tr("Etapas de trabajo", "Workflow stages")}</h2><p>${tr("Define nombres, orden y el estado operativo de cada etapa.", "Define the name, order and operational state of each stage.")}</p><div id="workflow-builder"></div><button type="button" class="btn" id="add-stage">+ ${tr("Añadir etapa", "Add stage")}</button></section><section class="panel"><h2>${tr("Reglas de asignación", "Assignment rules")}</h2><p>${tr("La primera regla que coincide asigna al técnico y puede enviar una notificación.", "The first matching rule assigns the technician and can send a notification.")}</p><div id="rules-builder"></div><button type="button" class="btn" id="add-rule">+ ${tr("Añadir regla", "Add rule")}</button></section><section class="panel"><h2>${tr("Escalaciones de SLA", "SLA escalations")}</h2><p>${tr("Cuando un SLA lleva el tiempo indicado vencido, asigna al técnico seleccionado. La regla requiere tu aprobación al guardar.", "When an SLA is overdue for the specified time, assign the selected technician. Saving the configuration approves the rule.")}</p><div id="escalations-builder"></div><button type="button" class="btn" id="add-escalation">+ ${tr("Añadir escalación", "Add escalation")}</button></section><section class="panel"><h2>${tr("Equipos y colaboradores", "Teams and collaborators")}</h2><div id="teams-list">${data.teams.map((team) => `<p>${e(team.name)}</p>`).join("") || tr("Sin equipos todavía", "No teams yet")}</div><button type="button" class="btn" id="new-team">+ ${tr("Crear equipo", "Create team")}</button><button type="button" class="btn" id="invite">+ ${tr("Invitar colaborador", "Invite teammate")}</button><div id="invitations-list"></div><h3>${tr("Roles y equipos", "Roles and teams")}</h3><div id="membership-list"><button type="button" class="btn" data-view="team">${tr("Gestionar roles y colaboradores", "Manage roles and collaborators")} ↗</button>${users
      .filter((u) => u.id !== getUser().id && u.role !== "platform_admin")
      .map(
        (u) =>
          `<div class="builder-row" data-member="${u.id}"><b data-user-content>${e(u.name)}</b><small data-user-content>${e(u.role_name || u.role)}</small><select data-member-team aria-label="Team"><option value="">—</option>${data.teams.map((team) => `<option value="${team.id}" ${team.id === u.team_id ? "selected" : ""}>${e(team.name)}</option>`).join("")}</select><button type="button" class="btn" data-save-member="${u.id}">${t("save")}</button></div>`,
      )
      .join(
        "",
      )}</div></section></div><div class="sticky-save"><span>${tr("Configuración validada y guardada en tu espacio.", "Configuration validated and saved in your workspace.")}</span><button class="btn primary">${t("save")} ↗</button></div></form>`;
    el.querySelector("#suggest-configuration").onclick = safe(async () => {
      const { proposal } = await api("/workspace/suggestions", "POST", {
        goal: el.querySelector("#configuration-goal").value,
      });
      const panel = el.querySelector("#configuration-proposal");
      panel.innerHTML = `<h3>${tr("Revisa antes de aplicar", "Review before applying")}</h3><p>${proposal.categories.map(e).join(" · ")}</p><ul>${proposal.fields.map((f) => `<li>${e(f.label)} · ${e(f.type)}${f.required ? " *" : ""}</li>`).join("")}</ul><label class="check"><input type="checkbox" id="approve-configuration">${tr("Revisé los campos y autorizo reemplazar los servicios y el formulario de mi espacio.", "I reviewed the fields and approve replacing my workspace services and form.")}</label><button type="button" class="btn primary" id="apply-configuration">${tr("Aplicar propuesta revisada", "Apply reviewed proposal")} ↗</button>`;
      panel.querySelector("#apply-configuration").onclick = safe(async () => {
        await api("/workspace/suggestions/" + proposal.id + "/apply", "POST", {
          approved: panel.querySelector("#approve-configuration").checked,
        });
        notify(t("saveSuccess"));
        await reload("settings");
      });
    });
    bindLogoPicker(el, w.settings);
    function drawFields() {
      el.querySelector("#fields-builder").innerHTML = fields
        .map(
          (f, i) =>
            `<div class="builder-row" data-field="${i}"><input data-property="label" aria-label="Label" value="${e(f.label)}" placeholder="${tr("Nombre del campo", "Field label")}"><input data-property="key" aria-label="Key" value="${e(f.key)}" placeholder="field_key"><select data-property="type" aria-label="Type">${["text", "number", "date", "select", "checkbox"].map((type) => `<option ${f.type === type ? "selected" : ""}>${type}</option>`).join("")}</select><input data-property="options" aria-label="Options" placeholder="${tr("Opciones separadas por coma", "Comma-separated options")}" value="${e((f.options || []).join(","))}"><label class="check"><input data-property="required" type="checkbox" ${f.required ? "checked" : ""}>${tr("Obligatorio", "Required")}</label><button type="button" class="btn" data-remove-field="${i}" aria-label="Remove">×</button></div>`,
        )
        .join("");
    }
    function readFields() {
      fields = [...el.querySelectorAll("[data-field]")].map((row) => {
        const get = (k) => row.querySelector(`[data-property="${k}"]`);
        return {
          key: get("key").value,
          label: get("label").value,
          type: get("type").value,
          required: get("required").checked,
          ...(get("type").value === "select"
            ? {
                options: get("options")
                  .value.split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : {}),
        };
      });
    }
    function drawStages() {
      el.querySelector("#workflow-builder").innerHTML = workflow
        .map(
          (w, i) =>
            `<div class="builder-row stage-row" data-stage="${i}"><span>${i + 1}</span><input aria-label="Stage name" value="${e(w.name)}"><select aria-label="Stage state">${["Abierto", "En curso", "Resuelto", "Cerrado"].map((s) => `<option ${w.state === s ? "selected" : ""}>${s}</option>`).join("")}</select><button class="btn" type="button" data-up-stage="${i}" aria-label="Move up">↑</button><button class="btn" type="button" data-remove-stage="${i}" aria-label="Remove">×</button></div>`,
        )
        .join("");
    }
    function readStages() {
      workflow = [...el.querySelectorAll("[data-stage]")].map((row) => ({
        name: row.querySelector("input").value,
        state: row.querySelector("select").value,
      }));
    }
    function drawRules() {
      el.querySelector("#rules-builder").innerHTML = rules
        .map(
          (r, i) =>
            `<div class="builder-row" data-rule="${i}"><select aria-label="Category">${w.settings.categories.map((c) => `<option ${r.category === c ? "selected" : ""}>${e(c)}</option>`).join("")}</select><select aria-label="Agent"><option value="">${tr("Técnico", "Technician")}</option>${users
              .filter((u) => u.role === "agent" && u.active)
              .map(
                (u) =>
                  `<option value="${u.id}" ${r.agent_id === u.id ? "selected" : ""}>${e(u.name)}</option>`,
              )
              .join(
                "",
              )}</select><label class="check"><input type="checkbox" ${r.notify ? "checked" : ""}>${tr("Notificar", "Notify")}</label><button type="button" class="btn" data-remove-rule="${i}" aria-label="Remove">×</button></div>`,
        )
        .join("");
    }
    function readRules() {
      rules = [...el.querySelectorAll("[data-rule]")].map((row) => ({
        category: row.querySelectorAll("select")[0].value,
        agent_id: Number(row.querySelectorAll("select")[1].value),
        notify: row.querySelector("input").checked,
      }));
    }
    function drawEscalations() {
      el.querySelector("#escalations-builder").innerHTML = escalations
        .map(
          (r, i) =>
            `<div class="builder-row" data-escalation="${i}"><label>${tr("Prioridad", "Priority")}<select data-esc="priority">${["Baja", "Media", "Alta", "Crítica"].map((p) => `<option ${p === r.priority ? "selected" : ""}>${e(p)}</option>`).join("")}</select></label><label>${tr("Horas después del SLA", "Hours after SLA")}<input data-esc="hours" type="number" step="0.25" min="0.25" value="${r.after_hours}"></label><select data-esc="agent" aria-label="Agent"><option value="">—</option>${users
              .filter((u) => u.role === "agent" && u.active)
              .map(
                (u) =>
                  `<option value="${u.id}" ${u.id === r.agent_id ? "selected" : ""}>${e(u.name)}</option>`,
              )
              .join(
                "",
              )}</select><label class="check"><input data-esc="notify" type="checkbox" ${r.notify ? "checked" : ""}>${tr("Notificar", "Notify")}</label><button type="button" class="btn" data-remove-escalation="${i}">×</button></div>`,
        )
        .join("");
    }
    function readEscalations() {
      escalations = [...el.querySelectorAll("[data-escalation]")].map(
        (row) => ({
          priority: row.querySelector("[data-esc=priority]").value,
          after_hours: Number(row.querySelector("[data-esc=hours]").value),
          agent_id: Number(row.querySelector("[data-esc=agent]").value),
          notify: row.querySelector("[data-esc=notify]").checked,
        }),
      );
    }
    drawFields();
    drawStages();
    drawRules();
    drawEscalations();
    el.querySelector("#add-escalation").onclick = () => {
      readEscalations();
      escalations.push({
        priority: "Alta",
        after_hours: 1,
        agent_id: 0,
        notify: false,
      });
      drawEscalations();
    };
    el.querySelector("#escalations-builder").onclick = (event) => {
      const b = event.target.closest("[data-remove-escalation]");
      if (b) {
        readEscalations();
        escalations.splice(Number(b.dataset.removeEscalation), 1);
        drawEscalations();
      }
    };
    el.querySelector("#add-field").onclick = () => {
      readFields();
      fields.push({
        key: "field_" + (fields.length + 1),
        label: "",
        type: "text",
        required: false,
      });
      drawFields();
    };
    el.querySelector("#add-stage").onclick = () => {
      readStages();
      workflow.push({ name: "", state: "En curso" });
      drawStages();
    };
    el.querySelector("#add-rule").onclick = () => {
      readRules();
      rules.push({
        category: w.settings.categories[0],
        agent_id: 0,
        notify: false,
      });
      drawRules();
    };
    el.onclick = (event) => {
      const b = event.target.closest("button");
      if (!b) return;
      for (const [key, list, read, draw] of [
        ["removeField", fields, readFields, drawFields],
        ["removeStage", workflow, readStages, drawStages],
        ["removeRule", rules, readRules, drawRules],
      ])
        if (key in b.dataset) {
          read();
          const index = Number(b.dataset[key]);
          if (key === "removeField") fields.splice(index, 1);
          if (key === "removeStage") workflow.splice(index, 1);
          if (key === "removeRule") rules.splice(index, 1);
          draw();
        }
      if ("upStage" in b.dataset) {
        readStages();
        const i = Number(b.dataset.upStage);
        if (i > 0)
          [workflow[i - 1], workflow[i]] = [workflow[i], workflow[i - 1]];
        drawStages();
      }
    };
    el.querySelector("#workspace-settings").onsubmit = safe(async () => {
      readFields();
      readStages();
      readRules();
      readEscalations();
      const settings = {
        ...w.settings,
        fields,
        workflow,
        rules,
        escalations,
        sector: el.querySelector("#sector").value,
        logo: w.settings.logo,
        timezone: el.querySelector("#timezone").value,
        language: el.querySelector("#workspace-language").value,
      };
      for (const key of ["categories", "departments", "sites"])
        settings[key] = el
          .querySelector("#config-" + key)
          .value.split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      for (const p of Object.keys(settings.sla))
        settings.sla[p] = Number(
          el.querySelector('[id="sla-' + p + '"]').value,
        );
      settings.dashboard = [
        ...el.querySelectorAll("[data-metric]:checked"),
      ].map((n) => n.dataset.metric);
      await api("/workspace", "PUT", {
        name: el.querySelector("#business").value,
        settings,
      });
      notify(t("saveSuccess"));
      await reload("settings");
    });
    el.querySelector("#new-team").onclick = safe(async () => {
      const name = prompt(tr("Nombre del equipo", "Team name"));
      if (name) {
        await api("/teams", "POST", { name });
        await settingsView();
      }
    });
    const settingsView = () => settings(el);
    el.querySelector("#invite").onclick = () => invite(el, data.teams);
    const invites = await api("/invitations");
    el.querySelector("#invitations-list").innerHTML = invites.invitations
      .filter((i) => !i.accepted_at)
      .map(
        (i) =>
          `<p>${e(i.email)} · ${e(i.role)} <button type="button" class="btn" data-cancel-invite="${i.id}">×</button></p>`,
      )
      .join("");
    el.querySelectorAll("[data-cancel-invite]").forEach(
      (b) =>
        (b.onclick = safe(async () => {
          await api("/invitations/" + b.dataset.cancelInvite, "DELETE");
          await settings(el);
        })),
    );
    el.querySelectorAll("[data-save-member]").forEach(
      (button) =>
        (button.onclick = safe(async () => {
          const row = button.closest("[data-member]");
          await api("/users/" + button.dataset.saveMember + "/team", "PUT", {
            team_id:
              Number(row.querySelector("[data-member-team]").value) || null,
          });
          notify(t("saveSuccess"));
        })),
    );
    bindUserLanguage();
  }
  async function invite(el, teams) {
    const [{ companies }, catalog] = await Promise.all([
      api("/companies"),
      api("/staff/catalog"),
    ]);
    const section = document.createElement("section");
    section.className = "panel invite-panel";
    section.innerHTML = `<h2>${tr("Invita a tu equipo", "Invite your team")}</h2><form id="invite-form">${input("invite-name", t("name"))}${input("invite-email", t("email"), "email")}<label>${tr("Rol", "Role")}<select id="invite-role">${catalog.roles.map((r) => `<option value="custom:${r.id}" data-profile="${r.base_role}" ${r.base_role === "agent" ? "selected" : ""}>${e(r.name)}</option>`).join("")}<option value="legacy:client" data-profile="client">${tr("Cliente", "Customer")}</option></select></label><label>${tr("Departamento", "Department")}<select id="invite-department"><option value="">—</option>${catalog.departments.map((d) => `<option value="${d.id}">${e(d.name)}</option>`).join("")}</select></label>${input("invite-specialty", tr("Especialidad / función (libre)", "Specialty / function (free text)"), "text", "", false)}<label>${tr("Cliente", "Customer")}<select id="invite-company"><option value="">—</option>${companies.map((c) => `<option value="${c.id}">${e(c.name)}</option>`).join("")}</select></label><label>${tr("Equipo", "Team")}<select id="invite-team"><option value="">—</option>${teams.map((c) => `<option value="${c.id}">${e(c.name)}</option>`).join("")}</select></label><p class="notice">${tr("La invitación se enviará por correo cuando el servicio de correo esté configurado. Caduca en 72 horas.", "The invitation will be emailed when the email service is configured. Expires in 72 hours.")}</p><button class="btn primary">${tr("Enviar invitación", "Send invitation")} ↗</button><button type="button" class="btn" id="cancel-invite">${tr("Cancelar", "Cancel")}</button></form>`;
    el.prepend(section);
    section.scrollIntoView();
    const updateInviteRole = () => {
      section.querySelector("#invite-department").required =
        section.querySelector("#invite-role").selectedOptions[0].dataset
          .profile === "manager";
    };
    section.querySelector("#invite-role").onchange = updateInviteRole;
    updateInviteRole();
    section.querySelector("#cancel-invite").onclick = () => section.remove();
    section.querySelector("form").onsubmit = safe(async () => {
      await api("/invitations", "POST", {
        name: section.querySelector("#invite-name").value,
        email: section.querySelector("#invite-email").value,
        role: section.querySelector("#invite-role").selectedOptions[0].dataset
          .profile,
        role_id: section
          .querySelector("#invite-role")
          .value.startsWith("custom:")
          ? Number(section.querySelector("#invite-role").value.split(":")[1])
          : null,
        department_id:
          Number(section.querySelector("#invite-department").value) || null,
        specialty: section.querySelector("#invite-specialty").value,
        company_id:
          Number(section.querySelector("#invite-company").value) || null,
        team_id: Number(section.querySelector("#invite-team").value) || null,
      });
      notify(
        tr(
          "Invitación guardada en la cola de correo",
          "Invitation saved to email queue",
        ),
      );
      await settings(el);
    });
  }
  async function billing(el) {
    const [b, { plans }] = await Promise.all([api("/billing"), api("/plans")]);
    let months = 1;
    el.innerHTML = `<div class="eyebrow">${tr("CRECE SIN PERDER EL RITMO", "GROW WITHOUT MISSING A BEAT")}</div><h1>${t("billing")}</h1><div class="subscription-summary panel"><div><span class="eyebrow">${e({ trialing: tr("Prueba gratuita", "Free trial"), active: tr("Suscripción activa", "Active subscription"), past_due: tr("Pago pendiente", "Payment pending"), suspended: tr("Suspendido", "Suspended"), canceled: tr("Cancelado", "Canceled") }[b.status] || b.status)}</span><h2>${b.status === "trialing" ? t("trialStatus") : tr("Tu espacio Service Hub", "Your Service Hub workspace")}</h2><p>${tr("Fin de prueba", "Trial ends")}: ${new Date(b.trial_ends_at).toLocaleString(lang)} · ${b.seat_limit} ${tr("usuarios", "users")}</p>${b.next_billing_at ? `<p>${tr("Próxima facturación", "Next billing")}: ${new Date(b.next_billing_at).toLocaleDateString(lang)}</p>` : ""}${b.cancel_at_period_end ? `<p>${tr("Cancelación al final del periodo", "Cancellation at period end")}</p>` : ""}</div>${b.plan_id ? `<button class="btn" id="billing-portal">${t("manage")} ↗</button>` : ""}</div><div class="license-note"><b>${t("license")}</b><p>${t("licenseDetail")}</p></div><div class="billing-periods">${[
      [1, "monthly"],
      [3, "quarterly"],
      [6, "semester"],
      [12, "annual"],
    ]
      .map(
        ([m, key]) =>
          `<button class="btn ${m === 1 ? "primary" : ""}" data-months="${m}">${t(key)}</button>`,
      )
      .join(
        "",
      )}</div><div id="billing-plans" class="plan-grid"></div><p class="notice">${tr("Ambos conceptos se renuevan automáticamente. Cancela antes de la renovación desde tu suscripción. Los cambios de plan pueden generar ajustes prorrateados.", "Both charges renew automatically. Cancel before renewal from your subscription. Plan changes may result in prorated adjustments.")}</p><label class="check"><input id="billing-consent" type="checkbox">${t("billingConsent")}</label>${!b.configured ? `<p class="notice">${tr("La facturación está en preparación. Contacta con O7 Digital Group.", "Billing is being prepared. Contact O7 Digital Group.")}</p>` : ""}<section class="panel"><h2>${tr("Historial de facturas", "Invoice history")}</h2>${b.invoices.length ? b.invoices.map((i) => `<p>${e(i.status)} · ${money(i.amount_paid)} ${i.hosted_url ? `<a href="${e(i.hosted_url)}" target="_blank" rel="noopener noreferrer">${tr("Ver factura", "View invoice")} ↗</a>` : ""}</p>`).join("") : `<p class="subtitle">${tr("Aún no hay facturas.", "No invoices yet.")}</p>`}</section>`;
    function draw() {
      el.querySelector("#billing-plans").innerHTML = plans
        .map((p) => {
          const amount = p.monthly_cents
            ? Math.round(
                p.monthly_cents *
                  months *
                  (1 - (p.discounts[months] || 0) / 100),
              )
            : null;
          return `<article class="panel plan-card"><span class="eyebrow">${e(p.name)}</span><h3>${p.seat_limit} <small>${tr("usuarios", "users")}</small></h3><div class="plan-price">${amount ? money(amount) : tr("Próximamente", "Coming soon")}</div><p>${tr("cada", "every")} ${months} ${tr("mes(es), por adelantado", "month(s), in advance")}</p><p>+ ${money(39900)} / ${tr("año", "year")}</p><p>✦ ${p.ai_limit} ${tr("consultas IA / mes", "AI requests / month")}</p>${amount ? `<small>${tr("Primer importe conjunto", "First combined amount")}: ${money(amount + 39900)}</small>` : ""}<button class="btn primary" data-plan="${e(p.id)}" ${!b.configured || !amount ? "disabled" : ""}>${b.plan_id ? tr("Cambiar plan", "Change plan") : t("choose")} ↗</button></article>`;
        })
        .join("");
      el.querySelectorAll("[data-plan]").forEach(
        (button) =>
          (button.onclick = safe(async () => {
            if (!el.querySelector("#billing-consent").checked)
              throw new Error(t("billingConsent"));
            const body = {
              plan_id: button.dataset.plan,
              months,
              accepted_terms: true,
            };
            if (b.plan_id) {
              await api("/billing/change-plan", "POST", body);
              notify(tr("Cambio solicitado", "Change requested"));
              await billing(el);
            } else {
              const { url } = await api("/billing/checkout", "POST", body);
              location.href = url;
            }
          })),
      );
    }
    draw();
    el.querySelectorAll("[data-months]").forEach(
      (button) =>
        (button.onclick = () => {
          months = Number(button.dataset.months);
          el.querySelectorAll("[data-months]").forEach((b) =>
            b.classList.toggle("primary", b === button),
          );
          draw();
        }),
    );
    el.querySelector("#billing-portal")?.addEventListener(
      "click",
      safe(async () => {
        const { url } = await api("/billing/portal", "POST", {});
        location.href = url;
      }),
    );
  }
  async function platform(el) {
    const data = await api("/platform");
    el.innerHTML = `<div class="eyebrow">O7 DIGITAL GROUP</div><h1>${t("admin")}</h1><div class="stats"><div class="stat"><small>${tr("Ingreso recurrente mensual contratado", "Contracted monthly recurring revenue")}</small><strong>${money(data.revenue.mrr_cents)}</strong><footer>${tr("Incluye la licencia anual normalizada por mes", "Includes annual licenses normalized per month")}</footer></div><div class="stat"><small>${tr("Pagos confirmados por Stripe", "Payments confirmed by Stripe")}</small><strong>${money(data.revenue.received_cents)}</strong><footer>USD</footer></div></div><div class="service-status">${Object.entries(
      data.services,
    )
      .map(
        ([k, v]) =>
          `<span class="badge ${v ? "green" : "amber"}">${e(k)} · ${v ? "OK" : tr("Por configurar", "Setup required")}</span>`,
      )
      .join(
        "",
      )}</div><section class="panel"><h2>${tr("Organizaciones suscritas", "Subscriber companies")}</h2><div class="table-wrap"><table><thead><tr>${["Empresa", "Estado", "Usuarios", "Prueba", "Plan", "Acceso"].map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${data.tenants.map((w) => `<tr><td>${e(w.name)}${w.is_demo ? "<small>Espacio ilustrativo privado</small>" : ""}</td><td>${e(w.status)}</td><td>${w.users} / ${w.seat_limit}</td><td>${new Date(w.trial_ends_at).toLocaleDateString(lang)}</td><td>${e(w.billing_plan_id || "—")}</td><td>${!w.is_demo ? `<button class="btn" data-tenant="${w.id}" data-status="${w.status === "suspended" ? "trialing" : "suspended"}">${w.status === "suspended" ? tr("Reactivar", "Reactivate") : tr("Suspender", "Suspend")}</button>` : ""}</td></tr>`).join("")}</tbody></table></div></section><h2>${tr("Catálogo de precios", "Pricing catalog")}</h2><p class="subtitle">${tr("USD. Los cambios se aplican a nuevas suscripciones o cambios de plan explícitos.", "USD. Changes apply to new subscriptions or explicit plan changes.")}</p><div class="settings-grid">${data.plans.map((p) => `<form class="panel plan-form" data-plan-edit="${e(p.id)}"><h3>${e(p.name)} · ${p.seat_limit} ${tr("usuarios", "users")}</h3><label>${tr("Nombre", "Name")}<input name="name" value="${e(p.name)}" required></label><label>${tr("Precio mensual en USD", "Monthly price in USD")}<input name="price" type="number" min="1" step="0.01" value="${p.monthly_cents ? p.monthly_cents / 100 : ""}" required></label>${[3, 6, 12].map((m) => `<label>${tr("Descuento", "Discount")} ${m} ${tr("meses", "months")} (%)<input name="discount-${m}" type="number" min="0" max="80" value="${p.discounts[m] || 0}"></label>`).join("")}<label>IA / ${tr("mes", "month")}<input name="ai_limit" type="number" min="0" value="${p.ai_limit}"></label><label class="check"><input name="active" type="checkbox" ${p.active ? "checked" : ""}>${tr("Disponible", "Available")}</label><button class="btn primary">${t("save")}</button></form>`).join("")}</div>`;
    el.insertAdjacentHTML(
      "beforeend",
      `<h2>${tr("Modelos de configuración", "Configuration templates")}</h2><div class="settings-grid">${data.templates.map((template) => `<form class="panel" data-template-edit="${e(template.id)}"><label>${tr("Nombre", "Name")}<input name="name" value="${e(template.name)}" required></label><label>${tr("Servicios (uno por línea)", "Services (one per line)")}<textarea name="categories" rows="4" required>${e((template.settings.categories || []).join("\n"))}</textarea></label><label>${tr("Departamentos", "Departments")}<textarea name="departments" rows="2">${e((template.settings.departments || []).join("\n"))}</textarea></label><label class="check"><input name="active" type="checkbox" ${template.active ? "checked" : ""}>${tr("Disponible", "Available")}</label><button class="btn primary">${t("save")}</button></form>`).join("")}</div>`,
    );
    el.querySelectorAll("[data-template-edit]").forEach(
      (form) =>
        (form.onsubmit = safe(async (event) => {
          const values = Object.fromEntries(new FormData(event.target));
          const template = data.templates.find(
            (t) => t.id === form.dataset.templateEdit,
          );
          await api("/platform/templates/" + template.id, "PUT", {
            name: values.name,
            active: values.active === "on",
            settings: {
              ...template.settings,
              categories: values.categories
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
              departments: values.departments
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            },
          });
          notify(t("saveSuccess"));
        })),
    );
    el.querySelectorAll("[data-plan-edit]").forEach(
      (form) =>
        (form.onsubmit = safe(async (event) => {
          const values = Object.fromEntries(new FormData(event.target));
          await api("/platform/plans/" + form.dataset.planEdit, "PUT", {
            name: values.name,
            monthly_cents: Math.round(Number(values.price) * 100),
            ai_limit: Number(values.ai_limit),
            active: values.active === "on",
            discounts: {
              1: 0,
              3: Number(values["discount-3"]),
              6: Number(values["discount-6"]),
              12: Number(values["discount-12"]),
            },
          });
          notify(t("saveSuccess"));
        })),
    );
    el.querySelectorAll("[data-tenant]").forEach(
      (button) =>
        (button.onclick = safe(async () => {
          if (
            !confirm(
              tr(
                "¿Confirmas este cambio de acceso?",
                "Confirm this access change?",
              ),
            )
          )
            return;
          await api("/platform/tenants/" + button.dataset.tenant, "PUT", {
            status: button.dataset.status,
          });
          await platform(el);
        })),
    );
  }
  async function importer(el) {
    let upload, preview;
    el.innerHTML = `<div class="eyebrow">${tr("EMPIEZA CON TUS DATOS", "START WITH YOUR DATA")}</div><h1>${t("import")}</h1><div class="panel"><p>${tr("Importa primero tus clientes y después tus solicitudes. Puedes conservar tu software actual durante la transición.", "Import customers first, then requests. Keep your existing software during the transition.")}</p><form id="import-upload"><label>${tr("Tipo de datos", "Data type")}<select id="import-kind"><option value="companies">${tr("Clientes", "Customers")}</option><option value="tickets">${tr("Solicitudes", "Requests")}</option></select></label><label>${tr("Archivo CSV / Excel", "CSV / Excel file")}<input id="import-file" type="file" accept=".csv,.xlsx" required></label><p class="subtitle">500 ${tr("filas", "rows")} · 1 MB · ${tr("Primera fila: encabezados", "First row: headers")}</p><button class="btn primary">${tr("Analizar archivo", "Analyze file")} ↗</button></form></div><div id="import-mapping"></div>`;
    el.querySelector("#import-upload").onsubmit = safe(async () => {
      const file = el.querySelector("#import-file").files[0];
      if (file.size > 1000000) throw new Error("Maximum 1 MB");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      upload = {
        file: btoa(binary),
        format: file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv",
        kind: el.querySelector("#import-kind").value,
      };
      preview = await api("/import/preview", "POST", upload);
      const mappingFields =
        preview.mapping_fields ||
        (upload.kind === "companies"
          ? ["name", "sector", "site"]
          : ["title", "company", "site", "category", "description", "priority"]
        ).map((key) => ({ key, label: key, required: true }));
      const required = mappingFields.map((f) => f.key);
      el.querySelector("#import-mapping").innerHTML =
        `<form id="mapping-form" class="panel"><h2>${tr("Relaciona las columnas", "Map your columns")}</h2><p>${preview.total} ${tr("filas detectadas", "rows detected")}</p><div class="settings-grid">${required.map((field) => `<label>${e(mappingFields.find((f) => f.key === field).label)}<select name="${field}" ${mappingFields.find((f) => f.key === field).required ? "required" : ""}><option value="">—</option>${preview.columns.map((c) => `<option ${c.toLowerCase() === field ? "selected" : ""}>${e(c)}</option>`).join("")}</select></label>`).join("")}</div><div class="table-wrap"><table><thead><tr>${preview.columns.map((c) => `<th>${e(c)}</th>`).join("")}</tr></thead><tbody>${preview.rows.map((row) => `<tr>${preview.columns.map((c) => `<td>${e(row[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div><label class="check"><input type="checkbox" required>${tr("Confirmo la importación en mi espacio.", "I approve importing this data into my workspace.")}</label><button class="btn primary">${tr("Importar y guardar", "Import and save")} ↗</button></form>`;
      el.querySelector("#mapping-form").onsubmit = safe(async (event) => {
        const result = await api("/import/commit", "POST", {
          ...upload,
          mapping: Object.fromEntries(new FormData(event.target)),
          confirm: true,
        });
        notify(
          result.processed + " " + tr("filas procesadas", "rows processed"),
        );
        await reload("clients");
      });
    });
  }
  async function companyForm(el) {
    const section = document.createElement("section");
    section.className = "panel";
    section.innerHTML = `<h2>${tr("Nuevo cliente", "New customer")}</h2><form id="company-form">${input("customer-name", tr("Nombre del cliente", "Customer name"))}${input("customer-sector", tr("Sector", "Industry"))}${input("customer-site", tr("Site", "Site"))}${input("contact-name", tr("Contacto (opcional)", "Contact (optional)"), "text", "", false)}${input("contact-email", tr("Correo del contacto (opcional)", "Contact email (optional)"), "email", "", false)}<button class="btn primary">${t("save")}</button><button class="btn" type="button" id="cancel-company">${tr("Cancelar", "Cancel")}</button></form>`;
    el.prepend(section);
    section.querySelector("#cancel-company").onclick = () => section.remove();
    section.querySelector("form").onsubmit = safe(async () => {
      const get = (id) => section.querySelector("#" + id).value;
      await api("/companies", "POST", {
        name: get("customer-name"),
        sector: get("customer-sector"),
        site: get("customer-site"),
        contact_name: get("contact-name"),
        contact_email: get("contact-email"),
      });
      await reload("clients");
    });
  }
  async function branchForm(el, company, branch = {}) {
    el.querySelector("#branch-panel")?.remove();
    const section = document.createElement("section");
    section.className = "panel";
    section.id = "branch-panel";
    section.innerHTML = `<h2>${e(company.name)} · ${tr(branch.id ? "Editar filial" : "Nueva filial", branch.id ? "Edit branch" : "New branch")}</h2><form id="branch-form">${input("branch-name", tr("Nombre de la filial", "Branch name"), "text", branch.name || "")}<label>${tr("País", "Country")}<select id="branch-country" required><option value="">—</option>${countries
      .map((code) => ({ code, label: countryName(code, lang) }))
      .sort((a, b) => a.label.localeCompare(b.label, lang))
      .map(
        (c) =>
          `<option value="${c.code}" ${branch.country_code === c.code ? "selected" : ""}>${e(c.label)}</option>`,
      )
      .join(
        "",
      )}</select></label>${input("branch-city", tr("Ciudad", "City"), "text", branch.city || "", false)}${input("branch-address", tr("Dirección", "Address"), "text", branch.address || "", false)}<label>${tr("Idioma de atención", "Service language")}<select id="branch-language">${Object.entries(
      languages,
    )
      .map(
        ([code, label]) =>
          `<option value="${code}" ${(branch.language || lang) === code ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><label>${tr("Zona horaria", "Time zone")}<select id="branch-timezone">${[...new Set([branch.timezone || getWorkspace().settings.timezone, ...Intl.supportedValuesOf("timeZone")])].map((zone) => `<option value="${e(zone)}" ${(branch.timezone || getWorkspace().settings.timezone) === zone ? "selected" : ""}>${e(zone)}</option>`).join("")}</select></label><p class="subtitle">${tr("La filial pertenece a este cliente. Sus solicitudes conservarán esta relación.", "This branch belongs to this customer. Requests retain this relationship.")}</p><button class="btn primary">${t("save")}</button><button class="btn" type="button" id="cancel-branch">${tr("Cancelar", "Cancel")}</button></form>`;
    el.prepend(section);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    section.querySelector("#cancel-branch").onclick = () => section.remove();
    section.querySelector("form").onsubmit = safe(async () => {
      const get = (id) => section.querySelector("#branch-" + id).value;
      await api(
        "/companies/" +
          company.id +
          "/branches" +
          (branch.id ? "/" + branch.id : ""),
        branch.id ? "PUT" : "POST",
        {
          name: get("name"),
          country_code: get("country"),
          city: get("city"),
          address: get("address"),
          language: get("language"),
          timezone: get("timezone"),
        },
      );
      await reload("clients");
    });
  }
  const staff = createStaffUI({ api, e, tr, notify, getUser, reload });
  const languagePicker = () => language();
  function bindUserLanguage() {
    const node = document.querySelector("#language");
    if (node)
      node.onchange = safe(async (event) => {
        const value = event.target.value;
        await api("/preferences", "PUT", { language: value });
        getUser().language = value;
        lang = value;
        document.documentElement.lang = lang;
        localStorage.setItem("servicehub-language", value);
        await reload();
      });
  }
  function customFields(settings) {
    return settings.fields
      .map(
        (f) =>
          `<label for="custom-${e(f.key)}">${e(f.label)}${f.required ? " *" : ""}</label>${f.type === "select" ? `<select id="custom-${e(f.key)}" data-custom="${e(f.key)}" ${f.required ? "required" : ""}><option value="">—</option>${f.options.map((v) => `<option>${e(v)}</option>`).join("")}</select>` : `<input id="custom-${e(f.key)}" data-custom="${e(f.key)}" type="${f.type === "checkbox" ? "checkbox" : f.type}" ${f.required ? "required" : ""} maxlength="2000">`}`,
      )
      .join("");
  }
  function readCustom(form, settings) {
    return Object.fromEntries(
      settings.fields.map((f) => {
        const node = form.querySelector('[data-custom="' + f.key + '"]');
        return [
          f.key,
          f.type === "checkbox"
            ? node.checked
            : f.type === "number" && node.value !== ""
              ? Number(node.value)
              : node.value,
        ];
      }),
    );
  }
  return {
    t,
    publicPage,
    settings,
    onboarding,
    billing,
    platform,
    importer,
    companyForm,
    staff,
    branchForm,
    countryName: (code) => countryName(code, lang),
    languagePicker,
    bindUserLanguage,
    customFields,
    readCustom,
    setLanguage: (value) => {
      if (translations[value]) {
        lang = value;
        localStorage.setItem("servicehub-language", lang);
        document.documentElement.lang = lang;
      }
    },
    tr,
  };
}
