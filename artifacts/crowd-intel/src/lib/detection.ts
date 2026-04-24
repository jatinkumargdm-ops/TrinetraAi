import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as faceapi from "@vladmandic/face-api";

const FACE_MODEL_URL =
  (import.meta.env.BASE_URL || "/") + "face-models";

let cocoModel: cocoSsd.ObjectDetection | null = null;
let faceLoaded = false;

export async function loadModels(onProgress?: (msg: string) => void) {
  onProgress?.("Initializing TensorFlow runtime");
  await tf.ready();

  onProgress?.("Loading person detector (COCO-SSD)");
  cocoModel = await cocoSsd.load({ base: "lite_mobilenet_v2" });

  onProgress?.("Loading face & demographics models");
  if (!faceLoaded) {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.ageGenderNet.loadFromUri(FACE_MODEL_URL),
    ]);
    faceLoaded = true;
  }
  onProgress?.("All models ready");
}

export function backendName() {
  try {
    return tf.getBackend()?.toUpperCase() || "—";
  } catch {
    return "—";
  }
}

export type FaceInfo = {
  bbox: [number, number, number, number];
  age: number;
  gender: "male" | "female";
  genderProb: number;
  masked: boolean;
  maskScore: number; // 0..1 confidence of being masked
};

export type FrameDetections = {
  personBoxes: [number, number, number, number][];
  faces: FaceInfo[];
};

export async function detectFrame(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  withFaces: boolean,
): Promise<FrameDetections> {
  if (!cocoModel) return { personBoxes: [], faces: [] };
  const preds = await cocoModel.detect(source, 30);
  const personBoxes: [number, number, number, number][] = preds
    .filter((p) => p.class === "person")
    .map((p) => p.bbox as [number, number, number, number]);

  let faces: FaceInfo[] = [];
  if (withFaces && faceLoaded) {
    try {
      const opts = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.5,
      });
      const results = await faceapi
        .detectAllFaces(source as any, opts)
        .withFaceLandmarks()
        .withAgeAndGender();

      faces = results.map((r) => {
        const box = r.detection.box;
        const bbox: [number, number, number, number] = [
          box.x,
          box.y,
          box.width,
          box.height,
        ];
        const { masked, maskScore } = estimateMaskFromLandmarks(
          source,
          r.landmarks,
        );
        return {
          bbox,
          age: r.age,
          gender: r.gender as "male" | "female",
          genderProb: r.genderProbability,
          masked,
          maskScore,
        };
      });
    } catch {
      faces = [];
    }
  }

  return { personBoxes, faces };
}

const tmpCanvas = (typeof document !== "undefined")
  ? document.createElement("canvas")
  : null;

/**
 * Heuristic mask detector.
 *  - Sample the lower-face region (between nose tip and chin, mouth area).
 *  - Compute saturation + skin-tone fraction.
 *  - If region is largely non-skin and low saturation variance => likely masked.
 *  - Returns (masked, score 0..1).
 */
function estimateMaskFromLandmarks(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  landmarks: faceapi.FaceLandmarks68,
): { masked: boolean; maskScore: number } {
  if (!tmpCanvas) return { masked: false, maskScore: 0 };
  try {
    const nose = landmarks.getNose(); // 9 points
    const mouth = landmarks.getMouth(); // 20 points
    const jaw = landmarks.getJawOutline(); // 17 points

    const points = [...mouth, ...jaw.slice(4, 13), nose[6]];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const w = Math.max(8, maxX - minX);
    const h = Math.max(8, maxY - minY);
    if (w < 10 || h < 10) return { masked: false, maskScore: 0 };

    const sw = Math.min(48, Math.round(w));
    const sh = Math.min(48, Math.round(h));
    tmpCanvas.width = sw;
    tmpCanvas.height = sh;
    const ctx = tmpCanvas.getContext("2d");
    if (!ctx) return { masked: false, maskScore: 0 };

    const sx = Math.max(0, Math.floor(minX));
    const sy = Math.max(0, Math.floor(minY));
    ctx.drawImage(source, sx, sy, w, h, 0, 0, sw, sh);
    const data = ctx.getImageData(0, 0, sw, sh).data;

    let skinCount = 0;
    let total = 0;
    let sumS = 0;
    let sumS2 = 0;
    let sumH = 0;
    let sumH2 = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      total++;
      const { h: hh, s, v } = rgbToHsv(r, g, b);
      sumS += s;
      sumS2 += s * s;
      sumH += hh;
      sumH2 += hh * hh;
      // Loose skin tone test
      if (
        r > 80 && g > 40 && b > 30 &&
        r > g && r > b &&
        Math.abs(r - g) > 12 &&
        v > 0.25 && v < 0.97 &&
        hh < 50
      ) {
        skinCount++;
      }
    }
    const skinFrac = skinCount / Math.max(1, total);
    const meanS = sumS / total;
    const varS = Math.max(0, sumS2 / total - meanS * meanS);
    const meanH = sumH / total;
    const varH = Math.max(0, sumH2 / total - meanH * meanH);

    // Lower skinFrac and lower variance in hue => more likely masked.
    const maskFromSkin = 1 - skinFrac; // 1 = no skin
    const maskFromVar = clamp01(1 - varH / 600);
    const score = clamp01(maskFromSkin * 0.7 + maskFromVar * 0.3);
    const masked = skinFrac < 0.18 && score > 0.55;
    return { masked, maskScore: score };
  } catch {
    return { masked: false, maskScore: 0 };
  }
}

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
