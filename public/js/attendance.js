(async function () {
  document.getElementById("today-label").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "short", day: "numeric",
  });

  const dots = [1, 2, 3, 4].map((n) => document.getElementById(`dot-${n}`));
  function advanceDot(i) {
    dots[i - 1].classList.replace("active", "done");
    if (dots[i]) dots[i].classList.add("active");
  }

  function showStatus(el, msg, type) {
    el.style.display = "block";
    el.className = `status-msg ${type}`;
    el.textContent = msg;
  }
  function hideStatus(el) {
    el.style.display = "none";
  }

  // ---------------------------------------------------------------------
  // Guard: no internet, no attendance. Never silently pretend success.
  // ---------------------------------------------------------------------
  function requireOnlineOrWarn(statusEl) {
    if (!navigator.onLine) {
      showStatus(statusEl, "Internet connection required. Please try again when you have a connection.", "error");
      return false;
    }
    return true;
  }

  let coords = null; // { latitude, longitude }

  // ---------------------------------------------------------------------
  // STEP 1: Location
  // ---------------------------------------------------------------------
  const stepLocation = document.getElementById("step-location");
  const stepFace = document.getElementById("step-face");
  const stepTruck = document.getElementById("step-truck");
  const stepDone = document.getElementById("step-done");
  const locationStatus = document.getElementById("location-status");
  const btnAllowLocation = document.getElementById("btn-allow-location");

  btnAllowLocation.addEventListener("click", () => {
    hideStatus(locationStatus);
    if (!requireOnlineOrWarn(locationStatus)) return;

    if (!("geolocation" in navigator)) {
      showStatus(locationStatus, "This browser does not support location. Please use Chrome or Safari.", "error");
      return;
    }

    btnAllowLocation.disabled = true;
    btnAllowLocation.textContent = "Getting location…";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        stepLocation.style.display = "none";
        stepFace.style.display = "block";
        advanceDot(1);
        initCamera();
      },
      (err) => {
        btnAllowLocation.disabled = false;
        btnAllowLocation.textContent = "Allow Location";
        console.error(err);
        showStatus(
          locationStatus,
          "Location permission was denied. Please enable Location for this site in your browser settings and try again.",
          "error"
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });

  // ---------------------------------------------------------------------
  // STEP 2: Face
  // ---------------------------------------------------------------------
  const video = document.getElementById("video");
  const cameraFrame = document.getElementById("camera-frame");
  const btnVerify = document.getElementById("btn-verify");
  const verifyLabel = document.getElementById("verify-label");
  const camSpinner = document.getElementById("cam-spinner");
  const faceStatus = document.getElementById("face-status");
  const faceInstruction = document.getElementById("face-instruction");

  let stream = null;
  let liveDescriptor = null;
  let verifying = false;

  async function initCamera() {
    try {
      verifyLabel.textContent = "Loading camera…";
      stream = await FaceUtils.startCamera(video);
      await FaceUtils.loadFaceModels();
      verifyLabel.textContent = "Take Photo";
      camSpinner.style.display = "none";
      btnVerify.disabled = false;
    } catch (err) {
      console.error(err);
      showStatus(faceStatus, "Could not access camera. Please allow camera permission and reload the page.", "error");
    }
  }

  btnVerify.addEventListener("click", async () => {
    if (verifying) return;
    if (!requireOnlineOrWarn(faceStatus)) return;

    verifying = true;
    btnVerify.disabled = true;
    camSpinner.style.display = "inline-block";
    hideStatus(faceStatus);
    cameraFrame.className = "camera-frame scanning";

    try {
      // Liveness: ask for a natural blink within a few seconds.
      verifyLabel.textContent = "Please blink naturally…";
      faceInstruction.textContent = "Please blink naturally while looking at the camera.";
      const blinked = await FaceUtils.waitForBlink(video, { timeoutMs: 4000 });

      if (!blinked) {
        cameraFrame.className = "camera-frame failed";
        showStatus(faceStatus, "We couldn't confirm a live face. Please look directly at the camera and try again.", "warn");
        faceInstruction.textContent = "Please look at the camera and take your photo.";
        return;
      }

      verifyLabel.textContent = "Verifying…";
      const result = await FaceUtils.detectFace(video);
      if (!result) {
        cameraFrame.className = "camera-frame failed";
        showStatus(faceStatus, "Face not recognized. Please try again or contact your supervisor.", "error");
        return;
      }

      liveDescriptor = Array.from(result.descriptor);

      // Identify the employee now so we can greet them by name before
      // asking for the truck number, and catch "already marked today"
      // early — matches the spec's flow exactly.
      verifyLabel.textContent = "Identifying…";
      const idRes = await fetch("/api/attendance/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faceDescriptor: liveDescriptor }),
      });
      const idData = await idRes.json();

      if (!idRes.ok) {
        cameraFrame.className = "camera-frame failed";
        showStatus(faceStatus, idData.error || "Face not recognized. Please try again or contact your supervisor.", "error");
        faceInstruction.textContent = "Please look at the camera and take your photo.";
        return;
      }

      cameraFrame.className = "camera-frame matched";
      FaceUtils.stopCamera(stream);
      stepFace.style.display = "none";
      greeting.textContent = `Hello ${idData.employeeName}`;

      if (idData.alreadyMarkedToday) {
        stepTruck.style.display = "block";
        truckInput.style.display = "none";
        btnSubmit.style.display = "none";
        showStatus(truckStatus, "Your attendance has already been marked today.", "warn");
      } else {
        stepTruck.style.display = "block";
        advanceDot(2);
        truckInput.focus();
      }
    } catch (err) {
      console.error(err);
      cameraFrame.className = "camera-frame failed";
      showStatus(faceStatus, "Something went wrong. Please try again.", "error");
    } finally {
      verifying = false;
      btnVerify.disabled = false;
      camSpinner.style.display = "none";
    }
  });

  // ---------------------------------------------------------------------
  // STEP 3: Truck number + submit
  // ---------------------------------------------------------------------
  const truckInput = document.getElementById("truckNumber");
  const btnSubmit = document.getElementById("btn-submit");
  const submitLabel = document.getElementById("submit-label");
  const submitSpinner = document.getElementById("submit-spinner");
  const truckStatus = document.getElementById("truck-status");
  const greeting = document.getElementById("greeting");

  btnSubmit.addEventListener("click", async () => {
    hideStatus(truckStatus);
    if (!requireOnlineOrWarn(truckStatus)) return;

    if (!truckInput.value.trim()) {
      showStatus(truckStatus, "Please enter the truck number.", "error");
      return;
    }
    if (!coords || !liveDescriptor) {
      showStatus(truckStatus, "Something went wrong earlier in the process. Please reload and start again.", "error");
      return;
    }

    btnSubmit.disabled = true;
    submitSpinner.style.display = "inline-block";
    submitLabel.textContent = "Saving…";

    try {
      const res = await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faceDescriptor: liveDescriptor,
          truckNumber: truckInput.value.trim(),
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        showStatus(truckStatus, data.error || "Could not save attendance. Please try again.", data.error && data.error.includes("already been marked") ? "warn" : "error");
        return;
      }

      document.getElementById("sum-name").textContent = data.employeeName;
      document.getElementById("sum-truck").textContent = data.truckNumber;
      document.getElementById("sum-time").textContent = data.time;
      document.getElementById("sum-city").textContent = data.city;
      greeting.textContent = `Hello ${data.employeeName}`;

      stepTruck.style.display = "none";
      stepDone.style.display = "block";
      advanceDot(3);
    } catch (err) {
      console.error(err);
      showStatus(truckStatus, "Internet connection required. Please try again when you have a connection.", "error");
    } finally {
      btnSubmit.disabled = false;
      submitSpinner.style.display = "none";
      submitLabel.textContent = "Confirm Attendance";
    }
  });
})();
