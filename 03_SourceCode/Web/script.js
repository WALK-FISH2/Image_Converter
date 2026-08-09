import {
  TONES as tones,
  calculateGridRows,
  calculateSamplePlacement,
  renderRasterCells,
} from "./raster-renderer.js";
import {
  QUALITY_PRESETS,
  chooseEncoder,
  defaultFpsOption,
  estimateOutputBytes,
  fitEvenDimensions,
  formatBytes,
  formatFps,
  inspectVideoFile,
  isFpsOptionAvailable,
  offlineExportSupport,
  resolveOutputFps,
} from "./video-export.js";

const canvas = document.querySelector("#screenCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const machine = document.querySelector(".machine");
const crtFrame = document.querySelector("#crtFrame");
const hiddenVideo = document.querySelector("#hiddenVideo");
const imageInput = document.querySelector("#imageInput");
const videoInput = document.querySelector("#videoInput");
const sourceLabel = document.querySelector("#sourceLabel");
const modeLabel = document.querySelector("#modeLabel");
const toneNeedle = document.querySelector("#toneNeedle");
const saveButton = document.querySelector("#saveButton");
const saveLabel = saveButton.querySelector(".save-label");
const exportDialog = document.querySelector("#exportDialog");
const exportSettings = document.querySelector("#exportSettings");
const exportProgress = document.querySelector("#exportProgress");
const exportStartButton = document.querySelector("#exportStartButton");
const exportCancelButton = document.querySelector("#exportCancelButton");
const sourceFpsLabel = document.querySelector("#sourceFpsLabel");
const exportResolution = document.querySelector("#exportResolution");
const exportFpsReadout = document.querySelector("#exportFpsReadout");
const exportCodec = document.querySelector("#exportCodec");
const exportSize = document.querySelector("#exportSize");
const exportNotice = document.querySelector("#exportNotice");
const exportStage = document.querySelector("#exportStage");
const exportPercent = document.querySelector("#exportPercent");
const exportProgressBar = document.querySelector("#exportProgressBar");
const exportFrameCount = document.querySelector("#exportFrameCount");
const exportAudioStatus = document.querySelector("#exportAudioStatus");

const controls = {
  cols: document.querySelector("#colsControl"),
  scale: document.querySelector("#scaleControl"),
  contrast: document.querySelector("#contrastControl"),
  invert: document.querySelector("#invertControl"),
  dither: document.querySelector("#ditherControl"),
  glow: document.querySelector("#glowControl"),
};

const readouts = {
  cols: document.querySelector("#colsValue"),
  scale: document.querySelector("#scaleValue"),
  contrast: document.querySelector("#contrastValue"),
};

const state = {
  mode: "ascii",
  charset: "dense",
  tone: "green",
  power: true,
  reflection: true,
  source: "demo",
  image: null,
  videoReady: false,
  videoFile: null,
  videoObjectUrl: null,
  videoMetadata: null,
  videoMetadataPromise: null,
  videoMetadataError: null,
  exportWorker: null,
  exportPlayback: null,
  exportProbeToken: 0,
  exportEncoder: null,
  saving: false,
  tick: 0,
};

const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const width = Math.max(420, Math.floor(rect.width * ratio));
  const height = Math.max(300, Math.floor(rect.height * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function roundedScreenClip() {
  const radius = Math.min(canvas.width, canvas.height) * 0.035;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(canvas.width - radius, 0);
  ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
  ctx.lineTo(canvas.width, canvas.height - radius);
  ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
  ctx.lineTo(radius, canvas.height);
  ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.clip();
}

function drawDemoSource(time) {
  const width = 360;
  const height = 240;
  sourceCanvas.width = width;
  sourceCanvas.height = height;

  const g = sourceCtx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, "#111917");
  g.addColorStop(0.46, "#d9d5bd");
  g.addColorStop(1, "#111917");
  sourceCtx.fillStyle = g;
  sourceCtx.fillRect(0, 0, width, height);

  sourceCtx.save();
  sourceCtx.translate(width / 2, height / 2);
  sourceCtx.rotate(Math.sin(time * 0.0012) * 0.16);

  sourceCtx.fillStyle = "#f5f1d8";
  sourceCtx.beginPath();
  sourceCtx.ellipse(-34, -3, 74, 92, -0.14, 0, Math.PI * 2);
  sourceCtx.fill();

  sourceCtx.fillStyle = "#151c1b";
  sourceCtx.beginPath();
  sourceCtx.ellipse(-58, -12, 16, 24, -0.16, 0, Math.PI * 2);
  sourceCtx.ellipse(-14, -14, 17, 25, 0.08, 0, Math.PI * 2);
  sourceCtx.fill();

  sourceCtx.strokeStyle = "#19201f";
  sourceCtx.lineWidth = 10;
  sourceCtx.lineCap = "round";
  sourceCtx.beginPath();
  sourceCtx.moveTo(-88, 70);
  sourceCtx.bezierCurveTo(-44, 98, 12, 98, 48, 62);
  sourceCtx.stroke();

  sourceCtx.fillStyle = "#303a38";
  sourceCtx.fillRect(54, -72, 18, 132);
  sourceCtx.fillRect(86, -68, 20, 126);
  sourceCtx.fillStyle = "#b84c3d";
  sourceCtx.fillRect(58, -68, 10, 122);
  sourceCtx.fillStyle = "#4d89a2";
  sourceCtx.fillRect(90, -64, 12, 118);

  sourceCtx.restore();

  sourceCtx.globalCompositeOperation = "multiply";
  sourceCtx.fillStyle = "rgba(0, 0, 0, 0.12)";
  for (let y = 0; y < height; y += 8) {
    sourceCtx.fillRect(0, y, width, 2);
  }
  sourceCtx.globalCompositeOperation = "source-over";
}

function drawSource(time) {
  if (state.source === "image" && state.image) {
    const maxSide = 480;
    const ratio = state.image.width / state.image.height;
    sourceCanvas.width = ratio >= 1 ? maxSide : Math.round(maxSide * ratio);
    sourceCanvas.height = ratio >= 1 ? Math.round(maxSide / ratio) : maxSide;
    sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceCtx.drawImage(state.image, 0, 0, sourceCanvas.width, sourceCanvas.height);
    return;
  }

  if (state.source === "video" && state.videoReady) {
    const ratio = hiddenVideo.videoWidth / hiddenVideo.videoHeight || 1;
    const maxSide = 480;
    sourceCanvas.width = ratio >= 1 ? maxSide : Math.round(maxSide * ratio);
    sourceCanvas.height = ratio >= 1 ? Math.round(maxSide / ratio) : maxSide;
    sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceCtx.drawImage(hiddenVideo, 0, 0, sourceCanvas.width, sourceCanvas.height);
    return;
  }

  drawDemoSource(time);
}

function buildSampleGrid() {
  const cols = Number(controls.cols.value);
  const rows = calculateGridRows(cols, canvas.width, canvas.height);
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;

  const scale = Number(controls.scale.value) / 100;
  const placement = calculateSamplePlacement({
    cols,
    rows,
    targetWidth: canvas.width,
    targetHeight: canvas.height,
    sourceWidth: sourceCanvas.width,
    sourceHeight: sourceCanvas.height,
    scale,
    preserveAspect: state.source !== "demo",
  });

  sampleCtx.fillStyle = "#050505";
  sampleCtx.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.drawImage(
    sourceCanvas,
    placement.x,
    placement.y,
    placement.width,
    placement.height,
  );
}

function fillScreenBackground() {
  const tone = tones[state.tone];
  ctx.fillStyle = `rgb(${tone.bg[0]}, ${tone.bg[1]}, ${tone.bg[2]})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.48,
    0,
    canvas.width * 0.5,
    canvas.height * 0.48,
    canvas.width * 0.74,
  );
  glow.addColorStop(0, `rgba(${tone.fg[0]}, ${tone.fg[1]}, ${tone.fg[2]}, 0.08)`);
  glow.addColorStop(0.62, "rgba(0, 0, 0, 0)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0.52)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function currentRenderSettings() {
  return {
    cols: Number(controls.cols.value),
    scale: Number(controls.scale.value) / 100,
    contrast: Number(controls.contrast.value) / 100,
    mode: state.mode,
    charset: state.charset,
    tone: state.tone,
    invert: controls.invert.checked,
    dither: controls.dither.checked,
    glow: controls.glow.checked,
  };
}

function renderScreen(time = 0) {
  resizeCanvas();

  ctx.save();
  roundedScreenClip();
  fillScreenBackground();

  if (state.power) {
    drawSource(time);
    buildSampleGrid();

    const cols = sampleCanvas.width;
    const rows = sampleCanvas.height;
    const imageData = sampleCtx.getImageData(0, 0, cols, rows);
    const marginX = canvas.width * 0.055;
    const marginY = canvas.height * 0.06;
    const cellW = (canvas.width - marginX * 2) / cols;
    const cellH = (canvas.height - marginY * 2) / rows;

    renderRasterCells({
      ctx,
      data: imageData.data,
      rows,
      cols,
      x: marginX,
      y: marginY,
      width: cellW * cols,
      height: cellH * rows,
      settings: currentRenderSettings(),
    });

    drawScreenNoise();
  }

  ctx.restore();
  state.tick = requestAnimationFrame(renderScreen);
}

function drawScreenNoise() {
  const tone = tones[state.tone];
  ctx.save();
  ctx.globalAlpha = 0.11;
  for (let i = 0; i < 180; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const value = 30 + Math.random() * 80;
    ctx.fillStyle = `rgba(${tone.fg[0]}, ${tone.fg[1]}, ${tone.fg[2]}, ${value / 255})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function updateLabels() {
  readouts.cols.textContent = controls.cols.value;
  readouts.scale.textContent = (Number(controls.scale.value) / 100).toFixed(2);
  readouts.contrast.textContent = (Number(controls.contrast.value) / 100).toFixed(2);
  modeLabel.textContent = `${state.mode.toUpperCase()} / ${controls.cols.value} COL`;
}

function setTone(tone) {
  state.tone = tone;
  crtFrame.classList.remove("tone-green", "tone-amber", "tone-paper");
  crtFrame.classList.add(`tone-${tone}`);
  toneNeedle.style.transform = `rotate(${tones[tone].angle}deg)`;

  document.querySelectorAll(".tone").forEach((button) => {
    button.classList.toggle("active", button.dataset.tone === tone);
  });
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  updateLabels();
}

function setCharset(charset) {
  state.charset = charset;
  document.querySelectorAll("[data-charset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.charset === charset);
  });
}

function loadImage(file) {
  if (!file) return;
  if (state.videoObjectUrl) {
    URL.revokeObjectURL(state.videoObjectUrl);
    state.videoObjectUrl = null;
  }
  state.videoFile = null;
  state.videoMetadata = null;
  state.videoMetadataPromise = null;
  state.videoMetadataError = null;
  hiddenVideo.pause();
  hiddenVideo.removeAttribute("src");
  hiddenVideo.load();
  const image = new Image();
  image.onload = () => {
    state.image = image;
    state.source = "image";
    state.videoReady = false;
    hiddenVideo.pause();
    sourceLabel.textContent = file.name.toUpperCase().slice(0, 28);
    URL.revokeObjectURL(image.src);
  };
  image.src = URL.createObjectURL(file);
}

function loadVideo(file) {
  if (!file) return;
  if (state.videoObjectUrl) URL.revokeObjectURL(state.videoObjectUrl);
  state.source = "video";
  state.videoReady = false;
  state.image = null;
  state.videoFile = file;
  state.videoMetadata = null;
  state.videoMetadataError = null;
  state.videoMetadataPromise = inspectVideoFile(file)
    .then((metadata) => {
      if (state.videoFile === file) state.videoMetadata = metadata;
      return metadata;
    })
    .catch((error) => {
      if (state.videoFile === file) state.videoMetadataError = error;
      return null;
    });
  state.videoObjectUrl = URL.createObjectURL(file);
  hiddenVideo.src = state.videoObjectUrl;
  hiddenVideo.onloadeddata = () => {
    state.videoReady = true;
    sourceLabel.textContent = file.name.toUpperCase().slice(0, 28);
    hiddenVideo.play().catch(() => {
      sourceLabel.textContent = "VIDEO PAUSED";
    });
  };
}

function setSaving(isSaving, label = "SAVE") {
  state.saving = isSaving;
  saveButton.disabled = isSaving;
  saveButton.classList.toggle("recording", isSaving);
  saveLabel.textContent = label;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function evenDimension(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function currentOutputAspect() {
  if (state.source === "demo") {
    return canvas.width / canvas.height;
  }

  if (state.source === "video" && hiddenVideo.videoWidth && hiddenVideo.videoHeight) {
    return hiddenVideo.videoWidth / hiddenVideo.videoHeight;
  }

  if (state.source === "image" && state.image) {
    return state.image.width / state.image.height;
  }

  if (sourceCanvas.width && sourceCanvas.height) {
    return sourceCanvas.width / sourceCanvas.height;
  }

  return canvas.width / canvas.height;
}

function outputCropForAspect(aspect) {
  let width = canvas.width;
  let height = width / aspect;

  if (height > canvas.height) {
    height = canvas.height;
    width = height * aspect;
  }

  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height
  };
}

function createExportCanvas() {
  const aspect = currentOutputAspect();
  const crop = outputCropForAspect(aspect);
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = evenDimension(crop.width);
  exportCanvas.height = evenDimension(crop.height);
  return exportCanvas;
}

function drawExportFrame(exportCanvas, exportCtx) {
  const aspect = exportCanvas.width / exportCanvas.height;
  const crop = outputCropForAspect(aspect);
  exportCtx.drawImage(
    canvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    exportCanvas.width,
    exportCanvas.height,
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function saveCanvasImage() {
  setSaving(true, "SAVING");
  requestAnimationFrame(() => {
    const exportCanvas = createExportCanvas();
    const exportCtx = exportCanvas.getContext("2d");
    drawExportFrame(exportCanvas, exportCtx);
    exportCanvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `ic84-raster-${timestamp()}.png`);
        sourceLabel.textContent = "IMAGE SAVED";
      } else {
        sourceLabel.textContent = "SAVE FAILED";
      }
      setSaving(false);
    }, "image/png");
  });
}

function pickRecorderMimeType() {
  const types = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  return types.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || "";
}

function waitForSeek(time) {
  return new Promise((resolve) => {
    if (!Number.isFinite(hiddenVideo.duration)) {
      resolve();
      return;
    }

    const done = () => {
      hiddenVideo.removeEventListener("seeked", done);
      resolve();
    };

    hiddenVideo.addEventListener("seeked", done, { once: true });
    hiddenVideo.currentTime = Math.min(Math.max(0, time), Math.max(0, hiddenVideo.duration - 0.05));

    if (Math.abs(hiddenVideo.currentTime - time) < 0.05) {
      requestAnimationFrame(done);
    }
  });
}

async function saveProcessedVideoRealtime() {
  if (!canvas.captureStream || !window.MediaRecorder) {
    sourceLabel.textContent = "VIDEO SAVE UNSUPPORTED";
    saveCanvasImage();
    return;
  }

  setSaving(true, "REC");
  const previousLoop = hiddenVideo.loop;
  const previousTime = hiddenVideo.currentTime;
  const wasPaused = hiddenVideo.paused;
  const duration = Number.isFinite(hiddenVideo.duration) && hiddenVideo.duration > 0 ? hiddenVideo.duration : 8;
  const mimeType = pickRecorderMimeType();
  const chunks = [];
  let copying = false;
  let stream = null;

  try {
    hiddenVideo.loop = false;
    await waitForSeek(0);

    const exportCanvas = createExportCanvas();
    const exportCtx = exportCanvas.getContext("2d");
    copying = true;
    const copyFrame = () => {
      if (!copying) return;
      drawExportFrame(exportCanvas, exportCtx);
      requestAnimationFrame(copyFrame);
    };
    copyFrame();

    stream = exportCanvas.captureStream(30);
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const stopped = new Promise((resolve) => {
      recorder.addEventListener("stop", resolve, { once: true });
    });

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    });

    sourceLabel.textContent = "COMPAT RECORDING";
    recorder.start(250);
    await hiddenVideo.play();

    await new Promise((resolve) => {
      const timer = window.setTimeout(resolve, Math.ceil((duration + 0.35) * 1000));
      hiddenVideo.addEventListener("ended", () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
    });

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    await stopped;
    copying = false;
    stream.getTracks().forEach((track) => track.stop());

    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    if (blob.size > 0) {
      downloadBlob(blob, `ic84-raster-video-${timestamp()}.webm`);
      sourceLabel.textContent = "VIDEO SAVED";
    } else {
      sourceLabel.textContent = "SAVE FAILED";
    }
  } catch (error) {
    sourceLabel.textContent = "SAVE FAILED";
  } finally {
    copying = false;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    hiddenVideo.loop = previousLoop;
    await waitForSeek(previousTime).catch(() => {});
    if (!wasPaused) {
      hiddenVideo.play().catch(() => {});
    }
    setSaving(false);
  }
}

function selectedRadioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function setSelectedRadio(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input && !input.disabled) input.checked = true;
}

function setExportInputsLocked(locked) {
  document.querySelectorAll("input[name='exportQuality'], input[name='exportFps']").forEach((input) => {
    if (locked) {
      input.dataset.wasDisabled = String(input.disabled);
      input.disabled = true;
    } else {
      input.disabled = input.dataset.wasDisabled === "true";
      delete input.dataset.wasDisabled;
    }
  });
}

async function requireVideoMetadata() {
  if (state.videoMetadata) return state.videoMetadata;
  const metadata = await state.videoMetadataPromise;
  if (metadata) return metadata;
  throw state.videoMetadataError || new Error("无法读取视频信息。");
}

function resetExportProgress() {
  exportSettings.hidden = false;
  exportProgress.hidden = true;
  exportStage.textContent = "PREPARING";
  exportPercent.textContent = "0%";
  exportProgressBar.style.inlineSize = "0%";
  exportFrameCount.textContent = "正在建立离线处理管线…";
  exportAudioStatus.textContent = "";
  exportCancelButton.disabled = false;
  exportCancelButton.textContent = "取消";
}

function selectedExportSpec(metadata) {
  const qualityName = selectedRadioValue("exportQuality") || "hd";
  const preset = QUALITY_PRESETS[qualityName] || QUALITY_PRESETS.hd;
  const dimensions = fitEvenDimensions(metadata.width, metadata.height, qualityName);
  const fpsMode = selectedRadioValue("exportFps") || defaultFpsOption(metadata.sourceFps);
  const fps = resolveOutputFps(metadata.sourceFps, fpsMode);
  return { qualityName, preset, dimensions, fpsMode, fps };
}

