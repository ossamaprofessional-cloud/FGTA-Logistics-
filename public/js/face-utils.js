/**
 * Shared face-recognition helpers used by both the registration page and
 * the daily attendance page. Uses face-api.js (TensorFlow.js under the
 * hood), loaded from a CDN in the <script> tag of each HTML page, plus
 * its pretrained model weights loaded here from a CDN at runtime.
 *
 * Nothing here ever sends a photo to the server — only the small 128-value
 * face descriptor (a list of numbers), which is what gets matched/stored.
 *
 * NOTE for production: for reliability independent of a third-party CDN,
 * download the /weights files once and serve them from this app's own
 * /public/models folder instead — see README "Self-hosting face models".
 */

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

let modelsLoaded = false;

async function loadFaceModels(onProgress) {
  if (modelsLoaded) return;
  onProgress && onProgress("Loading face recognition engine…");
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  modelsLoaded = true;
}

async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

function stopCamera(stream) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
}

const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

/**
 * Runs detection + landmarks + descriptor on the current video frame.
 * Returns { descriptor: Float32Array, landmarks, box } or null if no
 * single clear face was found.
 */
async function detectFace(videoEl) {
  const result = await faceapi
    .detectSingleFace(videoEl, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result || null;
}

// --- Basic liveness: eye-aspect-ratio blink check -------------------------
// Watches a short window of frames and looks for a blink (eyes briefly
// closing then reopening). This is a lightweight deterrent against holding
// up a printed photo — not a substitute for dedicated liveness hardware,
// but a meaningful step up from a single static snapshot.

function eyeAspectRatio(eyePoints) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const p = eyePoints;
  const vertical1 = dist(p[1], p[5]);
  const vertical2 = dist(p[2], p[4]);
  const horizontal = dist(p[0], p[3]);
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

/**
 * Watches the live video for ~2.5s waiting to see a blink. Calls
 * onTick(earStatus) each frame if you want to show progress.
 * Resolves true if a blink was detected, false if it timed out.
 */
async function waitForBlink(videoEl, { timeoutMs = 4000, onTick } = {}) {
  const start = Date.now();
  let sawClosed = false;
  let blinked = false;

  while (Date.now() - start < timeoutMs && !blinked) {
    const result = await faceapi.detectSingleFace(videoEl, detectorOptions).withFaceLandmarks();
    if (result) {
      const landmarks = result.landmarks;
      const leftEAR = eyeAspectRatio(landmarks.getLeftEye());
      const rightEAR = eyeAspectRatio(landmarks.getRightEye());
      const ear = (leftEAR + rightEAR) / 2;

      if (ear < 0.21) {
        sawClosed = true;
      } else if (sawClosed && ear > 0.25) {
        blinked = true;
      }
      onTick && onTick(ear);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 120));
  }
  return blinked;
}

window.FaceUtils = { loadFaceModels, startCamera, stopCamera, detectFace, waitForBlink };
