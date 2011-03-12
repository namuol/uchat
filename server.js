/*jslint
    white: true,
    onevar: true,
    undef: true,
    newcap: true,
    regexp: true,
    plusplus: true,
    bitwise: true,
    maxerr: 50,
    indent: 4 */
/*global
    setTimeout,
    console,
    __dirname,
    require*/

var connect = require('connect'),
    config  = require('./config'),
    http    = require('http'),
    mio     = require('./support/multio/lib/multio'),
    io      = require('socket.io'),
    fs      = require('fs'),
    uchat   = require('./lib/uchat');


fs.readFile(__dirname + '/views/index.html', function (err, data) {
    var clientHTML = data,
    baseServer,
    server,
    socket,
    mocket;

    baseServer = http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(clientHTML);
        res.end();
    });

    server = connect.createServer(
        connect.compiler({src: __dirname + '/public', enable: ['less']}),
        connect.staticProvider(__dirname + '/public'),
        baseServer
    );

    server.listen(config.port);
    console.log('Server listening on port ' + config.port + '.');
    socket = io.listen(server);
    mocket = mio.listen(socket);
    uchat.listen(mocket, {
        callbacks: {
            'uchat-msg': function () {
                return true;
            }
        }
    }); 
});
