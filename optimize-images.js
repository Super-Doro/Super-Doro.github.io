const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = __dirname;
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const yearDirectories = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

const jobs = [];

for (const year of yearDirectories) {
  const yearPath = path.join(root, year);
  const files = fs.readdirSync(yearPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);

  const thumbnailDirectory = path.join(yearPath, "thumbs");
  const previewDirectory = path.join(yearPath, "previews");
  fs.mkdirSync(thumbnailDirectory, { recursive: true });
  fs.mkdirSync(previewDirectory, { recursive: true });

  for (const file of files) {
    const input = path.join(yearPath, file);
    jobs.push(async () => {
      await sharp(input)
        .rotate()
        .resize(480, 360, { fit: "cover", position: "attention" })
        .webp({ quality: 68, effort: 5, smartSubsample: true })
        .toFile(path.join(thumbnailDirectory, `${file}.webp`));

      await sharp(input)
        .rotate()
        .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80, effort: 5, smartSubsample: true })
        .toFile(path.join(previewDirectory, `${file}.webp`));
    });
  }
}

const backgroundInput = path.join(root, "背景.png");
if (fs.existsSync(backgroundInput)) {
  jobs.push(async () => {
    await sharp(backgroundInput)
      .rotate()
      .resize({ width: 2560, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 5, smartSubsample: true })
      .toFile(path.join(root, "背景.webp"));
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
  console.log(`已生成 ${jobs.length - (fs.existsSync(backgroundInput) ? 1 : 0)} 组时间线图片资源。`);
  if (fs.existsSync(backgroundInput)) console.log("已生成首屏背景：背景.webp");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
