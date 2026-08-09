# AGENTS.md

本文件定义编码代理在 IC-84 Raster Console 仓库中的工作方式。它描述执行规则，不替代产品需求或架构文档。

## 开始工作前

根据任务范围按顺序阅读：

1. `docs/governance/constitution.md`
2. `docs/product/requirements-baseline.md`
3. `docs/product/spec.md`
4. `docs/contracts/rendering-parameters.md`
5. 涉及视频服务时阅读 `docs/contracts/video-processing-api.md`
6. 涉及跨端或渲染流程时阅读 `docs/architecture/architecture.md` 和 `docs/architecture/rendering-pipeline.md`
7. `docs/planning/tasks.md`

若文档与代码不一致，先指出差异并判断它是未实现需求、过期文档还是有意的端侧差异；不得静默选择其中一方。

## 仓库边界

- `Web`：浏览器端界面、Canvas 实时渲染和浏览器导出。
- `MiniProgram`：小程序 UI、Canvas 图片渲染、视频上传、结果播放和相册保存。
- `Server`：FFmpeg/FFprobe 调用、视频逐帧渲染、MP4 输出。
- `tests/fixtures`：项目自己的稳定测试素材和素材约定。
- `docs`：项目事实、约束和计划的来源。

不要跨模块重构与任务无关的代码。不得覆盖用户已有修改，尤其是字符集、视觉参数和设备兼容修复。

## 不可破坏的行为

- 输入图片和视频的显示宽高比必须在处理、预览和导出中保持。
- 视频必须按完整动态帧处理并保存为视频，不能退化为静态封面或单帧图片。
- 栅格化必须以字符、点阵或半调单元重建画面，不能用普通颜色滤镜冒充。
- 视频输出背景必须与图片输出保持黑色基底，不得额外加入绿色底光。
- Web、小程序模拟器和真机应使用相同的参数语义；允许因布局不同使用不同初始列数。
- 修改字符集、色调或亮度映射时，要检查 Web、小程序和 Server 三处定义及真机小字号可见性。
- 小程序开屏演示可使用独立的内部适配比例，但不得改变用户上传媒体的 `scale=1.00` 语义。

## 代码与配置规则

- Web 使用 Vite/npm 和 Mediabunny 以支持模块化 Worker 与 WebCodecs；MiniProgram 保持原生框架，Server 保持 Node.js 标准库方案。
- Web 视频导出不得调用 MiniProgram Server 或服务器 FFmpeg；MediaRecorder 只能作为 WebCodecs 缺失时的明确兼容降级。
- 新增环境相关配置时优先使用环境变量或单一配置入口，不继续散布机器 IP 和绝对路径。
- API 字段或默认值变化时同步更新 `docs/contracts`、调用端和测试。
- 关键技术选择使用 `docs/architecture/decisions/ADR-NNNN-title.md` 记录。
- 不提交 `.env`、上传视频、处理结果、临时帧或日志。

## 验证命令

Server 语法检查：

```powershell
node --check Server\server.js
node --check Server\smoke-test.js
```

MiniProgram JavaScript 语法检查：

```powershell
node --check MiniProgram\pages\index\index.js
```

Server 冒烟测试需要测试视频。默认读取 `Server/storage/test-input.mp4`，也可指定：

```powershell
$env:INPUT_VIDEO="$PWD\tests\fixtures\motion-silent.mp4"
npm --prefix Server run smoke
Remove-Item Env:INPUT_VIDEO
```

Web 视觉变更至少在桌面浏览器检查开屏、横图、竖图和视频。小程序视觉或 Canvas 变更至少在微信开发者工具和一台真机检查；涉及字体、字符、点阵、半调或小字号时，模拟器结果不能代替真机结果。

Web 构建与开发服务器：

```powershell
npm --prefix Web run build
npm --prefix Web run dev
```

Web 离线视频导出变更必须使用实际媒体验证 MP4/H.264 优先路径、WebM/VP9 降级、横竖比例、时长/帧率、音频、三种渲染模式、进度取消和 MediaRecorder 提示。

## 完成定义

只有满足以下条件才能将任务标为完成：

- 代码行为符合对应需求编号和验收条件。
- 执行了适合改动范围的语法检查、冒烟测试或手工设备验证。
- 没有改变与任务无关的现有行为。
- 影响契约、架构、运维或已知限制时已更新对应文档。
- `docs/planning/tasks.md` 中的状态和验证证据已同步。
