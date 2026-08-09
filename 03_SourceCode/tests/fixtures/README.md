# Test Fixtures

本目录只存放 IC-84 源码项目自己的稳定测试素材，不引用项目外的个人笔记、截图或临时媒体目录。

## 当前素材

| 文件名 | 用途 |
| --- | --- |
| `still-landscape.png` | Web 图片载入和 PNG 保存回归 |
| `motion-landscape-10s.mp4` | 640x360、30 FPS、H.264/AAC；离线性能、横向比例和降帧率检查 |
| `motion-portrait-3s.mp4` | 360x640、24 FPS、H.264/AAC；竖向比例、三模式和高帧率禁用检查 |

## 收录规则

- 素材必须拥有可用于项目测试的授权，不放入个人或敏感媒体。
- 文件应尽量短小；视频用于回归时建议控制在数秒。
- 图像应包含明确的比例标记和圆形参考物，便于识别拉伸。
- 替换素材时保持文件名和验证目的稳定，并在 `docs/quality/test-strategy.md` 更新说明。
- 临时上传、编码输出和运行时文件仍放在 `Server/storage`，不得混入本目录。

当前素材由 FFmpeg `testsrc2` 和 `sine` 生成，不含个人内容。方形、无声、29.97 FPS、59.94 FPS 和非 1:1 sample aspect ratio 素材仍待补充。
