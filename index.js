var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http, {'transports': ['websocket', 'polling']});
var ss = require('socket.io-stream');
var ytdl = require('ytdl-core');

io.set('origins', 'salty-falls-17641.herokuapp.com');

io.on('connection', function(socket){
  ss(socket).on('download', function (stream, data) {
    const url = `https://www.youtube.com/watch?v=${data.ytid}`;
    console.log(`downloading video from url: ${url}`);
    ytdl(url, {filter: "audioonly"}).pipe(stream);
  });
});

const port = process.env.PORT || 8080;
http.listen(port, function () {
  console.log(`listening on *:${port}`);
});
