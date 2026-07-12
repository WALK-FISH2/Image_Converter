# IC-84 Video Processor

This service receives a video from the mini program, converts every frame into
ASCII/dot/halftone raster output, encodes a new MP4, and returns the processed
video URL.

## Requirements

- Node.js 18+
- `ffmpeg` available in `PATH`

## Run

```bash
npm start
```

Default server URL:

```text
http://127.0.0.1:8787
```

For real-device mini program testing, replace the mini program API base URL
with your LAN IP or an HTTPS domain configured in the WeChat mini program
request/upload/download domain settings.

## API

```text
POST /api/process-video
```

Multipart form fields:

- `video`: uploaded video file
- `cols`, `scale`, `contrast`, `mode`, `charset`, `tone`, `invert`, `dither`, `glow`

Response:

```json
{
  "id": "job-id",
  "videoUrl": "http://host/outputs/job-id.mp4",
  "metadata": {
    "cols": 96,
    "rows": 89,
    "fps": 12,
    "width": 540,
    "height": 960,
    "frames": 120
  }
}
```

The output video is stored in `storage/outputs`.
