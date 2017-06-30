const crypto = require('crypto');
const fs = require('fs');
const readline = require('readline');
const exec = require('child_process').exec;

const sha256 = require('crypto-js/sha256');
const sha1 = require('crypto-js/sha1');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();

const program = require('commander');
program
	.version('0.1.0')
	.option('-p, --port <n>', 'the port on which the server will listen for connections.', parseInt)
	.option('-b, --branch [branch]', 'the branch on which to listen for changes. use * for all branches')
	.parse(process.argv);

const port = program.port || 3555;
const branch = typeof program.branch === 'string' ? program.branch : '*' || '*';

const command = './build.sh';

const pathToSecret = './secret';
var secret = '';

app.use(bodyParser.json());
app.post('/payload', function (req, res) {
	var hash = crypto.createHmac('sha1', secret).update(JSON.stringify(req.body)).digest('hex');
	if(!crypto.timingSafeEqual(Buffer.from(req.get('X-Hub-Signature'), 'utf8'), Buffer.from('sha1=' + hash), 'utf8')) {
		res.status(401).end();
		return;
	}
	res.status(200).end();
	if(branch === '*' || req.body.ref === 'refs/heads/' + branch) {
		exec(command, (err, stdout, stderr) => {
			console.log(stdout);
			console.log(stderr);
		});
	}
});

function initialize() {
	return new Promise((resolve, reject) => {
		var initializeSecret = new Promise((resolve, reject) => {
			fs.open(pathToSecret, 'r', (err, fd) => {
				if (err) {
					console.log('No secret file is detected.');
					generateSecret().then((secret) => {
						resolve(secret);
					}).catch((err) => {
						reject(err);
					});
				}
				else {
					fs.readFile(fd, (err, secret) => {
						if (err) {
							console.log('Error reading open secret file at ' + pathToSecret);
							reject(err);
						}
						resolve(secret);
					});
				}
			});
		});

		var initializeServer = new Promise((resolve, reject) => {

			app.listen(port, function () {
				console.log('App listening on port ' + port + '!');
				resolve();
			});
		});

		initializeSecret.then((retrievedSecret) => {
			secret = retrievedSecret;
		}).then(initializeServer).then(() => {
			resolve();
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
});
