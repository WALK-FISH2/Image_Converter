const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const serverPath = path.join(__dirname, "server.js");
const inputPath = process.env.INPUT_VIDEO || path.join(__dirname, "storage", "test-input.mp4");
const port = Number(process.env.PORT || 8787);
const baseUrl = `http://127.0.0.1:${port}`;

async function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing test video: ${inputPath}`);
  }

  const server = spawn(process.execPath, [serverPath], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });

  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));

  try {
    await waitForHealth();
    const data = fs.readFileSync(inputPath);
    const form = new FormData();
    form.append("video", new Blob([data], { type: "video/mp4" }), "test-input.mp4");
    form.append("cols", "48");
    form.append("scale", "1");
    form.append("contrast", "1.18");
    form.append("mode", "ascii");
    form.append("charset", "dense");
    form.append("tone", "green");
    form.append("dither", "true");
    form.append("invert", "false");

    const response = await fetch(`${baseUrl}/api/process-video`, {
      method: "POST",
      body: form
    });
    const text = await response.text();
    console.log(text);
    if (!response.ok) {
      process.exitCode = 1;
    }
  } finally {
    server.kill();
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      await delay(250);
    }
  }
  throw new Error("Server did not become ready");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
