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

        try {


            if ('refs/heads/' + job.gitlab.branch == event.payload.ref) {
                log('found matching branch ' + job.gitlab.branch);

                if (yaml_token == job.gitlab.token) {
                    log('gitlab token matches');

                    var jobFailed = false;

                    function finish() {
                        log('finished!');

                        log('failed? ' + jobFailed);

                        var logName = randomstring.generate();

                        fs.writeFile('./logs/' + logName + '.json', JSON.stringify(messages, null, 4), function (err) {
                            if (err) {
                                console.log(err);
                            } else {
                                var status = (jobFailed) ? 'FAILED' : 'succeeded';
                                var text = 'CI job by *' + event.payload.user_name + '* for repo *' + git_name + '* for branch *' + job.gitlab.branch + '* ' + status + '. <' + config.myurl + 'logs?' + logName + '|view log>';

                                request.post({
                                    url: config.slack_webhook,
                                    json: {
                                        username: 'CI',
                                        channel: job.slack.channel,
                                        icon_emoji: '',
                                        "attachments": [
                                            {
                                                mrkdwn_in: ["text"],
                                                "fallback": text,
                                                "color": jobFailed ? 'danger' : 'good',
                                                "text": text
                                            }
                                        ]

                                    }
                                });
                            }
                        });
                    }

                    if (job.server_manager) {
                        var manager = new serverManager();
                        manager.login(config, log, function () {
                            manager.setAccount(job.server_manager.account, function () {
                                async.eachSeries(job.steps, function (step, next) {
                                    // skip steps if job has failed
                                    if (jobFailed) {
                                        next();
                                        return;
                                    }

                                    switch (step.action) {
                                        case 'ssh':
                                            log('SSHing to environment ' + step.environment + '...');
                                            manager.executeSSH(step.environment, step.command, function (success) {
                                                if (!success) {
                                                    jobFailed = true;
                                                }

                                                next();
                                            });
                                            break;

                                        case 'redeploy-app':
                                            log('redeploying app ' + step.name + '...');
                                            manager.redeployApp(step.name, function (success) {
                                                if (!success) {
                                                    jobFailed = true;
                                                }

                                                next();
                                            });
                                            break;

                                        default:
                                            log('unknown action!!!');
                                            jobFailed = true;

                                            next();
                                    }
                                }, function done() {
                                    finish();
                                });
                            });
                        });
                    }else{
                        async.eachSeries(job.steps, function (step, next) {
                            // skip steps if job has failed
                            if (jobFailed) {
                                next();
                                return;
                            }

                            switch (step.action) {
                                case 'ssh':
                                    sshStep.execute({
                                        step: step,
                                        log: log,
                                        config: config
                                    }, function (success) {
                                        if (!success) {
                                            jobFailed = true;
                                        }

                                        next();
                                    });
                                    break;

                                default:
                                    log('unknown action!!!');
                                    jobFailed = true;

                                    next();
                            }
                        }, function done() {
                            finish();
                        });
                    }
                }

            }

            log('---------------');
        } catch (e) {
            log('couldn\'t parse or execute job file');
            log(e);
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