async function updateExportEstimate() {
  if (!state.videoMetadata || state.saving) return;
  const metadata = state.videoMetadata;
  const { preset, dimensions, fps } = selectedExportSpec(metadata);
  const support = offlineExportSupport();
  const probeToken = ++state.exportProbeToken;

  exportResolution.textContent = `${dimensions.width} × ${dimensions.height}`;
  exportFpsReadout.textContent = `${formatFps(fps)} FPS`;
  exportSize.textContent = formatBytes(estimateOutputBytes(metadata.duration, preset.bitrate, metadata.hasAudio));
  exportStartButton.disabled = true;
  state.exportEncoder = null;

  if (!metadata.canDecode) {
    exportCodec.textContent = "WebM / 实时录制";
    exportNotice.textContent = "当前浏览器不能用 WebCodecs 解码此视频，将使用实时录制兼容模式。";
    exportStartButton.textContent = "兼容录制";
    exportStartButton.disabled = !(canvas.captureStream && window.MediaRecorder);
    return;
  }

  if (!support.supported) {
    exportCodec.textContent = "WebM / 实时录制";
    exportNotice.textContent = support.reason;
    exportStartButton.textContent = "兼容录制";
    exportStartButton.disabled = !(canvas.captureStream && window.MediaRecorder);
    return;
  }

  exportCodec.textContent = "检测中…";
  exportNotice.textContent = "";
  const encoder = await chooseEncoder({
    width: dimensions.width,
    height: dimensions.height,
    fps,
    bitrate: preset.bitrate,
  });
  if (probeToken !== state.exportProbeToken) return;

  if (encoder) {
    state.exportEncoder = encoder;
    const acceleration = encoder.hardwareAcceleration === "prefer-hardware" ? "硬件优先" : "兼容模式";
    exportCodec.textContent = encoder.codecLabel;
    exportNotice.textContent = `${acceleration} · 可在后台离线逐帧处理，不按视频播放速度等待。`;
    exportStartButton.textContent = "开始导出";
    exportStartButton.disabled = false;
  } else {
    exportCodec.textContent = "WebM / 实时录制";
    exportNotice.textContent = "当前设备没有可用的 H.264 或 VP9 WebCodecs 编码器，只能使用实时录制兼容模式。";
    exportStartButton.textContent = "兼容录制";
    exportStartButton.disabled = !(canvas.captureStream && window.MediaRecorder);
  }
}

