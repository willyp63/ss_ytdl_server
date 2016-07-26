'use strict';

const http = require('http');
const ytdl = require('ytdl-core');

let _streamSizes = {};

const port = process.env.PORT || 8080;

http.createServer(function (req, res) {
  let ytid = matchDownloadUrl(req.url);
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
      }).on('info', function (info, format) {
        console.log(format);
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
    ytid = matchCheckUrl(req.url);
    if (ytid) {
      const url = `https://www.youtube.com/watch?v=${ytid}`;
      ytdl(url, {filter: "audioonly"}).on('info', function (info, format) {
        const validFormat = format.audioEncoding === 'opus';
        res.writeHead(200, {"Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"});
        res.end(JSON.stringify({validFormat: validFormat}));
      });
    } else {
      // not a valid url
      res.writeHead(404);
      res.end();
    }
  }
}).listen(port, function () {
  console.log(`listening on *:${port}`);
});

function matchDownloadUrl (url) {
  const match = url.match(/^\/download\/(.*)$/);
  return match ? match[1] : null;
}

function matchCheckUrl (url) {
  const match = url.match(/^\/check\/(.*)$/);
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
