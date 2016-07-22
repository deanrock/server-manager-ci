var request = require('request');
var cookie = require('cookie');
var randomstring = require("randomstring");
var WebSocket = require('ws');

function ServerManager() { }
ServerManager.prototype.host = null;
ServerManager.prototype._sshPassword = null;
ServerManager.prototype.login = function(host, username, password, ssh_host, ssh_port, log, callback) {
	this.host = host;
	this.ssh_host = ssh_host;
	this.ssh_port = ssh_port;
	this.log = log;
	this.jar = request.jar();
	var that = this;

	request.get({url: host + 'accounts/login/?next=/', jar: this.jar}, function optionalCallback(err, httpResponse, body) {
		var csrf_token = cookie.parse(httpResponse.headers['set-cookie'][0])['csrftoken'];

		request.post({
			url: host + 'accounts/login/?next=/',
			form: {
				username: username,
				password: password,
				csrfmiddlewaretoken: csrf_token,
			},
			jar: that.jar,
		}, function(err, response, body) {
			request.get({
				url: host + 'api/v1/profile',
				jar: that.jar,
			}, function(err, response, body) {
				that.log('login data: ' + body);
				callback();
			})
		});
	});
};

ServerManager.prototype._createSSHPassword = function(callback) {
	var that = this;
	this._sshPassword = randomstring.generate();

	request.post({
		url: that.host + 'api/v1/accounts/' + that.account + '/ssh-passwords',
		jar: that.jar,
		json: {
			description: 'server-manager node.js api',
			password: that._sshPassword,
		}
	}, function(err, response, body) {
		callback(that._sshPassword);
	});
};

ServerManager.prototype._getSSHPassword = function(	callback) {
	if (this._sshPassword !== null) {
		callback(this._sshPassword);
	}else{
		this._createSSHPassword(callback);
	}
};

ServerManager.prototype.setAccount = function(account, callback) {
	this.account = account;

	callback();
};

ServerManager.prototype.executeSSH = function(environment, command, callback) {
	var that = this;

	var ws = new WebSocket(that.host.replace('http', 'ws') + 'api/v1/accounts/' + that.account + '/shell?env=' + environment +'-base-shell', {
		headers: {
			'Cookie': that.jar.getCookieString(that.host),
		}
	});

	var end_delimiter = 'END_' + randomstring.generate();

	ws.on('open', function open() {
		ws.send(command + '\n ' + end_delimiter);
	});

	var callback_called = false;

	var re = new RegExp(end_delimiter,"g");
	var msg = "";

	function finish() {
		console.log("===========");
		if (!callback_called) {
			console.log("===========");

			that.log({
				type: 'raw-shell',
				message: msg,
			});

			callback_called = true;
			callback();
		}
	}

	ws.on('message', function(data, flags) {
		msg += data;

		var count = (msg.match(re) || []).length;
		if (count >= 2) {
			ws.close(1000);
			finish();
		}
	});

	ws.on('close', function() {
		finish();
	});

	/*this._getSSHPassword(function(password) {
		var Client = require('ssh2').Client;

		var conn = new Client();
		conn.on('ready', function() {
			console.log('Client :: ready');
			conn.exec('ls', function(err, stream) {
				if (err) {
					console.log('err: ' + err);
					callback();
				}else{
					stream.on('close', function(code, signal) {
						console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
						conn.end();
						//callback();
					}).on('data', function(data) {
						console.log('STDOUT: ' + data);
					}).stderr.on('data', function(data) {
						console.log('STDERR: ' + data);
					});
				}
			});
		}).connect({
			host: that.ssh_host,
			port: that.ssh_port,
			username: that.account + '+' + environment,
			password: password,
		});
	});*/
};

ServerManager.prototype.redeployApp = function(name, callback) {
	var that = this;

	request.get({
		url: that.host + 'api/v1/accounts/' + this.account + '/apps',
		jar: that.jar
	}, function(err, response, body) {
		var app_id = null;

		var b = JSON.parse(body);
		b.forEach(function(app) {
			if(app.name == name) {
				console.log('app with name ' + name + ' has ID: ' + app.id);
				app_id = app.id;
			}
		});

		if (app_id !== null) {
			request.post({
				url: that.host + 'api/v1/accounts/' + that.account + '/apps/' + app_id + '/redeploy',
				jar: that.jar,
			}, function(err, response, body) {
				console.log('app redeploy response:');
				console.log(body);
				callback();
			});
		}else{
			console.log('couldn\'t find app with the name ' + name);
			callback();
		}
	});
}

module.exports = ServerManager;
