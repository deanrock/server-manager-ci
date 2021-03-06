var request = require('request');
var cookie = require('cookie');
var StringDecoder = require('string_decoder').StringDecoder;
var manager_data = {}

function ServerManager(name, config) { 
	manager_data = config.server_managers[name]
	console.log(manager_data)
}
ServerManager.prototype.host = null;
ServerManager.prototype._sshPassword = null;
ServerManager.prototype.login = function(config, log, messages, callback) {
	this.host = manager_data.url;
	this.ssh_host = manager_data.ssh_host;
	this.ssh_port = manager_data.ssh_port;
	this.private_key_path = config.private_key_path;
	this.private_key_passphrase = config.private_key_passphrase;
	this.log = log;
	this.messages = messages;
	this.jar = request.jar();
	var that = this;

	request.post({
		url: that.host + 'api/v1/auth/login',
		body: {
			username: manager_data.username,
			password: manager_data.password,
		},
		json: true,
		jar: that.jar,
	}, function(err, response, body) {
		request.get({
			url: that.host + 'api/v1/profile',
			jar: that.jar,
		}, function(err, response, body) {
			that.log('login data: ' + body, that.messages);
			callback();
		})
	});
};

ServerManager.prototype.setAccount = function(account, callback) {
	this.account = account;

	callback();
};

ServerManager.prototype.executeSSH = function(environment, command, callback) {
	var that = this;

	var Client = require('ssh2').Client;
	var conn = new Client();
	conn.on('ready', function() {
		conn.exec(command, function(err, stream) {
			if (err) {
				that.log('err: ' + err, that.messages);
				callback(false);
			}else{
				var decoder = new StringDecoder('utf8');

				stream.on('close', function(code, signal) {
					that.log('Stream :: close :: code: ' + code + ', signal: ' + signal, that.messages);
					conn.end();

					callback(code == 0);
				}).on('data', function(data) {
					var textChunk = decoder.write(data);

					that.log({
						type: 'raw-shell',
						message: textChunk,
						stream: 'stdout'
					}, that.messages);
				}).stderr.on('data', function(data) {
						var textChunk = decoder.write(data);

						that.log({
							type: 'raw-shell',
							message: textChunk,
							stream: 'stderr'
						}, that.messages);
				});
			}
		});
	}).connect({
		host: that.ssh_host,
		port: that.ssh_port,
		username: that.account + '+' + environment,
		privateKey: require('fs').readFileSync(that.private_key_path),
		passphrase: that.private_key_passphrase
	});
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
				callback(true);
			});
		}else{
			console.log('couldn\'t find app with the name ' + name);
			callback(false);
		}
	});
}

module.exports = ServerManager;
