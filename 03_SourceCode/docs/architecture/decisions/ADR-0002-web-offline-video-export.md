# ADR-0002：Web 视频使用浏览器离线逐帧导出

- Status: Accepted
- Date: 2026-08-09

## Context

Web 端原实现通过隐藏 `video` 正常播放、`canvas.captureStream(30)` 和 MediaRecorder 实时录制处理结果。导出耗时被视频时长约束，输出尺寸受页面 CRT Canvas 限制，默认编码质量不足以稳定保留细小字符、点阵、半调和扫描线。

产品要求 Web 完全在浏览器处理，不调用 MiniProgram Server 或服务器 FFmpeg，同时保留当前实时预览和图片保存行为。

## Decision

1. Web 改为 Vite/npm 项目，在 localhost 或 HTTPS 安全上下文运行主要导出能力。
2. 使用 Mediabunny 处理输入容器、轨道读取和 MP4/WebM 输出，使用浏览器 WebCodecs 进行视频解码和编码。
3. 视频导出在 Dedicated Worker 中运行；支持时使用 OffscreenCanvas，以目标分辨率重新渲染每帧。
4. 编码通过 `VideoEncoder.isConfigSupported()` 逐项检测，优先 H.264/MP4、可变码率和 `prefer-hardware`，其次 VP9/WebM。
5. 画质边界为 1280x720、1920x1080、2560x1440；保持源比例、偶数尺寸且不放大。
6. 帧率支持源帧率、24、30、60；高于源帧率的选项按 29.5/59.5 容差禁用，降低帧率按时间戳抽帧。
7. 音频按兼容编码包直通、AAC/Opus 转码、无声警告顺序处理。
8. MediaRecorder 保留为缺少 WebCodecs 时的明确兼容降级，不是主要方案。

## Consequences

正面影响：导出不再等待正常播放时钟；分辨率不受页面布局限制；码率和编码格式可控；可显示真实帧进度并取消。

代价：Web 不再以 `file://` 直接打开作为完整功能运行方式；新增 Vite、Mediabunny、Worker 和更复杂的资源清理；硬件编码、H.264 和音频编码能力仍取决于浏览器与操作系统。离线处理不保证在所有设备上快于视频时长，但不再被人为限制为实时。

## Alternatives considered

- 继续提高 MediaRecorder 码率：不能解决实时等待和显示 Canvas 尺寸耦合，拒绝作为主方案。
- 使用 ffmpeg.wasm：下载体积和 CPU 成本较高，且与优先使用浏览器硬件编解码目标冲突，暂不采用。
- 调用现有 Server：违反 Web 纯前端处理边界，拒绝。
- 使用隐藏视频快速 seek 抽帧：逐帧 seek 开销大且精确性不稳定，拒绝。
