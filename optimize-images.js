const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = __dirname;
const scriptModifiedAt = fs.statSync(__filename).mtimeMs;
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const yearDirectories = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

const jobs = [];
let sourceCount = 0;
let skippedCount = 0;
let generatedCount = 0;
let removedCount = 0;

function needsUpdate(input, output) {
  if (!fs.existsSync(output)) return true;
  const inputModifiedAt = fs.statSync(input).mtimeMs;
  const outputModifiedAt = fs.statSync(output).mtimeMs;
  return outputModifiedAt < Math.max(inputModifiedAt, scriptModifiedAt);
}

function removeStaleFiles(directory, expectedFiles) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && !expectedFiles.has(entry.name)) {
      fs.rmSync(path.join(directory, entry.name));
      removedCount += 1;
    }
  }
}

for (const year of yearDirectories) {
  const yearPath = path.join(root, year);
  const files = fs.readdirSync(yearPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);

  const thumbnailDirectory = path.join(yearPath, "thumbs");
  const previewDirectory = path.join(yearPath, "previews");
  fs.mkdirSync(thumbnailDirectory, { recursive: true });
  fs.mkdirSync(previewDirectory, { recursive: true });

  const expectedFiles = new Set(files.map((file) => `${file}.webp`));
  removeStaleFiles(thumbnailDirectory, expectedFiles);
  removeStaleFiles(previewDirectory, expectedFiles);
  sourceCount += files.length;

  for (const file of files) {
    const input = path.join(yearPath, file);
    const thumbnailOutput = path.join(thumbnailDirectory, `${file}.webp`);
    const previewOutput = path.join(previewDirectory, `${file}.webp`);
    const updateThumbnail = needsUpdate(input, thumbnailOutput);
    const updatePreview = needsUpdate(input, previewOutput);

    if (!updateThumbnail && !updatePreview) {
      skippedCount += 1;
      continue;
    }

    jobs.push(async () => {
      if (updateThumbnail) {
        await sharp(input)
          .rotate()
          .resize(480, 360, { fit: "cover", position: "attention" })
          .webp({ quality: 68, effort: 5, smartSubsample: true })
          .toFile(thumbnailOutput);
      }

      if (updatePreview) {
        await sharp(input)
          .rotate()
          .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80, effort: 5, smartSubsample: true })
          .toFile(previewOutput);
      }

      generatedCount += 1;
    });
  }
}

const backgroundInput = path.join(root, "背景.png");
const backgroundOutput = path.join(root, "背景.webp");
const updateBackground = fs.existsSync(backgroundInput) && needsUpdate(backgroundInput, backgroundOutput);
if (updateBackground) {
  jobs.push(async () => {
    await sharp(backgroundInput)
      .rotate()
      .resize({ width: 2560, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 5, smartSubsample: true })
      .toFile(backgroundOutput);
  });
}

async function run() {
  const concurrency = 4;
  let nextJob = 0;

  async function worker() {
    while (nextJob < jobs.length) {
      const job = jobs[nextJob];
      nextJob += 1;
      await job();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(`已扫描 ${sourceCount} 张原图：更新 ${generatedCount} 组，跳过 ${skippedCount} 组。`);
  if (removedCount > 0) console.log(`已清理 ${removedCount} 个失效的缩略图或预览图。`);
  if (updateBackground) console.log("已更新首屏背景：背景.webp");
  else if (fs.existsSync(backgroundInput)) console.log("首屏背景未变化，已跳过。");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