function configureFpsOptions(metadata) {
  sourceFpsLabel.textContent = `${formatFps(metadata.sourceFps)} FPS`;
  document.querySelectorAll("input[name='exportFps']").forEach((input) => {
    if (input.value === "source") {
      input.disabled = false;
      return;
    }

    const available = isFpsOptionAvailable(metadata.sourceFps, Number(input.value));
    input.disabled = !available;
    input.closest(".export-choice").title = available
      ? ""
      : `源视频约为 ${formatFps(metadata.sourceFps)} FPS，不能生成新的真实画面。`;
  });

  setSelectedRadio("exportFps", defaultFpsOption(metadata.sourceFps));
}

async function openVideoExportDialog() {
  if (!state.videoFile || state.saving) return;
  resetExportProgress();
  setSelectedRadio("exportQuality", "hd");
  exportResolution.textContent = "--";
  exportFpsReadout.textContent = "--";
  exportCodec.textContent = "读取中…";
  exportSize.textContent = "--";
  exportNotice.textContent = "正在读取视频轨道、尺寸和帧率信息。";
  exportStartButton.disabled = true;
  exportStartButton.textContent = "开始导出";

  if (!exportDialog.open) exportDialog.showModal();

  try {
    const metadata = await requireVideoMetadata();
    if (!exportDialog.open) return;
    configureFpsOptions(metadata);
    await updateExportEstimate();
  } catch (error) {
    exportCodec.textContent = "不可用";
    exportNotice.textContent = error instanceof Error ? error.message : String(error);
    exportStartButton.disabled = true;
  }
}

