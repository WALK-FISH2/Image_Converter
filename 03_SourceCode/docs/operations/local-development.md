# 本地开发与联调

## 前置条件

- Node.js 18 或更高版本。
- FFmpeg 和 FFprobe。
- 当前 Chromium 浏览器。
- 微信开发者工具；真机测试还需要手机与电脑在同一局域网。

## Server

### 配置 FFmpeg

当前代码会自动检测项目开发机上的既定 Windows 路径，也可以显式设置：

```powershell
$env:FFMPEG_PATH="D:\Program_Files\ffmpeg\ffmpeg-master-latest-win64-gpl-shared\ffmpeg-master-latest-win64-gpl-shared\bin\ffmpeg.exe"
$env:FFPROBE_PATH="D:\Program_Files\ffmpeg\ffmpeg-master-latest-win64-gpl-shared\ffmpeg-master-latest-win64-gpl-shared\bin\ffprobe.exe"
```

所有可用变量见根目录 `.env.example`。Server 不会自动读取 `.env` 文件，变量必须由 shell、进程管理器或部署环境注入。

### 启动

```powershell
cd Server
npm start
```

默认监听 `0.0.0.0:8787`。检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

启动日志应显示实际使用的 FFmpeg 和 FFprobe 路径。

### 冒烟测试

```powershell
$env:INPUT_VIDEO="$PWD\tests\fixtures\motion-silent.mp4"
npm --prefix Server run smoke
Remove-Item Env:INPUT_VIDEO
```

测试会临时启动一个服务；如果 8787 已被占用，先设置单独端口并确保没有同端口实例。

## Web

安装依赖并启动 Vite：

```powershell
cd Web
npm install
npm run dev
```

浏览器打开 Vite 输出的 localhost 地址。WebCodecs 需要安全上下文；localhost 可用于开发，正式环境使用 HTTPS。直接以 `file://` 打开 HTML 时不保证 Worker、模块和 WebCodecs 主要导出路径可用。

Web 端不调用 Server。图片和视频都在浏览器中处理；视频主要保存路径使用 Mediabunny、WebCodecs、Worker 和 OffscreenCanvas，MediaRecorder 仅用于兼容降级。建议使用当前 Chrome 或 Edge。

修改 Web 导出规格或渲染代码后运行：

```powershell
npm test
npm run build
```

`npm test` 覆盖画质尺寸、偶数宽高、不放大和帧率可用性规则；实际编解码仍按 `docs/quality/test-strategy.md` 使用测试视频和 FFprobe 验证。

## 微信开发者工具

导入目录：

```text
MiniProgram
```

页面脚本中的默认 API：

```js
const VIDEO_PROCESSOR_API = "http://127.0.0.1:8787";
```

开发者工具调试本机服务时通常使用该地址。项目配置当前关闭 URL 合法性检查，仅适用于开发阶段。

## 局域网真机联调

1. 确认电脑和手机在同一局域网，网络没有客户端隔离。
2. 使用 `ipconfig` 找到电脑当前 IPv4，例如 `192.168.0.106`。
3. 确认 Server 监听 `0.0.0.0`，而不是只监听 `127.0.0.1`。
4. 确认 Windows 防火墙允许 Node.js 或 TCP 8787 入站。
5. 在手机浏览器访问 `http://电脑IP:8787/health` 验证连通性。
6. 将小程序 `VIDEO_PROCESSOR_API` 改为 `http://电脑IP:8787` 后进行真机预览。

开发者工具使用局域网地址失败、手机却成功时，通常与 Windows 代理、VPN、工具网络栈或防火墙规则有关。开发阶段可以在模拟器和真机构建前切换地址，但应尽快完成 `TASK-CONFIG-001`，建立单一环境配置入口。

## 正式小程序部署

正式版不能依赖局域网 HTTP 地址。需要：

- 部署可公网访问的 HTTPS Server。
- 配置 `PUBLIC_BASE_URL` 为该 HTTPS 基址。
- 在微信公众平台配置 request、uploadFile、downloadFile 合法域名。
- 增加鉴权、限流、上传校验、文件清理和监控。
- 将小程序 API 基址切换到发布配置。

## 生成文件

Server 运行时创建：

```text
Server/storage/uploads
Server/storage/temp
Server/storage/outputs
```

这些目录已经被 `.gitignore` 排除，但当前没有自动清理。开发期间应定期检查磁盘使用；生产清理策略由 `TASK-OPS-001` 跟踪。
