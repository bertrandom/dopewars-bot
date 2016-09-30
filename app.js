var config = require('config');
var Dopewars = require('./lib/dopewars');
var GameManager = require('./lib/gameManager');
var RtmClient = require('@slack/client').RtmClient;
var WebClient = require('@slack/client').WebClient;
var MemoryDataStore = require('@slack/client').MemoryDataStore;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;

var _ = require('lodash');

var express = require('express');
var bodyParser = require('body-parser');
var exphbs  = require('express-handlebars');

var OAuth = require('oauth');

var crypto = require('crypto');

var OAuth2 = OAuth.OAuth2;    
var oauth2 = new OAuth2(config.slack.client_id,
    config.slack.client_secret,
    'https://slack.com/', 
    '/oauth/authorize',
    '/api/oauth.access', 
    null);

var gm = new GameManager();

var rtm = new RtmClient(config.bot.bot_access_token, {
	logLevel: 'error',
	dataStore: new MemoryDataStore(),
	autoReconnect: true,
	autoMark: true
});

var webClient = new WebClient(config.bot.bot_access_token, {
	logLevel: 'error',
	dataStore: new MemoryDataStore()
});

rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, function (rtmStartData) {
	console.log('Connected to Slack RTM API.');
});

var RTM_EVENTS = require('@slack/client').RTM_EVENTS;

rtm.on(RTM_EVENTS.MESSAGE, function (message) {

	if (message.subtype && message.subtype == 'bot_message') {
		return;
	}

	if (message.subtype && message.subtype == 'message_changed') {
		return;
	}

	if (message.subtype && message.subtype == 'message_deleted') {
		return;
	}

	// If this is a DM
	if (message.channel.startsWith('D')) {

		var user = rtm.dataStore.getUserById(message.user)

		if (!user) {
			console.log(message);
			return;
		}
		var dm = rtm.dataStore.getDMByName(user.name);

		var game;

		if (gm.exists(dm)) {

			game = gm.get(user, dm, rtm, webClient);
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

			attachments.push({
				text: '',
				callback_id: dm.id + '-' + crypto.randomBytes(16).toString('hex'),
				actions: actions
			});

			webClient.chat.postMessage(dm.id, 
				"Based on John E. Dell's old Drug Wars game, dopewars is a simulation of an imaginary drug market.  dopewars is an All-American game which features buying, selling, and trying to get past the cops!" + "\n\n" +
				"The first thing you need to do is pay off your debt to the Loan Shark. After that, your goal is to make as much money as possible (and stay alive)! You have one month of game time to make your fortune.",
				{
					attachments: attachments
				});

		}

	}

});

rtm.start();

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

app.post('/button', function (req, res) {

	var payload = JSON.parse(req.body.payload);

	var user = rtm.dataStore.getUserById(payload.user.id);
	var dm = rtm.dataStore.getDMById(payload.channel.id);

	var game;

	if (payload.actions[0].value == 'start_game') {

		if (gm.exists(dm)) {
			return res.status(200);
		}

		game = gm.get(user, dm, rtm, webClient);

		var message = {
			response_type: 'in_channel',
            delete_original: true
		};

		return res.status(200).json(message);

	}

	game = gm.get(user, dm, rtm, webClient);

	game.handleButtonClicked(payload, function(message) {

		message = _.defaults({
			response_type: 'in_channel',
			replace_original: false
		}, message);

		res.status(200).json(message);

	});

});

app.get('/oauth', function (req, res) {

    oauth2.getOAuthAccessToken(
        req.query.code,
        {'grant_type':'client_credentials'},
        function (e, access_token, refresh_token, results) {
            res.redirect('/complete');
        }
    );

});

app.listen(config.port, function () {
    console.log('Server started on port ' + config.port + '.');
});