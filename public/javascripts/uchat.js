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
    MULTIO
    module
    document
    window
    $
    jQuery
    _
    setTimeout*/

var UCHAT = {};

if (typeof module !== 'undefined') { 
    module.exports = UCHAT;
}

UCHAT = function (container, socket) {
    var status_msg,
        join_form,
        name_text,
        msgs,
        msg_bar,
        msg_form,
        msg_text,
        msgHistory,
        msgHistoryPos,
        currentMsg,
        commands,
        mocket,
        myName,
        whoIsHere = [],
        roomName,
        userMsg,
        userError,
        tryConnect,
        blurred,
        unreadCount = 0,
        msgAlt = false,
        userSettings = {
            timestamps: $.Storage.get('timestamps') || 'off',
            alert: $.Storage.get('alert') || 'all'
        };

    status_msg = document.createElement('div');
    $(status_msg).addClass('status-msg');
    //$(container).append(status_msg);

    join_form = document.createElement('form');
    $(join_form).addClass('join-form');
    //$(container).append(join_form);

    name_text = document.createElement('input');
    $(name_text).attr('type', 'text');
    $(name_text).attr('size', 16);
    $(name_text).attr('maxlength', 16);
    $(name_text).addClass('name');
    $(join_form).append(name_text);

    msgs = document.createElement('ul');
    $(msgs).addClass('msgs');
    $(msgs).addClass('timestamps-' + userSettings.timestamps);

    msg_bar = document.createElement('div');
    $(msg_bar).addClass('msg-bar');

    msg_form = document.createElement('form');
    $(msg_form).addClass('msg-form');
    $(msg_bar).append(msg_form);

    msg_text = document.createElement('input');
    $(msg_text).attr('type', 'text');
    $(msg_text).addClass('msg-input');
    $(msg_form).append(msg_text);

    // Expose the UI:
    this.status_msg = status_msg;
    this.join_form = join_form;
    this.name_text = name_text;
    this.msgs = msgs;
    this.msg_bar = msg_bar;
    this.msg_form = msg_form;
    this.msg_text = msg_text;

    $(name_text).hide();

    ///////////////////////////////////////////////////////////////////////////
    // UTILITY FUNCTIONS

    this.userMsg = userMsg = function userMsg(data, tmpl) {
        var jtpl, txt;
        data = typeof data === 'string' ? {msg: data} : data;
        tmpl = tmpl || '#cmd-jtpl';
        jtpl = $.createTemplate($(tmpl).val());
        txt = $.processTemplateToText(jtpl, data);
        $(msgs).append(txt);
        
        $(msgs)[0].scrollTop = $(msgs)[0].scrollHeight;
        $(msg_text).focus();
    };

    this.userError = userError = function userError(msg) {
        userMsg(msg, '#cmd-err-jtpl');
    };

    function directedAtYou(text) {
        return (text + ' ').toUpperCase().indexOf(('!' + myName + ' ').toUpperCase()) >= 0 ||
               (text + ' ').toUpperCase().indexOf(('>' + myName + ' ').toUpperCase()) >= 0;
    }

    function isMeMsg(text) {
        return text.substring(0, 3) === '/me';
    }
    
    function replaceURLWithHTMLLinks(text) {
        var exp = /(\b(https?|ftp):\/\/[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|])/ig;
        return text.replace(exp, "<a href='$1'>$1</a>"); 
    }

    function insertClickableNames(text) {
        return text.replace(/@(\S+)/ig, "@<span class='clickable-name'>$1</span>");
    }

    function insertClickableRoomLinks(text) {
        return text.replace(/([\s+|>])(#[A-Z0-9\-_!]*)/ig, "$1<a href='$2' class='room-link'>$2</a>");
    }

    function timeString(time) {
        var d, h, m, s;
        d = new Date(time);
        h = d.getHours();
        h = h < 10 ? "0" + h : h;
        m = d.getMinutes();
        m = m < 10 ? "0" + m : m;
        s = d.getSeconds();
        s = s < 10 ? "0" + s : s;
        return h + ":" + m + ":" + s;
    }
    this.timeString = timeString;

    this.tryConnect = tryConnect = function tryConnect(attemptNumber) {
        if (!socket.connected) {
            if (typeof attemptNumber === 'undefined') {
                attemptNumber = 0;
            }

            if (attemptNumber > 3) {
                $(status_msg).html("could not connect :(");
                return;
            }

            $(status_msg).html("connecting...");
            
            socket.connect();

            setTimeout(function () {
                if (!socket.connected) {
                    tryConnect(attemptNumber + 1);
                }
            }, socket.options.connectTimeout + 25);
        }
    };

    function tryJoin() {
        mocket.on('uchat-joinSuccess', function (yourName) {
            $(status_msg).hide();
            $(join_form).hide();
            $(msg_text).attr('disabled', false);
            $(msg_text).blur();
            $(msg_text).focus();
            myName = yourName;
            whoIsHere.push(myName);
            userMsg('You joined as "' + myName + '".');
            setTimeout(function () {
                mocket.unbind('uchat-joinSuccess');
                mocket.unbind('uchat-nameTaken');
                mocket.unbind('uchat-nameTooShort');
            }, 50);
        });

        mocket.on('uchat-nameTaken', function () {
            myName = undefined;
            $(name_text).show();
            $(name_text).focus();
            $(status_msg).html('try something else');
        });

        mocket.on('uchat-nameTooShort', function () {
            myName = undefined;
            $(name_text).show();
            $(name_text).focus();
            $(status_msg).html('that\'s too short');
        });

        mocket.send('uchat-join', myName);
    }

    function tryEnter() {
        mocket.send('uchat-enter', document.location.hash.substring(1));
        mocket.on('uchat-entered', function (roomNameIn) {
            roomName = roomNameIn;

            document.location = "#" + roomName;
            document.title = "#" + roomName;

            if (typeof myName === 'undefined') {
                $(status_msg).html('who are you?');
                $(status_msg).show();
                $(name_text).show();
                $(name_text).focus();
                $(name_text).attr('disabled', false);
            } else {
                $(name_text).hide();
                tryJoin();
            }
            setTimeout(function () {
                mocket.unbind('uchat-entered');
            }, 50);
        });
    }


    // UTILITY FUNCTIONS
    ///////////////////////////////////////////////////////////////////////////

    socket.on('connect', function () {
        tryEnter();
    });

    tryConnect();

    mocket = MULTIO.listen(socket);

    /////////////////////////////////////////
    // UI BEHAVIOR
    msgHistory = [];
    currentMsg = '';
    msgHistoryPos = 0;

    // Expose some UI behavioral variables:
    this.msgHistory = msgHistory;

    $(msg_text).attr('autocomplete', 'off');
    $(msg_text).attr('disabled', 'disabled');

    $('.clickable-name').live('click', function () {
        $(msg_text).val($(msg_text).val() + $(this).html() + ' ');
        $(msg_text).focus();
    });

    $('a.room-link').live('click', function () {
        setTimeout(function () {
            socket.disconnect();
        }, 25);
        return true;
    });

    // Page loses focus:
    window.onblur = function () {
        blurred = true;
    };

    // Page regains focus:
    window.onfocus = function () {
        blurred = false;
        unreadCount = 0;
    };

    /////////////////////////////////////////////////////////////////////
    // COMMANDS
    commands = {};

    function whoami() {
        userMsg('Your name is "' + myName + '"');
    }
    
    function help() {
        for (var key in commands) {
            if (commands.hasOwnProperty(key)) {
                userMsg(commands[key].usage);
            }
        }
    }

    function listusers() {
        userMsg({usernames: whoIsHere}, '#listusers-jtpl'); 
    }

    function timestamps(onOrOff) {
        if (typeof onOrOff !== 'string') {
            onOrOff = '';
        }

        onOrOff = onOrOff.toLowerCase();

        switch (onOrOff) {
        case 'on':
            $(msgs).removeClass('timestamps-off');
            break;
        case 'off':
            $(msgs).addClass('timestamps-off');
            break;
        default:
            userError('Use "on" or "off"');
            return;
        }
        userSettings.timestamps = onOrOff;
        $.Storage.set(userSettings);
    }

    commands.help = {
        usage: "/help .............. list all available commands",
        func: help
    };

    commands.timestamps = {
        usage: "/timestamps on|off . toggle timestamp visibility",
        func: timestamps
    };

    commands.listusers = {
        usage: "/listusers ......... display a list of all users in this room",
        func: listusers
    };

    commands.whoami = {
        usage: '/whoami ............ display your username as it appears to everyone else',
        func: whoami
    };

    commands.stats = {
        usage: '/stats ............. display some basic global statistics',
        func: function () {
            mocket.send('uchat-stats');
        }
    };

    commands.alert = {
        usage: '/alert me|all|none.. specify when you would like to recieve alerts if the window is not focused',
        func: function (str) {
            if (typeof str !== 'string') {
                str = '';
            }
            str = str.toLowerCase();
            switch (str) {
            case 'me':
            case 'all':
            case 'none':
                userMsg('Alert mode: ' + str);
                userSettings.alert = str;
                $.Storage.set(userSettings);
                break;
            default:
                userError('Use "me", "all", or "none"');
            }
        }
    };

    commands.me = {
        usage: '/me msg ............ say something in the first person, like some kind of weirdo',
        func: function (msg_str) {
            mocket.send('uchat-msg', '/me ' + msg_str);
        }
    };
    
    mocket.on('uchat-stats', function (stats) {
        userMsg(stats.clientCount + ' users using ' + stats.roomCount + ' rooms.');
    });

    function tryToDoCommand(msg) {
        var cmd = msg.substring(1),
            cmdName = cmd.split(' ')[0].toLowerCase(),
            args;
        if (typeof commands[$.trim(cmdName)] === 'object' && 
            typeof commands[$.trim(cmdName)].func === 'function') {
            args = _.without(_.rest(cmd.split(' ')), '').map(function (n) {
                return n;
            });
            commands[$.trim(cmdName)].func.apply(null, args);
        } else { 
            userError('Unknown command: ' + cmd);
        }
    }

    // COMMANDS
    /////////////////////////////////////////////////////////////////////
    
    $(msg_text).keydown(function (e) {
        if (e.keyCode != 13) {
            var oldPos = msgHistoryPos,
                upOrDownWasPressed = true;
            switch (e.keyCode) {
            case 38: // UP
                msgHistoryPos = msgHistoryPos <= 0 ? 0 : msgHistoryPos - 1;
                break;
            case 40: // DOWN
                msgHistoryPos = msgHistoryPos >= msgHistory.length - 1 ? msgHistory.length - 1 : msgHistoryPos + 1;
                break;
            default:
                upOrDownWasPressed = false;
            }

            setTimeout(function () {
                msgHistory[msgHistoryPos] = $(msg_text).val();
            }, 0);

            if (oldPos != msgHistoryPos) {
                $(msg_text).val(msgHistory[msgHistoryPos]);
            }

            return !upOrDownWasPressed;
        }
    });

    $(name_text).keypress(function (e) {
        if (e.which == 32 ||// Ignore spaces
            e.which == 64)  // Ignore '@' 
        {
            return false;
        }
    });

    // UI BEHAVIOR
    /////////////////////////////////////////


    $(join_form).submit(function () {
        myName = $(name_text).val();

        tryJoin();

        return false;
    });

    $(msg_form).submit(function () {
        if ($(msg_text).val().length === 0) {
            return false;
        } else if ($(msg_text).val()[0] === '/') {
            tryToDoCommand($(msg_text).val());
        } else {
            mocket.send('uchat-msg', $(msg_text).val());
        }
        msgHistory[msgHistory.length - 1] = $(msg_text).val();
        msgHistoryPos = msgHistory.push('') - 1;
        $(msg_text).val('');
        return false;
    });

    mocket.on('uchat-logBegin', function () {
        whoIsHere = [];
        $(msgs).hide();
        $(msgs).html('');
        userMsg('Welcome to #' + roomName + '.');
        document.location.hash = '#' + roomName;
    });

    mocket.on('uchat-logEnd', function () {
        $(msgs).show();
        $(msgs)[0].scrollTop = $(msgs)[0].scrollHeight;
    });

    mocket.on('uchat-msg', function (msg, name, time) {
        var jtpl, output, atYou = directedAtYou(msg), meMsg = isMeMsg(msg);
        jtpl = jQuery.createTemplate($(meMsg ? '#me-msg-jtpl' : '#msg-jtpl').val());
        msgAlt = !msgAlt;
        output = jQuery.processTemplateToText(jtpl, {
            name: name,
            msg: msg,
            time: time,
            directedAtYou: atYou,
            alt: msgAlt
        });
        
        if (blurred && (userSettings.alert === 'all' || 
            (userSettings.alert === 'me'  && atYou))) {
            unreadCount += 1;
            if (unreadCount == 1) {
                (function () {

                    var a, b;
                    a = function () {
                        if (blurred) {
                            document.title = '--#' + roomName + ' (' + unreadCount + ')--';
                            setTimeout(b, 500);
                        } else {
                            document.title = '#' + roomName;
                        }
                    };

                    b = function () {
                        if (blurred) {
                            document.title = '__#' + roomName + ' (' + unreadCount + ')__';
                            setTimeout(a, 500);
                        } else {
                            document.title = '#' + roomName;
                        }
                    };
                    a();
                }());
            }
        }

        output = replaceURLWithHTMLLinks(output);
        output = insertClickableRoomLinks(output);
        output = insertClickableNames(output);

        $(msgs).append(replaceURLWithHTMLLinks(output));
        
        $(msgs)[0].scrollTop = $(msgs)[0].scrollHeight;
        $(msg_text).focus();
    });

    mocket.on('uchat-joined', function (name, time) {
        var jtpl, output;
        jtpl = jQuery.createTemplate($('#joined-jtpl').val());
        output = jQuery.processTemplateToText(jtpl, {name: name, time: time});
        $(msgs).append(output);
        
        $(msgs)[0].scrollTop = $(msgs)[0].scrollHeight;

        whoIsHere.push(name);
    });

    mocket.on('uchat-left', function (name, time) {
        var jtpl, output;
        jtpl = jQuery.createTemplate($('#left-jtpl').val());
        output = jQuery.processTemplateToText(jtpl, {name: name, time: time});
        $(msgs).append(output);
        
        $(msgs)[0].scrollTop = $(msgs)[0].scrollHeight;

        whoIsHere = _.without(whoIsHere, name);
    });
    
    return this;
};


