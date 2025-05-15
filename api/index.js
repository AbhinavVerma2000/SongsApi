const express = require("express");
const app = express();
const mongodb = require("mongodb");
// const http = require("http").createServer(app);
const mongoClient = mongodb.MongoClient;
const ObjectId = mongodb.ObjectId;
const cors = require("cors");
const path = require("path");
app.use(cors());
const fs = require("fs");
app.set("view engine", "ejs");
const expformidable = require("express-formidable");
const { title } = require("process");
app.use(expformidable());
app.set("views", path.join(__dirname, "..", "views"));
// connect with MongoDB server

async function connectDB() {
  client = await mongodb.MongoClient.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  bucket = new mongodb.GridFSBucket(client.db("mongodb_gridfs"));
  imgBucket = new mongodb.GridFSBucket(client.db("mongodb_gridfs_images"));
  collection = bucket.collection("api");
}

app.post("/upload", async function (request, result) {
  try {
    await connectDB();
    // get input name="file" from client side
    const file = request.files.file;

    // set file path in MongoDB GriDFS
    // this will be saved as "filename" in "fs.files" collection
    const filePath = file.name;

    if (file.type.startsWith("audio/")) {
      const mm = await import("music-metadata");
      const metadata = await mm.parseFile(file.path);

      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const image = metadata.common.picture[0]; // typically image/jpeg or image/png

        const uploadImage = imgBucket.openUploadStream(filePath, {
          chunkSizeBytes: 1048576,
          metadata: {
            linkedSong: filePath,
            type: image.format,
            duration: metadata.format.duration,
            title: metadata.common.title,
            artist: metadata.common.artist,
            album: metadata.common.album,
          },
        });

        uploadImage.end(image.data);
      }
      
      const re = await collection.insertOne({
        title: metadata.common.title,
        artistName: metadata.common.artist,
        album: metadata.common.album,
        duration: (metadata.format.duration / 60).toFixed(2).replace(".", ":"),
        genre: metadata.common.genre,
        musicUrl: `https://songsapi-w20w.onrender.com/songs/${filePath}`,
        thumbnail: `https://songsapi-w20w.onrender.com/images/${filePath}`,
      });
    }

    // read user uploaded file stream
    fs.createReadStream(file.path)
      // add GridFS bucket stream to the pipe
      // it will keep reading and saving file
      .pipe(
        bucket.openUploadStream(filePath, {
          // maximum size for each chunk (in bytes)
          chunkSizeBytes: 1048576, // 1048576 = 1 MB
          // metadata of the file
          metadata: {
            name: file.name, // file name
            size: file.size, // file size (in bytes)
            type: file.type, // type of file
          },
        })
      )
      // this callback will be called when the file is done saving
      .on("finish", function () {
        fs.unlink(file.path, (err) => {
          if (err) console.error("Temp file deletion failed:", err);
        });
        result.send({ msg: "File saved." });
        client.close()
      });
  } catch (error) {
    result.status(500).send({ error: error.message, msg: "File not saved." });
  }
});

app.get("/", async function (request, result) {
  await connectDB();
  // get all files from GridFS bucket
  const files = await bucket.find({}).toArray();
  const imgFiles = await imgBucket.find({}).toArray();
  result.render("index", {
    files,
    imgFiles,
  });
  // result.send("Okay");
  client.close()
});
app.get("/songsapi", async function (request, result) {
  await connectDB();
  // get all files from GridFS bucket
  const files = await collection.find({}).toArray();
  result.send( {
    files
  });
  // result.send("Okay");
  client.close()
});

app.get("/songs", async function (request, result) {
  await connectDB();
  const files = await bucket
    .find({
      // filename: "name of file" //
    })
    .sort({
      uploadDate: -1,
    })
    .toArray();
  result.send({
    files,
  });
  client.close()
});

app.get("/images", async function (request, result) {
  await connectDB();
  const files = await imgBucket
    .find({
      // filename: "name of file" //
    })
    .sort({
      uploadDate: -1,
    })
    .toArray();
  result.send({
    files,
  });
  client.close()
});

app.get("/songs/:filename", async function (request, result) {
  await connectDB();
  // get file name from URL
  const filename = request.params.filename;

  // get file from GridFS bucket
  const files = await bucket
    .find({
      filename,
    })
    .toArray();

  const song = files[0];
  if (!files || files.length == 0) {
    return result.status(404).json({
      error: "File does not exists.",
    });
  }
  result.set("Content-Type", song.metadata.type);

  // it will fetch the file from bucket and add it to pipe
  // result response is added in the pipe so it will keep
  // returning data to the client

  // bucket.openDownloadStreamByName(filename).pipe(result);

  const readstream = bucket.openDownloadStream(song._id);

  // for local file system
  // const readstream = fs.createReadStream(image.filename);
  // readstream.pipe(result);

  // const readstream = fs.createReadStream({ filename: request.params.filename });
  // readstream.on("error", (err) => {
  //   console.error("Stream error:", err);
  //   res.status(500).send("Error reading image");
  // });
  readstream.pipe(result);
  client.close()
});

app.get("/images/:filename", async function (request, result) {
  await connectDB();
  // get file name from URL
  const filename = request.params.filename;

  // get file from GridFS bucket
  const files = await imgBucket
    .find({
      filename,
    })
    .toArray();

  const image = files[0];
  if (!files || files.length == 0) {
    return result.status(404).json({
      error: "File does not exists.",
    });
  }
  result.set("Content-Type", image.metadata.type);

  // it will fetch the file from bucket and add it to pipe
  // result response is added in the pipe so it will keep
  // returning data to the client

  // bucket.openDownloadStreamByName(filename).pipe(result);

  const readstream = imgBucket.openDownloadStream(image._id);

  // for local file system
  // const readstream = fs.createReadStream(image.filename);
  // readstream.pipe(result);

  // const readstream = fs.createReadStream({ filename: request.params.filename });
  // readstream.on("error", (err) => {
  //   console.error("Stream error:", err);
  //   res.status(500).send("Error reading image");
  // });
  readstream.pipe(result);
  client.close()
});

app.listen(process.env.PORT || 5000, async () => {
  console.log("Server started");
});
module.exports = app;
