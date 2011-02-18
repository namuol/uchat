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
    rooms = {};

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

    function objectItemCount(objects) {
        var objectName, count = 0;
        for (objectName in objects) {
            if (objects.hasOwnProperty(objectName)) {
                count += 1;
            }
        }
        return count;
    }

    ////////////////////////////////////////////
    // CLIENT CONNECTS...
    mocket.on('$connection', function (client) {
        ////////////////////////////////////////
        // CLIENT ENTERS A ROOM...
        client.on('enter', function (roomName) {
            var room, name, i;
            if (typeof roomName !== 'string') {
                return;
            }

            roomName = roomName.match(/^([A-Z0-9\-_!])*/gi)[0];

            if (typeof roomName !== 'undefined' &&
                typeof rooms[roomName] === 'undefined') {
                // Room by this name doesn't yet exist, so create one:
                rooms[roomName] = {
                    clients: {},
                    clientCount: function () {
                        return objectItemCount(this.clients);
                    },
                    log: []
                };
            }

            client.send('entered', roomName);

            room = rooms[roomName];

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
                } else if (nameIn) {
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
                    console.log('"' + name + '" joined!');
                }
            });

            /////////////////////////////////
            // CLIENT SENDS A MESSAGE...
            client.on('msg', function (msg) {
                if (typeof room.clients[name] !== 'undefined') {
                    if (typeof msg !== 'string') {
                        return;
                    }
                    var matches = msg.match(/>(\S+)/ig),
                        i,
                        username,
                        timestamp = (new Date()),
                        private_message = false;

                    if (matches && matches.length > 0) {
                        for (i = 0; i < matches.length; i += 1) {
                            username = matches[i].substring(1);
                            if (typeof room.clients[username] !== 'undefined') {
                                private_message = true;
                                if (username != name) {
                                    room.clients[username].send('msg', msg, name, timestamp);
                                }
                            }
                        }
                    }

                    if (!private_message) {
                        bcastAndLog('msg', msg, name, (new Date()));
                    } else {
                        client.send('msg', msg, name, timestamp);
                    }

                    console.log(name + ': ' + msg);
                }
            });

            client.on('stats', function () {
                client.send('stats', {
                    roomCount: objectItemCount(rooms),
                    clientCount: objectItemCount(socket.clients)
                });
            });

            //////////////////////////////////////
            // CLIENT DISCONNECTS...
            client.on('$disconnect', function () {
                if (typeof room.clients[name] !== 'undefined') {
                    bcastAndLog('left', name, (new Date()));
                    delete room.clients[name];
                    console.log('"' + name + '" left!');
                }
                setTimeout(function () {
                    if (typeof rooms[roomName] !== 'undefined' &&
                        room.clientCount() <= 0) {
                        delete rooms[roomName];
                    }
                }, config.empty_room_life_span * 1000);
            });
        });
    });
});
