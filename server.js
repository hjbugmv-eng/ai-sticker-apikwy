const express = require("express");
const multer = require("multer");
const cors = require("cors");
const OpenAI = require("openai");
const sharp = require("sharp");
const archiver = require("archiver");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const outputDir = path.join(__dirname, "output");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}


// API TEST
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "AI Sticker Maker API is running"
  });
});


// GENERATE STICKERS
app.post(
  "/api/generate-stickers",
  upload.single("image"),
  async (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "تصویر لازمی ہے"
        });
      }

      const prompt = String(
        req.body.prompt || ""
      ).trim();

      const count = Math.min(
        Math.max(
          Number(req.body.count || 10),
          1
        ),
        30
      );

      if (!prompt) {
        return res.status(400).json({
          success: false,
          message: "Prompt لازمی ہے"
        });
      }

      const packId = crypto.randomUUID();

      const packDir = path.join(
        outputDir,
        packId
      );

      fs.mkdirSync(packDir, {
        recursive: true
      });

      const stickers = [];

      // CREATE STICKERS
      for (let i = 1; i <= count; i++) {

        const stickerPrompt = `
Create ONE premium 3D WhatsApp sticker
using the provided person's photo as the identity reference.

Keep the person's identity recognizable.
Keep facial characteristics, beard, hairstyle,
skin tone and overall appearance consistent.

Create only ONE sticker.

Sticker number: ${i}

User request:
${prompt}

Make it:
- premium 3D
- expressive
- clean
- centered
- sticker style
- clean background
- no watermark
- no extra people
- no sticker sheet
- no multiple stickers
`;

        const result = await openai.images.edit({

          model: "gpt-image-2",

          image: [
            {
              data: req.file.buffer,
              mime_type: req.file.mimetype
            }
          ],

          prompt: stickerPrompt,

          size: "1024x1024"
        });

        if (
          !result.data ||
          !result.data[0] ||
          !result.data[0].b64_json
        ) {
          throw new Error(
            `Sticker ${i} generate نہیں ہوا`
          );
        }

        const generatedBuffer =
          Buffer.from(
            result.data[0].b64_json,
            "base64"
          );

        const stickerPath =
          path.join(
            packDir,
            `sticker-${i}.webp`
          );

        await sharp(generatedBuffer)
          .resize(512, 512, {
            fit: "contain"
          })
          .webp({
            quality: 90
          })
          .toFile(stickerPath);

        stickers.push({
          number: i,
          file: `sticker-${i}.webp`
        });
      }


      // CREATE ZIP
      const zipName =
        `${packId}.zip`;

      const zipPath =
        path.join(
          outputDir,
          zipName
        );

      await createZip(
        packDir,
        zipPath
      );


      // RESPONSE
      res.json({
        success: true,
        message: "Sticker pack تیار ہے",
        pack_id: packId,
        count: stickers.length,
        stickers: stickers,
        download_url:
          `/download/${zipName}`
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message: "Sticker pack بنانے میں مسئلہ آیا",
        error: error.message
      });

    }
  }
);


// DOWNLOAD PACK
app.get(
  "/download/:filename",
  (req, res) => {

    const filename =
      path.basename(
        req.params.filename
      );

    const filePath =
      path.join(
        outputDir,
        filename
      );

    if (!fs.existsSync(filePath)) {

      return res.status(404).json({
        success: false,
        message: "Pack نہیں ملا"
      });

    }

    res.download(filePath);
  }
);


// ZIP FUNCTION
function createZip(
  folder,
  outputFile
) {

  return new Promise(
    (resolve, reject) => {

      const output =
        fs.createWriteStream(
          outputFile
        );

      const archive =
        archiver("zip", {
          zlib: {
            level: 9
          }
        });

      output.on(
        "close",
        resolve
      );

      archive.on(
        "error",
        reject
      );

      archive.pipe(output);

      archive.directory(
        folder,
        false
      );

      archive.finalize();

    }
  );
}


// START SERVER
app.listen(
  PORT,
  () => {
    console.log(
      `AI Sticker Maker API running on port ${PORT}`
    );
  }
);
