(function () {
  // Already logged in? Skip straight to the dashboard.
  if (localStorage.getItem("admin_token")) {
    window.location.href = "/admin/dashboard.html";
    return;
  }

  const username = document.getElementById("username");
  const password = document.getElementById("password");
  const btn = document.getElementById("btn-login");
  const errorEl = document.getElementById("login-error");

  function showError(msg) {
    errorEl.style.display = "block";
    errorEl.textContent = msg;
  }

  async function submit() {
    errorEl.style.display = "none";
    if (!username.value.trim() || !password.value) {
      showError("Please enter your username and password.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Logging in…";

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.value.trim(), password: password.value }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || "Login failed.");
        return;
      }

      localStorage.setItem("admin_token", data.token);
      localStorage.setItem("admin_info", JSON.stringify(data.admin));
      window.location.href = "/admin/dashboard.html";
    } catch (err) {
      showError("Network error. Please check your connection and try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Log In";
    }
  }

  btn.addEventListener("click", submit);
  password.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
})();
