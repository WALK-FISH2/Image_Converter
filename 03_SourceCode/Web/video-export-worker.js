import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
  WebMOutputFormat,
  canEncodeAudio,
} from "mediabunny";
import {
  calculateGridRows,
  calculateSamplePlacement,
  drawExportScanlines,
  renderRasterCells,
} from "./raster-renderer.js";

let activeJob = null;

class ExportCanceledError extends Error {
  constructor() {
    super("导出已取消。");
    this.name = "ExportCanceledError";
  }
}

function assertNotCanceled(job) {
  if (job.canceled) throw new ExportCanceledError();
}

function postProgress(job, frame, totalFrames, stage = "RENDERING") {
  const now = performance.now();
  if (frame < totalFrames && now - job.lastProgressAt < 80) return;
  job.lastProgressAt = now;
  self.postMessage({
    type: "progress",
    frame,
    totalFrames,
    progress: totalFrames > 0 ? Math.min(1, frame / totalFrames) : 0,
    stage,
  });
}

async function verifyEncoder(options) {
  const baseConfig = {
    codec: options.encoder.fullCodecString,
    width: options.width,
    height: options.height,
    framerate: options.fps,
    bitrate: options.bitrate,
    bitrateMode: "variable",
    latencyMode: "quality",
    ...(options.encoder.codec === "avc" ? { avc: { format: "avc" } } : {}),
  };

  const preferences = [options.encoder.hardwareAcceleration, "no-preference"];
  for (const hardwareAcceleration of [...new Set(preferences)]) {
    const config = { ...baseConfig, hardwareAcceleration };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return hardwareAcceleration;
    } catch {
      // Try the next acceleration preference.
    }
  }

  throw new Error("当前浏览器无法使用所选 WebCodecs 编码配置。");
}

function createRenderSurface(options) {
  const rows = calculateGridRows(options.render.cols, options.width, options.height);
  const sampleCanvas = new OffscreenCanvas(options.render.cols, rows);
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const outputCanvas = new OffscreenCanvas(options.width, options.height);
  const outputContext = outputCanvas.getContext("2d", { alpha: false });

  if (!sampleContext || !outputContext) {
    throw new Error("无法建立离屏导出画布。");
  }

  return {
    rows,
    sampleCanvas,
    sampleContext,
    outputCanvas,
    outputContext,
  };
}

function renderSample(sample, surface, options) {
  const { rows, sampleCanvas, sampleContext, outputContext } = surface;
  const placement = calculateSamplePlacement({
    cols: options.render.cols,
    rows,
    targetWidth: options.width,
    targetHeight: options.height,
    sourceWidth: sample.displayWidth,
    sourceHeight: sample.displayHeight,
    scale: options.render.scale,
  });

  sampleContext.save();
  sampleContext.shadowBlur = 0;
  sampleContext.globalCompositeOperation = "source-over";
  sampleContext.fillStyle = "#050505";
  sampleContext.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);
  sampleContext.imageSmoothingEnabled = true;
  sample.draw(
    sampleContext,
    placement.x,
    placement.y,
    placement.width,
    placement.height,
  );
  sampleContext.restore();

  const imageData = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
  const marginX = options.width * 0.055;
  const marginY = options.height * 0.06;

  outputContext.save();
  outputContext.shadowBlur = 0;
  outputContext.globalCompositeOperation = "source-over";
  outputContext.fillStyle = "#000000";
  outputContext.fillRect(0, 0, options.width, options.height);
  renderRasterCells({
    ctx: outputContext,
    data: imageData.data,
    rows,
    cols: options.render.cols,
    x: marginX,
    y: marginY,
    width: options.width - marginX * 2,
    height: options.height - marginY * 2,
    settings: options.render,
  });
  drawExportScanlines(outputContext, options.width, options.height);
  outputContext.restore();
}

async function prepareAudioPlan(audioTrack, outputFormat) {
  if (!audioTrack) return { mode: "none", label: "无音频轨道" };

  const [codec, decoderConfig, canDecode, numberOfChannels, sampleRate] = await Promise.all([
    audioTrack.getCodec(),
    audioTrack.getDecoderConfig(),
    audioTrack.canDecode(),
    audioTrack.getNumberOfChannels(),
    audioTrack.getSampleRate(),
  ]);

  if (codec && decoderConfig && outputFormat.getSupportedAudioCodecs().includes(codec)) {
    const source = new EncodedAudioPacketSource(codec);
    return {
      mode: "copy",
      label: `音频直通 (${codec.toUpperCase()})`,
      source,
      decoderConfig,
    };
  }

  const outputCodec = outputFormat instanceof Mp4OutputFormat ? "aac" : "opus";
  const quality = new Quality({ bitrate: 192_000, bitrateMode: "variable" });
  const canEncode = canDecode && await canEncodeAudio(outputCodec, {
    numberOfChannels,
    sampleRate,
    quality,
  }).catch(() => false);

  if (canEncode) {
    return {
      mode: "transcode",
      label: `音频转码 (${outputCodec.toUpperCase()})`,
      source: new AudioSampleSource({ codec: outputCodec, quality }),
    };
  }

  return {
    mode: "silent",
    label: "音频不兼容，已静音导出",
  };
}

