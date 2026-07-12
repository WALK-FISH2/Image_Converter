const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const STORAGE_DIR = path.join(__dirname, "storage");
const UPLOAD_DIR = path.join(STORAGE_DIR, "uploads");
const OUTPUT_DIR = path.join(STORAGE_DIR, "outputs");
const TEMP_DIR = path.join(STORAGE_DIR, "temp");

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 180 * 1024 * 1024);
const OUTPUT_WIDTH = Number(process.env.OUTPUT_WIDTH || 540);
const OUTPUT_HEIGHT = Number(process.env.OUTPUT_HEIGHT || 960);
const DEFAULT_FPS = Number(process.env.PROCESS_FPS || 12);
const MAX_DURATION_SECONDS = Number(process.env.MAX_DURATION_SECONDS || 0);

const CHARSETS = {
  dense: " .:-=+*#%@",
  block: "  .:+#@",
  line: " .-:=+*#%@"
};

const TONES = {
  green: {
    bg: [2, 15, 7],
    fg: [124, 255, 138]
  },
  amber: {
    bg: [21, 12, 2],
    fg: [255, 195, 90]
  },
  paper: {
    bg: [7, 15, 16],
    fg: [215, 240, 231]
  }
};

const GLYPHS = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
  "%": ["11001", "11010", "00100", "01000", "10110", "00110", "00000"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01111"]
};

async function main() {
  await ensureDirs();

  const server = http.createServer((req, res) => {
    route(req, res).catch((error) => {
      console.error(error);
      sendJson(res, 500, { error: "internal_error", message: error.message });
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`IC-84 video processor listening on http://${HOST}:${PORT}`);
  });
}

async function route(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/outputs/")) {
    await serveOutput(req, res, requestUrl.pathname);
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/process-video") {
    await handleProcessVideo(req, res);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

async function handleProcessVideo(req, res) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    sendJson(res, 400, { error: "missing_multipart_boundary" });
    return;
  }

  const body = await readBody(req, MAX_UPLOAD_BYTES);
  const parts = parseMultipart(body, boundaryMatch[1] || boundaryMatch[2]);
  const video = parts.files.video;
  if (!video || !video.content.length) {
    sendJson(res, 400, { error: "missing_video_file" });
    return;
  }

  const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const inputPath = path.join(UPLOAD_DIR, `${id}${safeExt(video.filename)}`);
  const silentOutputPath = path.join(TEMP_DIR, `${id}.silent.mp4`);
  const outputPath = path.join(OUTPUT_DIR, `${id}.mp4`);
  const params = normalizeParams(parts.fields);

  await fsp.writeFile(inputPath, video.content);
  const metadata = await processVideo(inputPath, silentOutputPath, outputPath, params);

  sendJson(res, 200, {
    id,
    videoUrl: buildPublicUrl(req, `/outputs/${id}.mp4`),
    metadata
  });
}

async function processVideo(inputPath, silentOutputPath, outputPath, params) {
  const cols = clampInt(params.cols, 44, 160, 96);
  const scale = clampNumber(params.scale, 0.4, 1.8, 1);
  const contrast = clampNumber(params.contrast, 0.7, 1.8, 1.18);
  const fps = clampInt(params.fps || DEFAULT_FPS, 6, 24, DEFAULT_FPS);
  const width = OUTPUT_WIDTH;
  const height = OUTPUT_HEIGHT;
  const rows = Math.max(24, Math.round(cols * (height / width) * 0.52));
  const frameSize = cols * rows * 3;
  const outputFrameSize = width * height * 3;
  const state = {
    ...params,
    cols,
    rows,
    scale,
    contrast,
    fps,
    width,
    height
  };

  const filters = [
    `scale=${cols}:${rows}:force_original_aspect_ratio=increase`,
    `crop=${cols}:${rows}`,
    `fps=${fps}`
  ].join(",");

  const decodeArgs = ["-hide_banner", "-loglevel", "error", "-i", inputPath];
  if (MAX_DURATION_SECONDS > 0) {
    decodeArgs.push("-t", String(MAX_DURATION_SECONDS));
  }
  decodeArgs.push("-vf", filters, "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "-");

  const encodeArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "-",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    silentOutputPath
  ];

  const decoder = spawn("ffmpeg", decodeArgs, { stdio: ["ignore", "pipe", "pipe"] });
  const encoder = spawn("ffmpeg", encodeArgs, { stdio: ["pipe", "ignore", "pipe"] });
  let pending = Buffer.alloc(0);
  let frames = 0;

  const decoderErr = collectStream(decoder.stderr);
  const encoderErr = collectStream(encoder.stderr);
  const encoderDone = waitForProcess(encoder, encoderErr);

  await new Promise((resolve, reject) => {
    decoder.stdout.on("data", (chunk) => {
      decoder.stdout.pause();
      handleChunk(chunk).then(() => decoder.stdout.resume()).catch(reject);
    });

    decoder.on("error", reject);
    encoder.on("error", reject);

    decoder.on("close", async (code) => {
      try {
        if (code !== 0) {
          reject(new Error(`ffmpeg decode failed: ${await decoderErr}`));
          return;
        }
        encoder.stdin.end();
        await encoderDone;
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    async function handleChunk(chunk) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= frameSize) {
        const sampleFrame = pending.subarray(0, frameSize);
        pending = pending.subarray(frameSize);
        const rendered = renderFrame(sampleFrame, state);
        if (rendered.length !== outputFrameSize) {
          throw new Error("renderer produced an invalid frame");
        }
        await writeStream(encoder.stdin, rendered);
        frames += 1;
      }
    }
  });

  await muxAudioIfPresent(silentOutputPath, inputPath, outputPath);

  return {
    cols,
    rows,
    fps,
    width,
    height,
    frames,
    audio: true
  };
}

async function muxAudioIfPresent(videoPath, sourcePath, outputPath) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    videoPath,
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "1:a?",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath
  ];
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  await waitForProcess(proc, collectStream(proc.stderr));
}

