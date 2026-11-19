const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const outputDir = path.join(__dirname, 'assets');
const names = ['idle', 'smile', 'cold'];

async function compressImages() {
  await fs.mkdir(outputDir, { recursive: true });

  await Promise.all(
    names.map(async (name) => {
      const input = path.join(__dirname, `${name}.png`);
      const output = path.join(outputDir, `${name}.png`);

      await sharp(input)
        .resize(600, 600, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .ensureAlpha()
        .png({ compressionLevel: 9 })
        .toFile(output);

      console.log(`已生成 assets/${name}.png`);
    }),
  );
}

compressImages().catch((error) => {
  console.error('图片压缩失败：', error);
  process.exitCode = 1;
});
