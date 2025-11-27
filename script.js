// ================== CONFIG ==================
const API_KEY = "AIzaSyBhi05HMVGg90dPP91zG1RZtNxm-d6hnQw";

const DRIVE_FOLDERS = {
  diamond_earrings: "1N0jndAEIThUuuNAJpvuRMGsisIaXCgMZ",
  diamond_necklaces: "1JGV8T03YdzjfW0Dyt9aMPybH8V9-gEhw",
  gold_earrings: "1GMZpcv4A1Gy2xiaIC1XPG_IOAt9NrDpi",
  gold_necklaces: "1QIvX-PrSVrK9gz-TEksqiKlXPGv2hsS5",
};

// Landmark indices (MediaPipe)
const LANDMARKS = {
  leftEye: 33,
  rightEye: 263,
  leftEar: 132,
  rightEar: 361,
  chin: 152,
};

// Smoothing factor
const SMOOTHING_ALPHA = 0.7;

// ================== DOM ELEMENTS ==================
const videoEl = document.getElementById("webcam");
const canvasEl = document.getElementById("overlay");
const ctx = canvasEl.getContext("2d");

const subcategoryButtonsEl = document.getElementById("subcategory-buttons");

const earringsListWrapper = document.getElementById("earrings-list-wrapper");
const earringsListEl = document.getElementById("earrings-list");

const necklacesListWrapper = document.getElementById("necklaces-list-wrapper");
const necklacesListEl = document.getElementById("necklaces-list");

const mainButtons = document.querySelectorAll(".main-btn");
const subButtons = document.querySelectorAll(".sub-btn");

// ================== STATE ==================
let faceMesh = null;
let hasWebcamStream = false;

let currentMainCategory = null; // "earrings" | "necklaces"
let currentSubType = null; // "gold" | "diamond"

let selectedEarringSrc = null;
let selectedNecklaceSrc = null;

const earringImg = new Image();
const necklaceImg = new Image();
let earringLoaded = false;
let necklaceLoaded = false;

// Smoothing state
let smoothedPoints = {
  leftEar: null,
  rightEar: null,
  chin: null,
  leftEye: null,
  rightEye: null,
};

// To avoid spamming FaceMesh
let isProcessingFrame = false;

// ================== INIT ==================
document.addEventListener("DOMContentLoaded", () => {
  setupUI();
  initFaceMesh();
  startCamera();
});

// ================== CAMERA ==================
function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error("getUserMedia is not supported in this browser.");
    return;
  }

  navigator.mediaDevices
    .getUserMedia({
      video: {
        facingMode: "user",
      },
      audio: false,
    })
    .then((stream) => {
      hasWebcamStream = true;
      videoEl.srcObject = stream;

      videoEl.onloadedmetadata = () => {
        videoEl.play();
        resizeCanvasToVideo();
        requestAnimationFrame(processVideoFrame);
      };
    })
    .catch((err) => {
      console.error("Error accessing camera:", err);
    });
}

function resizeCanvasToVideo() {
  const rect = videoEl.getBoundingClientRect();
  // Use intrinsic size if available
  const w = videoEl.videoWidth || rect.width;
  const h = videoEl.videoHeight || rect.height;
  canvasEl.width = w;
  canvasEl.height = h;
}

// ================== MEDIAPIPE SETUP ==================
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

// ================== FACE RESULTS ==================
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

// ================== DRAW JEWELRY ==================
function drawJewelry() {
  if (!smoothedPoints.leftEye || !smoothedPoints.rightEye) return;

  const w = canvasEl.width;
  const h = canvasEl.height;

  // Eye distance for scaling
  const dx = smoothedPoints.rightEye.x - smoothedPoints.leftEye.x;
  const dy = smoothedPoints.rightEye.y - smoothedPoints.leftEye.y;
  const eyeDist = Math.sqrt(dx * dx + dy * dy);

  // ---- Earrings ----
  if (earringLoaded && selectedEarringSrc) {
    const scaleFactor = 0.4; // tweak if too big/small
    const eW = eyeDist * scaleFactor;
    const eH = eW * (earringImg.height / earringImg.width);

    const leftPos = smoothedPoints.leftEar;
    const rightPos = smoothedPoints.rightEar;

    // Slight vertical offset upwards so it sits correctly
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

  // ---- Necklace ----
  if (necklaceLoaded && selectedNecklaceSrc) {
    const neckPos = smoothedPoints.chin;
    const neckWidth = w * 0.5; // 50% of frame width
    const neckHeight = neckWidth * (necklaceImg.height / necklaceImg.width);

    const yOffset = 0.02 * h; // slightly below chin
    const x = (w - neckWidth) / 2;
    const y = neckPos.y + yOffset;

    ctx.drawImage(necklaceImg, x, y, neckWidth, neckHeight);
  }
}

// ================== GOOGLE DRIVE ==================
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
      .map((f) => {
        const src = `https://drive.google.com/thumbnail?id=${f.id}&sz=w1000`;
        return {
          id: f.id,
          name: f.name,
          src,
        };
      });
  } catch (err) {
    console.error("Error fetching Drive images:", err);
    return [];
  }
}

async function loadJewelryList(mainCategory, subType) {
  const key = `${subType}_${mainCategory}`; // e.g. gold_earrings
  const folderId = DRIVE_FOLDERS[key];
  if (!folderId) {
    console.warn("No folderID for", key);
    return;
  }

  const images = await fetchDriveImages(folderId);
  const isEarrings = mainCategory === "earrings";

  const wrapper = isEarrings ? earringsListWrapper : necklacesListWrapper;
  const listEl = isEarrings ? earringsListEl : necklacesListEl;

  // Show the correct wrapper
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
      // Remove old selection highlight
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

// ================== UI HANDLERS ==================
function setupUI() {
  mainButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const main = btn.dataset.main;

      currentMainCategory = main;
      // Highlight main category button
      mainButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Show subcategory row
      subcategoryButtonsEl.classList.remove("hidden");

      // Reset sub selection highlight
      subButtons.forEach((b) => b.classList.remove("active"));

      // Show the correct list wrapper, hide the other (until subtype chosen)
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

      const type = btn.dataset.type; // gold / diamond
      currentSubType = type;

      // Highlight subtype button
      subButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      await loadJewelryList(currentMainCategory, currentSubType);
    });
  });
}
