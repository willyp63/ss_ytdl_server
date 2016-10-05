'use strict';

const app = require('express')();
const ytdl = require('ytdl-core');

// YTID CACHE
let _ytids = {};

// ALLOW ALL ORIGINS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// READ CACHE
app.get('/ytid/:spotifyId', function (req, res) {
  const spotifyId = req.params.spotifyId;
  res.writeHead(200, {"Content-Type": "application/json"});
  console.log(`Checking Cache for SpotifyId! (${spotifyId})`);
  if (_ytids[spotifyId]) {
    const ytid = _ytids[spotifyId];
    // check if stream is still there
    const url = `https://www.youtube.com/watch?v=${ytid}`;
    const stream = ytdl(url, {filter: 'audioonly'}).on('info', function (info, format) {
      // end stream and return ytid
      stream.destroy();
      console.log(`Successfully Returned YTID from Cache! (${ytid})`);
      res.end(JSON.stringify({ytid: ytid}));
    }).on('error', function (err) {
      // remove ytid from cache and return null
      _ytids[spotifyId] = null;
      console.log(`Removed YTID from Cache B/C Stream Failed! (${ytid})`);
      res.end(JSON.stringify({ytid: null}));
    });
  } else {
    console.log(`SpotifyId was not in Cache! (${spotifyId})`);
    res.end(JSON.stringify({ytid: null}));
  }
});

// WRITE CACHE
app.get('/cache', function (req, res) {
  // store ytid
  _ytids[req.query.spotifyId] = req.query.ytid;
  console.log(`Stored YTID in Cache! (${req.query.spotifyId} - ${req.query.ytid})`);
  res.sendStatus(200);
});

// STREAM
app.get('/stream', function (req, res) {
  const ytid = req.query.ytid;
  const encoding = req.query.encoding;
  const reqRange = requestRange(req);

  // check if partial request goes to end of file
  if (!reqRange.end) {
    console.log('EOF Request!');
    streamAudio(res, ytid, reqRange, encoding);
  } else {
    // must get totalBytes with seperate request
    console.log('NOT EOF Request!');
    getTotalBytes(ytid, encoding, function (totalBytes) {
      streamAudio(res, ytid, reqRange, encoding, totalBytes);
    });
  }
});

function streamAudio (res, ytid, reqRange, encoding, totalBytes) {
  const stream = audioStream(ytid, encoding, reqRange.start, reqRange.end).on('response', function (downloadRes) {
    totalBytes = (totalBytes || parseInt(downloadRes.headers['content-length']));
    console.log('#######' + totalBytes);
    res.writeHead(206, responseHeader(reqRange, encoding, totalBytes));
    // stream audio
    console.log(`Streaming Audio for YTID! (${ytid} (${reqRange.start} - ${reqRange.end}))`);
    stream.pipe(res);
  }).on('error', function (err) {
    console.error(err.stack);
    res.status(500).send('Can not open Stream!');
  });
}

// AUDIO ENCODING
app.get('/audioEncoding', function (req, res) {
  const url = `https://www.youtube.com/watch?v=${req.query.ytid}`;
  const filterFunction = (req.query.encoding === 'opus' ? opusFormat : aacFormat);
  const stream = ytdl(url, {filter: filterFunction}).on('info', function (info, format) {
    stream.destroy();
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify({validFormat: true}));
  }).on('error', function (err) {
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify({validFormat: false}));
  });
});

// listen on heroku port or 8080
const port = process.env.PORT || 8080;
app.listen(port, function () {
  console.log(`listening on *:${port}`);
});

function getTotalBytes (ytid, encoding, returnTotalBytes) {
  const stream = audioStream(ytid, encoding, 0, null).on('response', function (downloadRes) {
    stream.destroy();
    returnTotalBytes(parseInt(downloadRes.headers['content-length']));
  }).on('error', function (err) {
    console.error(err.stack);
  });
}

// return a YT stream
function audioStream (ytid, encoding, start, end) {
  const filterFunction = (encoding === 'opus' ? opusFormat : aacFormat);
  const range = end ? `${start}-${end}` : `${start}-`;
  const url = `https://www.youtube.com/watch?v=${ytid}`;
  return ytdl(url, {filter: filterFunction, range: range});
}

// parse req headers to get byte range
function requestRange (req) {
  const range = req.headers.range;
  if (!range) { return {start: 0, end: null}; }
  const positions = range.replace(/bytes=/, "").split("-");
  const start = parseInt(positions[0], 10);
  const end = positions[1] ? parseInt(positions[1], 10) : null;
  return {start: start, end: end};
}

// return response headers for partial content
function responseHeader (reqRange, encoding, totalBytes) {
  const end = reqRange.end || totalBytes - 1;
  return {
    "content-range": "bytes " + reqRange.start + "-" + (end) + "/" + totalBytes,
    "accept-ranges": "bytes",
    "content-length": (end - reqRange.start + 1),
    "content-type": (encoding === 'opus' ? 'audio/webm' : 'audio/mp4')
  };
}

function aacFormat (format) {
  return (format.resolution === '360p' &&
          format.container === 'mp4' &&
          format.audioEncoding === 'aac');
}

function opusFormat (format) {
  return (format.resolution === null &&
          format.container === 'webm' &&
          format.audioEncoding === 'opus');
}