function showOfflineProgress() {
  exportSettings.hidden = true;
  exportProgress.hidden = false;
  exportStartButton.disabled = true;
  exportStartButton.textContent = "导出中";
  exportCancelButton.textContent = "取消导出";
  setExportInputsLocked(true);
}

async function restoreVideoPlayback() {
  const playback = state.exportPlayback;
  state.exportPlayback = null;
  if (!playback || !state.videoReady) return;

  hiddenVideo.loop = playback.loop;
  await waitForSeek(playback.time).catch(() => {});
  if (!playback.paused) hiddenVideo.play().catch(() => {});
}

async function resetAfterOfflineExport({ closeDialog = false } = {}) {
  if (state.exportWorker) {
    state.exportWorker.terminate();
    state.exportWorker = null;
  }
  await restoreVideoPlayback();
  setSaving(false);
  setExportInputsLocked(false);
  exportStartButton.disabled = false;
  exportStartButton.textContent = "开始导出";
  exportCancelButton.disabled = false;
  exportCancelButton.textContent = "取消";
  if (closeDialog && exportDialog.open) exportDialog.close();
}

function updateWorkerProgress(message) {
  const labels = {
    RENDERING: "RENDERING FRAMES",
    FINALIZING: "FINALIZING VIDEO",
    MUXING: "MUXING OUTPUT",
  };
  const percentage = Math.max(0, Math.min(100, Math.round(message.progress * 100)));
  exportStage.textContent = labels[message.stage] || message.stage || "PROCESSING";
  exportPercent.textContent = `${percentage}%`;
  exportProgressBar.style.inlineSize = `${percentage}%`;
  exportFrameCount.textContent = `已处理 ${message.frame} / ${message.totalFrames} 帧`;
}

