'use strict';

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var ss = require('socket.io-stream');
var ytdl = require('ytdl-core');
var WritableStream = require('stream').Writable;

io.on('connection', function(socket){
  ss(socket).on('download', function (stream, data) {
    // stream download
    const url = `https://www.youtube.com/watch?v=${data.ytid}`;
    const downloadStream = ytdl(url, {filter: "audioonly"});
    downloadStream.pipe(stream).on('finish', function () {
      console.log(`Finished Downloading from URL:${url}`);
    });

    // track download
    console.log(`Begun Downloading from URL:${url}`);
    let chunkNum = 0;
    const ws = new WritableStream();
    ws._write = function (chunk, type, next) {
      console.log(`Sent Chunk#${chunkNum++} from URL:${url}`);
      next();
    };
    downloadStream.pipe(ws);
  });
});

// listen on heroku port or 8080
const port = process.env.PORT || 8080;
http.listen(port, function () {
  console.log(`listening on *:${port}`);
});
