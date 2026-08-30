(async function () {
  const stepName = document.getElementById("step-name");
  const stepCamera = document.getElementById("step-camera");
  const stepDone = document.getElementById("step-done");
  const dot1 = document.getElementById("dot-1");
  const dot2 = document.getElementById("dot-2");
  const dot3 = document.getElementById("dot-3");

  const fullNameInput = document.getElementById("fullName");
  const customIdInput = document.getElementById("customId");
  const nameError = document.getElementById("name-error");

  const btnToCamera = document.getElementById("btn-to-camera");
  const btnBackName = document.getElementById("btn-back-name");
  const btnCapture = document.getElementById("btn-capture");
  const captureLabel = document.getElementById("capture-label");
  const camSpinner = document.getElementById("cam-spinner");
  const cameraStatus = document.getElementById("camera-status");
  const cameraFrame = document.getElementById("camera-frame");
  const video = document.getElementById("video");

  let stream = null;
  let capturing = false;

  function showStatus(el, msg, type) {
    el.style.display = "block";
    el.className = `status-msg ${type}`;
    el.textContent = msg;
  }
  function hideStatus(el) {
    el.style.display = "none";
  }

  btnToCamera.addEventListener("click", async () => {
    hideStatus(nameError);
    if (!fullNameInput.value.trim()) {
      showStatus(nameError, "Please enter your name to continue.", "error");
      return;
    }
    stepName.style.display = "none";
    stepCamera.style.display = "block";
    dot1.classList.replace("active", "done");
    dot2.classList.add("active");

    try {
      captureLabel.textContent = "Loading camera…";
      stream = await FaceUtils.startCamera(video);
      await FaceUtils.loadFaceModels();
      captureLabel.textContent = "Capture Photo";
      camSpinner.style.display = "none";
      btnCapture.disabled = false;
    } catch (err) {
      console.error(err);
      showStatus(cameraStatus, "Could not access camera. Please allow camera permission and reload the page.", "error");
    }
  });

  btnBackName.addEventListener("click", () => {
    FaceUtils.stopCamera(stream);
    stepCamera.style.display = "none";
    stepName.style.display = "block";
    dot1.classList.add("active");
    dot1.classList.remove("done");
    dot2.classList.remove("active");
  });

  btnCapture.addEventListener("click", async () => {
    if (capturing) return;
    capturing = true;
    btnCapture.disabled = true;
    camSpinner.style.display = "inline-block";
    captureLabel.textContent = "Detecting face…";
    hideStatus(cameraStatus);
    cameraFrame.className = "camera-frame scanning";

    try {
      const result = await FaceUtils.detectFace(video);
      if (!result) {
        cameraFrame.className = "camera-frame failed";
        showStatus(cameraStatus, "No face detected. Please face the camera directly in good light and try again.", "error");
        return;
      }

      captureLabel.textContent = "Saving…";
      const res = await fetch("/api/employees/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullNameInput.value.trim(),
          customId: customIdInput.value.trim(),
          faceDescriptor: Array.from(result.descriptor),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        cameraFrame.className = "camera-frame failed";
        showStatus(cameraStatus, data.error || "Registration failed. Please try again.", "error");
        return;
      }

      cameraFrame.className = "camera-frame matched";
      FaceUtils.stopCamera(stream);
      stepCamera.style.display = "none";
      stepDone.style.display = "block";
      dot2.classList.replace("active", "done");
      dot3.classList.add("active", "done");
    } catch (err) {
      console.error(err);
      cameraFrame.className = "camera-frame failed";
      showStatus(cameraStatus, "Network error. Please check your internet connection and try again.", "error");
    } finally {
      capturing = false;
      btnCapture.disabled = false;
      camSpinner.style.display = "none";
      captureLabel.textContent = "Capture Photo";
    }
  });
})();