async function pumpCopiedAudio(job, audioTrack, plan, videoFirstTimestamp, videoDuration) {
  const sink = new EncodedPacketSink(audioTrack);
  let firstPacket = true;

  for await (const packet of sink.packets()) {
    assertNotCanceled(job);
    let timestamp = packet.timestamp - videoFirstTimestamp;
    let duration = packet.duration;
    if (timestamp + duration <= 0 || timestamp >= videoDuration) continue;
    if (timestamp < 0) {
      duration += timestamp;
      timestamp = 0;
    }
    duration = Math.min(duration, videoDuration - timestamp);
    if (duration <= 0) continue;

    const normalizedPacket = packet.clone({ timestamp, duration });
    await plan.source.add(
      normalizedPacket,
      firstPacket ? { decoderConfig: plan.decoderConfig } : undefined,
    );
    firstPacket = false;
  }
}

async function pumpTranscodedAudio(job, audioTrack, plan, videoFirstTimestamp, videoEndTimestamp) {
  const sink = new AudioSampleSink(audioTrack);

  for await (const originalSample of sink.samples(videoFirstTimestamp, videoEndTimestamp)) {
    assertNotCanceled(job);
    let sample = originalSample;
    let timestamp = sample.timestamp - videoFirstTimestamp;

    if (timestamp < 0) {
      const startFrame = Math.min(sample.numberOfFrames, Math.ceil(-timestamp * sample.sampleRate));
      if (startFrame >= sample.numberOfFrames) {
        sample.close();
        continue;
      }
      sample = sample.trim(startFrame);
      originalSample.close();
      timestamp = 0;
    }

    sample.setTimestamp(timestamp);
    await plan.source.add(sample);
    sample.close();
  }
}

async function pumpAudio(job, audioTrack, plan, videoFirstTimestamp, videoDuration) {
  if (!audioTrack || plan.mode === "none" || plan.mode === "silent") return;
  const videoEndTimestamp = videoFirstTimestamp + videoDuration;
  if (plan.mode === "copy") {
    await pumpCopiedAudio(job, audioTrack, plan, videoFirstTimestamp, videoDuration);
  } else {
    await pumpTranscodedAudio(job, audioTrack, plan, videoFirstTimestamp, videoEndTimestamp);
  }
}

function fixedTimestamps(firstTimestamp, duration, fps) {
  const count = Math.max(1, Math.ceil(duration * fps));
  return {
    count,
    *[Symbol.iterator]() {
      for (let index = 0; index < count; index += 1) {
        yield firstTimestamp + index / fps;
      }
    },
  };
}

async function pumpFixedFpsVideo(job, sink, source, surface, options, firstTimestamp, duration) {
  const timestamps = fixedTimestamps(firstTimestamp, duration, options.fps);
  let frame = 0;

  for await (const sample of sink.samplesAtTimestamps(timestamps)) {
    assertNotCanceled(job);
    const timestamp = frame / options.fps;
    const frameDuration = Math.min(1 / options.fps, Math.max(0.000001, duration - timestamp));
    if (sample) {
      renderSample(sample, surface, options);
      await source.add(timestamp, frameDuration);
      sample.close();
    }
    frame += 1;
    postProgress(job, frame, timestamps.count);
  }

  return timestamps.count;
}

async function pumpSourceFpsVideo(
  job,
  sink,
  source,
  surface,
  options,
  firstTimestamp,
  endTimestamp,
  estimatedFrames,
) {
  let frame = 0;
  const duration = endTimestamp - firstTimestamp;

  for await (const sample of sink.samples(firstTimestamp, endTimestamp)) {
    assertNotCanceled(job);
    const timestamp = Math.max(0, sample.timestamp - firstTimestamp);
    const frameDuration = Math.min(
      sample.duration || 1 / options.fps,
      Math.max(0.000001, duration - timestamp),
    );
    renderSample(sample, surface, options);
    await source.add(timestamp, frameDuration);
    sample.close();
    frame += 1;
    postProgress(job, frame, estimatedFrames);
  }

  postProgress(job, frame, frame, "FINALIZING");
  return frame;
}

