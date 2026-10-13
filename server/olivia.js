const fail = (status, message) => Object.assign(new Error(message), { status });

export function oliviaStatus() {
  return {
    configured: Boolean(
      process.env.OLIVIA_BASE_URL && process.env.OLIVIA_API_KEY,
    ),
    version: "3.5",
    mode:
      process.env.OLIVIA_BASE_URL && process.env.OLIVIA_API_KEY
        ? "live"
        : "demo",
  };
}
export async function oliviaChat(message, conversationId, user) {
  if (!oliviaStatus().configured)
    throw fail(424, "La conexión Olivia V3.5 está pendiente de configuración.");
  let response;
  try {
    response = await fetch(
      new URL("chat", process.env.OLIVIA_BASE_URL.replace(/\/?$/, "/")),
      {
        method: "POST",
        signal: AbortSignal.timeout(60000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OLIVIA_API_KEY}`,
        },
        body: JSON.stringify({
          message,
          conversation_id: conversationId || null,
          scope:
            user.role === "client"
              ? `client-${user.company_id}`
              : user.role === "agent"
                ? `support-${user.id}`
                : "global",
        }),
      },
    );
  } catch {
    throw fail(
      503,
      "Olivia V3.5 no está disponible temporalmente. Tu mensaje no se publicó en ningún ticket.",
    );
  }
  if (!response.ok)
    throw fail(
      response.status === 429 ? 429 : 502,
      "No fue posible obtener una respuesta de Olivia V3.5.",
    );
  const data = await response.json();
  if (typeof data.answer !== "string" || !data.answer.trim())
    throw fail(502, "Respuesta Olivia no válida");
  return {
    answer: data.answer,
    conversation_id: data.conversation_id,
    mode: "live",
    version: "3.5",
  };
}
