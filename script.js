// =============== CONFIG ===============
const API_KEY = "AIzaSyBhi05HMVGg90dPP91zG1RZtNxm-d6hnQw";

const DRIVE_FOLDERS = {
  diamond_earrings: "1N0jndAEIThUuuNAJpvuRMGsisIaXCgMZ",
  diamond_necklaces: "1JGV8T03YdzjfW0Dyt9aMPybH8V9-gEhw",
  gold_earrings: "1GMZpcv4A1Gy2xiaIC1XPG_IOAt9NrDpi",
  gold_necklaces: "1QIvX-PrSVrK9gz-TEksqiKlXPGv2hsS5",
};

const LANDMARKS = {
  leftEye: 33,
  rightEye: 263,
  leftEar: 132,
  rightEar: 361,
  chin: 152,
};

const SMOOTHING_ALPHA = 0.7;

// =============== DOM ===============
const videoEl = document.getElementById("webcam");
const canvasEl = document.getElementById("overlay");
const ctx = canvasEl.getContext("2d");

const cameraOverlayEl = document.getElementById("camera-overlay");
const startCameraBtn = document.getElementById("start-camera-btn");
const cameraErrorText = document.getElementById("camera-error-text");

const subcategoryButtonsEl = document.getElementById("subcategory-buttons");
const earringsListWrapper = document.getElementById("earrings-list-wrapper");
const earringsListEl = document.getElementById("earrings-list");
const necklacesListWrapper = document.getElementById("necklaces-list-wrapper");
const necklacesListEl = document.getElementById("necklaces-list");

const mainButtons = document.querySelectorAll(".main-btn");
const subButtons = document.querySelectorAll(".sub-btn");

// =============== STATE ===============
let currentMainCategory = null;
let currentSubType = null;

let selectedEarringSrc = null;
let selectedNecklaceSrc = null;

const earringImg = new Image();
const necklaceImg = new Image();
let earringLoaded = false;
let necklaceLoaded = false;

let smoothedPoints = {
  leftEar: null,
  rightEar: null,
  chin: null,
  leftEye: null,
  rightEye: null,
};

let faceMesh = null;
let isProcessingFrame = false;
let hasWebcamStream = false;
let currentStream = null;

// =============== INIT ===============
document.addEventListener("DOMContentLoaded", () => {
  setupUI();
  initFaceMesh();

  // IMPORTANT: do NOT auto-start camera – wait for user tap
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCameraError("Camera is not supported in this browser.");
  }

  startCameraBtn.addEventListener("click", () => {
    startCameraBtn.disabled = true;
    cameraErrorText.textContent = "";
    startCamera();
  });

  window.addEventListener("resize", () => {
    resizeCanvasToVideo();
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(resizeCanvasToVideo, 400);
  });
});

// =============== CAMERA ===============
function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCameraError("Camera is not supported in this browser.");
    return;
  }

  // Stop previous stream if any
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }

  // Simplified constraints – better for mobile
  const constraints = {
    video: {
      facingMode: "user",
    },
    audio: false,
  };

  // For iOS Safari – ensure attributes
  videoEl.setAttribute("playsinline", "true");
  videoEl.setAttribute("autoplay", "true");
  videoEl.muted = true;

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      currentStream = stream;
      hasWebcamStream = true;
      videoEl.srcObject = stream;

      const onReady = () => {
        resizeCanvasToVideo();
        cameraOverlayEl.style.display = "none";
        requestAnimationFrame(processVideoFrame);
      };

      // Some mobiles fire loadeddata instead of loadedmetadata reliably
      videoEl.onloadedmetadata = onReady;
      videoEl.onloadeddata = onReady;

      return videoEl
        .play()
        .catch((err) => console.warn("Video play interrupted", err));
    })
    .catch((err) => {
      console.error("Error accessing camera:", err);
      showCameraError(
        "Unable to access camera. Please allow camera permission and use HTTPS."
      );
      startCameraBtn.disabled = false;
    });
}

function resizeCanvasToVideo() {
  const rect = videoEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvasEl.width = rect.width;
  canvasEl.height = rect.height;
}

function showCameraError(msg) {
  cameraErrorText.textContent = msg;
  cameraOverlayEl.style.display = "flex";
}

// =============== MEDIAPIPE ===============
function initFaceMesh() {
  faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });

  faceMesh.onResults(onFaceResults);
}

function processVideoFrame() {
  if (!hasWebcamStream || !faceMesh) {
    requestAnimationFrame(processVideoFrame);
    return;
  }

  if (!isProcessingFrame) {
    isProcessingFrame = true;
    faceMesh
      .send({ image: videoEl })
      .catch((err) => {
        console.error("FaceMesh send error:", err);
      })
      .finally(() => {
        isProcessingFrame = false;
      });
  }

  requestAnimationFrame(processVideoFrame);
}

// =============== FACE RESULTS ===============
function onFaceResults(results) {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];
  const w = canvasEl.width;
  const h = canvasEl.height;

  const pts = {
    leftEar: toPixel(landmarks[LANDMARKS.leftEar], w, h),
    rightEar: toPixel(landmarks[LANDMARKS.rightEar], w, h),
    chin: toPixel(landmarks[LANDMARKS.chin], w, h),
    leftEye: toPixel(landmarks[LANDMARKS.leftEye], w, h),
    rightEye: toPixel(landmarks[LANDMARKS.rightEye], w, h),
  };

  smoothPoints(pts);
  drawJewelry();
}

