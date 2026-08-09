# IC-84 Raster Console

IC-84 是一个复古 CRT 风格的图像与视频栅格化工具。项目包含浏览器端、微信小程序端和基于 Node.js/FFmpeg 的视频处理服务。

本文件所在的 `03_SourceCode` 是项目根目录；本文中的命令和相对路径均以此目录为基准。

## 源码目录结构

| 路径 | 职责 |
| --- | --- |
| `Web` | Vite 驱动的 HTML/CSS/JavaScript Web 端 |
| `MiniProgram` | 微信小程序界面、图片渲染和视频上传/播放/保存 |
| `Server` | 视频逐帧栅格化、MP4 编码和结果文件服务 |
| `docs` | 产品、架构、契约、质量、运维和计划文档 |
| `tests/fixtures` | 项目专用、可复现的测试素材约定 |

## 快速开始

### 视频处理服务

前置条件：Node.js 18+、FFmpeg 和 FFprobe。

```powershell
cd Server
npm start
```

默认地址为 `http://127.0.0.1:8787`，健康检查为：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

服务读取进程环境变量；可用变量见根目录的 `.env.example`。该示例文件不会被服务自动加载。

### Web 端

首次运行先安装依赖并启动 Vite：

```powershell
cd Web
npm install
npm run dev
```

WebCodecs 主要导出能力需要 localhost 或 HTTPS 安全上下文；直接打开 `Web/index.html` 只保留兼容能力。

### 微信小程序

使用微信开发者工具导入 `MiniProgram`。模拟器默认访问 `http://127.0.0.1:8787`；真机调试需要在 `MiniProgram/pages/index/index.js` 中配置电脑的局域网地址，或使用已配置为小程序合法域名的 HTTPS 服务。

## 当前能力

- 图片和视频的字符、点阵、半调渲染
- DENSE、BLOCK、LINE 字符集
- 绿屏、琥珀、冷白三种色调
- 列数、缩放、对比度、反相、抖动和辉光控制
- Web PNG 图片导出与 WebCodecs 离线逐帧视频导出
- Web 视频画质/帧率设置、H.264/VP9 能力检测、进度、取消和音频保留
- 小程序图片保存及后端逐帧处理后的 MP4 播放与保存
- 输入媒体宽高比保持

各能力的正式边界以 [需求基线](docs/product/requirements-baseline.md) 和 [产品规格](docs/product/spec.md) 为准；当前实现覆盖情况见 [需求审计](docs/product/requirements-audit.md)。

## 文档入口

从 [文档索引](docs/README.md) 开始。影响产品行为的修改必须同步检查需求、契约、验收标准和任务状态。

## 开发约定

面向编码代理的仓库规则见 [AGENTS.md](AGENTS.md)。工程原则见 [constitution.md](docs/governance/constitution.md)。
