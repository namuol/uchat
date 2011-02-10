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
    $       = require('jquery'),
    log     = [];

fs.readFile(__dirname + '/views/index.html', function (err, data) {
    var clientHTML = data,
    clients = {},
    baseServer,
    server,
    mocket;

    function bcastAndLog() {
        mocket.broadcast(arguments[0], _.tail(arguments));
        log.push(arguments);
        if (log.length > config.max_log_length) {
            log = _.tail(log);
        }
    }

    baseServer = baseServer = http.createServer(function (req, res) {
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

    mocket = mio.listen(io.listen(server));

    mocket.on('$connection', function (client) {
        var name, i;
        client.send('logBegin');
        for (i = 0; i < log.length; i += 1)
        {
            client.send.apply(client, log[i]);
        }
        client.send('logEnd');

        client.on('join', function (nameIn) {
            if (typeof clients[nameIn] !== 'undefined') {
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
                clients[name] = client;
                console.log('"' + name + '" joined!');
            }
        });
        
        client.on('$disconnect', function () {
            if (typeof clients[name] !== 'undefined') {
                bcastAndLog('left', name, (new Date()));
                clients[name] = undefined;
                console.log('"' + name + '" left!');
            }
        });
        
        client.on('msg', function (msg) {
            if (typeof clients[name] !== 'undefined') {
                var args = [];
                bcastAndLog('msg', msg, name, (new Date()));
                console.log(name + ': ' + msg);
            }
        });
    });
});
