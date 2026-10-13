const e = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function metricCards(data) {
  const m = data.metrics;
  return `<div class="stats executive-stats">${[
    ["Solicitudes del periodo", m.total, "Registros guardados"],
    ["En atención", m.active, `${m.overdue} SLA vencidos`],
    [
      "Cumplimiento SLA",
      m.sla_percent === null ? "—" : m.sla_percent + "%",
      `${m.resolved} casos atendidos`,
    ],
    [
      "Tiempo de resolución",
      m.average_resolution_hours === null
        ? "—"
        : m.average_resolution_hours + " h",
      "Promedio de casos atendidos",
    ],
  ]
    .map(
      ([l, v, n]) =>
        `<div class="stat"><small>${l}</small><strong>${v}</strong><footer>${n}</footer></div>`,
    )
    .join("")}</div>`;
}
function lines(series) {
  const data =
      series.length > 31
        ? series.filter((_, i) => i % Math.ceil(series.length / 31) === 0)
        : series,
    max = Math.max(1, ...data.map((d) => Math.max(d.created, d.resolved))),
    w = 600,
    h = 160;
  const points = (key) =>
    data
      .map(
        (d, i) =>
          `${30 + (i / Math.max(data.length - 1, 1)) * 540},${h - 20 - (d[key] / max) * 120}`,
      )
      .join(" ");
  return `<svg class="activity-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Solicitudes creadas y atendidas durante el periodo"><path d="M30 20H570M30 60H570M30 100H570M30 140H570" class="grid-line"/><polyline points="${points("created")}" class="chart-created"/><polyline points="${points("resolved")}" class="chart-resolved"/>${data.map((d, i) => `<circle cx="${30 + (i / Math.max(data.length - 1, 1)) * 540}" cy="${h - 20 - (d.created / max) * 120}" r="3" class="chart-dot"><title>${d.date}: ${d.created} creadas, ${d.resolved} atendidas</title></circle>`).join("")}</svg><div class="chart-labels"><span>${e(series[0]?.date)}</span><span>${e(series.at(-1)?.date)}</span></div>`;
}
function bars(values) {
  const max = Math.max(1, ...values.map((v) => v.count));
  return values.length
    ? values
        .map(
          (v) =>
            `<div class="report-bar"><div class="row"><span>${e(v.label)}</span><b>${v.count}</b></div><svg viewBox="0 0 100 5" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="5" rx="2" fill="#edf0e9"/><rect width="${(v.count / max) * 100}" height="5" rx="2" fill="#a6be72"/></svg></div>`,
        )
        .join("")
    : '<p class="empty">Sin datos en este periodo.</p>';
}
export function charts(data) {
  return `<div class="dashboard-charts"><div class="panel activity-panel"><div class="panel-head"><div><div class="eyebrow">PULSO DE ATENCIÓN</div><h2>Evolución de solicitudes</h2></div><div class="chart-key"><span>Creadas</span><span>Atendidas</span></div></div>${lines(data.series)}<p class="chart-caption">Cohorte de solicitudes creadas durante el periodo seleccionado. Atendidas según su fecha de resolución.</p></div><div class="panel"><div class="eyebrow">DISTRIBUCIÓN</div><h2>Estado de la operación</h2><div class="chart-list">${bars(data.status)}</div></div><div class="panel"><div class="eyebrow">MOTIVOS DE CONTACTO</div><h2>Categorías</h2><div class="chart-list">${bars(data.category)}</div></div><div class="panel"><div class="eyebrow">FOCO DE SERVICIO</div><h2>Volumen por empresa</h2><div class="chart-list">${bars(data.companies.slice(0, 8))}</div></div></div>`;
}
export function reportDocument(report) {
  const d = report.snapshot;
  return `<div class="saved-report"><div class="row"><div><div class="eyebrow">INFORME ${e(report.id.slice(0, 8))}</div><h2>Informe de servicio</h2></div><span class="badge">${report.provider === "huggingface" ? "Hugging Face" : "Datos verificados"}</span></div><p class="subtitle">${d.filters.start} — ${d.filters.end} · alcance ${e(d.scope)} · creado ${new Date(report.created_at).toLocaleString("es-MX")}</p>${metricCards(d)}${report.narrative ? `<div class="report-narrative text-block">${e(report.narrative)}</div>` : ""}${charts(d)}</div>`;
}