function renderFrame(sample, state) {
  const frame = Buffer.allocUnsafe(state.width * state.height * 3);
  fillTerminalBackground(frame, state);

  const marginX = Math.round(state.width * 0.06);
  const marginY = Math.round(state.height * 0.08);
  const contentWidth = state.width - marginX * 2;
  const contentHeight = state.height - marginY * 2;
  const cellW = contentWidth / state.cols;
  const cellH = contentHeight / state.rows;
  const charset = CHARSETS[state.charset] || CHARSETS.dense;

  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      const sampleIndex = (y * state.cols + x) * 3;
      const lum = luminance(sample[sampleIndex], sample[sampleIndex + 1], sample[sampleIndex + 2]);
      const brightness = processedBrightness(lum, x, y, state);
      const color = toneColor(brightness, state);
      const cx = Math.round(marginX + x * cellW + cellW / 2);
      const cy = Math.round(marginY + y * cellH + cellH / 2);

      if (state.mode === "dots") {
        const radius = Math.max(1, Math.min(cellW, cellH) * (0.12 + brightness * 0.44));
        drawCircle(frame, state.width, state.height, cx, cy, radius, color);
      } else if (state.mode === "halftone") {
        const radius = Math.max(1, Math.min(cellW, cellH) * (0.08 + Math.sqrt(brightness) * 0.46));
        drawCircle(frame, state.width, state.height, cx, cy, radius, color);
      } else {
        const charIndex = Math.min(charset.length - 1, Math.floor(brightness * (charset.length - 1)));
        const ch = charset[charIndex];
        drawGlyph(frame, state.width, state.height, ch, cx, cy, cellW, cellH, color);
      }
    }
  }

  applyScanlinesAndVignette(frame, state.width, state.height);
  return frame;
}

function fillTerminalBackground(frame, state) {
  const tone = TONES[state.tone] || TONES.green;
  const [bgR, bgG, bgB] = tone.bg;
  const cx = state.width * 0.5;
  const cy = state.height * 0.48;
  const maxD = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const index = (y * state.width + x) * 3;
      const dx = x - cx;
      const dy = y - cy;
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / maxD) * 0.22;
      frame[index] = clampByte(bgR + tone.fg[0] * glow);
      frame[index + 1] = clampByte(bgG + tone.fg[1] * glow);
      frame[index + 2] = clampByte(bgB + tone.fg[2] * glow);
    }
  }
}

function drawGlyph(frame, width, height, ch, cx, cy, cellW, cellH, color) {
  const glyph = GLYPHS[ch] || GLYPHS["."];
  const scale = Math.max(1, Math.floor(Math.min(cellW / 5, cellH / 7)));
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const startX = Math.round(cx - glyphW / 2);
  const startY = Math.round(cy - glyphH / 2);

  for (let gy = 0; gy < 7; gy += 1) {
    for (let gx = 0; gx < 5; gx += 1) {
      if (glyph[gy][gx] !== "1") continue;
      fillRect(frame, width, height, startX + gx * scale, startY + gy * scale, scale, scale, color);
    }
  }
}

function fillRect(frame, width, height, x, y, rectW, rectH, color) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(width, x + rectW);
  const y1 = Math.min(height, y + rectH);
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      setPixel(frame, width, px, py, color);
    }
  }
}

function drawCircle(frame, width, height, cx, cy, radius, color) {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(frame, width, x, y, color);
      }
    }
  }
}

function setPixel(frame, width, x, y, color) {
  const index = (y * width + x) * 3;
  frame[index] = color[0];
  frame[index + 1] = color[1];
  frame[index + 2] = color[2];
}

function applyScanlinesAndVignette(frame, width, height) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxD = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y += 1) {
    const scan = y % 4 === 0 ? 0.78 : 1;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      const dx = x - cx;
      const dy = y - cy;
      const vignette = 0.55 + 0.45 * Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / maxD);
      const mul = scan * vignette;
      frame[index] = clampByte(frame[index] * mul);
      frame[index + 1] = clampByte(frame[index + 1] * mul);
      frame[index + 2] = clampByte(frame[index + 2] * mul);
    }
  }
}

