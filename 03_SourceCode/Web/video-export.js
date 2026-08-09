import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

export const QUALITY_PRESETS = {
  quick: {
    label: "快速",
    maxWidth: 1280,
    maxHeight: 720,
    bitrate: 6_000_000,
  },
  hd: {
    label: "高清",
    maxWidth: 1920,
    maxHeight: 1080,
    bitrate: 14_000_000,
  },
  fine: {
    label: "精细",
    maxWidth: 2560,
    maxHeight: 1440,
    bitrate: 24_000_000,
  },
};

const evenFloor = (value) => Math.max(2, Math.floor(value / 2) * 2);
const evenRound = (value) => Math.max(2, Math.round(value / 2) * 2);

export function fitEvenDimensions(sourceWidth, sourceHeight, presetName) {
  const preset = QUALITY_PRESETS[presetName] || QUALITY_PRESETS.hd;
  const scale = Math.min(
    1,
    preset.maxWidth / sourceWidth,
    preset.maxHeight / sourceHeight,
  );
  const maxWidth = sourceWidth * scale;
  const maxHeight = sourceHeight * scale;
  const aspect = sourceWidth / sourceHeight;
  const candidates = [];

  const widthFirst = evenFloor(maxWidth);
  const widthFirstHeight = evenRound(widthFirst / aspect);
  if (widthFirstHeight <= maxHeight + 0.001) {
    candidates.push({ width: widthFirst, height: widthFirstHeight });
  }

  const heightFirst = evenFloor(maxHeight);
  const heightFirstWidth = evenRound(heightFirst * aspect);
  if (heightFirstWidth <= maxWidth + 0.001) {
    candidates.push({ width: heightFirstWidth, height: heightFirst });
  }

  if (candidates.length === 0) {
    candidates.push({
      width: evenFloor(maxWidth),
      height: evenFloor(maxHeight),
    });
  }

  candidates.sort((a, b) => {
    const errorA = Math.abs(a.width / a.height - aspect);
    const errorB = Math.abs(b.width / b.height - aspect);
    if (Math.abs(errorA - errorB) > 1e-8) return errorA - errorB;
    return b.width * b.height - a.width * a.height;
  });

  return candidates[0];
}

export function isFpsOptionAvailable(sourceFps, requestedFps) {
  if (!requestedFps || !Number.isFinite(sourceFps)) return true;
  return sourceFps + 0.5 >= requestedFps;
}

export function defaultFpsOption(sourceFps) {
  return isFpsOptionAvailable(sourceFps, 30) ? "30" : "source";
}

export function resolveOutputFps(sourceFps, fpsOption) {
  if (fpsOption === "source") return sourceFps;
  return Number(fpsOption);
}

export function estimateOutputBytes(duration, videoBitrate, hasAudio) {
  const audioBitrate = hasAudio ? 192_000 : 0;
  return Math.ceil((duration * (videoBitrate + audioBitrate)) / 8);
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "--";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export function formatFps(value) {
  if (!Number.isFinite(value)) return "--";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function offlineExportSupport() {
  const supported = Boolean(
    window.isSecureContext
    && window.VideoEncoder
    && window.VideoDecoder
    && window.Worker
    && window.OffscreenCanvas,
  );

  return {
    supported,
    reason: supported
      ? ""
      : "当前浏览器缺少安全上下文、WebCodecs、Worker 或 OffscreenCanvas，将使用实时录制兼容模式。",
  };
}

export async function inspectVideoFile(file) {
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  try {
    if (!(await input.canRead())) {
      throw new Error("无法识别这个视频文件。");
    }

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error("文件中没有可用的视频轨道。");
    }

    const audioTrack = await input.getPrimaryAudioTrack();
    const [width, height, firstTimestamp, endTimestamp, stats, canDecode, videoCodec] = await Promise.all([
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.getFirstTimestamp(),
      videoTrack.computeDuration(),
      videoTrack.computePacketStats(120),
      videoTrack.canDecode(),
      videoTrack.getCodec(),
    ]);

    const duration = Math.max(0.001, endTimestamp - firstTimestamp);
    const sourceFps = stats.averagePacketRate > 0
      ? stats.averagePacketRate
      : Math.max(1, stats.packetCount / duration);
    const audioCodec = audioTrack ? await audioTrack.getCodec() : null;

    return {
      width,
      height,
      duration,
      sourceFps,
      estimatedFrameCount: Math.max(1, Math.round(duration * sourceFps)),
      videoCodec,
      canDecode,
      hasAudio: Boolean(audioTrack),
      audioCodec,
      fileSize: file.size,
    };
  } finally {
    input.dispose();
  }
}

function avcCodecString(width, height, fps) {
  const macroblocksPerFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const macroblocksPerSecond = macroblocksPerFrame * fps;

  if (macroblocksPerFrame <= 3600 && macroblocksPerSecond <= 108000) return "avc1.42001f";
  if (macroblocksPerFrame <= 8192 && macroblocksPerSecond <= 245760) return "avc1.420028";
  if (macroblocksPerFrame <= 8704 && macroblocksPerSecond <= 522240) return "avc1.42002a";
  return "avc1.420033";
}

function encoderCandidates({ width, height, fps, bitrate }) {
  const avcCodec = avcCodecString(width, height, fps);
  const codecs = [
    {
      container: "mp4",
      codec: "avc",
      codecLabel: "H.264 / MP4",
      extension: "mp4",
      mimeType: "video/mp4",
      fullCodecString: avcCodec,
      codecConfig: { avc: { format: "avc" } },
    },
    {
      container: "webm",
      codec: "vp9",
      codecLabel: "VP9 / WebM",
      extension: "webm",
      mimeType: "video/webm",
      fullCodecString: "vp09.00.10.08",
      codecConfig: {},
    },
  ];

  const candidates = [];
  for (const codec of codecs) {
    for (const hardwareAcceleration of ["prefer-hardware", "no-preference"]) {
      candidates.push({
        ...codec,
        hardwareAcceleration,
        config: {
          codec: codec.fullCodecString,
          width,
          height,
          framerate: fps,
          bitrate,
          bitrateMode: "variable",
          latencyMode: "quality",
          hardwareAcceleration,
          ...codec.codecConfig,
        },
      });
    }
  }
  return candidates;
}

export async function chooseEncoder(options) {
  if (!window.VideoEncoder?.isConfigSupported) return null;

  for (const candidate of encoderCandidates(options)) {
    try {
      const result = await VideoEncoder.isConfigSupported(candidate.config);
      if (result.supported) {
        return {
          container: candidate.container,
          codec: candidate.codec,
          codecLabel: candidate.codecLabel,
          extension: candidate.extension,
          mimeType: candidate.mimeType,
          fullCodecString: candidate.fullCodecString,
          hardwareAcceleration: candidate.hardwareAcceleration,
        };
      }
    } catch {
      // Continue probing the next codec or acceleration preference.
    }
  }

  return null;
}
