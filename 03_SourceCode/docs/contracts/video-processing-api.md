# 视频处理 API

## 基本信息

- 默认服务地址：`http://127.0.0.1:8787`
- 内容类型：JSON 响应；视频上传使用 `multipart/form-data`
- 当前版本：未版本化的本地原型接口
- 鉴权：无

正式公网部署前必须增加 HTTPS、合法域名配置、请求限制和文件生命周期策略。

## 健康检查

```http
GET /health
```

成功响应：

```json
{
  "ok": true,
  "ffmpeg": "ffmpeg",
  "ffprobe": "ffprobe"
}
```

该接口仅表明服务已启动并报告将要调用的可执行文件，不保证对一个真实视频的完整编码一定成功。

## 处理视频

```http
POST /api/process-video
Content-Type: multipart/form-data
```

### 表单字段

| 字段 | 必需 | 类型 | 说明 |
| --- | --- | --- | --- |
| `video` | 是 | file | 输入视频文件。 |
| `cols` | 否 | string integer | 默认 96，Server 限制为 44-160。 |
| `scale` | 否 | string number | 默认 1.00，限制为 0.40-1.80。 |
| `contrast` | 否 | string number | 默认 1.18，限制为 0.70-1.80。 |
| `mode` | 否 | enum | `ascii`, `dots`, `halftone`。 |
| `charset` | 否 | enum | `dense`, `block`, `line`。 |
| `tone` | 否 | enum | `green`, `amber`, `paper`。 |
| `invert` | 否 | boolean string | `true/false` 或 `1/0`。 |
| `dither` | 否 | boolean string | 默认 true。 |
| `glow` | 否 | boolean string | 默认 true；当前 Server 渲染器尚未使用该值。 |

参数的正式语义见 `rendering-parameters.md`。

### 成功响应

```json
{
  "id": "job-id",
  "videoUrl": "http://host/outputs/job-id.mp4",
  "metadata": {
    "cols": 50,
    "rows": 89,
    "fps": 12,
    "width": 540,
    "height": 960,
    "frames": 120,
    "inputWidth": 1080,
    "inputHeight": 1920,
    "aspectRatio": 0.5625,
    "audio": true
  }
}
```

说明：

- `videoUrl` 使用 `PUBLIC_BASE_URL`；未配置时根据请求 `Host` 生成。
- `width` 和 `height` 是按输入显示比例计算并调整为偶数后的输出尺寸。
- `rows` 根据输出比例和字符单元补偿计算。
- `fps` 由服务环境变量 `PROCESS_FPS` 控制，限制为 6-24。
- 当前实现中的 `metadata.audio` 固定报告 true，不能用于判断输入是否实际含音轨；需要后续修正契约或实现。

## 获取结果

```http
GET /outputs/{id}.mp4
```

成功时返回 `video/mp4`，允许跨域并设置一小时公共缓存。结果当前没有自动过期 API。

## 当前错误

| HTTP 状态 | `error` | 场景 |
| --- | --- | --- |
| 400 | `missing_multipart_boundary` | 请求不是有效 multipart。 |
| 400 | `missing_video_file` | 缺少 `video` 文件。 |
| 403 | `forbidden` | 非法输出路径。 |
| 404 | `not_found` | 路由不存在。 |
| 404 | `output_not_found` | 输出文件不存在。 |
| 500 | `internal_error` | 上传超限、FFprobe/FFmpeg 失败、编码失败等当前统一落入服务错误。 |

调用端应同时检查 HTTP 状态和响应体。未来如果调整错误状态码，需要作为契约变化记录。

## 时序和限制

- 请求在完整处理结束前不会返回，是同步长请求。
- 默认最大上传大小为 180 MiB。
- `MAX_DURATION_SECONDS=0` 表示不由 Server 截断时长；小程序选择器当前限制 60 秒。
- 默认输出帧率为 12 fps。
- 当前没有进度、取消、重试、队列、鉴权和自动清理接口。