function processedBrightness(value, x, y, state) {
  let brightness = value / 255;
  brightness = (brightness - 0.5) * state.contrast + 0.5;

  if (state.dither) {
    const matrix = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5]
    ];
    brightness += (matrix[y % 4][x % 4] / 16 - 0.5) * 0.16;
  }

  if (state.invert) {
    brightness = 1 - brightness;
  }

  return Math.max(0, Math.min(1, brightness));
}

function toneColor(brightness, state) {
  const tone = TONES[state.tone] || TONES.green;
  const alpha = 0.18 + brightness * 0.86;
  const boost = 0.82 + brightness * 0.35;
  return [
    clampByte(tone.fg[0] * boost * alpha),
    clampByte(tone.fg[1] * boost * alpha),
    clampByte(tone.fg[2] * boost * alpha)
  ];
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function normalizeParams(fields) {
  return {
    cols: Number(fields.cols || 96),
    scale: Number(fields.scale || 1),
    contrast: Number(fields.contrast || 1.18),
    mode: sanitizeChoice(fields.mode, ["ascii", "dots", "halftone"], "ascii"),
    charset: sanitizeChoice(fields.charset, ["dense", "block", "line"], "dense"),
    tone: sanitizeChoice(fields.tone, ["green", "amber", "paper"], "green"),
    invert: fields.invert === "true" || fields.invert === "1",
    dither: fields.dither !== "false" && fields.dither !== "0",
    glow: fields.glow !== "false" && fields.glow !== "0"
  };
}

function sanitizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clampInt(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("upload_too_large");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseMultipart(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const result = { fields: {}, files: {} };
  const segments = splitBuffer(body, delimiter);

  for (let segment of segments) {
    segment = trimPart(segment);
    if (!segment.length || segment.equals(Buffer.from("--"))) continue;

    const headerEnd = segment.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd < 0) continue;

    const rawHeaders = segment.subarray(0, headerEnd).toString("utf8");
    const content = trimTrailingCrlf(segment.subarray(headerEnd + 4));
    const disposition = rawHeaders.match(/content-disposition:\s*form-data;([^\r\n]+)/i);
    if (!disposition) continue;

    const name = matchParam(disposition[1], "name");
    const filename = matchParam(disposition[1], "filename");
    if (!name) continue;

    if (filename) {
      result.files[name] = { filename, content };
    } else {
      result.fields[name] = content.toString("utf8");
    }
  }

  return result;
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(delimiter, start);

  while (index !== -1) {
    if (index > start) {
      parts.push(buffer.subarray(start, index));
    }
    start = index + delimiter.length;
    index = buffer.indexOf(delimiter, start);
  }

  if (start < buffer.length) {
    parts.push(buffer.subarray(start));
  }

  return parts;
}

function trimPart(buffer) {
  let start = 0;
  let end = buffer.length;
  if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
  if (buffer[end - 2] === 13 && buffer[end - 1] === 10) end -= 2;
  return buffer.subarray(start, end);
}

function trimTrailingCrlf(buffer) {
  if (buffer[buffer.length - 2] === 13 && buffer[buffer.length - 1] === 10) {
    return buffer.subarray(0, buffer.length - 2);
  }
  return buffer;
}

function matchParam(headerValue, name) {
  const match = headerValue.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? match[1] : "";
}

function safeExt(filename) {
  const ext = path.extname(filename || "").toLowerCase();
  return ext && ext.length <= 8 ? ext : ".mp4";
}

async function serveOutput(req, res, pathname) {
  const filename = path.basename(pathname);
  const filePath = path.join(OUTPUT_DIR, filename);
  if (!filePath.startsWith(OUTPUT_DIR)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": stat.size,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600"
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    sendJson(res, 404, { error: "output_not_found" });
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

function buildPublicUrl(req, pathname) {
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL.replace(/\/$/, "")}${pathname}`;
  }
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  return `http://${host}${pathname}`;
}

function collectStream(stream) {
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  return new Promise((resolve) => {
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function waitForProcess(proc, stderrPromise) {
  return new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", async (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(await stderrPromise));
    });
  });
}

function writeStream(stream, chunk) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      stream.off("drain", onDrain);
      reject(error);
    };
    const onDrain = () => {
      stream.off("error", onError);
      resolve();
    };

    stream.once("error", onError);
    if (stream.write(chunk)) {
      stream.off("error", onError);
      resolve();
    } else {
      stream.once("drain", onDrain);
    }
  });
}

async function ensureDirs() {
  await Promise.all([
    fsp.mkdir(UPLOAD_DIR, { recursive: true }),
    fsp.mkdir(OUTPUT_DIR, { recursive: true }),
    fsp.mkdir(TEMP_DIR, { recursive: true })
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
