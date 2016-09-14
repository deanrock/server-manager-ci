var Client = require('ssh2').Client;
var StringDecoder = require('string_decoder').StringDecoder;

function execute({step, config, log, messages}, callback) {
    log('SSHing to server ' + step.server.host + ' as ' + step.server.username + '...', messages);

    var conn = new Client();
    conn.on('ready', function () {
        conn.exec(step.command, function (err, stream) {
            if (err) {
                log('err: ' + err, messages);
                callback(false);
            } else {
                var decoder = new StringDecoder('utf8');

                stream.on('close', function (code, signal) {
                    log('Stream :: close :: code: ' + code + ', signal: ' + signal, messages);
                    conn.end();

                    callback(code == 0);
                }).on('data', function (data) {
                    var textChunk = decoder.write(data);

                    log({
                        type: 'raw-shell',
                        message: textChunk,
                        stream: 'stdout'
                    }, messages);
                }).stderr.on('data', function (data) {
                        var textChunk = decoder.write(data);

                        log({
                            type: 'raw-shell',
                            message: textChunk,
                            stream: 'stderr'
                        }, messages);
                    });
            }
        });
    }).connect({
        host: step.server.host,
        port: step.server.port,
        username: step.server.username,
        privateKey: require('fs').readFileSync(config.private_key_path),
        passphrase: config.private_key_passphrase
    });
}

exports.execute = execute;
