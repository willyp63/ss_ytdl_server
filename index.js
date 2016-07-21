var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var ss = require('socket.io-stream');
var ytdl = require('ytdl-core');

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/bundle.js', function (req, res) {
  res.sendFile(__dirname + '/bundle.js');
});

app.get('/style.css', function (req, res) {
  res.sendFile(__dirname + '/style.css');
});

io.on('connection', function(socket){
  ss(socket).on('download', function (stream, data) {
    const url = `https://www.youtube.com/watch?v=${data.ytid}`;
    try {
      console.log(`downloading video from url: ${url}`);
      ytdl(url, {filter: "audioonly"}).pipe(stream);
    } catch (err) {
      socket.emit('download_error', err);
    }
  });
});

const port = process.env.PORT || 3000;
http.listen(port, function () {
  console.log(`listening on *:${port}`);
});
