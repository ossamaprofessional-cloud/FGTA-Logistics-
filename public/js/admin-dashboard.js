(function () {
  const token = localStorage.getItem("admin_token");
  if (!token) {
    window.location.href = "/admin/login.html";
    return;
  }

  const adminInfo = JSON.parse(localStorage.getItem("admin_info") || "{}");
  document.getElementById("who-label").textContent = `${adminInfo.name || ""} (${adminInfo.role || "admin"})`;

  async function api(path, opts = {}) {
    const res = await fetch(`/api${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

    if (res.status === 401) {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_info");
      window.location.href = "/admin/login.html";
      throw new Error("Not authenticated");
    }

    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) throw new Error((data && data.error) || "Request failed");
    return data;
  }

  // -------------------------------------------------------------------
  // Sidebar navigation
  // -------------------------------------------------------------------
  const views = {
    today: { title: "Today's Attendance", el: document.getElementById("view-today"), load: loadToday },
    history: { title: "Attendance History", el: document.getElementById("view-history"), load: loadHistory },
    monthly: { title: "Monthly Present/Absent Summary", el: document.getElementById("view-monthly"), load: initMonthly },
    employees: { title: "Employees", el: document.getElementById("view-employees"), load: loadEmployees },
  };

  document.querySelectorAll(".admin-sidebar nav a[data-view]").forEach((link) => {
    link.addEventListener("click", () => switchView(link.dataset.view));
  });

  function switchView(name) {
    Object.entries(views).forEach(([key, v]) => {
      v.el.style.display = key === name ? "block" : "none";
    });
    document.querySelectorAll(".admin-sidebar nav a[data-view]").forEach((a) => {
      a.classList.toggle("active", a.dataset.view === name);
    });
    document.getElementById("view-title").textContent = views[name].title;
    views[name].load();
  }

  document.getElementById("logout-link").addEventListener("click", () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_info");
    window.location.href = "/admin/login.html";
  });

  // -------------------------------------------------------------------
  // TODAY
  // -------------------------------------------------------------------
  async function loadToday() {
    const tbody = document.getElementById("today-tbody");
    tbody.innerHTML = `<tr><td colspan="6">Loading…</td></tr>`;
    try {
      const [todayData, employees] = await Promise.all([api("/attendance/today"), api("/employees")]);
      const rows = todayData.rows;

      document.getElementById("stat-present-today").textContent = rows.length;
      document.getElementById("stat-employees").textContent = employees.filter((e) => e.active_status).length;
      document.getElementById("stat-trucks-today").textContent = new Set(rows.map((r) => r.truck_number)).size;

      tbody.innerHTML = rows.length
        ? rows
            .map(
              (r) => `<tr>
                <td>${escapeHtml(r.full_name)}</td>
                <td>${escapeHtml(r.custom_id || "—")}</td>
                <td>${escapeHtml(r.truck_number)}</td>
                <td>${escapeHtml(r.time)}</td>
                <td>${escapeHtml(r.city || "—")}</td>
                <td><span class="badge present">${escapeHtml(r.status)}</span></td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="6">No attendance recorded yet today.</td></tr>`;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6">Could not load: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // -------------------------------------------------------------------
  // HISTORY
  // -------------------------------------------------------------------
  async function loadHistory() {
    const tbody = document.getElementById("history-tbody");
    tbody.innerHTML = `<tr><td colspan="9">Loading…</td></tr>`;

    const params = new URLSearchParams();
    const search = document.getElementById("f-search").value.trim();
    const truck = document.getElementById("f-truck").value.trim();
    const city = document.getElementById("f-city").value.trim();
    const dateFrom = document.getElementById("f-date-from").value;
    const dateTo = document.getElementById("f-date-to").value;
    if (search) params.set("search", search);
    if (truck) params.set("truck", truck);
    if (city) params.set("city", city);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    try {
      const rows = await api(`/attendance?${params.toString()}`);
      tbody.innerHTML = rows.length
        ? rows
            .map(
              (r) => `<tr>
                <td>${escapeHtml(r.full_name)}</td>
                <td>${escapeHtml(r.custom_id || "—")}</td>
                <td>${escapeHtml(r.truck_number)}</td>
                <td>${escapeHtml(r.date)}</td>
                <td>${escapeHtml(r.time)}</td>
                <td>${escapeHtml(r.city || "—")}</td>
                <td>${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}</td>
                <td><span class="badge present">${escapeHtml(r.status)}</span></td>
                <td><button class="action-link danger" data-del="${r.attendance_id}">Delete</button></td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="9">No matching attendance records.</td></tr>`;

      tbody.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this attendance record? This cannot be undone.")) return;
          try {
            await api(`/attendance/${btn.dataset.del}`, { method: "DELETE" });
            loadHistory();
          } catch (err) {
            alert(`Could not delete: ${err.message}`);
          }
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9">Could not load: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  document.getElementById("btn-filter").addEventListener("click", loadHistory);
  document.getElementById("btn-export").addEventListener("click", async () => {
    try {
      const res = await fetch("/api/attendance/export/csv", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "attendance-export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Could not export: ${err.message}`);
    }
  });

  // -------------------------------------------------------------------
  // MONTHLY SUMMARY
  // -------------------------------------------------------------------
  function initMonthly() {
    const monthSel = document.getElementById("m-month");
    const yearSel = document.getElementById("m-year");
    if (!monthSel.options.length) {
      const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      months.forEach((m, i) => {
        const opt = document.createElement("option");
        opt.value = i + 1;
        opt.textContent = m;
        monthSel.appendChild(opt);
      });
      const now = new Date();
      monthSel.value = now.getMonth() + 1;
      for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        if (y === now.getFullYear()) opt.selected = true;
        yearSel.appendChild(opt);
      }
      document.getElementById("btn-load-monthly").addEventListener("click", loadMonthly);
      loadMonthly();
    }
  }

  async function loadMonthly() {
    const month = document.getElementById("m-month").value;
    const year = document.getElementById("m-year").value;
    const head = document.getElementById("monthly-head");
    const tbody = document.getElementById("monthly-tbody");
    tbody.innerHTML = `<tr><td>Loading…</td></tr>`;

    try {
      const data = await api(`/attendance/monthly-summary?year=${year}&month=${month}`);
      head.innerHTML = `<th>Employee</th>` + data.days.map((d) => `<th>${d.slice(-2)}</th>`).join("");

      tbody.innerHTML = data.grid.length
        ? data.grid
            .map(
              (row) =>
                `<tr><td>${escapeHtml(row.fullName)}${row.customId ? ` <small>(${escapeHtml(row.customId)})</small>` : ""}</td>` +
                row.days.map((d) => `<td class="cell ${d.toLowerCase()}">${d === "Present" ? "P" : "A"}</td>`).join("") +
                `</tr>`
            )
            .join("")
        : `<tr><td>No active employees.</td></tr>`;
    } catch (err) {
      tbody.innerHTML = `<tr><td>Could not load: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // -------------------------------------------------------------------
  // EMPLOYEES
  // -------------------------------------------------------------------
  async function loadEmployees() {
    const tbody = document.getElementById("employees-tbody");
    tbody.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
    const search = document.getElementById("e-search").value.trim();

    try {
      const rows = await api(`/employees${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      tbody.innerHTML = rows.length
        ? rows
            .map(
              (e) => `<tr>
                <td>${escapeHtml(e.full_name)}</td>
                <td>${escapeHtml(e.custom_id || "—")}</td>
                <td>${new Date(e.registration_date).toLocaleDateString()}</td>
                <td>${e.active_status ? '<span class="badge present">Active</span>' : '<span class="badge absent">Reset</span>'}</td>
                <td>${e.active_status ? `<button class="action-link danger" data-reset="${e.employee_id}">Reset Face</button>` : `<button class="action-link" data-reactivate="${e.employee_id}">Reactivate</button>`}</td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="5">No employees found.</td></tr>`;

      tbody.querySelectorAll("[data-reset]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Reset this employee's face profile? They will need to register again.")) return;
          try {
            await api(`/employees/${btn.dataset.reset}/reset-face`, { method: "POST" });
            loadEmployees();
          } catch (err) {
            alert(`Could not reset: ${err.message}`);
          }
        });
      });
      tbody.querySelectorAll("[data-reactivate]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await api(`/employees/${btn.dataset.reactivate}/reactivate`, { method: "POST" });
            loadEmployees();
          } catch (err) {
            alert(`Could not reactivate: ${err.message}`);
          }
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5">Could not load: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  document.getElementById("btn-emp-search").addEventListener("click", loadEmployees);

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Initial view
  loadToday();
})();
