var http = require('http');
var ytdl = require('ytdl-core');

const port = process.env.PORT || 8080;
http.createServer(function (req, res) {
  const ytid = matchUrl(req.url);
  if (ytid) {
    console.log(`***Started Streaming Audio for ytid:${ytid}***`);
    audioStream(ytid).on('response', function (downloadRes) {
      res.writeHead(206, resHeader(req, downloadRes));
    }).on('end', function () {
      console.log(`***Finished Streaming Audio for ytid:${ytid}***`);
      res.end();
    }).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(port, function () {
  console.log(`listening on *:${port}`);
});

function matchUrl (url) {
  const match = url.match(/^\/download\/(.*)$/);
  return match ? match[1] : null;
}

function audioStream (ytid) {
  const url = `https://www.youtube.com/watch?v=${ytid}`;
  return ytdl(url, {filter: "audioonly"});
}

function resHeader (req, downloadRes) {
  const total = downloadRes.headers['content-length'];
  var range = req.headers.range;
  var positions = range.replace(/bytes=/, "").split("-");
  var start = parseInt(positions[0], 10);
  var end = positions[1] ? parseInt(positions[1], 10) : total - 1;
  var chunksize = (end - start) + 1;
  return {
    "Content-Range": "bytes " + start + "-" + end + "/" + total,
    "Accept-Ranges": "bytes",
    "Content-Length": chunksize,
    "Content-Type": "audio/mp3"
  };
}
