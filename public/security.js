import { localizedHtml, translateText as t } from "./localization.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function securityDialog(api) {
  const state = await api("/security");
  const dialog = document.createElement("dialog");
  dialog.className = "security-dialog";
  dialog.innerHTML = localizedHtml`<form id="security-form"><div class="panel-head"><h2>Account security</h2><button type="button" id="security-close" class="btn">×</button></div><p>Protect your account with two-factor authentication. Keep your recovery codes in a safe place.</p><p>${state.method ? `${t("Enabled")}: ${state.method}` : t("Two-factor authentication is not enabled.")}</p>${!state.method ? localizedHtml`<label>Verification method<select name="method"><option value="email" ${state.email ? "" : "disabled"}>Email ${state.email ? "" : t("(not connected)")}</option><option value="totp">Google Authenticator / TOTP</option></select></label>` : ""}<label>Current password<input type="password" name="password" autocomplete="current-password" required maxlength="200"></label><div id="security-step"></div><p id="security-error" role="alert"></p><button class="btn primary" id="security-submit">${state.method ? t("Disable two-factor authentication") : t("Set up two-factor authentication")}</button></form>`;
  document.body.append(dialog);
  dialog.showModal();
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.querySelector("#security-close").onclick = close;
  dialog.addEventListener("cancel", () => dialog.remove());
  let step = 0;
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const button = dialog.querySelector("#security-submit");
    button.disabled = true;
    try {
      const form = event.target,
        body = Object.fromEntries(new FormData(form));
      if (!step) {
        const setup = await api(
          state.method ? "/security/disable/start" : "/security/setup",
          "POST",
          body,
        );
        step = 1;
        form.elements.password.disabled = true;
        dialog.querySelector("#security-step").innerHTML =
          localizedHtml`${setup.qr ? localizedHtml`<img class="totp-qr" src="${setup.qr}" alt="Authenticator QR code"><p>Scan this QR code in your authenticator app, or enter this secret manually:</p><code data-user-content>${escape(setup.secret)}</code>` : ""}<label>Verification code<input name="code" autocomplete="one-time-code" required maxlength="20"></label>`;
        button.textContent = t("Confirm");
      } else {
        const result = await api(
          state.method ? "/security/disable" : "/security/confirm",
          "POST",
          { code: body.code },
        );
        if (result.recovery_codes) {
          form.innerHTML = localizedHtml`<h2>Two-factor authentication enabled</h2><p>Save these recovery codes now. Each code can be used once. They will not be shown again.</p><pre data-user-content>${result.recovery_codes.join("\n")}</pre><button type="button" id="codes-saved" class="btn primary">I have saved my recovery codes</button>`;
          form.querySelector("#codes-saved").onclick = close;
        } else close();
      }
    } catch (error) {
      dialog.querySelector("#security-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