async function handleWorkerMessage(event) {
  const message = event.data;
  if (message.type === "progress") {
    updateWorkerProgress(message);
    return;
  }

  if (message.type === "audio") {
    exportAudioStatus.textContent = message.label;
    return;
  }

  if (message.type === "complete") {
    exportPercent.textContent = "100%";
    exportProgressBar.style.inlineSize = "100%";
    exportFrameCount.textContent = `完成 ${message.frameCount} 帧 · ${message.codecLabel}`;
    exportAudioStatus.textContent = message.audioLabel;
    const blob = new Blob([message.buffer], { type: message.mimeType });
    downloadBlob(blob, `ic84-raster-video-${timestamp()}.${message.extension}`);
    sourceLabel.textContent = "VIDEO SAVED";
    await resetAfterOfflineExport({ closeDialog: true });
    return;
  }

  if (message.type === "canceled") {
    sourceLabel.textContent = "EXPORT CANCELED";
    await resetAfterOfflineExport({ closeDialog: true });
    return;
  }

  if (message.type === "error") {
    sourceLabel.textContent = "EXPORT FAILED";
    await resetAfterOfflineExport();
    resetExportProgress();
    exportNotice.textContent = `离线导出失败：${message.message}`;
    await updateExportEstimate();
  }
}

async function startOfflineExport() {
  const metadata = await requireVideoMetadata();
  const spec = selectedExportSpec(metadata);
  if (!state.exportEncoder) {
    const accepted = window.confirm(
      "当前浏览器无法使用 WebCodecs 离线编码，将改用实时录制。保存时间约等于视频时长，是否继续？",
    );
    if (accepted) {
      exportDialog.close();
      await saveProcessedVideoRealtime();
    }
    return;
  }

  state.exportPlayback = {
    time: hiddenVideo.currentTime,
    paused: hiddenVideo.paused,
    loop: hiddenVideo.loop,
  };
  hiddenVideo.pause();
  setSaving(true, "EXPORT");
  showOfflineProgress();
  sourceLabel.textContent = "OFFLINE EXPORT";

  try {
    const worker = new Worker(new URL("./video-export-worker.js", import.meta.url), { type: "module" });
    state.exportWorker = worker;
    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", async (event) => {
      sourceLabel.textContent = "EXPORT FAILED";
      await resetAfterOfflineExport();
      resetExportProgress();
      exportNotice.textContent = `离线导出 Worker 异常：${event.message || "未知错误"}`;
      await updateExportEstimate();
    }, { once: true });
    worker.postMessage({
      type: "start",
      file: state.videoFile,
      options: {
        width: spec.dimensions.width,
        height: spec.dimensions.height,
        fps: spec.fps,
        fpsMode: spec.fpsMode,
        bitrate: spec.preset.bitrate,
        encoder: state.exportEncoder,
        render: currentRenderSettings(),
      },
    });
  } catch (error) {
    sourceLabel.textContent = "EXPORT FAILED";
    await resetAfterOfflineExport();
    resetExportProgress();
    exportNotice.textContent = `无法启动离线导出：${error instanceof Error ? error.message : String(error)}`;
    await updateExportEstimate();
  }
}

