const express = require("express");
const serverless = require("serverless-http");
const cors = require("cors");
const formidable = require("express-formidable");
const fs = require("fs");
const mongodb = require("mongodb");

const app = express();
app.use(cors());
app.use(formidable());

const mongoClient = mongodb.MongoClient;
const ObjectId = mongodb.ObjectId;

let db, imgdb, bucket, imgBucket;

// Setup Mongo only once per cold start
async function connectDB() {
  if (!db || !imgdb) {
    const client = await mongoClient.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    db = client.db("mongodb_gridfs");
    imgdb = client.db("mongodb_gridfs_images");
    bucket = new mongodb.GridFSBucket(db);
    imgBucket = new mongodb.GridFSBucket(imgdb);
  }
}

app.post("/upload", async (req, res) => {
  await connectDB();

  const file = req.files.file;
  const filePath = file.name;

  const mm = await import("music-metadata");
  const metadata = await mm.parseFile(file.path);

  if (metadata.common.picture && metadata.common.picture.length > 0) {
    const image = metadata.common.picture[0];

    const uploadImage = imgBucket.openUploadStream(filePath, {
      chunkSizeBytes: 1048576,
      metadata: {
        type: "image",
        linkedSong: filePath,
        type: image.format,
      },
    });

    uploadImage.end(image.data);
  }

  fs.createReadStream(file.path)
    .pipe(
      bucket.openUploadStream(filePath, {
        chunkSizeBytes: 1048576,
        metadata: {
          name: file.name,
          size: file.size,
          type: file.type,
        },
      })
    )
    .on("finish", () => {
      res.send({ msg: "File saved." });
    });
});

module.exports = serverless(app);
