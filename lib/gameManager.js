"use strict";

var Dopewars = require('./dopewars');
const crypto = require('crypto');
const moment = require('moment');

class GameManager {

	constructor() {
		this.games = {};
	}

	get(user, dm, rtm, webClient) {

		if (!this.games[dm.id]) {

			var game = new Dopewars(user.id, user.name, dm.id, webClient);
			this.games[dm.id] = game;

			game.on('print', (line) => {
				rtm.sendMessage(line, dm.id);
			});

			game.on('debug', function() {
				console.log.apply(null, arguments);
			});

			game.on('displayStatus', function(payload, data) {

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

				webClient.chat.postMessage(dm.id, '*' + data.location + '* ' + moment(data.state.date, "D-M-YYYY").format("MMMM D, YYYY") + '', {
					attachments: attachments
				});

			});

			game.on('promptQuestion', function(question) {

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
 					callback_id: this.dmId + '-' + crypto.randomBytes(16).toString('hex'),
 					actions: actions
 				});

				webClient.chat.postMessage(dm.id, question, {
					attachments: attachments
				});

			});

		}

		return this.games[dm.id];

	}

}

module.exports = GameManager;