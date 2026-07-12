const CHARSETS = {
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  block: "  ░▒▓█",
  line: "  .-:=+*#%@"
};

const SHOW_CHAR_PROBE = false;

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

const DEMO_SOURCE_ASPECT = 360 / 240;
const WEB_DEMO_STRETCH = 1.04;
const DEMO_OPENING_SCALE = 0.7;
const VIDEO_PROCESSOR_API = "http://127.0.0.1:8787";
// const VIDEO_PROCESSOR_API = "http://192.168.0.106:8787";

Page({
  data: {
    cols: 50,
    scale: 100,
    contrast: 118,
    mode: "ascii",
    charset: "dense",
    tone: "green",
    invert: false,
    dither: true,
    glow: true,
    power: true,
    saving: false,
    processingVideo: false,
    processedVideoSrc: "",
    sourceLabel: "SIMULATED SIGNAL",
    modeLabel: "ASCII / 50 COL",
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
    this.processedVideoPath = "";
    this.frame = 0;
    this.initCanvases();
  },

  onShow() {
    if (this.data.processedVideoSrc) {
      this.playProcessedVideo();
      return;
    }
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

  initCanvases(callback) {
    this.createSelectorQuery()
      .select("#screenCanvas")
      .fields({ node: true, size: true })
      .select("#sampleCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node || !res[1] || !res[1].node) {
          wx.showToast({ title: "Canvas 初始化失败", icon: "none" });
          if (callback) callback(false);
          return;
        }

        this.screenCanvas = res[0].node;
        this.screenCtx = this.screenCanvas.getContext("2d");
        this.sampleCanvas = res[1].node;
        this.sampleCtx = this.sampleCanvas.getContext("2d");
        this.resizeScreenCanvas(res[0].width, res[0].height);
        this.startRenderLoop();
        if (callback) callback(true);
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
          this.clearProcessedVideo(() => {
            this.loadCanvasImage(file.tempFilePath, "IMAGE SIGNAL", "image");
          });
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
        if (!file || !file.tempFilePath) return;

        this.clearProcessedVideo(() => {
          this.sourceKind = "video-processing";
          this.setData({
            processingVideo: true,
            sourceLabel: "PROCESSING VIDEO"
          });
          if (file.thumbTempFilePath) {
            this.loadCanvasImage(file.thumbTempFilePath, "PROCESSING VIDEO", "video-processing");
          } else {
            this.sourceImage = null;
            this.renderScreen();
          }
          this.uploadVideoForProcessing(file.tempFilePath);
        });
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

  clearProcessedVideo(callback) {
    const hadProcessedVideo = !!this.data.processedVideoSrc;
    this.processedVideoPath = "";
    if (this.data.processedVideoSrc || this.data.processingVideo) {
      this.setData({
        processedVideoSrc: "",
        processingVideo: false
      }, () => {
        if (hadProcessedVideo) {
          this.screenCanvas = null;
          this.screenCtx = null;
          this.initCanvases(() => {
            if (callback) callback();
          });
          return;
        }
        if (callback) callback();
      });
      return;
    }
    if (callback) callback();
  },

  uploadVideoForProcessing(filePath) {
    wx.showLoading({ title: "处理中", mask: true });
    wx.uploadFile({
      url: `${VIDEO_PROCESSOR_API}/api/process-video`,
      filePath,
      name: "video",
      formData: this.videoProcessParams(),
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          this.handleVideoProcessError();
          return;
        }

        let payload = null;
        try {
          payload = JSON.parse(res.data || "{}");
        } catch (error) {
          this.handleVideoProcessError();
          return;
        }

        if (!payload.videoUrl) {
          this.handleVideoProcessError();
          return;
        }

        this.prepareProcessedVideo(payload.videoUrl);
      },
      fail: () => this.handleVideoProcessError(),
      complete: () => wx.hideLoading()
    });
  },

  prepareProcessedVideo(videoUrl) {
    this.setData({
      processingVideo: true,
      sourceLabel: "LOADING VIDEO"
    });

    wx.downloadFile({
      url: videoUrl,
      success: (res) => {
        const playablePath = res.statusCode === 200 && res.tempFilePath ? res.tempFilePath : videoUrl;
        this.showProcessedVideo(playablePath);
      },
      fail: () => {
        this.showProcessedVideo(videoUrl);
      }
    });
  },

  showProcessedVideo(filePath) {
    this.processedVideoPath = filePath;
    this.sourceKind = "processed-video";
    this.stopRenderLoop();
    this.screenCanvas = null;
    this.screenCtx = null;
    this.setData({
      processedVideoSrc: filePath,
      processingVideo: false,
      sourceLabel: "PROCESSED VIDEO"
    }, () => {
      this.playProcessedVideo();
    });
    wx.showToast({ title: "视频处理完成", icon: "success" });
  },

  videoProcessParams() {
    return {
      cols: String(this.data.cols),
      scale: (this.data.scale / 100).toFixed(2),
      contrast: (this.data.contrast / 100).toFixed(2),
      mode: this.data.mode,
      charset: this.data.charset,
      tone: this.data.tone,
      invert: String(this.data.invert),
      dither: String(this.data.dither),
      glow: String(this.data.glow)
    };
  },

  handleVideoProcessError() {
    this.processedVideoPath = "";
    this.sourceKind = this.sourceImage ? "video-processing" : "demo";
    this.setData({
      processingVideo: false,
      processedVideoSrc: "",
      sourceLabel: "VIDEO PROCESS FAILED"
    });
    wx.showToast({ title: "视频处理失败", icon: "none" });
  },

  onProcessedVideoError() {
    wx.showToast({ title: "处理后视频播放失败", icon: "none" });
  },

  onProcessedVideoLoaded() {
    this.playProcessedVideo();
  },

  playProcessedVideo() {
    if (!this.data.processedVideoSrc) return;
    setTimeout(() => {
      const videoContext = wx.createVideoContext("processedVideo", this);
      if (videoContext && videoContext.play) {
        videoContext.play();
      }
    }, 60);
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

  saveCurrentOutput() {
    if (this.data.saving) return;
    if (this.data.processingVideo) {
      wx.showToast({ title: "视频处理中", icon: "none" });
      return;
    }
    if (this.processedVideoPath) {
      this.saveProcessedVideo();
      return;
    }
    if (!this.screenCanvas || !this.screenCtx) {
      wx.showToast({ title: "屏幕尚未就绪", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: "保存中", mask: true });
    this.renderScreen();
    setTimeout(() => this.exportScreenImage(), 80);
  },

  saveProcessedVideo() {
    this.setData({ saving: true });
    wx.showLoading({ title: "保存中", mask: true });

    if (/^https?:\/\//i.test(this.processedVideoPath)) {
      wx.downloadFile({
        url: this.processedVideoPath,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            this.saveVideoToAlbum(res.tempFilePath);
            return;
          }
          this.handleSaveError();
        },
        fail: () => this.handleSaveError()
      });
      return;
    }

    this.saveVideoToAlbum(this.processedVideoPath);
  },

  exportScreenImage() {
    const canvas = this.screenCanvas;
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: "png",
      quality: 1,
      success: (res) => this.saveImageToAlbum(res.tempFilePath),
      fail: () => this.exportScreenImageById()
    });
  },

  exportScreenImageById() {
    wx.canvasToTempFilePath({
      canvasId: "screenCanvas",
      fileType: "png",
      quality: 1,
      success: (res) => this.saveImageToAlbum(res.tempFilePath),
      fail: (error) => this.handleSaveError(error)
    }, this);
  },

  saveImageToAlbum(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => {
        this.finishSaving();
        wx.showToast({ title: "已保存图片", icon: "success" });
      },
      fail: (error) => this.handleAlbumError(error)
    });
  },

  saveVideoToAlbum(filePath) {
    wx.saveVideoToPhotosAlbum({
      filePath,
      success: () => {
        this.finishSaving();
        wx.showToast({ title: "已保存视频", icon: "success" });
      },
      fail: (error) => this.handleAlbumError(error)
    });
  },

  handleAlbumError(error) {
    const message = (error && error.errMsg) || "";
    this.finishSaving();

    if (message.includes("auth deny") || message.includes("authorize") || message.includes("permission")) {
      wx.showModal({
        title: "需要相册权限",
        content: "请允许保存到相册后再试一次。",
        confirmText: "去设置",
        success: (res) => {
          if (res.confirm) wx.openSetting();
        }
      });
      return;
    }

    wx.showToast({ title: "保存失败", icon: "none" });
  },

  handleSaveError() {
    this.finishSaving();
    wx.showToast({ title: "导出失败", icon: "none" });
  },

  finishSaving() {
    wx.hideLoading();
    this.setData({ saving: false });
  },

  renderScreen() {
    if (!this.screenCtx || !this.screenCanvas) return;

    const ctx = this.screenCtx;
    const width = this.screenCanvas.width;
    const height = this.screenCanvas.height;

    this.frame += 1;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    this.roundedClip(ctx, width, height, Math.min(width, height) * 0.04);
    this.fillScreenBackground(ctx, width, height);

    if (this.data.power) {
      const cols = Number(this.data.cols);
      const rows = Math.max(24, Math.round(cols * (height / width) * 0.52));
      const metrics = this.fullDisplayMetrics(width, height, cols, rows);
      const sample = this.buildSampleData(cols, rows, metrics);

      ctx.save();
      ctx.translate(metrics.x, metrics.y);
      if (this.data.mode === "dots") {
        this.renderDots(ctx, sample, rows, cols, metrics.cellW, metrics.cellH);
      } else if (this.data.mode === "halftone") {
        this.renderHalftone(ctx, sample, rows, cols, metrics.cellW, metrics.cellH);
      } else {
        this.renderAscii(ctx, sample, rows, cols, metrics.cellW, metrics.cellH);
      }
      ctx.restore();
      this.drawScreenNoise(ctx, width, height);
      if (SHOW_CHAR_PROBE) {
        this.drawCharacterProbe(ctx, width, height);
      }
    }

    ctx.restore();
  },

  fullDisplayMetrics(width, height, cols, rows) {
    const marginX = width * 0.06;
    const marginY = height * 0.08;
    return {
      x: marginX,
      y: marginY,
      cellW: (width - marginX * 2) / cols,
      cellH: (height - marginY * 2) / rows
    };
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

  buildSampleData(cols, rows, metrics) {
    if (this.sourceImage) {
      return this.sampleImageData(cols, rows, metrics);
    }
    return this.demoSampleData(cols, rows, metrics);
  },

  sampleImageData(cols, rows, metrics) {
    const canvas = this.sampleCanvas;
    const ctx = this.sampleCtx;
    canvas.width = cols;
    canvas.height = rows;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, cols, rows);

    const scale = this.data.scale / 100;
    const imageRatio = (this.sourceImage.width || cols) / (this.sourceImage.height || rows);
    const cellStretch = metrics ? metrics.cellH / metrics.cellW : 1.8;
    const displayAspect = imageRatio * cellStretch;
    let drawW = cols * scale;
    let drawH = drawW / displayAspect;
    if (drawH > rows * scale) {
      drawH = rows * scale;
      drawW = drawH * displayAspect;
    }

    const x = (cols - drawW) / 2;
    const y = (rows - drawH) / 2;
    ctx.drawImage(this.sourceImage, x, y, drawW, drawH);

    try {
      return ctx.getImageData(0, 0, cols, rows).data;
    } catch (error) {
      return this.demoSampleData(cols, rows, metrics);
    }
  },

  demoSampleData(cols, rows, metrics) {
    const canvas = this.sampleCanvas;
    const ctx = this.sampleCtx;
    canvas.width = cols;
    canvas.height = rows;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, cols, rows);

    const baseWidth = 360;
    const baseHeight = 240;
    const scale = (this.data.scale / 100) * (this.sourceKind === "demo" ? DEMO_OPENING_SCALE : 1);
    const cellStretch = metrics ? metrics.cellH / metrics.cellW : 1.8;
    const displayAspect = DEMO_SOURCE_ASPECT * cellStretch * WEB_DEMO_STRETCH;
    const boxWidth = cols * scale * 0.94;
    const boxHeight = rows * scale * 0.94;
    let drawWidth = boxWidth;
    let drawHeight = drawWidth / displayAspect;

    if (drawHeight < boxHeight) {
      drawHeight = boxHeight;
      drawWidth = drawHeight * displayAspect;
    }

    const drawX = (cols - drawWidth) / 2;
    const drawY = (rows - drawHeight) / 2;

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.scale(drawWidth / baseWidth, drawHeight / baseHeight);
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
    if (this.sourceKind === "demo" && value > 14) {
      b = Math.max(b, 0.13);
    }
    return Math.max(0, Math.min(1, b));
  },

  toneColor(alpha, boost) {
    const tone = TONES[this.data.tone];
    const r = Math.min(255, Math.round(tone.fg[0] * boost));
    const g = Math.min(255, Math.round(tone.fg[1] * boost));
    const b = Math.min(255, Math.round(tone.fg[2] * boost));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  applyGlow(ctx, cellW, mode = "ascii") {
    if (this.data.glow) {
      ctx.shadowColor = TONES[this.data.tone].shadow;
      const glowScale = mode === "dots" ? 0.5 : mode === "halftone" ? 0.45 : 0.9;
      const minGlow = mode === "ascii" ? 4 : 2;
      ctx.shadowBlur = Math.max(minGlow, cellW * glowScale);
    } else {
      ctx.shadowBlur = 0;
    }
  },

  demoGraphicCell(value) {
    return this.sourceKind === "demo" && value > 14;
  },

  firstVisibleCharIndex(chars) {
    for (let i = 0; i < chars.length; i += 1) {
      if (chars[i] !== " ") return i;
    }
    return 0;
  },

  stableVisibleCharIndex(chars) {
    const preferred = [":", ";", "i", "I", "-", "░", "."];
    for (let i = 0; i < preferred.length; i += 1) {
      const index = chars.indexOf(preferred[i]);
      if (index >= 0) return index;
    }
    return this.firstVisibleCharIndex(chars);
  },

  renderAscii(ctx, data, rows, cols, cellW, cellH) {
    const chars = CHARSETS[this.data.charset];
    const visibleCharIndex = this.stableVisibleCharIndex(chars);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(8, Math.floor(cellH * 0.98))}px "Courier New", monospace`;
    this.applyGlow(ctx, cellW, "ascii");

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const index = (y * cols + x) * 4;
        const luminance = this.luminance(data, index);
        let b = this.brightness(luminance, x, y);
        let charIndex = Math.min(chars.length - 1, Math.floor(b * (chars.length - 1)));

        if (this.sourceKind === "demo" && luminance > 14) {
          charIndex = Math.max(charIndex, visibleCharIndex);
          b = Math.max(b, 0.13);
        }

        ctx.fillStyle = this.toneColor(Math.min(1, 0.34 + b * 0.72), 0.9 + b * 0.3);
        ctx.fillText(chars[charIndex], x * cellW + cellW / 2, y * cellH + cellH / 2);
      }
    }
    ctx.shadowBlur = 0;
  },

  renderDots(ctx, data, rows, cols, cellW, cellH) {
    this.applyGlow(ctx, cellW, "dots");
    const maxRadius = Math.min(cellW, cellH) * 0.42;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const index = (y * cols + x) * 4;
        const luminance = this.luminance(data, index);
        const visibleDemoCell = this.demoGraphicCell(luminance);
        const b = visibleDemoCell ? Math.max(this.brightness(luminance, x, y), 0.32) : this.brightness(luminance, x, y);
        const minRadius = visibleDemoCell ? maxRadius * 0.34 : 0.45;
        const radius = Math.max(minRadius, maxRadius * (0.18 + b * 0.86));
        ctx.beginPath();
        ctx.fillStyle = this.toneColor(visibleDemoCell ? Math.min(1, 0.38 + b * 0.62) : 0.15 + b * 0.9, 0.84 + b * 0.35);
        ctx.arc(x * cellW + cellW / 2, y * cellH + cellH / 2, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
  },

  renderHalftone(ctx, data, rows, cols, cellW, cellH) {
    this.applyGlow(ctx, cellW, "halftone");

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const index = (y * cols + x) * 4;
        const luminance = this.luminance(data, index);
        const visibleDemoCell = this.demoGraphicCell(luminance);
        const b = visibleDemoCell ? Math.max(this.brightness(luminance, x, y), 0.32) : this.brightness(luminance, x, y);
        const w = cellW * (visibleDemoCell ? 0.42 + b * 0.58 : 0.22 + b * 0.76);
        const h = cellH * (visibleDemoCell ? 0.54 : 0.46);
        ctx.save();
        ctx.translate(x * cellW + cellW / 2, y * cellH + cellH / 2);
        ctx.rotate(((x + y) % 2 ? -1 : 1) * 0.42);
        ctx.fillStyle = this.toneColor(visibleDemoCell ? Math.min(1, 0.36 + b * 0.64) : 0.16 + b * 0.88, 0.86 + b * 0.3);
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
  },

  drawCharacterProbe(ctx, width, height) {
    const tone = TONES[this.data.tone];
    const fontSize = Math.max(18, Math.round(width * 0.042));

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `${fontSize}px "Courier New", monospace`;
    ctx.fillStyle = `rgb(${tone.fg[0]}, ${tone.fg[1]}, ${tone.fg[2]})`;
    ctx.fillText(".'`^\",:;Il!i><~+_-?][}{1)(|*#MW&8%B@$", width * 0.075, height * 0.07);
    ctx.restore();
  }
});
