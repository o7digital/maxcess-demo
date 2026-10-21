import { localizedHtml, translateText as t } from "./localization.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function connectorsDialog(api) {
  const data = await api("/connectors");
  const dialog = document.createElement("dialog");
  dialog.className = "security-dialog";
  dialog.innerHTML = localizedHtml`<div class="panel-head"><h2>Ticket integrations</h2><button class="btn" id="connectors-close">×</button></div><p>Connect an external help desk using an OAuth access token with the required permissions. Export is manual and one-way. Internal notes, attachments and personal profiles are not exported. Existing external records receive updates; no background synchronization runs.</p>${[
    "zendesk",
    "servicenow",
  ]
    .map((provider) => {
      const c = data.connectors.find((c) => c.provider === provider);
      return localizedHtml`<section><h3>${provider === "zendesk" ? "Zendesk" : "ServiceNow"}</h3><p data-user-content>${c ? escape(c.hostname) : t("Not connected")}</p><form data-connector="${provider}"><label>Instance hostname<input name="hostname" required value="${escape(c?.hostname)}" placeholder="${provider === "zendesk" ? "your-company.zendesk.com" : "your-company.service-now.com"}"></label><label>OAuth access token<input name="token" type="password" required autocomplete="off" maxlength="4000"></label><button class="btn primary">Save connection</button></form>${c ? localizedHtml`<button class="btn" data-test="${provider}">Test connection</button><button class="btn" data-remove="${provider}">Disconnect</button><form data-export="${provider}"><label>Maxcess ticket number<input name="id" type="number" min="1" required></label><p>The ticket title, description, priority and supported status fields will be sent to this provider.</p><label class="check"><input type="checkbox" required>Authorize this export</label><button class="btn primary">Export / update ticket</button></form>` : ""}</section>`;
    })
    .join("")}<p role="status" id="connector-result"></p>`;
  document.body.append(dialog);
  dialog.showModal();
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.querySelector("#connectors-close").onclick = close;
  dialog.addEventListener("cancel", () => dialog.remove());
  const run = async (task, reload = false) => {
    try {
      const message = await task();
      if (reload) {
        close();
        await connectorsDialog(api);
      } else
        dialog.querySelector("#connector-result").textContent =
          message || t("Connection successful");
    } catch (error) {
      dialog.querySelector("#connector-result").textContent = error.message;
    }
  };
  dialog.querySelectorAll("[data-connector]").forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        run(
          () =>
            api(
              "/connectors/" + form.dataset.connector,
              "PUT",
              Object.fromEntries(new FormData(form)),
            ),
          true,
        );
      }),
  );
  dialog
    .querySelectorAll("[data-test]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          run(() =>
            api("/connectors/" + button.dataset.test + "/test", "POST", {}),
          )),
    );
  dialog
    .querySelectorAll("[data-remove]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          run(
            () => api("/connectors/" + button.dataset.remove, "DELETE"),
            true,
          )),
    );
  dialog.querySelectorAll("[data-export]").forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        run(async () => {
          const result = await api(
            "/connectors/" +
              form.dataset.export +
              "/tickets/" +
              form.elements.id.value,
            "POST",
            {},
          );
          return t("Export completed") + ": " + result.external_id;
        });
      }),
  );
}
