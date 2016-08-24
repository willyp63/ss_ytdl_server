'use strict';

const app = require('express')();
const ytdl = require('ytdl-core');

let _ytids = {};

// ORIGINS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Range");
  res.header("Access-Control-Expose-Headers", "Content-Range");
  next();
});

// ACCESS CACHE
app.get('/ytid/:spotifyId', function (req, res) {
  res.writeHead(200, {"Content-Type": "application/json"});
  if (_ytids[req.params.spotifyId]) {
    const url = `https://www.youtube.com/watch?v=${_ytids[req.params.spotifyId]}`;
    const stream = ytdl(url, {filter: "audioonly"}).on('info', function (info, format) {
      stream.destroy();
      res.end(JSON.stringify({ytid: _ytids[req.params.spotifyId]}));
    }).on('error', function (err) {
      // remove ytid from cache
      _ytids[req.params.spotifyId] = null;
      console.error(err.stack);
      res.end(JSON.stringify({ytid: null}));
    });
  } else {
    res.end(JSON.stringify({ytid: null}));
  }
});

// ACCESS CACHE
app.get('/cache', function (req, res) {
  _ytids[req.query.spotifyId] = req.query.ytid;
  res.sendStatus(200);
});

// STREAM
app.get('/stream/:ytid', function (req, res) {
  // stream only requested range
  const reqRange = requestRange(req);
  const stream = audioStream(req.params.ytid, reqRange.start, reqRange.end).on('response', function (downloadRes) {
    // stream audio
    const totalBytes = reqRange.start + parseInt(downloadRes.headers['content-length']);
    res.writeHead(206, responseHeader(reqRange, totalBytes));
    stream.pipe(res);
  }).on('error', function (err) {
    console.error(err.stack);
    res.status(500).send('Can not open Stream!');
  });
});

// AUDIO ENCODING
app.get('/audioEncoding/:ytid', function (req, res) {
  const url = `https://www.youtube.com/watch?v=${req.params.ytid}`;
  const stream = ytdl(url, {filter: "audioonly"}).on('info', function (info, format) {
    stream.destroy();
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify({validFormat: (format.audioEncoding === 'opus')}));
  }).on('error', function (err) {
    console.error(err.stack);
    res.status(500).send('Can not get Stream Info!');
  });
});

// listen on heroku port or 8080
const port = process.env.PORT || 8080;
app.listen(port, function () {
  console.log(`listening on *:${port}`);
});

function audioStream (ytid, start, end) {
  const range = end ? `${start}-${end}` : `${start}-`;
  const url = `https://www.youtube.com/watch?v=${ytid}`;
  return ytdl(url, {filter: "audioonly", range: range});
}

function requestRange (req) {
  const range = req.headers.range;
  if (!range) { return {start: 0, end: null}; }
  const positions = range.replace(/bytes=/, "").split("-");
  const start = parseInt(positions[0], 10);
  const end = positions[1] ? parseInt(positions[1], 10) : null;
  return {start: start, end: end};
}

function responseHeader (reqRange, totalBytes) {
  const end = reqRange.end || totalBytes - 1;
  return {
    "Content-Range": "bytes " + reqRange.start + "-" + (end) + "/" + totalBytes,
    "Accept-Ranges": "bytes",
    "Content-Length": (end - reqRange.start + 1),
    "Content-Type": "audio/webm"
  };
}
