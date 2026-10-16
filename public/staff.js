export function createStaffUI({ api, e, tr, notify, getUser, reload }) {
  const profiles = () => ({
    admin: tr("Administrador", "Administrator"),
    manager: tr("Responsable de departamento", "Department manager"),
    agent: tr("Técnico / ingeniero", "Technician / engineer"),
    client: tr("Cliente", "Customer"),
    platform_admin: tr("Administración O7", "O7 administration"),
  });
  return async function staff(el) {
    const [catalog, accounts, clients] = await Promise.all([
      api("/staff/catalog"),
      api("/users"),
      api("/companies"),
    ]);
    const owner = ["admin", "platform_admin"].includes(getUser().role);
    const editable = (u) =>
      owner && u.id !== getUser().id && u.role !== "platform_admin";
    const departments = (value, all = true) =>
      `${all ? '<option value="">—</option>' : ""}${catalog.departments.map((d) => `<option value="${d.id}" ${d.id === value ? "selected" : ""}>${e(d.name)}</option>`).join("")}`;
    const names = profiles();
    el.innerHTML = `<div class="eyebrow">${tr("PERSONAS Y PERMISOS", "PEOPLE AND PERMISSIONS")}</div><h1>${tr("Roles y colaboradores", "Roles and collaborators")}</h1><p class="subtitle">${tr("Define tus funciones y especialidades. Los responsables acceden a las solicitudes de su departamento; los técnicos, a las asignadas.", "Define your roles and specialties. Department managers access their department requests; technicians access assigned requests.")}</p><div class="actions"><button class="btn primary" id="create-user">+ ${tr("Nuevo usuario", "New user")}</button>${owner ? `<button class="btn" id="add-custom-role">+ ${tr("Crear rol", "Create role")}</button><button class="btn" id="add-department">+ ${tr("Crear departamento", "Create department")}</button>` : ""}</div><div id="staff-editor"></div><section class="panel"><h2>${tr("Colaboradores", "Collaborators")}</h2><div class="table-wrap"><table><thead><tr>${[tr("Usuario", "User"), tr("Rol", "Role"), tr("Departamento", "Department"), tr("Especialidad / función", "Specialty / function"), tr("Acceso", "Access")].map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${accounts.users.map((u) => `<tr data-staff-user="${u.id}"><td data-user-content><b>${e(u.name)}</b><small>${e(u.email)}</small></td><td data-user-content>${e(u.role_name || names[u.role])}</td><td data-user-content>${e(catalog.departments.find((d) => d.id === u.department_id)?.name || "—")}</td><td data-user-content>${e(u.specialty || "—")}</td><td><div class="actions">${editable(u) ? `<button class="btn" data-edit-staff="${u.id}">${tr("Editar", "Edit")}</button>` : ""}${u.id !== getUser().id && u.role !== "platform_admin" && (owner || u.role === "agent" || u.role === "client") ? `<button class="btn" data-toggle-staff="${u.id}">${u.active ? tr("Desactivar", "Deactivate") : tr("Activar", "Activate")}</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div></section>${owner ? `<section class="panel"><h2>${tr("Tus roles", "Your roles")}</h2><p class="subtitle">${tr("El nombre es libre. El perfil de permisos se fija al crear el rol. Ningún rol de cliente puede conceder acceso de administración O7.", "Choose any role name. Its permission profile is fixed at creation. Customer roles cannot grant O7 administration access.")}</p>${catalog.roles.map((r) => `<div class="staff-role-row" data-role-row="${r.id}"><input data-role-name aria-label="${tr("Nombre del rol", "Role name")}" maxlength="100" value="${e(r.name)}"><small>${e(names[r.base_role])}</small><button class="btn" data-rename-role="${r.id}">${tr("Guardar", "Save")}</button></div>`).join("")}</section>` : ""}`;
    const safe = (fn) => async (event) => {
      event?.preventDefault();
      const button = event?.submitter || event?.currentTarget;
      if (button?.tagName === "BUTTON") button.disabled = true;
      try {
        await fn(event);
      } catch (error) {
        notify(error.message);
      } finally {
        if (button?.isConnected) button.disabled = false;
      }
    };
    function editor(html) {
      const node = el.querySelector("#staff-editor");
      node.innerHTML = `<section class="panel">${html}<button class="btn" type="button" id="cancel-staff">${tr("Cancelar", "Cancel")}</button></section>`;
      node.querySelector("#cancel-staff").onclick = () =>
        node.replaceChildren();
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      return node;
    }
    el.querySelector("#add-custom-role")?.addEventListener("click", () => {
      const node = editor(
        `<h2>${tr("Crear rol", "Create role")}</h2><form id="staff-role-form"><label>${tr("Nombre del rol", "Role name")}<input name="name" required maxlength="100" placeholder="${tr("Ej.: Ingeniero de ciberseguridad", "e.g. Cybersecurity engineer")}"></label><label>${tr("Perfil de permisos", "Permission profile")}<select name="base_role">${Object.entries(
          names,
        )
          .filter(([role]) => role !== "platform_admin")
          .map(
            ([role, name]) =>
              `<option value="${role}" ${role === "agent" ? "selected" : ""}>${e(name)}</option>`,
          )
          .join(
            "",
          )}</select></label><p class="notice">${tr("Administrador: gestiona el espacio. Responsable: gestiona las solicitudes de su departamento. Técnico: solicitudes asignadas. Cliente: su organización cliente.", "Administrator: manages the workspace. Manager: manages department requests. Technician: assigned requests. Customer: their customer organization.")}</p><button class="btn primary">${tr("Crear rol", "Create role")}</button></form>`,
      );
      node.querySelector("form").onsubmit = safe(async (event) => {
        await api(
          "/staff/roles",
          "POST",
          Object.fromEntries(new FormData(event.target)),
        );
        await reload("team");
      });
    });
    el.querySelector("#add-department")?.addEventListener("click", () => {
      const node = editor(
        `<h2>${tr("Crear departamento", "Create department")}</h2><form id="staff-department-form"><label>${tr("Nombre", "Name")}<input name="name" required maxlength="100"></label><button class="btn primary">${tr("Guardar", "Save")}</button></form>`,
      );
      node.querySelector("form").onsubmit = safe(async (event) => {
        await api(
          "/staff/departments",
          "POST",
          Object.fromEntries(new FormData(event.target)),
        );
        await reload("team");
      });
    });
    function userForm(user = {}) {
      const allowed = owner
        ? ["admin", "manager", "agent", "client"]
        : ["agent", "client"];
      const options = catalog.roles
        .filter((r) => allowed.includes(r.base_role))
        .sort(
          (a, b) =>
            ["agent", "manager", "client", "admin"].indexOf(a.base_role) -
            ["agent", "manager", "client", "admin"].indexOf(b.base_role),
        );
      const selected = user.role_id
        ? "custom:" + user.role_id
        : user.id
          ? "legacy:" + user.role
          : "";
      const node = editor(
        `<h2>${user.id ? tr("Editar colaborador", "Edit collaborator") : tr("Nuevo usuario", "New user")}</h2><form id="staff-user-form">${!user.id ? `<label>${tr("Nombre", "Name")}<input name="name" maxlength="100" required></label><label>${tr("Correo electrónico", "Email address")}<input name="email" type="email" required></label><label>${tr("Contraseña inicial (12 caracteres mínimo)", "Initial password (at least 12 characters)")}<input name="password" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label>` : `<p data-user-content>${e(user.name)} · ${e(user.email)}</p>`}<label>${tr("Rol", "Role")}<select id="staff-role" required>${options.map((r) => `<option value="custom:${r.id}" data-profile="${r.base_role}" ${selected === "custom:" + r.id ? "selected" : ""}>${e(r.name)} · ${e(names[r.base_role])}</option>`).join("")}${allowed.map((role) => `<option value="legacy:${role}" data-profile="${role}" ${selected === "legacy:" + role ? "selected" : ""}>${e(names[role])}</option>`).join("")}</select></label><label>${tr("Departamento", "Department")}<select id="staff-department">${departments(user.department_id || getUser().department_id)}</select></label><label>${tr("Especialidad / función (libre)", "Specialty / function (free text)")}<input id="staff-specialty" value="${e(user.specialty || "")}" list="staff-specialties" maxlength="160"><datalist id="staff-specialties">${[tr("Redes", "Networks"), tr("Soporte", "Support"), "DevOps", tr("Ciberseguridad", "Cybersecurity")].map((value) => `<option value="${e(value)}">`).join("")}</datalist></label><label id="staff-customer-label">${tr("Cliente", "Customer")}<select id="staff-company">${clients.companies.map((c) => `<option value="${c.id}" ${c.id === user.company_id ? "selected" : ""}>${e(c.name)}</option>`).join("")}</select></label><button class="btn primary">${tr("Guardar", "Save")}</button></form>`,
      );
      const role = node.querySelector("#staff-role"),
        department = node.querySelector("#staff-department");
      const update = () => {
        const profile = role.selectedOptions[0]?.dataset.profile;
        department.required = profile === "manager";
        node.querySelector("#staff-customer-label").hidden =
          profile !== "client";
      };
      role.onchange = update;
      update();
      node.querySelector("form").onsubmit = safe(async (event) => {
        const [kind, id] = role.value.split(":");
        const body = {
          ...Object.fromEntries(new FormData(event.target)),
          role: role.selectedOptions[0].dataset.profile,
          role_id: kind === "custom" ? Number(id) : null,
          department_id: Number(department.value) || null,
          specialty: node.querySelector("#staff-specialty").value,
          company_id:
            Number(node.querySelector("#staff-company").value) || null,
        };
        await api(
          user.id ? "/users/" + user.id + "/permissions" : "/users",
          user.id ? "PUT" : "POST",
          body,
        );
        await reload("team");
      });
    }
    el.querySelector("#create-user").onclick = () => userForm();
    el.querySelectorAll("[data-edit-staff]").forEach(
      (button) =>
        (button.onclick = () =>
          userForm(
            accounts.users.find(
              (u) => u.id === Number(button.dataset.editStaff),
            ),
          )),
    );
    el.querySelectorAll("[data-toggle-staff]").forEach(
      (button) =>
        (button.onclick = safe(async () => {
          const user = accounts.users.find(
            (u) => u.id === Number(button.dataset.toggleStaff),
          );
          await api("/users/" + user.id + "/access", "POST", {
            active: !user.active,
          });
          await reload("team");
        })),
    );
    el.querySelectorAll("[data-rename-role]").forEach(
      (button) =>
        (button.onclick = safe(async () => {
          await api("/staff/roles/" + button.dataset.renameRole, "PUT", {
            name: button
              .closest("[data-role-row]")
              .querySelector("[data-role-name]").value,
          });
          await reload("team");
        })),
    );
  };
}
