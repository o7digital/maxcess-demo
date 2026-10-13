const presets = {
  mobile: { width: 390, height: 844, label: "Móvil" },
  tablet: { width: 820, height: 1180, label: "iPad / tablet" },
  desktop: { width: 1280, height: 800, label: "Desktop" },
};
const frame = document.querySelector(".device-frame"),
  wrapper = document.querySelector(".device-wrapper"),
  stage = document.querySelector(".device-stage"),
  iframe = document.querySelector("iframe");
let device = "mobile",
  rotated = false;
function resize() {
  const p = presets[device];
  const width = rotated ? p.height : p.width,
    height = rotated ? p.width : p.height;
  const chrome = device === "desktop" ? 34 : 56;
  const available = Math.max(180, stage.clientWidth - 40);
  const availableHeight=Math.max(450,Math.min(innerHeight-170,960));
  const scale = Math.min(1, available / (width + 24),availableHeight/(height+chrome+24));
  frame.className = "device-frame " + device;
  frame.style.width = width + 24 + "px";
  frame.style.height = height + chrome + 24 + "px";
  frame.style.transform = `scale(${scale})`;
  wrapper.style.width = (width + 24) * scale + "px";
  wrapper.style.height = (height + chrome + 24) * scale + "px";
  iframe.width = width;
  iframe.height = height;
  iframe.style.width = width + "px";
  iframe.style.height = height + "px";
  iframe.title = `Portal cliente — ${p.label}`;
  document.querySelector("#viewport-label").textContent =
    `${p.label} · ${width} × ${height} · ${width > height ? "horizontal" : "vertical"}`;
  document
    .querySelectorAll("[data-device]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.device === device)),
    );
  document.querySelector("#rotate").disabled = device === "desktop";
}
document.querySelectorAll("[data-device]").forEach(
  (b) =>
    (b.onclick = () => {
      device = b.dataset.device;
      rotated = false;
      resize();
      history.replaceState(null, "", "/demo?device=" + device);
    }),
);
document.querySelector("#rotate").onclick = () => {
  rotated = !rotated;
  resize();
};
const requested = new URLSearchParams(location.search).get("device");
if (presets[requested]) device = requested;
new ResizeObserver(resize).observe(stage);
resize();
