var http = require('http');
var ytdl = require('ytdl-core');

const port = process.env.PORT || 8080;
http.createServer(function (req, res) {
  const urlMatch = req.url.match(/^\/download\/(.*)$/);
  if (urlMatch) {
    const ytid = urlMatch[1];
    const url = `https://www.youtube.com/watch?v=${ytid}`;
    const downloadStream = ytdl(url, {filter: "audioonly"});
    downloadStream.on('response', function (downloadRes) {
      const total = downloadRes.headers['content-length'];
      var range = req.headers.range;
      var positions = range.replace(/bytes=/, "").split("-");
      var start = parseInt(positions[0], 10);
      var end = positions[1] ? parseInt(positions[1], 10) : total - 1;
      var chunksize = (end - start) + 1;
      res.writeHead(206, {
        "Content-Range": "bytes " + start + "-" + end + "/" + total,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4"
      });
      downloadStream.pipe(res);
    });
  } else {
    res.sendStatus(404);
  }
}).listen(port, function () {
  console.log(`listening on *:${port}`);
});
