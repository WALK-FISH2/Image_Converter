# 故障排查

## Server 无法启动或找不到 FFmpeg

症状：启动时报 `ENOENT`、FFmpeg/FFprobe 不存在，或处理请求返回 500。

检查：

```powershell
& "D:\Program_Files\ffmpeg\ffmpeg-master-latest-win64-gpl-shared\ffmpeg-master-latest-win64-gpl-shared\bin\ffmpeg.exe" -version
& "D:\Program_Files\ffmpeg\ffmpeg-master-latest-win64-gpl-shared\ffmpeg-master-latest-win64-gpl-shared\bin\ffprobe.exe" -version
```

然后显式设置 `FFMPEG_PATH`、`FFPROBE_PATH`，重启 Server 并查看 `/health` 返回的实际路径。只安装 FFmpeg 但不重启旧 Node 进程不会生效。

## 手机无法连接视频服务

症状：开发者工具可用，手机上传失败。

依次检查：

- 小程序 API 不能使用手机自身的 `127.0.0.1`，应使用电脑局域网 IP。
- Server 必须监听 `0.0.0.0:8787`。
- 手机浏览器是否能打开 `http://电脑IP:8787/health`。
- Windows 防火墙、VPN、代理和无线路由器客户端隔离。
- 正式小程序是否使用 HTTPS 并配置三个合法域名类别。

## 手机可用，微信开发者工具使用局域网 IP 失败

先在电脑浏览器分别访问 `127.0.0.1` 和局域网 IP 的 `/health`。只有局域网 IP 在开发者工具失败时，检查工具代理设置、VPN 和防火墙对开发者工具进程的限制。开发阶段模拟器可以继续使用 `127.0.0.1`，真机使用局域网地址。

## 视频处理完成但页面只显示图片

确认成功响应包含 `videoUrl`，小程序已执行 `wx.downloadFile`，且 `processedVideoSrc` 被设置。WXML 中处理后 `video` 与 Canvas 必须互斥显示；视频加载完成后调用 `play()`。

如果远程 URL 不能直接播放，优先下载为本地临时文件再绑定给 `video` 组件。

## 保存的视频背景发绿

Server 的输出帧背景应使用纯黑填充。修改后必须重启 Server 并重新处理视频；已经生成在 `storage/outputs` 的旧 MP4 不会自动重建。区分“前景绿色辉光”和“整幅背景被绿色填充”。

## 输出图片或视频变窄

不要通过强制填满目标屏幕来修复黑边。检查：

- 输入显示宽高比是否在采样前读取。
- 视频是否考虑 `sample_aspect_ratio`。
- `scale` 是否同时等比作用于宽高。
- 字符单元 `cellH / cellW` 补偿是否重复应用或遗漏。
- 导出是否按输入比例建立独立画布。
- 编码偶数尺寸调整后的比例误差。

使用带圆形标记的横图、竖图和方图进行定位。

## 真机开屏内部出现大片空洞

不要先假设字符不受支持。可以临时启用字符探针，直接绘制代表字符。如果探针可见但栅格主体缺失，原因通常是小字号 Canvas、低透明度、小几何尺寸和 CRT 叠层共同吞掉低亮度单元。

检查小程序中的：

- 演示非黑单元最低亮度。
- 稳定可见的低亮度字符索引。
- 点阵最小半径和半调最小宽度。
- 各模式独立辉光半径。
- 扫描线、暗角、噪声叠层透明度。

修复应限制在开屏演示或明确的设备兼容层，避免抬高用户图片所有暗部。

## BLOCK/LINE 在 Server 视频中像普通字符

浏览器字体可以直接绘制字符，但 Server 只拥有有限 5x7 字形。检查 `CHARSETS`、`GLYPHS` 和 `drawBlockGlyph` 是否同步。未知字符回退为点字形时，会让 DENSE/BLOCK/LINE 差异变弱。

修改 Server 字符集时保留用户已经校准的完整 DENSE 定义，不要用旧短集合覆盖。

## 视频处理很慢

小程序路径需要上传、FFmpeg 解码、Node 逐帧绘制、H.264 编码、音频复用和结果下载。十几秒视频处理十几秒在当前同步 CPU 路径下并不异常。

先通过日志区分上传、渲染、编码和下载耗时，再决定优化。不要为了速度退化为滤镜或单帧。后续性能工作由 `TASK-VIDEO-001/002` 跟踪。
