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
    console,
    __dirname,
    require*/

var connect = require('connect'),
    http    = require('http'),
    config  = require('./config'),
    io      = require('socket.io'),
    mio     = require('./support/multio/lib/multio'),
    fs      = require('fs'),
    _       = require('underscore'),
    $       = require('jquery');


fs.readFile(__dirname + '/views/index.html', function (err, data) {
    var clientHTML = data,
    baseServer,
    server,
    socket,
    mocket,
    rooms = {},
    roomCount = 0,
    clientCount = 0;

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

    ////////////////////////////////////////////
    // CLIENT CONNECTS...
    mocket.on('$connection', function (client) {
        clientCount += 1;

        ////////////////////////////////////////
        // CLIENT ENTERS A ROOM...
        client.on('enter', function (roomName) {
            var room, name, i;

            if (typeof roomName !== 'undefined' &&
                typeof rooms[roomName] === 'undefined') {
                // Room by this name does't yet exist, so create one:
                rooms[roomName] = {
                    clients: {},
                    clientCount: 0,
                    log: []
                };
                roomCount += 1;
            }

            client.send('entered', roomName);

            function bcastAndLog() {
                var c;
                for (c in room.clients) {
                    if (typeof c !== 'undefined' &&
                        room.clients.hasOwnProperty(c)) {
                        room.clients[c].send.apply(room.clients[c], arguments);
                    }
                }
                room.log.push(arguments);
                if (room.log.length > config.max_log_length) {
                    room.log = _.tail(room.log);
                }
            }

            room = rooms[roomName];

            // Send a log of recent events to the client:
            client.send('logBegin');
            for (i = 0; i < room.log.length; i += 1)
            {
                client.send.apply(client, room.log[i]);
            }
            client.send('logEnd');

            ///////////////////////////////////////////////
            // CLIENT TELLS US HIS/HER NAME...
            client.on('join', function (nameIn) {
                if (typeof room.clients[nameIn] !== 'undefined') {
                    client.send('nameTaken');
                } else {
                    nameIn = nameIn.replace(' ', '');
                    nameIn = nameIn.replace('@', '');
                    nameIn = $.trim(nameIn);
                    if (nameIn.length < config.min_name_length) {
                        client.send('nameTooShort'); 
                        return;
                    }
                    name = nameIn;
                    client.send('joinSuccess', name);
                    bcastAndLog('joined', name, (new Date()));
                    room.clients[name] = client;
                    room.clientCount += 1;
                    console.log('"' + name + '" joined!');
                }
            });

            /////////////////////////////////
            // CLIENT SENDS A MESSAGE...
            client.on('msg', function (msg) {
                if (typeof room.clients[name] !== 'undefined') {
                    var args = [];
                    bcastAndLog('msg', msg, name, (new Date()));
                    console.log(name + ': ' + msg);
                }
            });

            client.on('stats', function () {
                client.send('stats', {
                    roomCount: roomCount,
                    clientCount: clientCount
                });
            });
            
            //////////////////////////////////////
            // CLIENT DISCONNECTS...
            client.on('$disconnect', function () {
                clientCount -= 1;
                if (typeof room.clients[name] !== 'undefined') {
                    bcastAndLog('left', name, (new Date()));
                    delete room.clients[name];
                    console.log('"' + name + '" left!');
                    room.clientCount -= 1;
                    if (room.clientCount <= 0) {
                        delete rooms[roomName];
                        roomCount -= 1;
                    }
                }
            });
        });
    });
});
