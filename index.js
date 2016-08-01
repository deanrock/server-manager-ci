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
    var file = '.gitlab-ci.yml'

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

    mkdirSync('./temp')
    var execSync = require('child_process').execSync;
    var cmd = 'git archive --remote='+git_url+' HEAD .gitlab-ci.yml | tar -x >> ' + unique_name;
    execSync(cmd);

    try {
        var job = yaml.safeLoad(fs.readFileSync('./' + file, 'utf8'));
        console.log(job);
        console.log('loaded ' + file + ' job');
        fs.unlinkSync(unique_name)
    } catch (e) {
        console.log('cannot load ' + file + 'job file' + e);
    }

    log('running job for ' + git_name);

        try {


            if ('refs/heads/' + job.gitlab.branch == event.payload.ref) {
                log('found matching branch ' + job.gitlab.branch);

                    if (yaml_token == job.gitlab.token) {
                        log('gitlab token matches');

                        var manager = new serverManager();
                        manager.login(config.url, config.username, config.password, config.ssh_host, config.ssh_port, log, function() {
                            manager.setAccount(job.server_manager.account, function() {
                                async.eachSeries(job.steps, function(step, next) {
                                    switch(step.action) {
                                        case 'ssh':
                                            log('SSHing to environment ' + step.environment + '...');
                                            manager.executeSSH(step.environment, step.command, function() {
                                                next();
                                            });
                                            break;

                                        case 'redeploy-app':
                                            log('redeploying app ' + step.name + '...');
                                            manager.redeployApp(step.name, function() {
                                                next();
                                            });
                                            break;

                                        default:
                                            log('unknown action!!!');
                                            next();
                                    }
                                }, function done() {
                                    log('finished!');

                                    var logName = randomstring.generate();

                                    fs.writeFile('./logs/' + logName + '.json', JSON.stringify(messages, null, 4), function(err) {
                                        if(err) {
                                            console.log(err);
                                        } else {
                                            request.post({
                                                url: config.slack_webhook,
                                                json: {
                                                    text: 'Deployment by *' + event.payload.user_name + '* for job *' + git_name + '* for branch *' + job.gitlab.branch + '* finished. <' + config.myurl + 'logs?' + logName + '|view log>',
                                                    username: 'CI',
                                                    channel: job.slack.channel,
                                                    icon_emoji: '',
                                                }
                                            });
                                        }
                                    });
                                });
                            });
                        });
                    }

            }

            log('---------------');
        }catch(e) {
            log('couldn\'t parse or execute job file ' + job.fileName + ':');
            log(e);
        }

});

var mkdirSync = function (path) {
  try {
    fs.mkdirSync(path);
  } catch(e) {
    if ( e.code != 'EEXIST' ) throw e;
  }
}
