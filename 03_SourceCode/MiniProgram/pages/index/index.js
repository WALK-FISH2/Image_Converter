const CHARSETS = {
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  block: "  ..::ooOO@@",
  line: "  .-:=+*#%@"
};

const TONES = {
  green: {
    bg: [2, 15, 7],
    fg: [124, 255, 138],
    shadow: "rgba(124, 255, 138, 0.42)"
  },
  amber: {
    bg: [21, 12, 2],
    fg: [255, 195, 90],
    shadow: "rgba(255, 195, 90, 0.38)"
  },
  paper: {
    bg: [7, 15, 16],
    fg: [215, 240, 231],
    shadow: "rgba(215, 240, 231, 0.3)"
  }
};

Page({
  data: {
    cols: 80,
    scale: 100,
    contrast: 118,
    mode: "ascii",
    charset: "dense",
    tone: "green",
    invert: false,
    dither: true,
    glow: true,
    power: true,
    sourceLabel: "SIMULATED SIGNAL",
    modeLabel: "ASCII / 80 COL",
    scaleLabel: "1.00",
    contrastLabel: "1.18",
    vents: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    signalBars: [0, 1, 2, 3, 4, 5],
    modes: [
      { id: "ascii", label: "字符" },
      { id: "dots", label: "点阵" },
      { id: "halftone", label: "半调" }
    ],
    charsets: [
      { id: "dense", label: "DENSE" },
      { id: "block", label: "BLOCK" },
      { id: "line", label: "LINE" }
    ],
    tones: [
      { id: "green", label: "绿屏" },
      { id: "amber", label: "琥珀" },
      { id: "paper", label: "冷白" }
    ]
  },

  onReady() {
    const pixelRatio = wx.getSystemInfoSync().pixelRatio || 1;
    this.dpr = Math.max(1, Math.min(pixelRatio, 2));
    this.sourceKind = "demo";
    this.sourceImage = null;
    this.frame = 0;
    this.initCanvases();
  },

  onShow() {
    if (this.screenCanvas && !this.renderTimer) {
      this.startRenderLoop();
    }
  },

  onHide() {
    this.stopRenderLoop();
  },

  onUnload() {
    this.stopRenderLoop();
  },

  initCanvases() {
    this.createSelectorQuery()
      .select("#screenCanvas")
      .fields({ node: true, size: true })
      .select("#sampleCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node || !res[1] || !res[1].node) {
          wx.showToast({ title: "Canvas 初始化失败", icon: "none" });
          return;
        }

        this.screenCanvas = res[0].node;
        this.screenCtx = this.screenCanvas.getContext("2d");
        this.sampleCanvas = res[1].node;
        this.sampleCtx = this.sampleCanvas.getContext("2d");
        this.resizeScreenCanvas(res[0].width, res[0].height);
        this.startRenderLoop();
      });
  },

  resizeScreenCanvas(width, height) {
    this.screenCssWidth = Math.max(240, width || 320);
    this.screenCssHeight = Math.max(160, height || 220);
    this.screenCanvas.width = Math.floor(this.screenCssWidth * this.dpr);
    this.screenCanvas.height = Math.floor(this.screenCssHeight * this.dpr);
  },

  startRenderLoop() {
    this.stopRenderLoop();
    const loop = () => {
      this.renderScreen();
      this.renderTimer = setTimeout(loop, this.data.power ? 90 : 180);
    };
    loop();
  },

  stopRenderLoop() {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["compressed", "original"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file && file.tempFilePath) {
          this.loadCanvasImage(file.tempFilePath, "IMAGE SIGNAL", "image");
        }
      }
    });
  },

  chooseVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["video"],
      sourceType: ["album", "camera"],
      maxDuration: 60,
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        const thumbPath = file.thumbTempFilePath || file.tempFilePath;
        if (thumbPath && file.thumbTempFilePath) {
          this.loadCanvasImage(thumbPath, "VIDEO THUMB", "video");
          return;
        }
        this.sourceKind = "video";
        this.sourceImage = null;
        this.setData({ sourceLabel: "VIDEO SIMULATION" });
      }
    });
  },

  loadCanvasImage(path, label, kind) {
    if (!this.sampleCanvas) return;
    const image = this.sampleCanvas.createImage();
    image.onload = () => {
      this.sourceKind = kind;
      this.sourceImage = image;
      this.setData({ sourceLabel: label });
      this.renderScreen();
    };
    image.onerror = () => {
      wx.showToast({ title: "媒体载入失败", icon: "none" });
    };
    image.src = path;
  },

  onColsChanging(event) {
    const cols = Number(event.detail.value);
    this.setData({
      cols,
      modeLabel: `${this.data.mode.toUpperCase()} / ${cols} COL`
    });
  },

  onScaleChanging(event) {
    const scale = Number(event.detail.value);
    this.setData({
      scale,
      scaleLabel: (scale / 100).toFixed(2)
    });
  },

  onContrastChanging(event) {
    const contrast = Number(event.detail.value);
    this.setData({
      contrast,
      contrastLabel: (contrast / 100).toFixed(2)
    });
  },

  setMode(event) {
    const mode = event.currentTarget.dataset.mode;
    this.setData({
      mode,
      modeLabel: `${mode.toUpperCase()} / ${this.data.cols} COL`
    });
  },

  setCharset(event) {
    this.setData({ charset: event.currentTarget.dataset.charset });
  },

  setTone(event) {
    this.setData({ tone: event.currentTarget.dataset.tone });
  },

  toggleFlag(event) {
    const key = event.currentTarget.dataset.key;
    if (!key) return;
    this.setData({ [key]: !this.data[key] });
  },

  togglePower() {
    this.setData({ power: !this.data.power });
  },

  renderScreen() {
    if (!this.screenCtx || !this.screenCanvas) return;

    const ctx = this.screenCtx;
    const width = this.screenCanvas.width;
    const height = this.screenCanvas.height;

    this.frame += 1;
    ctx.save();
    this.roundedClip(ctx, width, height, Math.min(width, height) * 0.04);
    this.fillScreenBackground(ctx, width, height);

    if (this.data.power) {
      const cols = Number(this.data.cols);
      const rows = Math.max(22, Math.round(cols * (height / width) * 0.52));
      const sample = this.buildSampleData(cols, rows);
      const marginX = width * 0.06;
      const marginY = height * 0.08;
      const cellW = (width - marginX * 2) / cols;
      const cellH = (height - marginY * 2) / rows;

      ctx.save();
      ctx.translate(marginX, marginY);
      if (this.data.mode === "dots") {
        this.renderDots(ctx, sample, rows, cols, cellW, cellH);
      } else if (this.data.mode === "halftone") {
        this.renderHalftone(ctx, sample, rows, cols, cellW, cellH);
      } else {
        this.renderAscii(ctx, sample, rows, cols, cellW, cellH);
      }
      ctx.restore();
      this.drawScreenNoise(ctx, width, height);
    }

    ctx.restore();
  },

  roundedClip(ctx, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.quadraticCurveTo(width, 0, width, radius);
    ctx.lineTo(width, height - radius);
    ctx.quadraticCurveTo(width, height, width - radius, height);
    ctx.lineTo(radius, height);
    ctx.quadraticCurveTo(0, height, 0, height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.clip();
  },

  fillScreenBackground(ctx, width, height) {
    const tone = TONES[this.data.tone];
    ctx.fillStyle = `rgb(${tone.bg[0]}, ${tone.bg[1]}, ${tone.bg[2]})`;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.48, width * 0.72);
    glow.addColorStop(0, `rgba(${tone.fg[0]}, ${tone.fg[1]}, ${tone.fg[2]}, 0.09)`);
    glow.addColorStop(0.62, "rgba(0, 0, 0, 0)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0.56)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  },

  buildSampleData(cols, rows) {
    if (this.sourceImage) {
      return this.sampleImageData(cols, rows);
    }
    return this.demoSampleData(cols, rows);
  },

  sampleImageData(cols, rows) {
    const canvas = this.sampleCanvas;
    const ctx = this.sampleCtx;
    canvas.width = cols;
    canvas.height = rows;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, cols, rows);

    const scale = this.data.scale / 100;
    const imageRatio = (this.sourceImage.width || cols) / (this.sourceImage.height || rows);
    let drawW = cols * scale;
    let drawH = drawW / imageRatio;
    if (drawH > rows * scale) {
      drawH = rows * scale;
      drawW = drawH * imageRatio;
    }

    const x = (cols - drawW) / 2;
    const y = (rows - drawH) / 2;
    ctx.drawImage(this.sourceImage, x, y, drawW, drawH);

    try {
      return ctx.getImageData(0, 0, cols, rows).data;
    } catch (error) {
      return this.demoSampleData(cols, rows);
    }
  },

  demoSampleData(cols, rows) {
    const canvas = this.sampleCanvas;
    const ctx = this.sampleCtx;
    canvas.width = cols;
    canvas.height = rows;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, cols, rows);

    const baseWidth = 360;
    const baseHeight = 240;
    const scale = this.data.scale / 100;
    const fitScale = Math.max(cols / baseWidth, rows / baseHeight) * scale;
    const displayAspect = cols / rows;
    const sourceAspect = baseWidth / baseHeight;
    const shapeCorrection = Math.min(2.55, Math.max(1, sourceAspect / displayAspect));
    const drawWidth = baseWidth * fitScale * shapeCorrection;
    const drawHeight = baseHeight * fitScale;
    const drawX = (cols - drawWidth) / 2;
    const drawY = (rows - drawHeight) / 2;

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.scale(fitScale * shapeCorrection, fitScale);
    this.drawWebDemoSource(ctx, this.frame * 90);
    ctx.restore();

    if (this.sourceKind === "video") {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#ffffff";
      for (let y = (this.frame % 10) - 10; y < rows; y += 10) {
        ctx.fillRect(0, y, cols, 1);
      }
      ctx.restore();
    }

    try {
      return ctx.getImageData(0, 0, cols, rows).data;
    } catch (error) {
      return new Uint8ClampedArray(cols * rows * 4);
    }
  },

  drawWebDemoSource(ctx, time) {
    const width = 360;
    const height = 240;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#111917");
    gradient.addColorStop(0.46, "#d9d5bd");
    gradient.addColorStop(1, "#111917");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(Math.sin(time * 0.0012) * 0.16);

    ctx.fillStyle = "#f5f1d8";
    ctx.beginPath();
    this.ellipsePath(ctx, -34, -3, 74, 92, -0.14);
    ctx.fill();

    ctx.fillStyle = "#151c1b";
    ctx.beginPath();
    this.ellipsePath(ctx, -58, -12, 16, 24, -0.16);
    ctx.fill();
    ctx.beginPath();
    this.ellipsePath(ctx, -14, -14, 17, 25, 0.08);
    ctx.fill();

    ctx.strokeStyle = "#19201f";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-88, 70);
    ctx.bezierCurveTo(-44, 98, 12, 98, 48, 62);
    ctx.stroke();

    ctx.fillStyle = "#303a38";
    ctx.fillRect(54, -72, 18, 132);
    ctx.fillRect(86, -68, 20, 126);
    ctx.fillStyle = "#b84c3d";
    ctx.fillRect(58, -68, 10, 122);
    ctx.fillStyle = "#4d89a2";
    ctx.fillRect(90, -64, 12, 118);

    ctx.restore();

    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    for (let y = 0; y < height; y += 8) {
      ctx.fillRect(0, y, width, 2);
    }
  },

  ellipsePath(ctx, x, y, radiusX, radiusY, rotation) {
    if (ctx.ellipse) {
      ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(radiusX, radiusY);
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.restore();
  },

  luminance(data, index) {
    return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
  },

  brightness(value, x, y) {
    let b = value / 255;
    b = (b - 0.5) * (this.data.contrast / 100) + 0.5;

    if (this.data.dither) {
      const matrix = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
      ];
      b += (matrix[y % 4][x % 4] / 16 - 0.5) * 0.16;
    }

    if (this.data.invert) b = 1 - b;
    return Math.max(0, Math.min(1, b));
  },

  toneColor(alpha, boost) {
    const tone = TONES[this.data.tone];
    const r = Math.min(255, Math.round(tone.fg[0] * boost));
    const g = Math.min(255, Math.round(tone.fg[1] * boost));
    const b = Math.min(255, Math.round(tone.fg[2] * boost));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  applyGlow(ctx, cellW) {
    if (this.data.glow) {
      ctx.shadowColor = TONES[this.data.tone].shadow;
      ctx.shadowBlur = Math.max(2, cellW * 0.75);
    } else {
      ctx.shadowBlur = 0;
    }
  },

  renderAscii(ctx, data, rows, cols, cellW, cellH) {
    const chars = CHARSETS[this.data.charset];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(7, Math.floor(cellH * 0.96))}px monospace`;
    this.applyGlow(ctx, cellW);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const index = (y * cols + x) * 4;
        const b = this.brightness(this.luminance(data, index), x, y);
        const charIndex = Math.min(chars.length - 1, Math.floor(b * (chars.length - 1)));
        ctx.fillStyle = this.toneColor(0.18 + b * 0.86, 0.82 + b * 0.35);
        ctx.fillText(chars[charIndex], x * cellW + cellW / 2, y * cellH + cellH / 2);
      }
    }
    ctx.shadowBlur = 0;
  },

  renderDots(ctx, data, rows, cols, cellW, cellH) {
    this.applyGlow(ctx, cellW);
    const maxRadius = Math.min(cellW, cellH) * 0.42;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const index = (y * cols + x) * 4;
        const b = this.brightness(this.luminance(data, index), x, y);
        const radius = Math.max(0.45, maxRadius * (0.14 + b));
        ctx.beginPath();
        ctx.fillStyle = this.toneColor(0.15 + b * 0.9, 0.8 + b * 0.35);
        ctx.arc(x * cellW + cellW / 2, y * cellH + cellH / 2, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
  },

  renderHalftone(ctx, data, rows, cols, cellW, cellH) {
    this.applyGlow(ctx, cellW);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const index = (y * cols + x) * 4;
        const b = this.brightness(this.luminance(data, index), x, y);
        const w = cellW * (0.22 + b * 0.76);
        const h = cellH * 0.46;
        ctx.save();
        ctx.translate(x * cellW + cellW / 2, y * cellH + cellH / 2);
        ctx.rotate(((x + y) % 2 ? -1 : 1) * 0.42);
        ctx.fillStyle = this.toneColor(0.16 + b * 0.88, 0.82 + b * 0.3);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
    ctx.shadowBlur = 0;
  },

  drawScreenNoise(ctx, width, height) {
    const tone = TONES[this.data.tone];
    ctx.save();
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 80; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const value = 30 + Math.random() * 80;
      ctx.fillStyle = `rgba(${tone.fg[0]}, ${tone.fg[1]}, ${tone.fg[2]}, ${value / 255})`;
      ctx.fillRect(x, y, this.dpr, this.dpr);
    }
    ctx.restore();
  }
});
