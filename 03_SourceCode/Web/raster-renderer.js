export const CHARSETS = {
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  block: "  ░▒▓█",
  line: "  .-:=+*#%@",
};

export const TONES = {
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
    angle: 0,
  },
  paper: {
    bg: [7, 15, 16],
    fg: [215, 240, 231],
    shadow: "rgba(215, 240, 231, 0.3)",
    angle: 42,
  },
};

const DITHER_MATRIX = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function calculateGridRows(cols, width, height) {
  return Math.max(24, Math.round(cols * (height / width) * 0.55));
}

export function calculateSamplePlacement({
  cols,
  rows,
  targetWidth,
  targetHeight,
  sourceWidth,
  sourceHeight,
  scale,
  preserveAspect = true,
}) {
  let width = cols * scale;
  let height = rows * scale;

  if (preserveAspect && sourceWidth > 0 && sourceHeight > 0) {
    const marginX = targetWidth * 0.055;
    const marginY = targetHeight * 0.06;
    const cellWidth = (targetWidth - marginX * 2) / cols;
    const cellHeight = (targetHeight - marginY * 2) / rows;
    const correctedRatio = (sourceWidth / sourceHeight) * (cellHeight / cellWidth);

    height = width / correctedRatio;
    if (height > rows * scale) {
      height = rows * scale;
      width = height * correctedRatio;
    }
  }

  return {
    x: (cols - width) / 2,
    y: (rows - height) / 2,
    width,
    height,
  };
}

function luminanceAt(data, index) {
  return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
}

function processedBrightness(value, x, y, settings) {
  let brightness = value / 255;
  brightness = (brightness - 0.5) * settings.contrast + 0.5;

  if (settings.dither) {
    brightness += (DITHER_MATRIX[y % 4][x % 4] / 16 - 0.5) * 0.16;
  }

  if (settings.invert) {
    brightness = 1 - brightness;
  }

  return clamp(brightness, 0, 1);
}

function toneColor(tone, alpha = 1, boost = 1) {
  const r = Math.min(255, Math.round(tone.fg[0] * boost));
  const g = Math.min(255, Math.round(tone.fg[1] * boost));
  const b = Math.min(255, Math.round(tone.fg[2] * boost));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderAscii(ctx, data, rows, cols, cellWidth, cellHeight, settings, tone) {
  const chars = CHARSETS[settings.charset] || CHARSETS.dense;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.max(8, Math.floor(cellHeight * 0.98))}px "Courier New", monospace`;

  if (settings.glow) {
    ctx.shadowColor = tone.shadow;
    ctx.shadowBlur = Math.max(4, cellWidth * 0.9);
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = (y * cols + x) * 4;
      const brightness = processedBrightness(luminanceAt(data, index), x, y, settings);
      const charIndex = Math.min(chars.length - 1, Math.floor(brightness * (chars.length - 1)));
      ctx.fillStyle = toneColor(tone, 0.18 + brightness * 0.86, 0.82 + brightness * 0.35);
      ctx.fillText(chars[charIndex], x * cellWidth + cellWidth / 2, y * cellHeight + cellHeight / 2);
    }
  }

  ctx.shadowBlur = 0;
}

function renderDots(ctx, data, rows, cols, cellWidth, cellHeight, settings, tone) {
  const maxRadius = Math.min(cellWidth, cellHeight) * 0.42;
  if (settings.glow) {
    ctx.shadowColor = tone.shadow;
    ctx.shadowBlur = Math.max(2, cellWidth * 0.5);
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = (y * cols + x) * 4;
      const brightness = processedBrightness(luminanceAt(data, index), x, y, settings);
      const radius = Math.max(0.35, maxRadius * (0.14 + brightness));
      ctx.beginPath();
      ctx.fillStyle = toneColor(tone, 0.15 + brightness * 0.9, 0.8 + brightness * 0.35);
      ctx.arc(x * cellWidth + cellWidth / 2, y * cellHeight + cellHeight / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.shadowBlur = 0;
}

function renderHalftone(ctx, data, rows, cols, cellWidth, cellHeight, settings, tone) {
  if (settings.glow) {
    ctx.shadowColor = tone.shadow;
    ctx.shadowBlur = Math.max(2, cellWidth * 0.45);
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = (y * cols + x) * 4;
      const brightness = processedBrightness(luminanceAt(data, index), x, y, settings);
      const width = cellWidth * (0.22 + brightness * 0.76);
      const height = cellHeight * 0.46;
      ctx.save();
      ctx.translate(x * cellWidth + cellWidth / 2, y * cellHeight + cellHeight / 2);
      ctx.rotate(((x + y) % 2 ? -1 : 1) * 0.42);
      ctx.fillStyle = toneColor(tone, 0.16 + brightness * 0.88, 0.82 + brightness * 0.3);
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.restore();
    }
  }

  ctx.shadowBlur = 0;
}

export function renderRasterCells({
  ctx,
  data,
  rows,
  cols,
  x = 0,
  y = 0,
  width,
  height,
  settings,
}) {
  const tone = TONES[settings.tone] || TONES.green;
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  ctx.save();
  ctx.translate(x, y);
  if (settings.mode === "dots") {
    renderDots(ctx, data, rows, cols, cellWidth, cellHeight, settings, tone);
  } else if (settings.mode === "halftone") {
    renderHalftone(ctx, data, rows, cols, cellWidth, cellHeight, settings, tone);
  } else {
    renderAscii(ctx, data, rows, cols, cellWidth, cellHeight, settings, tone);
  }
  ctx.restore();
}

export function drawExportScanlines(ctx, width, height) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  const interval = Math.max(3, Math.round(height / 360));
  for (let y = 0; y < height; y += interval) {
    ctx.fillRect(0, y, width, 1);
  }
  ctx.restore();
}
