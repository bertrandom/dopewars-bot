var config = require('config');
var Dopewars = require('./lib/dopewars');
var GameManager = require('./lib/gameManager');
var WebClient = require('@slack/client').WebClient;
var MemoryDataStore = require('@slack/client').MemoryDataStore;

var _ = require('lodash');

var express = require('express');
var bodyParser = require('body-parser');
var exphbs  = require('express-handlebars');

var OAuth = require('oauth');

var crypto = require('crypto');

var redis = require("redis");
var rc = redis.createClient();

var OAuth2 = OAuth.OAuth2;    
var oauth2 = new OAuth2(config.slack.client_id,
	config.slack.client_secret,
	'https://slack.com/', 
	'/oauth/authorize',
	'/api/oauth.access', 
	null);

var gm = new GameManager();

var webClients = {};

var app = express();

app.engine('hb', exphbs({
	defaultLayout: 'main',
	extname: 'hb'
}));

app.set('view engine', 'hb');

app.enable('view cache');

app.use(express.static('static'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var getWebClient = function(team_id, cb) {

	if (webClients[team_id]) {
		return cb(null, webClients[team_id]);
	}

	rc.get('dopewars:' + team_id, function(err, bot_access_token) {

		if (err) {
			return cb(err);
		}

		if (bot_access_token) {

			var webClient = new WebClient(bot_access_token, {
				logLevel: 'error',
				dataStore: new MemoryDataStore()
			});

			webClients[team_id] = webClient;

			return cb(null, webClient);

		}

	});

}

app.get('/', function (req, res) {
	res.render('home', {home: true});
});

app.get('/complete', function (req, res) {
	res.render('complete', {complete: true});
});

app.get('/failed', function (req, res) {
	res.render('failed');
});

app.get('/screenshots', function (req, res) {
	res.render('screenshots', {
		screenshots: true,
		hideHands: true
	});
});

app.get('/privacy', function (req, res) {
	res.render('privacy', {
		privacy: true,
		hideHands: true
	});
});

app.get('/support', function (req, res) {
	res.render('support', {
		support: true,
		hideHands: true
	});
});

app.post('/button', function (req, res) {

	var payload = JSON.parse(req.body.payload);

	if (payload.token != config.slack.verification_token) {
		return res.status(401).send('Unauthorized');
	}

	getWebClient(payload.team.id, function (err, webClient) {

		if (err) {
			return res.status(500).send('Team not recognized.');
		}

		var user = {
			team_id: payload.team.id,
			id: payload.user.id,
			name: payload.user.name
		};

		var dm = {
			id: payload.channel.id
		};

		var game;

		if (payload.actions[0].value == 'start_game') {

			if (gm.exists(dm)) {
				return res.status(200);
			}

			game = gm.get(user, dm, webClient);

			var message = {
				response_type: 'in_channel',
				delete_original: true
			};

			return res.status(200).json(message);

		} else if (payload.actions[0].value == 'about') {

			if (gm.exists(dm)) {
				return res.status(200);
			}

			var message = {
				response_type: 'in_channel',
				replace_original: false,
				delete_original: false,
				text: 'dopewars bot is created by <https://twitter.com/bertrandom|@bertrandom> which is a wrapper around <http://dopewars.sourceforge.net/|dopewars> by Ben Webb which is a rewrite of a game called "Drug Wars" by John E. Dell.\n\nhttps://dopewarsbot.com'
			};

			return res.status(200).json(message);

		}

		if (!gm.exists(dm)) {

			var message = {
				response_type: 'in_channel',
				replace_original: false,
				delete_original: false,
				text: 'Game is currently not running.'
			};

			return res.status(200).json(message);

		}

		game = gm.get(user, dm, webClient);

		game.handleButtonClicked(payload, function(message) {

			message = _.defaults({
				response_type: 'in_channel',
				replace_original: false
			}, message);

			res.status(200).json(message);

		});

	});

});

app.post('/event', function (req, res) {

	var payload = req.body;

	if (payload.token != config.slack.verification_token) {
		return res.status(401).send('Unauthorized');
	}

	if (payload) {

		if (payload.type == 'url_verification') {
			return res.status(200).send(payload.challenge);
		} else if (payload.type == 'event_callback') {

			return getWebClient(payload.team_id, function (err, webClient) {

				if (err) {
					return res.status(500).send('Team not recognized.');
				}

				var event = payload.event;

				if (event.type == 'message') {

					var message = event;

					if (message.subtype && message.subtype == 'bot_message') {
						return res.status(200).send('OK');
					}

					if (message.subtype && message.subtype == 'message_changed') {
						return res.status(200).send('OK');
					}

					if (message.subtype && message.subtype == 'message_deleted') {
						return res.status(200).send('OK');
					}

					// If this is a DM
					if (message.channel.startsWith('D')) {

						var user = {
							team_id: payload.team_id,
							id: message.user,
							name: message.user
						}

						var dm = {
							id: message.channel
						};

						var game;

						if (gm.exists(dm)) {

							game = gm.get(user, dm, webClient);
							game.handleSlackMessage(message);

						} else {

							var attachments = [];

							var actions = [];

							actions.push({
								type: 'button',
								value: 'start_game',
								name: 'start_game',
								text: 'Start Game'
							});

							actions.push({
								type: 'button',
								value: 'about',
								name: 'about',
								text: 'About'
							});

							attachments.push({
								text: '',
								callback_id: dm.id + '-' + crypto.randomBytes(16).toString('hex'),
								actions: actions
							});

							webClient.chat.postMessage(dm.id, 
								"Based on John E. Dell's old Drug Wars game, dopewars is a simulation of an imaginary drug market. dopewars is an All-American game which features buying, selling, and trying to get past the cops!" + "\n\n" +
								"The first thing you need to do is pay off your debt to the Loan Shark. After that, your goal is to make as much money as possible (and stay alive)! You have one month of game time to make your fortune.",
								{
									attachments: attachments
								});

						}

					}

				}

				return res.status(200).send('OK');

			});

		}

	}

	return res.status(200).send('OK');

});

app.get('/oauth', function (req, res) {

	oauth2.getOAuthAccessToken(
		req.query.code,
		{'grant_type':'client_credentials'},
		function (e, access_token, refresh_token, results) {

			if (!(results && results.ok)) {
				return res.redirect('/failed');				
			}

			rc.set('dopewars:' + results.team_id, results.bot.bot_access_token, function(err, res) {

				if (err) {
					return;
				}

				getWebClient(results.team_id, function (err, webClient) {

					if (err) {
						return;
					}

					webClient.im.open(results.user_id, function(err, dmInfo) {

						if (err) {
							return;
						}

						var dm = {
							id: dmInfo.channel.id
						};

						webClient.chat.postMessage(dm.id, "Thanks for installing dopewars bot! Users on this team can send me a DM to start a game.");

					});

				});


			});
			res.redirect('/complete');
		}
	);

});

app.listen(config.port, function () {
	console.log('Server started on port ' + config.port + '.');
});