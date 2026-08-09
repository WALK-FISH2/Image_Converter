import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultFpsOption,
  fitEvenDimensions,
  isFpsOptionAvailable,
  resolveOutputFps,
} from "../video-export.js";

test("quality presets preserve source size when upscaling is unnecessary", () => {
  assert.deepEqual(fitEvenDimensions(640, 360, "hd"), { width: 640, height: 360 });
  assert.deepEqual(fitEvenDimensions(360, 640, "fine"), { width: 360, height: 640 });
});

test("fine quality caps 4K input at 1440p without changing aspect", () => {
  assert.deepEqual(fitEvenDimensions(3840, 2160, "fine"), { width: 2560, height: 1440 });
});

test("odd source dimensions produce even output with negligible aspect error", () => {
  const sourceAspect = 641 / 361;
  const output = fitEvenDimensions(641, 361, "hd");
  assert.equal(output.width % 2, 0);
  assert.equal(output.height % 2, 0);
  assert.ok(Math.abs(output.width / output.height - sourceAspect) < 0.005);
});

test("fps choices reject synthetic frame multiplication but allow NTSC tolerance", () => {
  assert.equal(isFpsOptionAvailable(24, 30), false);
  assert.equal(isFpsOptionAvailable(29.97, 30), true);
  assert.equal(isFpsOptionAvailable(59.94, 60), true);
  assert.equal(defaultFpsOption(24), "source");
  assert.equal(defaultFpsOption(29.97), "30");
  assert.equal(resolveOutputFps(23.976, "source"), 23.976);
});
