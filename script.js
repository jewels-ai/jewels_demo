const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');

const subcategoryButtons = document.getElementById('subcategory-buttons');
const jewelryOptions = document.getElementById('jewelry-options');

let earringImg = null;
let necklaceImg = null;

let currentType = '';
let smoothedFaceLandmarks = null;
let camera;

// Store smoothed jewelry positions
let smoothedFacePoints = {};

// ================== GOOGLE DRIVE CONFIG ==================
const API_KEY = "AIzaSyBhi05HMVGg90dPP91zG1RZtNxm-d6hnQw";

const driveFolders = {
  diamond_earrings: "1N0jndAEIThUuuNAJpvuRMGsisIaXCgMZ",
  diamond_necklaces: "1JGV8T03YdzjfW0Dyt9aMPybH8V9-gEhw",
  gold_earrings: "1GMZpcv4A1Gy2xiaIC1XPG_IOAt9NrDpi",
  gold_necklaces: "1QIvX-PrSVrK9gz-TEksqiKlXPGv2hsS5",
};

// Fetch image links from a Drive folder
async function fetchDriveImages(folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${API_KEY}&fields=files(id,name,mimeType)`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.files) return [];

  return data.files
    .filter(f => f.mimeType.includes("image/"))
    .map(f => {
      const link = `https://drive.google.com/thumbnail?id=${f.id}&sz=w1000`;
      console.log("Image loaded:", link);
      return { id: f.id, name: f.name, src: link };
    });
}

// Utility function to load images
async function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.error(`Failed to load image: ${src}`);
      resolve(null);
    };
    img.src = src;
  });
}

// Change jewelry image
async function changeJewelry(type, src) {
  const img = await loadImage(src);
  if (!img) return;

  earringImg = necklaceImg = null;

  if (type.includes('earrings')) earringImg = img;
  else if (type.includes('necklaces')) necklaceImg = img;
}

// Handle category selection
function toggleCategory(category) {
  jewelryOptions.style.display = 'none';
  subcategoryButtons.style.display = 'none';
  currentType = category;

  subcategoryButtons.style.display = 'flex';
  startCamera('user');
}

// Handle subcategory (Gold/Diamond)
function selectJewelryType(mainType, subType) {
  currentType = `${subType}_${mainType}`;
  subcategoryButtons.style.display = 'none';
  jewelryOptions.style.display = 'flex';
  insertJewelryOptions(currentType, 'jewelry-options');
}

// Insert jewelry options (from Google Drive)
async function insertJewelryOptions(type, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!driveFolders[type]) {
    console.error("No Google Drive folder mapped for:", type);
    return;
  }

  const images = await fetchDriveImages(driveFolders[type]);

  images.forEach((file, i) => {
    const btn = document.createElement('button');
    const img = document.createElement('img');
    img.src = file.src;
    img.alt = `${type.replace('_', ' ')} ${i + 1}`;
    btn.appendChild(img);
    btn.onclick = () => changeJewelry(type, file.src);
    container.appendChild(btn);
  });
}

// ================== MEDIAPIPE ==================
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });

faceMesh.onResults((results) => {
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const newLandmarks = results.multiFaceLandmarks[0];
    if (!smoothedFaceLandmarks) {
      smoothedFaceLandmarks = newLandmarks;
    } else {
      const smoothingFactor = 0.2;
      smoothedFaceLandmarks = smoothedFaceLandmarks.map((prev, i) => ({
        x: prev.x * (1 - smoothingFactor) + newLandmarks[i].x * smoothingFactor,
        y: prev.y * (1 - smoothingFactor) + newLandmarks[i].y * smoothingFactor,
        z: prev.z * (1 - smoothingFactor) + newLandmarks[i].z * smoothingFactor,
      }));
    }
  } else {
    smoothedFaceLandmarks = null;
  }
  drawJewelry(smoothedFaceLandmarks, canvasCtx);
});

// Start camera
async function startCamera(facingMode) {
  if (camera) camera.stop();
  camera = new Camera(videoElement, {
    onFrame: async () => {
      await faceMesh.send({ image: videoElement });
    },
    width: 1280,
    height: 720,
    facingMode: facingMode
  });
  camera.start();
}

document.addEventListener('DOMContentLoaded', () => startCamera('user'));

videoElement.addEventListener('loadedmetadata', () => {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
});

// =============== Smoothing Helper ==================
function smoothPoint(prev, current, factor = 0.4) {
  if (!prev) return current;
  return {
    x: prev.x * (1 - factor) + current.x * factor,
    y: prev.y * (1 - factor) + current.y * factor
  };
}

// Draw jewelry
function drawJewelry(faceLandmarks, ctx) {
  const earringScale = 0.078;
  const necklaceScale = 0.252;

  if (faceLandmarks) {
    const leftEarLandmark = faceLandmarks[132];
    const rightEarLandmark = faceLandmarks[361];
    const neckLandmark = faceLandmarks[152];

    let leftEarPos = { x: leftEarLandmark.x * canvasElement.width - 16, y: leftEarLandmark.y * canvasElement.height - 150 };
    let rightEarPos = { x: rightEarLandmark.x * canvasElement.width + 16, y: rightEarLandmark.y * canvasElement.height - 150 };
    let neckPos = { x: neckLandmark.x * canvasElement.width - 8, y: neckLandmark.y * canvasElement.height + 10 };

    smoothedFacePoints.leftEar = smoothPoint(smoothedFacePoints.leftEar, leftEarPos);
    smoothedFacePoints.rightEar = smoothPoint(smoothedFacePoints.rightEar, rightEarPos);
    smoothedFacePoints.neck = smoothPoint(smoothedFacePoints.neck, neckPos);

    if (earringImg) {
      const w = earringImg.width * earringScale, h = earringImg.height * earringScale;
      ctx.drawImage(earringImg, smoothedFacePoints.leftEar.x - w / 2, smoothedFacePoints.leftEar.y, w, h);
      ctx.drawImage(earringImg, smoothedFacePoints.rightEar.x - w / 2, smoothedFacePoints.rightEar.y, w, h);
    }
    if (necklaceImg) {
      const w = necklaceImg.width * necklaceScale, h = necklaceImg.height * necklaceScale;
      ctx.drawImage(necklaceImg, smoothedFacePoints.neck.x - w / 2, smoothedFacePoints.neck.y, w, h);
    }
  }
}
