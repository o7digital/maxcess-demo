import { inFrench } from "./french.js";
// Translate the retained operational screens while keeping canonical API values.
const english = {
  Resumen: "Overview",
  Solicitudes: "Requests",
  "Mi fila": "My queue",
  Clientes: "Customers",
  "Todos los clientes": "All customers",
  "CLIENTE / SEDE": "CUSTOMER / SITE",
  Filial: "Branch",
  "Sede general": "General site",
  Administración: "Users & access",
  Informes: "Reports",
  "Centro de servicio": "Service workspace",
  "Centro de servicio /": "Service workspace /",
  "MI ESPACIO": "MY WORKSPACE",
  Superadministrador: "Super administrator",
  Administrador: "Administrator",
  Gerente: "Manager",
  "Técnico de soporte": "Support technician",
  Cliente: "Customer",
  Actualizar: "Refresh",
  "Cerrar sesión": "Sign out",
  "RELACIONES DE SERVICIO": "SERVICE RELATIONSHIPS",
  "+ Nuevo cliente": "+ New customer",
  "Importar CSV / Excel ↗": "Import CSV / Excel ↗",
  "Contactos y seguimiento por sede.": "Contacts and follow-up by site.",
  "Ver solicitudes ↗": "View requests ↗",
  "+ Nueva solicitud": "+ New request",
  "Mi fila de atención": "My support queue",
  "Cada caso, su responsable y su siguiente paso.":
    "Every request, its owner and its next step.",
  Lista: "List",
  "Todos los estados": "All statuses",
  "Todas las prioridades": "All priorities",
  "Todas las empresas": "All companies",
  "Todos los agentes": "All agents",
  "Sin asignar": "Unassigned",
  "Exportar CSV": "Export CSV",
  SOLICITUD: "REQUEST",
  "EMPRESA / SEDE": "COMPANY / SITE",
  AGENTE: "AGENT",
  PRIORIDAD: "PRIORITY",
  "ESTADO / SLA": "STATUS / SLA",
  Abierto: "Open",
  "En curso": "In progress",
  Resuelto: "Resolved",
  Cerrado: "Closed",
  Baja: "Low",
  Media: "Medium",
  Alta: "High",
  Crítica: "Critical",
  Vencido: "Overdue",
  Atendido: "Handled",
  "Nueva solicitud": "New request",
  "PORTAL DE ATENCIÓN": "SERVICE PORTAL",
  "Describe lo que ocurre. El equipo validará la prioridad y te dará seguimiento.":
    "Describe what happened. Your team will review the priority and follow up.",
  Asunto: "Subject",
  Empresa: "Company",
  Sede: "Site",
  Categoría: "Category",
  "Prioridad deseada": "Requested priority",
  Descripción: "Description",
  "No incluyas contraseñas ni datos bancarios. Las piezas adjuntas no están habilitadas.":
    "Do not include passwords or bank details. Attachments are not enabled.",
  "Registrar solicitud ↗": "Submit request ↗",
  "Cerrar ×": "Close ×",
  "Conversación e historial": "Conversation and history",
  "Respuesta para el cliente": "Reply to customer",
  "Responder al equipo": "Reply to team",
  "Revisé el contenido y autorizo publicarlo en el portal cliente.":
    "I reviewed this content and approve publication in the customer portal.",
  "Validar y publicar respuesta": "Approve and publish reply",
  "Enviar respuesta": "Send reply",
  "Trabajo interno": "Internal work",
  "Nota interna (oculta al cliente)": "Internal note (hidden from customer)",
  "Guardar nota interna": "Save internal note",
  "Resolución verificada": "Verified resolution",
  "Documentar y resolver": "Document and resolve",
  "Cerrar solicitud": "Close request",
  "Reabrir con motivo": "Reopen with reason",
  "Responsable del caso": "Request owner",
  "Seleccionar agente…": "Select technician…",
  "Asignar y notificar en el portal": "Assign and update portal",
  "Preparar con Olivia ↗": "Prepare with Olivia ↗",
  "Clasificación validada": "Verified classification",
  Prioridad: "Priority",
  "Confirmo esta clasificación.": "I confirm this classification.",
  "Validar clasificación": "Confirm classification",
  Etapa: "Stage",
  "Actualizar etapa": "Update stage",
  "ASISTENCIA INTEGRADA": "INTEGRATED ASSISTANCE",
  "ASISTENCIA CON CONTEXTO": "CONTEXTUAL ASSISTANCE",
  "Tu criterio.": "Your judgment.",
  "Una mejor preparación.": "Better preparation.",
  "Resumen, clasificación y borradores por solicitud. Revisión humana antes de publicar.":
    "Request summaries, classification and drafts. Human review before publication.",
  "Explorar Olivia ↗": "Explore Olivia ↗",
  "Revisión humana antes de publicar.": "Human review before publication.",
  "Visibilidad para decidir. Contexto para responder.":
    "Visibility to decide. Context to respond.",
  "OPERACIÓN CONECTADA": "CONNECTED OPERATIONS",
  "La atención que avanza.": "Service that moves forward.",
  "La información que": "Information that",
  "permanece.": "stays.",
  "Solicitudes y conversaciones guardadas. Indicadores calculados con los casos autorizados para tu perfil.":
    "Saved requests and conversations. Metrics calculated from cases authorized for your role.",
  "Solicitudes recientes": "Recent requests",
  "Ver todas ↗": "View all ↗",
  "Inteligencia en cada caso.": "Intelligence in every case.",
  "Seguimiento claro.": "Clear follow-up.",
  "Respuestas con contexto.": "Replies with context.",
  "Conoce a Olivia ↗": "Meet Olivia ↗",
  "INTELIGENCIA DE SERVICIO": "SERVICE INTELLIGENCE",
  "Informes con perspectiva.": "Reports with perspective.",
  "Datos guardados, lectura clara y decisiones documentadas.":
    "Saved data, clear insights and documented decisions.",
  "Exportar indicadores ↗": "Export metrics ↗",
  Desde: "From",
  Hasta: "To",
  "Aplicar periodo": "Apply period",
  "TU REPORTE EJECUTIVO": "YOUR EXECUTIVE REPORT",
  "Guarda una fotografía del servicio.": "Save a snapshot of your service.",
  "El informe conserva los indicadores de este periodo, incluso cuando los tickets cambien.":
    "Your report retains this period’s metrics even when requests change.",
  "Guardar informe": "Save report",
  "Síntesis con Hugging Face ✦": "Summary with Hugging Face ✦",
  "Imprimir / PDF ↗": "Print / PDF ↗",
  "Mis informes guardados": "My saved reports",
  Global: "Workspace",
  "Solicitudes activas": "Active requests",
  Urgencias: "Critical requests",
  "SLA vencidos": "Overdue SLAs",
  "Cumplimiento SLA": "SLA compliance",
  "Casos resueltos": "Resolved cases",
  "Tiempo promedio": "Average time",
  "En atención": "In progress",
  Atendidas: "Handled",
  "Resueltas o cerradas": "Resolved or closed",
  "Casos atendidos": "Handled cases",
  "Hasta la resolución": "Until resolution",
  Inicio: "Home",
  "TU ESPACIO": "YOUR WORKSPACE",
  "Portal de atención": "Service portal",
  "Estamos contigo en cada solicitud.": "With you in every request.",
  "CUÉNTANOS QUÉ NECESITAS": "TELL US WHAT YOU NEED",
  "Una solicitud.": "One request.",
  "El siguiente paso, claro.": "A clear next step.",
  "Tu equipo tiene el contexto. Tú tienes el seguimiento.":
    "Your team has the context. You have the follow-up.",
  "Todo en un solo lugar": "Everything in one place",
  "TU SEGUIMIENTO": "YOUR FOLLOW-UP",
  "¿EN QUÉ TE AYUDAMOS?": "HOW CAN WE HELP?",
  "Empieza por aquí.": "Start here.",
  "TU PERSPECTIVA": "YOUR PERSPECTIVE",
  "El servicio también se ve en los datos.": "See your service in the data.",
  "Explorar mis informes ↗": "Explore my reports ↗",
  Conectividad: "Connectivity",
  Equipos: "Equipment",
  Facturación: "Billing",
  Accesos: "Access",
  Servicio: "Service",
  "Administración de usuarios": "User administration",
  "Crear usuario": "Create user",
  "Nuevo usuario": "New user",
  Nombre: "Name",
  "Correo electrónico": "Email address",
  Contraseña: "Password",
  Rol: "Role",
  Activo: "Active",
  Suspendido: "Suspended",
  Suspender: "Suspend",
  Reactivar: "Reactivate",
  Acceso: "Access",
  Equipo: "Team",
  "No hay solicitudes con estos filtros.": "No requests match these filters.",
  "Tu primera solicitud empieza aquí. Cuéntanos cómo podemos ayudarte.":
    "Your first request starts here. Tell us how we can help.",
  SAV: "After-sales service",
  "Servicio posventa": "After-sales service",
  "Soporte informático": "IT support",
  Mantenimiento: "Maintenance",
  "Centro de servicios": "Service center",
  Personalizado: "Custom",
};
export function installLegacyTranslations(root) {
  let queued = false;
  const translate = () => {
    queued = false;
    if (
      !["en", "fr"].includes(document.documentElement.lang) ||
      root.classList.contains("commercial")
    )
      return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (
        node.parentElement.closest(
          "script,style,textarea,[data-user-content],.ticket-title,.client-banner,.client-company,.profile,.workspace-label,input",
        )
      )
        continue;
      const original = node.nodeValue,
        trim = original.trim();
      let value = english[trim];
      if (!value && /^Hola, .+\.$/.test(trim))
        value = trim.replace(/^Hola, /, "Hello, ");
      if (!value) continue;
      if (document.documentElement.lang === "fr")
        value = /^Hello, /.test(value)
          ? value.replace(/^Hello, /, "Bonjour, ")
          : inFrench(value);
      const option = node.parentElement.closest("option");
      if (option && !option.hasAttribute("value"))
        option.value = option.textContent;
      node.nodeValue = original.replace(trim, value);
    }
  };
  new MutationObserver(() => {
    if (!queued) {
      queued = true;
      queueMicrotask(translate);
    }
  }).observe(root, { childList: true, subtree: true });
  return translate;
}
