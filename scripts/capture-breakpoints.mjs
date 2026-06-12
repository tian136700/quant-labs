import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3002/?symbol=SPY&years=2";
const OUT = path.resolve("docs/responsive-screenshots");

const breakpoints = [
  { name: "xs-320-iphone-se", width: 320, height: 568 },
  { name: "sm-390-iphone14", width: 390, height: 844 },
  { name: "sm-480-android", width: 480, height: 854 },
  { name: "md-768-ipad-mini", width: 768, height: 1024 },
  { name: "lg-1024-ipad-air", width: 1024, height: 768 },
  { name: "xl-1280-laptop", width: 1280, height: 800 },
  { name: "xl-1440-desktop", width: 1440, height: 900 },
  { name: "2xl-1920-wide", width: 1920, height: 1080 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const bp of breakpoints) {
  const context = await browser.newContext({
    viewport: { width: bp.width, height: bp.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(OUT, `${bp.name}.png`),
    fullPage: true,
  });
  await context.close();
  console.log(`saved ${bp.name}`);
}

// Named device presets
const devicePresets = [
  ["iphone-se", devices["iPhone SE"]],
  ["iphone-14", devices["iPhone 14"]],
  ["ipad-mini", devices["iPad Mini"]],
  ["ipad-air", devices["iPad (gen 7)"]],
];

for (const [name, device] of devicePresets) {
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(OUT, `device-${name}.png`),
    fullPage: true,
  });
  await context.close();
  console.log(`saved device-${name}`);
}

await browser.close();