function toPixel(landmark, width, height) {
  return {
    x: landmark.x * width,
    y: landmark.y * height,
  };
}

function smoothPoints(newPts) {
  Object.keys(newPts).forEach((key) => {
    const current = newPts[key];
    if (!smoothedPoints[key]) {
      smoothedPoints[key] = { ...current };
    } else {
      smoothedPoints[key].x =
        SMOOTHING_ALPHA * smoothedPoints[key].x +
        (1 - SMOOTHING_ALPHA) * current.x;
      smoothedPoints[key].y =
        SMOOTHING_ALPHA * smoothedPoints[key].y +
        (1 - SMOOTHING_ALPHA) * current.y;
    }
  });
}

// =============== DRAW JEWELRY ===============
function drawJewelry() {
  if (!smoothedPoints.leftEye || !smoothedPoints.rightEye) return;

  const w = canvasEl.width;
  const h = canvasEl.height;

  const dx = smoothedPoints.rightEye.x - smoothedPoints.leftEye.x;
  const dy = smoothedPoints.rightEye.y - smoothedPoints.leftEye.y;
  const eyeDist = Math.sqrt(dx * dx + dy * dy);

  // Earrings
  if (earringLoaded && selectedEarringSrc) {
    const scaleFactor = 0.4;
    const eW = eyeDist * scaleFactor;
    const eH = eW * (earringImg.height / earringImg.width);

    const leftPos = smoothedPoints.leftEar;
    const rightPos = smoothedPoints.rightEar;
    const verticalOffset = -0.05 * h;

    ctx.drawImage(
      earringImg,
      leftPos.x - eW / 2,
      leftPos.y + verticalOffset,
      eW,
      eH
    );
    ctx.drawImage(
      earringImg,
      rightPos.x - eW / 2,
      rightPos.y + verticalOffset,
      eW,
      eH
    );
  }

  // Necklace
  if (necklaceLoaded && selectedNecklaceSrc) {
    const neckPos = smoothedPoints.chin;
    const neckWidth = w * 0.5;
    const neckHeight = neckWidth * (necklaceImg.height / necklaceImg.width);
    const yOffset = 0.02 * h;

    const x = (w - neckWidth) / 2;
    const y = neckPos.y + yOffset;

    ctx.drawImage(necklaceImg, x, y, neckWidth, neckHeight);
  }
}

// =============== GOOGLE DRIVE ===============
async function fetchDriveImages(folderId) {
  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?q='${folderId}'+in+parents` +
    `&key=${API_KEY}` +
    `&fields=files(id,name,mimeType)`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Drive API error", res.status, res.statusText);
      return [];
    }

    const data = await res.json();
    if (!data.files) return [];

    return data.files
      .filter((f) => f.mimeType && f.mimeType.startsWith("image/"))
      .map((f) => ({
        id: f.id,
        name: f.name,
        src: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1000`,
      }));
  } catch (err) {
    console.error("Error fetching Drive images:", err);
    return [];
  }
}

async function loadJewelryList(mainCategory, subType) {
  const key = `${subType}_${mainCategory}`;
  const folderId = DRIVE_FOLDERS[key];
  if (!folderId) {
    console.warn("No folder ID for", key);
    return;
  }

  const images = await fetchDriveImages(folderId);
  const isEarrings = mainCategory === "earrings";

  const listEl = isEarrings ? earringsListEl : necklacesListEl;

  earringsListWrapper.classList.toggle("hidden", !isEarrings);
  necklacesListWrapper.classList.toggle("hidden", isEarrings);

  listEl.innerHTML = "";

  images.forEach((imgObj) => {
    const btn = document.createElement("button");
    btn.className = "jewelry-item-btn";

    const img = document.createElement("img");
    img.className = "jewelry-item-img";
    img.src = imgObj.src;
    img.alt = imgObj.name || key;

    btn.appendChild(img);

    btn.addEventListener("click", () => {
      listEl
        .querySelectorAll(".jewelry-item-img.selected")
        .forEach((el) => el.classList.remove("selected"));
      img.classList.add("selected");

      if (isEarrings) {
        selectedEarringSrc = imgObj.src;
        earringLoaded = false;
        earringImg.onload = () => {
          earringLoaded = true;
        };
        earringImg.src = imgObj.src;
      } else {
        selectedNecklaceSrc = imgObj.src;
        necklaceLoaded = false;
        necklaceImg.onload = () => {
          necklaceLoaded = true;
        };
        necklaceImg.src = imgObj.src;
      }
    });

    listEl.appendChild(btn);
  });
}

// =============== UI ===============
function setupUI() {
  mainButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const main = btn.dataset.main;
      currentMainCategory = main;

      mainButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      subcategoryButtonsEl.classList.remove("hidden");
      subButtons.forEach((b) => b.classList.remove("active"));

      if (main === "earrings") {
        earringsListWrapper.classList.remove("hidden");
        necklacesListWrapper.classList.add("hidden");
      } else {
        necklacesListWrapper.classList.remove("hidden");
        earringsListWrapper.classList.add("hidden");
      }
    });
  });

  subButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!currentMainCategory) return;
      const type = btn.dataset.type;
      currentSubType = type;

      subButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      await loadJewelryList(currentMainCategory, currentSubType);
    });
  });
}