async function runExport(file, options, job) {
  if (!self.VideoEncoder?.isConfigSupported || !self.OffscreenCanvas) {
    throw new Error("当前 Worker 环境不支持 WebCodecs 离线导出。");
  }

  const hardwareAcceleration = await verifyEncoder(options);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  job.input = input;

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode())) {
      throw new Error("当前浏览器无法逐帧解码这个视频。");
    }

    const audioTrack = await input.getPrimaryAudioTrack();
    const [firstTimestamp, endTimestamp, stats] = await Promise.all([
      videoTrack.getFirstTimestamp(),
      videoTrack.computeDuration(),
      videoTrack.computePacketStats(120),
    ]);
    const duration = Math.max(0.001, endTimestamp - firstTimestamp);
    const estimatedFrames = Math.max(1, Math.round(duration * stats.averagePacketRate));
    const surface = createRenderSurface(options);
    const target = new BufferTarget();
    const format = options.encoder.container === "mp4"
      ? new Mp4OutputFormat({ fastStart: "in-memory" })
      : new WebMOutputFormat();
    const output = new Output({ format, target });
    job.output = output;

    const videoSource = new CanvasSource(surface.outputCanvas, {
      codec: options.encoder.codec,
      fullCodecString: options.encoder.fullCodecString,
      quality: new Quality({ bitrate: options.bitrate, bitrateMode: "variable" }),
      hardwareAcceleration,
      latencyMode: "quality",
      keyFrameInterval: 2,
      sizeChangeBehavior: "deny",
      contentHint: "detail",
    });
    const expectedFrames = options.fpsMode === "source"
      ? estimatedFrames
      : Math.max(1, Math.ceil(duration * options.fps));
    output.addVideoTrack(videoSource, { maximumPacketCount: expectedFrames });

    const audioPlan = await prepareAudioPlan(audioTrack, format);
    if (audioPlan.mode === "copy") {
      output.addAudioTrack(audioPlan.source, { decoderConfig: audioPlan.decoderConfig });
    } else if (audioPlan.mode === "transcode") {
      output.addAudioTrack(audioPlan.source);
    }

    self.postMessage({ type: "audio", mode: audioPlan.mode, label: audioPlan.label });
    await output.start();
    assertNotCanceled(job);

    const sink = new VideoSampleSink(videoTrack, { hardwareAcceleration: "prefer-hardware" });
    const videoPump = options.fpsMode === "source"
      ? pumpSourceFpsVideo(
        job,
        sink,
        videoSource,
        surface,
        options,
        firstTimestamp,
        endTimestamp,
        estimatedFrames,
      )
      : pumpFixedFpsVideo(job, sink, videoSource, surface, options, firstTimestamp, duration);
    const audioPump = pumpAudio(job, audioTrack, audioPlan, firstTimestamp, duration);

    const [frameCount] = await Promise.all([videoPump, audioPump]);
    assertNotCanceled(job);
    postProgress(job, frameCount, frameCount, "MUXING");
    await output.finalize();

    if (!target.buffer) throw new Error("视频封装完成，但没有生成输出数据。");
    const mimeType = await output.getMimeType();
    const buffer = target.buffer;
    self.postMessage({
      type: "complete",
      buffer,
      frameCount,
      duration,
      mimeType,
      extension: format.fileExtension.replace(/^\./, ""),
      codecLabel: options.encoder.codecLabel,
      hardwareAcceleration,
      audioMode: audioPlan.mode,
      audioLabel: audioPlan.label,
    }, [buffer]);
  } finally {
    input.dispose();
    job.input = null;
    job.output = null;
  }
}

self.addEventListener("message", async (event) => {
  const message = event.data;
  if (message.type === "cancel") {
    if (activeJob) {
      activeJob.canceled = true;
      activeJob.input?.dispose();
      await activeJob.output?.cancel().catch(() => {});
    }
    return;
  }

  if (message.type !== "start" || activeJob) return;

  const job = {
    canceled: false,
    input: null,
    output: null,
    lastProgressAt: 0,
  };
  activeJob = job;

  try {
    await runExport(message.file, message.options, job);
  } catch (error) {
    if (job.canceled || error instanceof ExportCanceledError) {
      self.postMessage({ type: "canceled" });
    } else {
      self.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    activeJob = null;
  }
});