async function cancelOfflineExport() {
  if (!state.exportWorker) {
    exportDialog.close();
    return;
  }

  exportCancelButton.disabled = true;
  exportCancelButton.textContent = "正在取消…";
  exportStage.textContent = "CANCELING";
  state.exportWorker.postMessage({ type: "cancel" });
}

function saveCurrentOutput() {
  if (state.saving) return;
  if (state.source === "video" && state.videoReady) {
    openVideoExportDialog();
    return;
  }

  saveCanvasImage();
}

document.querySelector("[data-action='load-image']").addEventListener("click", () => imageInput.click());
document.querySelector("[data-action='load-video']").addEventListener("click", () => videoInput.click());
imageInput.addEventListener("change", (event) => loadImage(event.target.files[0]));
videoInput.addEventListener("change", (event) => loadVideo(event.target.files[0]));
saveButton.addEventListener("click", saveCurrentOutput);
exportStartButton.addEventListener("click", () => {
  if (!state.saving) startOfflineExport().catch((error) => {
    exportNotice.textContent = error instanceof Error ? error.message : String(error);
  });
});
exportCancelButton.addEventListener("click", cancelOfflineExport);
exportDialog.addEventListener("cancel", (event) => {
  if (state.saving) {
    event.preventDefault();
    cancelOfflineExport();
  }
});
document.querySelectorAll("input[name='exportQuality'], input[name='exportFps']").forEach((input) => {
  input.addEventListener("change", updateExportEstimate);
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll("[data-charset]").forEach((button) => {
  button.addEventListener("click", () => setCharset(button.dataset.charset));
});

document.querySelectorAll(".tone").forEach((button) => {
  button.addEventListener("click", () => setTone(button.dataset.tone));
});

Object.values(controls).forEach((control) => {
  control.addEventListener("input", () => {
    updateLabels();
    crtFrame.classList.toggle("glow-on", controls.glow.checked);
  });
});

document.querySelector("#reflectionButton").addEventListener("click", (event) => {
  state.reflection = !state.reflection;
  crtFrame.classList.toggle("reflection-off", !state.reflection);
  event.currentTarget.classList.toggle("on", state.reflection);
  event.currentTarget.setAttribute("aria-pressed", String(state.reflection));
});

document.querySelector("#powerButton").addEventListener("click", (event) => {
  state.power = !state.power;
  machine.classList.toggle("power-off", !state.power);
  event.currentTarget.classList.toggle("on", state.power);
  event.currentTarget.setAttribute("aria-pressed", String(state.power));
});

window.addEventListener("resize", resizeCanvas);

updateLabels();
setTone("green");
setMode("ascii");
setCharset("dense");
renderScreen();
