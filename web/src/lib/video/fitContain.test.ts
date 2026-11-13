// Unit tests for object-fit: contain geometry. Run with: npm test.

import assert from "node:assert/strict";
import { test } from "node:test";
import { fitContain } from "./fitContain.ts";

test("portrait video in a wide box: full height, centered with side bars", () => {
  const rect = fitContain(400, 400, 500, 1000);
  assert.deepEqual(rect, { left: 100, top: 0, width: 200, height: 400 });
});

test("landscape video in a tall box: full width, centered with top/bottom bars", () => {
  const rect = fitContain(360, 640, 1920, 1080);
  assert.equal(rect.left, 0);
  assert.equal(rect.width, 360);
  assert.equal(rect.height, 202.5);
  assert.equal(rect.top, (640 - 202.5) / 2);
});

test("same aspect ratio fills the box", () => {
  assert.deepEqual(fitContain(358, 201.375, 1920, 1080), { left: 0, top: 0, width: 358, height: 201.375 });
});

test("empty box or video gives an empty rect", () => {
  assert.deepEqual(fitContain(0, 100, 1920, 1080), { left: 0, top: 0, width: 0, height: 0 });
  assert.deepEqual(fitContain(100, 100, 0, 0), { left: 0, top: 0, width: 0, height: 0 });
});
