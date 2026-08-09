# IC-84 文档索引

本目录用于让产品意图、当前实现、工程决策和待办工作彼此可追踪。

## 文档地图

| 分类 | 文件 | 用途 |
| --- | --- | --- |
| 产品 | `product/requirements-baseline.md` | 已确认且需要受控变更的需求 |
| 产品 | `product/requirements-audit.md` | 需求覆盖情况、证据和缺口 |
| 产品 | `product/spec.md` | 交互与处理行为的详细规格 |
| 产品 | `product/acceptance-criteria.md` | 可验证的完成条件 |
| 架构 | `architecture/architecture.md` | 系统边界、模块和数据流 |
| 架构 | `architecture/rendering-pipeline.md` | 三端渲染、比例和保存流程 |
| 架构 | `architecture/decisions` | 重要技术决策记录 |
| 契约 | `contracts/video-processing-api.md` | 视频服务 HTTP 契约 |
| 契约 | `contracts/rendering-parameters.md` | 跨端参数语义、范围和默认值 |
| 质量 | `quality/test-strategy.md` | 测试层级和回归策略 |
| 质量 | `quality/compatibility-matrix.md` | 浏览器、模拟器和真机验证状态 |
| 质量 | `quality/web-export-validation-2026-08-09.md` | Web 离线视频导出的实际媒体验证记录 |
| 运维 | `operations/local-development.md` | 本地运行与联调 |
| 运维 | `operations/troubleshooting.md` | 常见故障定位 |
| 计划 | `planning/plan.md` | 阶段目标和实施顺序 |
| 计划 | `planning/tasks.md` | 可执行任务和状态 |
| 治理 | `governance/constitution.md` | 长期工程原则和变更规则 |

## 信息边界

- `requirements-baseline.md` 说明“必须实现什么”，只保存已确认需求。
- `spec.md` 说明“用户如何使用、系统如何表现”，不记录任务进度。
- `requirements-audit.md` 说明“当前实现到什么程度”，不得重新定义需求。
- `plan.md` 说明“按什么阶段推进”；`tasks.md` 说明“下一步具体做什么”。
- `architecture.md` 描述当前系统结构；改变关键方向时先新增或更新 ADR。
- `AGENTS.md` 只描述代理执行规则，不作为产品需求来源。

## 冲突处理

出现不一致时按以下方式处理：

1. 宪章决定不可违反的工程原则。
2. 需求基线和已接受的 ADR 决定目标与明确技术决策。
3. 产品规格、接口契约和验收标准细化目标行为。
4. 代码代表当前事实，但不自动覆盖尚未实现的需求。
5. 计划和任务记录实施状态，不能修改前述定义。

无法判断冲突来源时，记录到需求审计或任务列表，并在修改代码前确认。

## 更新规则

- 新需求：先分配需求编号，再更新规格、验收标准和任务。
- API 或参数变化：同时更新契约、调用端、Server 和相关测试。
- 架构方向变化：新增 ADR，并更新架构图和运行手册。
- 修复跨端差异：更新兼容性矩阵，记录实际验证设备。
- 发布版本：更新 `CHANGELOG.md` 和需求审计日期。
