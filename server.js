'use strict';

const http = require('http');
const ytdl = require('ytdl-core');

let _streamSizes = {};

const port = process.env.PORT || 8080;

http.createServer(function (req, res) {
  const ytid = matchUrl(req.url);
  if (ytid) {
    if (initRequest(req)) {
      // stream entire audio
      const stream = audioStream(ytid, 0).on('response', function (downloadRes) {
        // save stream size
        _streamSizes[ytid] = downloadRes.headers['content-length'];

        // stream audio
        const reqRange = requestRange(req, _streamSizes[ytid]);
        res.writeHead(206, responseHeader(reqRange, _streamSizes[ytid]));
        stream.pipe(res);
      }).on('end', function () {
        res.end();
      });
    } else {
      // stream only requested range
      const reqRange = requestRange(req, _streamSizes[ytid]);
      const stream = audioStream(ytid, reqRange.start, reqRange.end).on('response', function () {
        // stream audio
        res.writeHead(206, responseHeader(reqRange, _streamSizes[ytid]));
        stream.pipe(res);
      }).on('end', function () {
        res.end();
      });
    }
  } else {
    // not a valid url
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

function audioStream (ytid, start, end) {
  const range = end ? `${start}-${end}` : `${start}-`;
  const url = `https://www.youtube.com/watch?v=${ytid}`;
  return ytdl(url, {filter: "audioonly", range: range});
}

function initRequest (req) {
  const range = req.headers.range;
  const positions = range.replace(/bytes=/, "").split("-");
  const start = parseInt(positions[0], 10);
  return !start;
}

function requestRange (req, totalBytes) {
  const range = req.headers.range;
  const positions = range.replace(/bytes=/, "").split("-");
  const start = parseInt(positions[0], 10);
  const end = positions[1] ? parseInt(positions[1], 10) : totalBytes - 1;
  const chunksize = (end - start) + 1;
  return {start: start, end: end, chunksize: chunksize};
}

function responseHeader (reqRange, totalBytes) {
  return {
    "Content-Range": "bytes " + reqRange.start + "-" + (reqRange.end - 1) + "/" + totalBytes,
    "Accept-Ranges": "bytes",
    "Content-Length": reqRange.chunksize,
    "Content-Type": "audio/mp3"
  };
}
