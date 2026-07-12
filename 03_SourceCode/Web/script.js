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
  source: "demo",
  image: null,
  videoReady: false,
  tick: 0,
};

const charsets = {
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  block: "  ░▒▓█",
  line: "  .-:=+*#%@",
};

const tones = {
  green: {
    bg: [2, 15, 7],
    fg: [124, 255, 138],
    shadow: "rgba(124, 255, 138, 0.42)",
    angle: -42,
  },
  amber: {
    bg: [21, 12, 2],
    fg: [255, 195, 90],
    shadow: "rgba(255, 195, 90, 0.38)",
    // shadow: "rgba(188,190,169)",
    angle: 0,
  },
  paper: {
    bg: [7, 15, 16],
    fg: [215, 240, 231],
    shadow: "rgba(215, 240, 231, 0.3)",
    angle: 42,
  },
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
  const aspect = canvas.height / canvas.width;
  const rows = Math.max(24, Math.round(cols * aspect * 0.55));
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;

  const scale = Number(controls.scale.value) / 100;
  const drawW = sampleCanvas.width * scale;
  const drawH = sampleCanvas.height * scale;
  const drawX = (sampleCanvas.width - drawW) / 2;
  const drawY = (sampleCanvas.height - drawH) / 2;

  sampleCtx.fillStyle = "#050505";
  sampleCtx.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.drawImage(sourceCanvas, drawX, drawY, drawW, drawH);
}

function luminanceAt(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function processedBrightness(value, x, y) {
  let brightness = value / 255;
  const contrast = Number(controls.contrast.value) / 100;
  brightness = (brightness - 0.5) * contrast + 0.5;

  if (controls.dither.checked) {
    const matrix = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    brightness += (matrix[y % 4][x % 4] / 16 - 0.5) * 0.16;
  }

  if (controls.invert.checked) {
    brightness = 1 - brightness;
  }

  return Math.max(0, Math.min(1, brightness));
}

function toneColor(alpha = 1, boost = 1) {
  const tone = tones[state.tone];
  const r = Math.min(255, Math.round(tone.fg[0] * boost));
  const g = Math.min(255, Math.round(tone.fg[1] * boost));
  const b = Math.min(255, Math.round(tone.fg[2] * boost));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

function renderAscii(data, rows, cols, cellW, cellH) {
  const chars = charsets[state.charset];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.max(8, Math.floor(cellH * 0.98))}px "Courier New", monospace`;

  if (controls.glow.checked) {
    ctx.shadowColor = tones[state.tone].shadow;
    ctx.shadowBlur = Math.max(4, cellW * 0.9);
  } else {
    ctx.shadowBlur = 0;
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = (y * cols + x) * 4;
      const b = processedBrightness(luminanceAt(data, index), x, y);
      const charIndex = Math.min(chars.length - 1, Math.floor(b * (chars.length - 1)));
      ctx.fillStyle = toneColor(0.18 + b * 0.86, 0.82 + b * 0.35);
      ctx.fillText(chars[charIndex], x * cellW + cellW / 2, y * cellH + cellH / 2);
    }
  }
  ctx.shadowBlur = 0;
}

function renderDots(data, rows, cols, cellW, cellH) {
  const maxRadius = Math.min(cellW, cellH) * 0.42;
  if (controls.glow.checked) {
    ctx.shadowColor = tones[state.tone].shadow;
    ctx.shadowBlur = Math.max(2, cellW * 0.5);
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = (y * cols + x) * 4;
      const b = processedBrightness(luminanceAt(data, index), x, y);
      const radius = Math.max(0.35, maxRadius * (0.14 + b));
      ctx.beginPath();
      ctx.fillStyle = toneColor(0.15 + b * 0.9, 0.8 + b * 0.35);
      ctx.arc(x * cellW + cellW / 2, y * cellH + cellH / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
}

function renderHalftone(data, rows, cols, cellW, cellH) {
  if (controls.glow.checked) {
    ctx.shadowColor = tones[state.tone].shadow;
    ctx.shadowBlur = Math.max(2, cellW * 0.45);
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = (y * cols + x) * 4;
      const b = processedBrightness(luminanceAt(data, index), x, y);
      const w = cellW * (0.22 + b * 0.76);
      const h = cellH * 0.46;
      ctx.save();
      ctx.translate(x * cellW + cellW / 2, y * cellH + cellH / 2);
      ctx.rotate(((x + y) % 2 ? -1 : 1) * 0.42);
      ctx.fillStyle = toneColor(0.16 + b * 0.88, 0.82 + b * 0.3);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
  ctx.shadowBlur = 0;
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

    ctx.save();
    ctx.translate(marginX, marginY);

    if (state.mode === "dots") {
      renderDots(imageData.data, rows, cols, cellW, cellH);
    } else if (state.mode === "halftone") {
      renderHalftone(imageData.data, rows, cols, cellW, cellH);
    } else {
      renderAscii(imageData.data, rows, cols, cellW, cellH);
    }
    ctx.restore();

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
  state.source = "video";
  state.videoReady = false;
  state.image = null;
  hiddenVideo.src = URL.createObjectURL(file);
  hiddenVideo.onloadeddata = () => {
    state.videoReady = true;
    sourceLabel.textContent = file.name.toUpperCase().slice(0, 28);
    hiddenVideo.play().catch(() => {
      sourceLabel.textContent = "VIDEO PAUSED";
    });
  };
}

document.querySelector("[data-action='load-image']").addEventListener("click", () => imageInput.click());
document.querySelector("[data-action='load-video']").addEventListener("click", () => videoInput.click());
imageInput.addEventListener("change", (event) => loadImage(event.target.files[0]));
videoInput.addEventListener("change", (event) => loadVideo(event.target.files[0]));

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
