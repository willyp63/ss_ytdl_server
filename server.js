'use strict';

const app = require('express')();
const ytdl = require('ytdl-core');

/// Cache for SpotifyId to YtId pairs.
let _ytIds = {};

/// Allow requests from all origins.
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

/// Read from cache.
///
/// Query params: [spotifyId]
/// Response format: {ytid: YtId}
app.get('/ytid/:spotifyId', function (req, res) {
  res.writeHead(200, {"Content-Type": "application/json"});

  const spotifyId = req.params.spotifyId;
  if (const ytid = _ytIds[spotifyId]) {
    // Check if stream is still there since we have no way to know of
    // changes to Yt's content.
    const url = `https://www.youtube.com/watch?v=${ytid}`;
    const stream = ytdl(url, {filter: 'audioonly'})
      .on('info', function (info, format) {
        // Stream is still there :). Stop streaming and return YtId.
        console.log(`Successfully returned YtId: ${ytid} for SpotifyId: ${spotifyId} from cache.`);
        stream.destroy();
        res.end(JSON.stringify({ytid: ytid}));
      }).on('error', function (err) {
        // There is no longer a stream :(. Remove YtId from cache
        // and return null.
        console.log(`Removed YtId: ${ytid} for SpotifyId: ${spotifyId} from Cache b/c streaming failed.`);
        _ytIds[spotifyId] = null;
        res.end(JSON.stringify({ytid: null}));
      });
  } else {
    console.log(`YtId for SpotifyId: ${spotifyId} was not cached.`);
    res.end(JSON.stringify({ytid: null}));
  }
});

/// Write to cache.
///
/// Query params: [spotifyId, ytid]
/// Response format: N/A
app.get('/cache', function (req, res) {
  console.log(`Cached YtId: ${req.query.ytid} \
               for SpotifyId: ${req.query.spotifyId}.`);
  _ytIds[req.query.spotifyId] = req.query.ytid;
  res.sendStatus(200);
});

/// Stream content from Yt.
///
/// Query params: [ytid, encoding]
/// Response format: Stream of audio in the encoding requested.
app.get('/stream', function (req, res) {
  const ytid = req.query.ytid;
  const encoding = req.query.encoding;
  const reqRange = requestRange(req);

  // Check if partial request goes to end of file.
  if (!reqRange.end) {
    console.log(`Eof audio request for YtId: ${ytid} and encoding: ${encoding}. Byte range: ${reqRange.start} - ${reqRange.end}`);
    streamAudio(res, ytid, reqRange, encoding);
  } else {
    // Must get totalBytes with seperate request :(.
    console.log(`Audio request for YtId: ${ytid} and encoding: ${encoding}. Byte range: ${reqRange.start} - ${reqRange.end}`);
    getTotalBytes(ytid, encoding, function (totalBytes) {
      streamAudio(res, ytid, reqRange, encoding, totalBytes);
    });
  }
});

/// Steams audio from Yt to [res].
function streamAudio (res, ytid, reqRange, encoding, totalBytes) {
  const stream = audioStream(ytid, encoding, reqRange.start, reqRange.end)
    .on('response', function (downloadRes) {
      console.log(`Started streaming audio for YtId: ${ytid} and encoding: ${encoding}. Byte range: ${reqRange.start} - ${reqRange.end}`);
      // If [totalBytes] is null, this is Eof request and [totalBytes] can
      // be infered from the length of this stream.
      totalBytes = totalBytes ||
        parseInt(downloadRes.headers['content-length']) + reqRange.start;
      res.writeHead(206, responseHeader(reqRange, encoding, totalBytes));
      stream.pipe(res);
    }).on('error', function (err) {
      // Audio stream failed. Ideally this should never happen.
      console.log(`Failed to stream audio for YtId: ${ytid} and encoding: ${encoding}. Byte range: ${reqRange.start} - ${reqRange.end}`);
      console.error(err.stack);
      res.status(500).send(`Sorry. Could not stream audio for YtId: ${ytid} and encoding: ${encoding}.`);
    });
}

/// Check if Yt provides an audio stream for the given YtId and encoding.
///
/// Supported encodings are: 'opus' and 'aac'
///
/// Query params: [ytid, encoding]
/// Response format: {validFormat: Bool}
app.get('/audioEncoding', function (req, res) {
  res.writeHead(200, {"Content-Type": "application/json"});

  const url = `https://www.youtube.com/watch?v=${req.query.ytid}`;
  const filterFunction = req.query.encoding === 'opus'
    ? opusFormat : aacFormat;
  const stream = ytdl(url, {filter: filterFunction})
    .on('info', function (info, format) {
      // We were able to stream from Yt. This is a valid encoding option.
      stream.destroy();
      res.end(JSON.stringify({validFormat: true}));
    }).on('error', function (err) {
      // We weren't able to stream from Yt. This is not a valid encoding option.
      res.end(JSON.stringify({validFormat: false}));
    });
});

/// Gets the total bytes for an audio stream.
function getTotalBytes (ytid, encoding, returnTotalBytes) {
  const stream = audioStream(ytid, encoding, 0, null)
    .on('response', function (downloadRes) {
      stream.destroy();
      returnTotalBytes(parseInt(downloadRes.headers['content-length']));
    }).on('error', function (err) {
      console.log(`Failed to stream audio for YtId: ${ytid} and encoding: ${encoding} trying to get total bytes for request.`);
      console.error(err.stack);
    });
}

/// Makes a request to Yt for audio and returns the stream.
///
/// ytdl-core does all this work for us :).
function audioStream (ytid, encoding, start, end) {
  const filterFunction = (encoding === 'opus' ? opusFormat : aacFormat);
  const range = end ? `${start}-${end}` : `${start}-`;
  const url = `https://www.youtube.com/watch?v=${ytid}`;
  return ytdl(url, {filter: filterFunction, range: range});
}

/// Parses audio request header to get byte range.
function requestRange (req) {
  const range = req.headers.range;
  if (!range) { return {start: 0, end: null}; }
  const positions = range.replace(/bytes=/, "").split("-");
  const start = parseInt(positions[0], 10);
  const end = positions[1] ? parseInt(positions[1], 10) : null;
  return {start: start, end: end};
}

// Returns response header for audio request.
function responseHeader (reqRange, encoding, totalBytes) {
  const end = reqRange.end || totalBytes - 1;
  return {
    "content-range": "bytes " + reqRange.start + "-" + (end) + "/" + totalBytes,
    "accept-ranges": "bytes",
    "content-length": (end - reqRange.start + 1),
    "content-type": (encoding === 'opus' ? 'audio/webm' : 'audio/mp4')
  };
}

/// Functions passed to ytdl-core to stream aac encoded audio.
function aacFormat (format) {
  return (format.resolution === '360p' &&
          format.container === 'mp4' &&
          format.audioEncoding === 'aac');
}

/// Functions passed to ytdl-core to stream opus encoded audio.
function opusFormat (format) {
  return (format.resolution === null &&
          format.container === 'webm' &&
          format.audioEncoding === 'opus');
}

const port = process.env.PORT || 8080;
app.listen(port, function () {
  console.log(`Listening on port:${port}.`);
});
