"use strict";

var config = require('config');
var Dopewars = require('./dopewars');
var Queue = require('async-function-queue');
const crypto = require('crypto');
const moment = require('moment');

class GameManager {

	constructor() {
		this.games = {};
	}

	exists(dm) {
		return (typeof this.games[dm.id] !== 'undefined');
	}

	get(user, dm, webClient) {

		var self = this;

		if (!this.games[dm.id]) {

			console.log(user.id + ' (' + user.team_id + ') has started a game.');

			var game = new Dopewars(user.team_id, user.id, user.name, dm.id, webClient);
			this.games[dm.id] = game;

			var queue = Queue(1);

			var printLine = function(line, cb) {
				webClient.chat.postMessage(dm.id, line, {}, function(err, result) {
					cb();
				});
			};

			var displayHighScores = function(highScores, cb) {

				var attachments = [];

				highScores.forEach(function(highScore) {

					if (highScore.sameTeam) {

						var attachment = {
							author_name: '<@' + highScore.userId + '>',
							text: moment(highScore.date, "DD-MM-YYYY").format("MMMM D, YYYY"),
							title: highScore.score,
						};

						if (highScore.bold) {
							attachment.color = 'good';
						}

						attachments.push(attachment);

					} else {

						attachments.push({
							author_name: highScore.userName,
							text: moment(highScore.date, "DD-MM-YYYY").format("MMMM D, YYYY"),
							title: highScore.score,
						});

					}

				});

				webClient.chat.postMessage(dm.id, 'High Scores', {attachments: attachments}, function(err, result) {
					cb();
				});
			};

			var displayFightLine = function(payload, data, cb) {

				if (payload.fightpoint == 'F_LASTLEAVE' && game.getFightTs()) {
					webClient.chat.delete(game.getFightTs(), dm.id);
					game.setFightTs(null);
				}

				webClient.chat.postMessage(dm.id, payload.text, {}, function(err, result) {
					cb();
				});

			};

			var displayFight = function(payload, data, cb) {

				var attachments = [];

				var fields = [
					{
						title: 'Cash',
						value: (data.settings.hasCurrencyPrefix ? data.settings.currencySymbol : '') + data.state.cash,
						short: true
					},
					{
						title: data.nameGuns,
						value: data.totalGuns,
						short: true
					},
					{
						title: 'Health',
						value: data.state.health,
						short: true
					},
					{
						title: 'Bank',
						value: (data.settings.hasCurrencyPrefix ? data.settings.currencySymbol : '') + data.state.bank,
						short: true
					},
					{
						title: 'Debt',
						value: (data.settings.hasCurrencyPrefix ? data.settings.currencySymbol : '') + data.state.debt,
						short: true
					},
					{
						title: data.nameBitches,
						value: data.state.bitches,
						short: true
					},
					{
						title: 'Space',
						value: data.state.coatsize,
						short: true
					},
				];

				attachments.push({
					// title: data.location,
					// text: data.state.date,
					text: 'Stats:',
					fields: fields
				});

				if (payload.runhere || payload.canfire) {

					var actions = [];

					if (payload.runhere) {

						actions.push({
							type: 'button',
							value: 'run',
							name: 'run',
							text: 'Run'
						});

					}

					if (payload.canfire) {

						actions.push({
							type: 'button',
							value: 'fire',
							name: 'fire',
							text: 'Fire'
						});
						
					}

					actions.push({
						type: 'button',
						value: 'stand',
						name: 'stand',
						text: 'Stand'
					});

					actions.push({
						type: 'button',
						value: 'quit',
						name: 'quit',
						text: 'Quit'
					});

					attachments.push({
						text: '',
						callback_id: dm.id + '-' + crypto.randomBytes(16).toString('hex'),
						actions: actions
					});

				}

				var next = function() {

					if (game.getFightTs()) {
						webClient.chat.delete(game.getFightTs(), dm.id);
						game.setFightTs(null);
					}

					webClient.chat.postMessage(dm.id, '', {
						attachments: attachments
					}, function(err, result) {

						if (result && result.ok) {
							game.setFightTs(result.ts);
						}

						cb();

					});

				};

				if (payload.text) {

					webClient.chat.postMessage(dm.id, payload.text, {}, function(err, result) {
						next();
					});

				} else {
					next();
				}

			};

			var displayStatus = function(payload, data, cb) {

				var attachments = [];

				var fields = [
					{
						title: 'Cash',
						value: (data.settings.hasCurrencyPrefix ? data.settings.currencySymbol : '') + data.state.cash,
						short: true
					},
					{
						title: data.nameGuns,
						value: data.totalGuns,
						short: true
					},
					{
						title: 'Health',
						value: data.state.health,
						short: true
					},
					{
						title: 'Bank',
						value: (data.settings.hasCurrencyPrefix ? data.settings.currencySymbol : '') + data.state.bank,
						short: true
					},
					{
						title: 'Debt',
						value: (data.settings.hasCurrencyPrefix ? data.settings.currencySymbol : '') + data.state.debt,
						short: true
					},
					{
						title: data.nameBitches,
						value: data.state.bitches,
						short: true
					},
					{
						title: 'Space',
						value: data.state.coatsize,
						short: true
					},
				];

				attachments.push({
					// title: data.location,
					// text: data.state.date,
					text: 'Stats:',
					fields: fields
				});

				if (payload) {

					fields = [];

					for (var i = 0; i < data.state.drugs.length; i++) {

						var drugAmount = data.state.drugs[i];

						if (drugAmount > 0) {

							fields.push({
								title: data.drugs[i].name,
								value: drugAmount + ' @ ' + (payload.currencySymbol ? payload.currencySymbol : '') + Math.floor(data.state.drugsValue[i] / drugAmount),
								short: true
							});

						}

					}

					var holdingDrugs = (fields.length > 0);

					if (holdingDrugs) {

						attachments.push({
							text: 'Drugs:',
							fields: fields
						});

					}

					fields = [];

					payload.drugs.forEach(function(drug) {

						fields.push({
							title: drug.name,
							value: (payload.currencySymbol ? payload.currencySymbol : '') + drug.price,
							short: true
						});

					});

					attachments.push({
						text: 'Hey dude, the prices of drugs here are:',
						fields: fields
					});

					var actions = [];

					actions.push({
						type: 'button',
						value: 'buy',
						name: 'buy',
						text: 'Buy'
					});

					if (holdingDrugs) {
						actions.push({
							type: 'button',
							value: 'sell',
							name: 'sell',
							text: 'Sell'
						});
					}

					actions.push({
						type: 'button',
						value: 'jet',
						name: 'jet',
						text: 'Jet'
					});

					actions.push({
						type: 'button',
						value: 'quit',
						name: 'quit',
						text: 'Quit'
					});

					attachments.push({
						text: '',
						callback_id: dm.id + '-' + crypto.randomBytes(16).toString('hex'),
						actions: actions
					});

				}

				var status = game.getLastStatus();

				if (status) {
					webClient.chat.update(status.ts, dm.id, status.text, {attachments: status.attachments});
					game.setLastStatus(null);
				}

				var text = '*' + data.location + '* ' + moment(data.state.date, "D-M-YYYY").format("MMMM D, YYYY") + '';

				webClient.chat.postMessage(dm.id, text, {
					attachments: attachments
				}, function(err, results) {

					if (results && results.ok) {

						if (payload) {
							attachments.pop();							
						}

						game.setLastStatus({
							ts: results.ts,
							text: text,
							attachments: attachments
						});

					}

					cb();
				});

			};

			var clearStatus = function(cb) {

				var status = game.getLastStatus();

				if (status) {
					webClient.chat.update(status.ts, dm.id, status.text, {attachments: status.attachments});
					game.setLastStatus(null);
				}

				cb();

			}

			var displayGunshop = function(payload, data, cb) {

				var attachments = [];

				var fields = [
					{
						title: 'Cash',
						value: (data.settings.hasCurrencyPrefix ? data.settings.currencySymbol : '') + data.state.cash,
						short: true
					},
					{
						title: data.nameGuns,
						value: data.totalGuns,
						short: true
					},
					{
						title: 'Health',
						value: data.state.health,
						short: true
					},
					{
						title: 'Bank',
						value: (data.settings.hasCurrencyPrefix ? data.settings.currencySymbol : '') + data.state.bank,
						short: true
					},
					{
						title: 'Debt',
						value: (data.settings.hasCurrencyPrefix ? data.settings.currencySymbol : '') + data.state.debt,
						short: true
					},
					{
						title: data.nameBitches,
						value: data.state.bitches,
						short: true
					},
					{
						title: 'Space',
						value: data.state.coatsize,
						short: true
					},
				];

				attachments.push({
					text: 'Stats:',
					fields: fields
				});

				var holdingGuns = (data.totalGuns > 0);

				fields = [];

				for (var i = 0; i < data.state.guns.length; i++) {

					var gunAmount = data.state.guns[i];

					if (gunAmount > 0) {

						fields.push({
							title: payload.guns[i].name,
							value: gunAmount,
							short: true
						});

					}

				}

				if (holdingGuns) {

					attachments.push({
						text: 'Guns:',
						fields: fields
					});

				}

				fields = [];

				payload.guns.forEach(function(gun) {

					fields.push({
						title: gun.name,
						value: (payload.currencySymbol ? payload.currencySymbol : '') + gun.price,
						short: true
					});

				});

				attachments.push({
					text: 'Prices:',
					fields: fields
				});

				var actions = [];

				actions.push({
					type: 'button',
					value: 'buygun',
					name: 'buygun',
					text: 'Buy'
				});

				if (holdingGuns) {
					actions.push({
						type: 'button',
						value: 'sell',
						name: 'sell',
						text: 'Sell'
					});
				}

				actions.push({
					type: 'button',
					value: 'leave',
					name: 'leave',
					text: 'Leave'
				});

				attachments.push({
					text: '',
					callback_id: dm.id + '-' + crypto.randomBytes(16).toString('hex'),
					actions: actions
				});

				webClient.chat.postMessage(dm.id, '', {
					attachments: attachments
				}, function(err, results) {
					cb();
				});

			};

			var displayBank = function(cb) {

				var attachments = [];

				var actions = [];

				actions.push({
					type: 'button',
					value: 'deposit',
					name: 'deposit',
					text: 'Deposit'
				});

				actions.push({
					type: 'button',
					value: 'withdraw',
					name: 'withdraw',
					text: 'Withdraw'
				});

				actions.push({
					type: 'button',
					value: 'leave_bank',
					name: 'leave',
					text: 'Leave'
				});

				attachments.push({
					text: '',
					callback_id: dm.id + '-' + crypto.randomBytes(16).toString('hex'),
					actions: actions
				});

				webClient.chat.postMessage(dm.id, '', {
					attachments: attachments
				}, function(err, results) {
					cb();
				});

			};

			var promptQuestion = function(question, cb) {

				var attachments = [];
				var actions = [];

				actions.push({
					type: 'button',
					value: 'Y',
					name: 'handleAnswer',
					text: 'Yes'
				});

				actions.push({
					type: 'button',
					value: 'N',
					name: 'handleAnswer',
					text: 'No'
				});

				attachments.push({
					text: '',
					callback_id: dm.id + '-' + crypto.randomBytes(16).toString('hex'),
					actions: actions
				});

				webClient.chat.postMessage(dm.id, question, {
					attachments: attachments
				}, function(err, results) {
					cb();
				});

			};

			game.on('destroy', function() {
				console.log(user.id + ' (' + user.team_id + ') has finished a game.');
				delete self.games[dm.id];
			});

			game.on('print', function(line) {
				queue.push(function(cb){printLine(line, cb)});
			});

			game.on('debug', function() {
				if (config.debug) {
					console.log.apply(null, arguments);					
				}
			});

			game.on('displayHighScores', function(highScores) {
				queue.push(function(cb){displayHighScores(highScores, cb)});
			});

			game.on('displayFightLine', function(payload, data) {
				queue.push(function(cb){displayFightLine(payload, data, cb)});
			});

			game.on('displayFight', function(payload, data) {
				queue.push(function(cb){displayFight(payload, data, cb)});
			});

			game.on('displayBank', function() {
				queue.push(function(cb){displayBank(cb)});
			});

			game.on('displayGunshop', function(payload, data) {
				queue.push(function(cb){displayGunshop(payload, data, cb)});
			});

			game.on('clearStatus', function() {
				queue.push(function(cb){clearStatus(cb)});
			});

			game.on('displayStatus', function(payload, data) {
				queue.push(function(cb){displayStatus(payload, data, cb)});
			});

			game.on('promptQuestion', function(question) {
				queue.push(function(cb){promptQuestion(question, cb)});
			});

		}

		return this.games[dm.id];

	}

}

module.exports = GameManager;