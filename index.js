var http = require('http');
var yaml = require('js-yaml');
var request = require('request');
var fs = require('fs');
var randomstring = require("randomstring");
var url = require('url');
var async = require('async');
var createHandler = require('gitlab-webhook-handler');
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
    var messages = [];
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

    var jobs = getJobs();
    jobs.forEach(function(job) {
        try {
            if (job.gitlab.repo == event.payload.repository.name) {
                log('found matching job ' + job.fileName + ' based on repo name');

                if ('refs/heads/' + job.gitlab.branch == event.payload.ref) {
                    log('found matching branch ' + job.gitlab.branch);

                    var queryData = url.parse(event.url, true).query;
                    if(queryData['token'] !== undefined) {
                        if (queryData['token'] == job.gitlab.token) {
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
                                                        text: 'Deployment by *' + event.payload.user_name + '* for job *' + job.fileName + '* for branch *' + job.gitlab.branch + '* finished. <' + config.myurl + 'logs?' + logName + '|view log>',
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
                }
            }

            log('---------------');
        }catch(e) {
            log('couldn\'t parse or execute job file ' + job.fileName + ':');
            log(e);
        }
    });
});


var getFilesFromDirectory = function(path) {
    var results = [];

    fs.readdirSync(path).forEach(function(file) {
        var stat = fs.statSync(path + '/' + file);

        if (stat && !stat.isDirectory()) {
            results.push(file);
       }
    });

    return results;
};

var getJobs = function() {
    var jobs = [];

    var files = getFilesFromDirectory('./jobs');

    files.forEach(function(file) {
        try {
            var doc = yaml.safeLoad(fs.readFileSync('./jobs/' + file, 'utf8'));
            console.log('loaded ' + file + ' job');

            doc.fileName = file;

            jobs.push(doc);
        } catch (e) {
            console.log('cannot load ' + file + 'job file' + e);
        }

        console.log('---------------');
    });

    return jobs;
}
