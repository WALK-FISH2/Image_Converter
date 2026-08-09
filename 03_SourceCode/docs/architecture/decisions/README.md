# Architecture Decision Records

本目录记录对系统结构有长期影响的决策。ADR 一旦进入 `Accepted`，不直接改写历史结论；需要改变方向时新增 ADR，并把旧记录标为 `Superseded by ADR-NNNN`。

## 命名

```text
ADR-NNNN-short-title.md
```

编号递增，不复用。

## 状态

- Proposed
- Accepted
- Rejected
- Deprecated
- Superseded

## 模板

```markdown
# ADR-NNNN: 标题

- Status: Proposed
- Date: YYYY-MM-DD

## Context

## Decision

## Consequences

## Alternatives considered
```

## 索引

- [ADR-0001：小程序视频使用后端 FFmpeg 逐帧处理](ADR-0001-video-processing.md)
- [ADR-0002：Web 视频使用浏览器离线逐帧导出](ADR-0002-web-offline-video-export.md)
