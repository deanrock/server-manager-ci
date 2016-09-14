var async = require('async');
var randomstring = require("randomstring");
var fs = require('fs');
var path = require('path');
var url = require('url');
var sshStep = require('./steps/ssh');
var config = require('./config');
var request = require('request');
var serverManager = require('./server-manager');


function handlev1 (event, job, messages) {
	var branch = event.payload.ref.replace('refs/heads/', '')
	var yaml_token = event.token
	if (event.token != job.gitlab.token) {
		return
	}

	execute(event, job, messages, branch)
}

function handlev2 (event, job, messages) {
	/*
		check if branch definition exists in yaml file
		check if gitlab token matches
	*/

	var branch = event.payload.ref.replace('refs/heads/', '')
	var yaml_token = event.token

	if (typeof(job[branch]) == undefined) {
		return
	}

	var data = job[branch]
	if (event.token != data.gitlab.token) {
		return
	}

	execute(event, data, messages, branch)
}

function execute(event, job, messages, branch) {
	console.log("executing job")

	var jobFailed = false;

    if (job.server_manager) {
        var manager = new serverManager();
        manager.login(config, console.log, function () {
            manager.setAccount(job.server_manager.account, function () {
                async.eachSeries(job.steps, function (step, next) {
                    // skip steps if job has failed
                    if (jobFailed) {
                        next();
                        return;
                    }

                    switch (step.action) {
                        case 'ssh':
                            console.log('SSHing to environment ' + step.environment + '...');
                            manager.executeSSH(step.environment, step.command, function (success) {
                                if (!success) {
                                    jobFailed = true;
                                }

                                next();
                            });
                            break;

                        case 'redeploy-app':
                            console.log('redeploying app ' + step.name + '...');
                            manager.redeployApp(step.name, function (success) {
                                if (!success) {
                                    jobFailed = true;
                                }

                                next();
                            });
                            break;

                        default:
                            console.log('unknown action!!!');
                            jobFailed = true;

                            next();
                    }
                }, function done() {
                    finish(jobFailed, event, job, messages, branch);
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
                    console.log('unknown action!!!');
                    jobFailed = true;

                    next();
            }
        }, function done() {
            finish(jobFailed, event, job, messages, branch);
        });
    }
}

function finish(jobFailed, event, job, messages, branch) {
    console.log('finished!');
    console.log('failed? ' + jobFailed);
    console.log(job)
    var logName = randomstring.generate();

    fs.writeFile('./logs/' + logName + '.json', JSON.stringify(messages, null, 4), function (err) {
        if (err) {
            console.log(err);
        } else {
            var status = (jobFailed) ? 'FAILED' : 'succeeded';
            var text = 'CI job by *' + event.payload.user_name + '* for repo *' + event.payload.project.name + '* for branch *' + branch + '* ' + status + '. <' + config.myurl + 'logs?' + logName + '|view log>';

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

module.exports = {
    handlev2: handlev2,
    handlev1: handlev1
}