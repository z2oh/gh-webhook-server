const crypto = require('crypto');
const fs = require('fs');
const readline = require('readline');
const exec = require('child_process').exec;

const sha256 = require('crypto-js/sha256');
const sha1 = require('crypto-js/sha1');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();
app.use(bodyParser.json());

const program = require('commander');

program
	.version('0.1.0')
	.option('--config [path]', 'path to configuration file')
	.option('-p, --port <n>', 'the port on which the server will listen for connections.', parseInt)
	.option('-b, --branch [branch]', 'the branch on which to listen for changes. use * for all branches')
	.option('-c, --command [command]', 'a shell command to run. surround with quotes')
	.option('-s, --secret [path]', 'path to the secret file')
	.option('--endpoint [endpoint]', 'the endpoint on which the server will listen for POSTs')
	.parse(process.argv);

var config;

function createEndpoint(endpoint, endpointConfig) {
	if (endpoint[0] !== '/') {
		endpoint = '/' + endpoint;
	}
	var endpointSecret;
	var secretFound = new Promise((resolve, reject) => {
		if (endpointConfig && endpointConfig.secret) {
			if (endpointConfig.secret.value) {
				resolve(endpointConfig.secret.value);
			}
			else if (endpointConfig.secret.path) {
				fs.readFile(endpointConfig.secret.path, (err, data) => {
					if (err) {
						reject(err);
					}
					else {
						resolve(data);
					}
				});
			}
		}
		else {
			generateSecret.then((result) => {
				resolve(data);
			}).catch((err) => {
				reject(err);
			});
		}
	});

	secretFound.then((secret) => {
		app.post(endpoint, (req, res) => {
			var hash = crypto.createHmac('sha1', secret).update(JSON.stringify(req.body)).digest('hex');
			if (!crypto.timingSafeEqual(Buffer.from(req.get('X-Hub-Signature'), 'utf8'), Buffer.from('sha1=' + hash), 'utf8')) {
				res.status(401).end();
				return;
			}
			res.status(200).end();
			var branch = req.body.ref.replace('refs/heads/', '');
			if (endpointConfig.branches[branch]) {
				var commands = endpointConfig.branches[branch];
				for (var command of commands) {
					exec(command, writeToLogs);
				}
			}
			if (endpointConfig.branches['*'] && (!endpointConfig.branches[branch] || config.alwaysDoWildcardAction)) {
				var wildcardCommands = endpointConfig.branches['*'];
				for (var wildcardCommand of wildcardCommands) {
					exec(wildcardCommand, writeToLogs);
				}
			}
		});
	}).catch((err) => {
		console.log("Unable to create endpoint for " + endpoint + ". Continuing...");
	});
}

// TODO: Write this function instead of logging to stderr/stdout.
function writeToLogs(err, stdout, stderr, logFile = './log') {
	console.log(stdout);
	console.log(stderr);
}

function initialize() {
	return new Promise((resolve, reject) => {
		var loadConfig = new Promise((resolve, reject) => {
			// If the user specified a config file, we load it in here.
			if (program.config) {
				fs.readFile(program.config, 'utf8', (err, data) => {
					if (err) {
						reject(err);
					}
					else {
						resolve(JSON.parse(data));
					}
				});
			}
			else if (program.endpoint && program.branch && program.command) {
				var config = {
					port: program.port || 3555,
					endpoints: {},
				};
				config.endpoints[program.endpoint] = {
					secret: false,
					branches: {},
				};
				config.endpoints[program.endpoint].branches[program.branch] = [program.command];
				resolve(config);
			}
			else {
				reject('You must specify either a config file OR a branch, command, and endpoint.');
			}
		});

		loadConfig.then((config) => {
			for (var ep in config.endpoints) {
				var endpointConfig = config.endpoints[ep];
				createEndpoint(ep, endpointConfig);
			}
			app.listen(config.port, function () {
				console.log('App listening on port ' + config.port + '!');
				resolve(config);
			});
		}).catch((err) => {
			reject(err);
		});
	});
}

function generateSecret() {
	return new Promise((resolve, reject) => {
		fs.open(pathToSecret, 'w', (err, fd) => {
			if (err) {
				console.error('Could not open secret file for writing.');
				reject(err);
			}
			var rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			});
			rl.question('Enter a password to generate a secret key:', (password) => {
				var secret;
				if (password === '') {
					secret = '';
				}
				else {
					secret = sha256(password);
				}
				console.log('Your secret key is ' + secret);
				fs.write(fd, sha256(password), (err) => {
					if (err) {
						console.error('Writing to open file ' + pathToSecret + ' failed. Delete ' + pathToSecret + ' and try again.');
						reject(err);
					}
					resolve(secret);
				});
				rl.close();
			});
		});
	});
}

initialize().then(() => {
	console.log('Initialization complete!');
}).catch((err) => {
	console.error(err);
});
