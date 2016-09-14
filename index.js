var http = require('http');
var yaml = require('js-yaml');
var request = require('request');
var fs = require('fs');
var path = require('path');
var randomstring = require("randomstring");
var url = require('url');
var async = require('async');
var createHandler = require('./gitlab-webhook-handler');
var serverManager = require('./server-manager');
var config = require('./config');
var handler = createHandler({ path: '/webhook' });
var tmp = require('tmp');
var sshStep = require('./steps/ssh');
var handlev2 = require('./v2-handler').handlev2;
var handlev1 = require('./v2-handler').handlev1;

http.createServer(function (req, res) {
  handler(req, res, function (err) {
    if (req.url.split('?').shift() !== '/logs') {
        res.statusCode = 404
        res.end('no such location')
    }else{
        var name = req.url.split('?')[1];
        name = name.replace(/[^a-z0-9]/gi,'');

        fs.readFile('./logs/' + name + '.json', 'utf8', function (err,data) {
        if (err) {
            console.log(err);
            res.end('error');
        }
            res.statusCode = '200';
            res.end(data);
        });
    }
  })
}).listen(7777);

console.log("Gitlab Hook Server running at http://0.0.0.0:7777/webhook");

handler.on('error', function (err) {
    console.error('Error:', err.message)
})

handler.on('push', function (event) {
    var git_url = event.payload.project.git_ssh_url
    var git_name = event.payload.project.name
    var unique_name = 'temp/' + git_name + '-' + yaml_token
    var yaml_token = event.token
    var messages = [];
    var file = '.sm-ci.yml';

    function log(m) {
        if (typeof m === 'object' && m.type == 'raw-shell') {
            messages.push(m);
        }else{
            m = {
                type: 'text',
                message: m,
            };

            messages.push(m);
        }
        console.log(m);
    }

    log('Received a push event for %s to %s',
    event.payload.repository.name,
    event.payload.ref);

    tmp.dir({ unsafeCleanup: true }, function _tempDirCreated(err, directory, cleanupCallback) {
        if (err) throw err;

        var filePath = path.join(directory, file);
        var execSync = require('child_process').execSync;
        var cmd = 'git archive --remote=' + git_url + ' ' + event.payload.ref + ' ' + file + ' | tar -x -C ' + directory;
        execSync(cmd);

        try {
            var job = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));
            console.log(job);
            console.log('loaded ' + file + ' job');
        } catch (e) {
            console.log('cannot load ' + file + 'job file' + e);
        }

        //cleanupCallback();


        log('running job for ' + git_name);

        if (job.version == '2') {
            log ('Found YAML version 2')
            handlev2(event, job, messages);
            return
        } else {
            log ('Found YAML version 1')
            handlev1(event, job, messages);
            return
        }
    });
});

var mkdirSync = function (path) {
  try {
    fs.mkdirSync(path);
  } catch(e) {
    if ( e.code != 'EEXIST' ) throw e;
  }
}
