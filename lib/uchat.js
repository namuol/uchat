/*jslint
    white: true,
    onevar: true,
    undef: true,
    newcap: true,
    nomen: false,
    regexp: true,
    plusplus: true,
    bitwise: true,
    maxerr: 50,
    indent: 4 */

/*global
    setTimeout,
    console,
    __dirname,
    require,
    module*/

var _       = require('underscore'),
    $       = require('jquery'),
    mio     = require('../support/multio/lib/multio'),
    UCHAT   = {};

if (typeof module !== 'undefined') { 
    module.exports = UCHAT;
}

function objectItemCount(objects) {
    var objectName, count = 0;
    for (objectName in objects) {
        if (objects.hasOwnProperty(objectName)) {
            count += 1;
        }
    }
    return count;
}



UCHAT.listen = function (mocket, config) {
    var rooms = {},
        socket = mocket.getSocket(),
        callbacks = config.callbacks || {};

    function tryCallback(name, client) {
        if (typeof callbacks[name] === 'function') {
            var args = [client],
                i;
            for (i = 1; i < arguments.length; i += 1) {
                args.push(arguments[i]);
            }
            return callbacks[name].apply(callbacks[name], args);
        }
        return true;
    }

    ////////////////////////////////////////////
    // CLIENT CONNECTS...
    mocket.on('$connection', function (client) {
        if (!tryCallback('$connection', client)) {
            return;
        }

        ////////////////////////////////////////
        // CLIENT ENTERS A ROOM...
        client.on('uchat-enter', function (roomName) {
            var room, name, i;
            if (typeof roomName !== 'string') {
                return;
            }

            roomName = roomName.match(/^([A-Z0-9\-_!])*/gi)[0];

            if (!tryCallback('roomName', client, roomName)) {
                return;
            }

            if (typeof roomName !== 'undefined' &&
                typeof rooms[roomName] === 'undefined') {
                // Room by this name doesn't yet exist, so create one:
                rooms[roomName] = {
                    clients: [],
                    joined: {},
                    clientCount: function () {
                        return objectItemCount(this.joined);
                    },
                    log: []
                };
            }

            client.send('uchat-entered', roomName);

            room = rooms[roomName];
            room.clients.push(client);

            function bcastAndLog() {
                var i;
                for (i = 0; i < room.clients.length; i += 1) {
                    if (typeof room.clients[i] !== 'undefined') {
                        room.clients[i].send.apply(room.clients[i], arguments);
                    }
                }
                room.log.push(arguments);
                if (room.log.length > config.max_log_length) {
                    room.log = _.tail(room.log);
                }
            }


            ///////////////////////////////////////////////
            // CLIENT TELLS US HIS/HER NAME...
            client.on('uchat-join', function (nameIn) {
                nameIn = nameIn.replace(' ', '');
                nameIn = nameIn.replace('@', '');
                nameIn = $.trim(nameIn);

                if (!tryCallback('uchat-join', client, nameIn)) {
                    return;
                }

                if (typeof room.joined[nameIn] !== 'undefined') {
                    client.send('uchat-nameTaken');
                } else if (nameIn) {
                    if (nameIn.length < config.min_name_length) {
                        client.send('uchat-nameTooShort'); 
                        return;
                    }

                    name = nameIn;
                    client.send('uchat-joinSuccess', name);
                    bcastAndLog('uchat-joined', name, (new Date()));
                    room.joined[name] = client;
                    console.log('"' + name + '" joined!');

                    // Send a log of recent events to the client:
                    client.send('uchat-logBegin');
                    for (i = 0; i < room.log.length; i += 1)
                    {
                        client.send.apply(client, room.log[i]);
                    }
                    client.send('uchat-logEnd');
                }
            });

            /////////////////////////////////
            // CLIENT SENDS A MESSAGE...
            client.on('uchat-msg', function (msg) {
                if (typeof room.joined[name] !== 'undefined') {
                    if (typeof msg !== 'string') {
                        return;
                    }
                    var matches = msg.match(/>(\S+)/ig),
                        i,
                        username,
                        timestamp = (new Date()),
                        private_message = false;

                    if (!tryCallback('uchat-msg', client, msg)) {
                        return;
                    }

                    if (matches && matches.length > 0) {
                        for (i = 0; i < matches.length; i += 1) {
                            username = matches[i].substring(1);
                            if (typeof room.joined[username] !== 'undefined') {
                                private_message = true;
                                if (username != name) {
                                    room.joined[username].send('uchat-msg', msg, name, timestamp);
                                    client.send('uchat-msg', msg, name, timestamp);
                                }
                            }
                        }
                    }

                    if (!private_message) {
                        bcastAndLog('uchat-msg', msg, name, (new Date()));
                    } else {
                        client.send('uchat-msg', msg, name, timestamp);
                    }

                    console.log(name + ': ' + msg);
                }
            });

            client.on('uchat-stats', function () {
                client.send('uchat-stats', {
                    roomCount: objectItemCount(rooms),
                    clientCount: objectItemCount(socket.clients)
                });
            });

            //////////////////////////////////////
            // CLIENT DISCONNECTS...
            client.on('$disconnect', function () {
                tryCallback('$disconnect', client);

                if (typeof room.joined[name] !== 'undefined') {
                    bcastAndLog('uchat-left', name, (new Date()));
                    delete room.joined[name];
                    room.clients = _.without(room.clients, room.joined[name]);
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

    return {
        rooms: rooms
    };
};
