"use strict";

const util = require('util');
const EventEmitter = require('events');
const crypto = require('crypto');

EventEmitter.EventEmitter.prototype._maxListeners = 100;

var telnet = require('telnet-client');
 
var aiCodes = require('../data/aiCodes');
var msgCodes = require('../data/msgCodes');
var abilTypes = require('../data/abilTypes');
var dataTypes = require('../data/dataTypes');
var fightCodes = require('../data/fightCodes');

var aiCodesLookup = {};
for (var code in aiCodes) {
	aiCodesLookup[aiCodes[code]] = code;
}

var msgCodesLookup = {};
for (var code in msgCodes) {
	msgCodesLookup[msgCodes[code]] = code;
}

class Dopewars extends EventEmitter {

	constructor(teamId, userId, userName, dmId, webClient) {

		super();

		var self = this;

		this.teamId = teamId;
		this.userId = userId;
		this.userName = userName;
		this.dmId = dmId;
		this.webClient = webClient;

		this.settings = {};
		this.locations = [];
		this.drugs = [];
		this.guns = [];
		this.players = {};
		this.state = {};

		this.inGunShop = false;
		this.lastStatus = null;

		this.highScores = [];

		this.drugsHere = [];
		this.resetPromptState();

		var connection = new telnet();

		connection.on('data', function(buffer) {

			var lines = buffer.toString().split("\n");
			lines.forEach(function(line) {
				self.handleMessage(line);
			});

		});

		connection.on('connect', function() {

			connection.send('^^Ar1111011' + "\r\n" + '^^Ac' + self.teamId + '_' + self.userId + '_' + self.userName, {
				ors: '\r\n',
				waitfor: '\n'
			});

		});

		connection.on('close', function() {
			self.emit('debug', 'Connection closed.');
			self.emit('destroy');
		});

		connection.on('end', function() {
			self.emit('debug', 'Connection end.');
		});

		connection.connect({
		  host: '127.0.0.1',
		  port: 7902,
		  negotiationMandatory: false,
		  timeout: 2000
		});

		this.connection = connection;

	}

	parseAbilities(abilitiesString) {

		var matches = abilitiesString.match(/(.*)?\^(.*)?\^([A-Za-z])([A-Za-z])([01]+)$/);

		if (matches) {

			var from = matches[1];
			var to = matches[2];
			var aiCode = aiCodes[matches[3]];
			var msgCode = msgCodes[matches[4]];
			var rawAbilities = matches[5];

			if (msgCode === 'C_ABILITIES') {

				var abilities = {};

				for (var i = 0; i < matches[5].length; i++) {
					abilities[abilTypes[i]] = parseInt(matches[5][i], 10) ? true : false;
				}

				return abilities;

			}

		}

		return null;

	}

	initialize(aiCode, msgCode, data) {

		var parts = data.split('^');
		this.settings.serverVersion      = parts[0];
		this.settings.numberLocations    = parseInt(parts[1], 10);
		this.settings.numberGuns         = parseInt(parts[2], 10);
		this.settings.numberDrugs        = parseInt(parts[3], 10);
		this.settings.nameBitch          = parts[4];
		this.settings.nameBitches        = parts[5];
		this.settings.nameGun            = parts[6];
		this.settings.nameGuns           = parts[7];
		this.settings.nameDrug           = parts[8];
		this.settings.nameDrugs          = parts[9];
		this.settings.date               = parts[10];
		this.settings.clientId           = parseInt(parts[11], 10);
		this.settings.nameLoanShark      = parts[12];
		this.settings.nameBank           = parts[13];
		this.settings.nameGunShop        = parts[14];
		this.settings.namePub            = parts[15];

		var currencyParts = parts[16];
		this.settings.hasCurrencyPrefix  = parseInt(currencyParts.slice(0,1), 10) ? true : false;

		if (this.settings.hasCurrencyPrefix) {
			this.settings.currencySymbol = currencyParts.slice(1);
		}

	}

	handleData(data) {

		var matches = data.match(/^([0-9]+)\^([A-D])(.*)$/);

		if (matches) {

			var index = matches[1];
			var dataType = dataTypes[matches[2]];

			switch (dataType) {

				case "DT_LOCATION":

					var messageData = matches[3].split('^');
					this.locations[index] = messageData[0];
					break;

				case "DT_DRUG":

					var messageData = matches[3].split('^');
					this.drugs[index] = {
						"name": messageData[0],
						"min": parseInt(messageData[1], 10),
						"max": parseInt(messageData[2], 10)
					};
					break;

				case "DT_GUN":
					var messageData = matches[3].split('^');
					this.guns[index] = {
						"name": messageData[0],
						"price": parseInt(messageData[1], 10),
						"space": parseInt(messageData[2], 10),
						"damage": parseInt(messageData[3], 10)
					};
					break;

				case "DT_PRICES":
					var messageData = matches[3].split('^');
					this.settings.priceSpy = parseInt(messageData[0], 10);
					this.settings.priceTipoff = parseInt(messageData[1], 10);
					break;

			}

		}

	}

	handleLoggedOnPlayer(data) {

		var parts = data.split('^');
		this.players[parseInt(parts[1], 10)] = parts[0];

	}

	handleState(data) {

		var parts = data.split('^');

		this.state.cash = parts[0] ? parts[0] : 0;
		this.state.debt = parts[1] ? parts[1] : 0;
		this.state.bank = parts[2] ? parts[2] : 0;
		this.state.health = parts[3] ? parts[3] : 0;
		this.state.coatsize = parseInt(parts[4], 10);
		this.state.location = parseInt(parts[5], 10);
		this.state.turn = parts[6];
		this.state.flags = parts[7];
		this.state.date = parts[8] + '-' + parts[9] + '-' + parts[10];

		var remainingParts = parts.slice(11);

		this.state.guns = remainingParts.splice(0, this.settings.numberGuns);

		for (var i = 0; i < this.state.guns.length; i++) {
			this.state.guns[i] = parseInt(this.state.guns[i], 10);
		}

		this.state.drugs = remainingParts.splice(0, this.settings.numberDrugs);
		for (var i = 0; i < this.state.drugs.length; i++) {
			this.state.drugs[i] = parseInt(this.state.drugs[i], 10);
		}

		this.state.drugsValue = remainingParts.splice(0, this.settings.numberDrugs);
		for (var i = 0; i < this.state.drugsValue.length; i++) {

			var value = parseInt(this.state.drugsValue[i], 10);
			if (!value) {
				value = 0;
			}

			this.state.drugsValue[i] = value;

		}

		this.state.bitches = parseInt(remainingParts.shift(), 10);

	}

	handleFight(data) {

		var self = this;

		var parts = data.split('^');

		var fight = {};

		fight.attack = parts[0];
		fight.defend = parts[1];
		fight.health = parts[2];
		fight.bitches = parts[3];
		fight.nameBitches = parts[4];
		fight.killed = parts[5];
		fight.armpct = parts[6];
		fight.fightpoint = fightCodes[parts[7].substring(0,1)];

		fight.runhere = parseInt(parts[7].substring(1,2), 10);
		fight.loot = parseInt(parts[7].substring(2,3), 10);
		fight.canfire = parseInt(parts[7].substring(3,4), 10);

		fight.text = parts[8];

		switch (fight.fightpoint) {

			case "F_LASTLEAVE":
			case "F_ARRIVED":
			case "F_STAND":
			case "F_FAILFLEE":
				this.emit('displayFightLine', fight, this.getStatus());
				break;

			case "F_HIT":
			case "F_MISS":
				this.emit('displayFight', fight, this.getStatus());
				break;

		}

	}

	printMessage(data) {

		var self = this;

		if (data) {

			if (data == 'Disconnected due to idle timeout') {
				self.emit('print', 'Your game is over due to inactivity. Sorry!');                
				this.connection.end().then(function() {
					self.emit('debug', 'Connection closed in response to Disconnected due to idle timeout.');
				});
				return;
			}

			var parts = data.split('^');
			parts.forEach(function(part) {

				if (part) {
					self.emit('print', part);                
				}

			});


		}

	}

	getStatus() {

		var totalGuns = 0;
		this.state.guns.forEach(function(gun) {
			totalGuns += gun;
		});

		return {
			location: this.locations[this.state.location],
			settings: this.settings,
			state: this.state,
			totalGuns: totalGuns,
			nameGuns: this.settings.nameGuns.charAt(0).toUpperCase() + this.settings.nameGuns.slice(1),
			nameBitches: this.settings.nameBitches.charAt(0).toUpperCase() + this.settings.nameBitches.slice(1),
			drugs: this.drugs
		};

	}

	getDrugsHere(data) {

		var payload = {};
		if (this.settings.hasCurrencyPrefix) {
			payload.currencySymbol = this.settings.currencySymbol;
		}

		payload.drugs = [];

		var parts = data.split('^');
		for (var i = 0; i < parts.length; i++) {
			if (parts[i] != '') {

				var drug = {
					name: this.drugs[i].name,
					index: i,
					price: parseInt(parts[i], 10)
				}

				payload.drugs.push(drug);

			}
		}

		return payload;

	}

	displayStatus(displayDrugs) {

		if (typeof displayDrugs === 'undefined') {
			displayDrugs = true;
		}

		if (displayDrugs) {
			this.emit('displayStatus', this.drugsHere, this.getStatus());
		} else {
			this.emit('displayStatus', null, this.getStatus());
		}

	}

	handleQuestion(aiCode, data) {

		var self = this;

		var parts = data.split('^');
		var choices = parts[0];

		var question = '';

		// For some reason, C_ASKBITCH has an empty parts[1] and the question is in parts[2]

		if (parts[1]) {
			question = parts[1];
		} else if (parts[2]) {
			question = parts[2];
		}

		if (choices == 'YN') {

			this.emit('clearStatus');
			this.emit('promptQuestion', question);

		}

	}

	handleGunshop(data) {

		this.inGunShop = true;
		this.promptAfterUpdate = true;

		var status = this.getStatus();

		this.emit('displayGunshop', {
			guns: this.guns,
			currencySymbol: status.settings.currencySymbol
		}, status)
	}

	handleBank() {

		this.displayStatus(false);
		this.emit('displayBank');

	}

	handleMessage(messageString) {

		var self = this;

		this.emit('debug', messageString);

		if (messageString.slice(0,2) == '^^') {

			this.parseAbilities(messageString);
			return;

		}

		var matches = messageString.match(/^([0-9]*)\^([A-Za-z])([A-Za-z])(.*)?$/);

		if (matches) {

			var to = matches[1];
			var aiCode = aiCodes[matches[2]];
			var msgCode = msgCodes[matches[3]];
			var data = matches[4];

			switch (msgCode) {

				case "C_INIT":
					this.initialize(aiCode, msgCode, data);
					break;

				case "C_DATA":
					this.handleData(data);
					break;

				case "C_LIST":
					this.handleLoggedOnPlayer(data);
					break;

				case "C_ENDLIST":
					break;

				case "C_UPDATE":
					this.handleState(data);
					if (this.promptAfterUpdate) {

						if (this.inGunShop) {
							this.handleGunshop(data);
						} else {
							this.displayStatus();                            
						}

					}
					break;

				case "C_PRINTMESSAGE":
					this.printMessage(data);
					break;

				case "C_FIGHTPRINT":
					this.handleFight(data);
					break;

				case "C_DRUGHERE":
					this.drugsHere = this.getDrugsHere(data);
					this.displayStatus();
					break;

				case "C_SUBWAYFLASH":
					this.emit('print', ':metro: SUBWAY :metro:');
					break;

				case "C_QUESTION":
					this.handleQuestion(aiCode, data);
					break;

				case "C_GUNSHOP":
					this.handleGunshop(data);
					break;

				case "C_LOANSHARK":
					this.promptLoanShark();
					break;

				case "C_BANK":
					this.handleBank();
					break;

				case "C_STARTHISCORE":
					this.highScores = [];
					break;

				case "C_HISCORE":
					this.handleHighScore(data);
					break;

				case "C_ENDHISCORE":
					this.emit('displayHighScores', this.highScores);
					this.connection.end().then(function() {
						self.emit('debug', 'Connection closed because high scores were displayed.'); 
					});
					return;
					break;

			}

			this.emit('debug', 'receive:', to, aiCode, msgCode, data);

		}


	}

	handleHighScore(data) {

		var parts = data.split('^');

		var bold = parts[1].substring(0,1) == 'B';
		var rawScore = parts[1].substring(1);

		rawScore = rawScore.replace(/>|</g,'');
		rawScore = rawScore.trim();

		var matches = rawScore.match(/(\S*)\s+(\S*)\s+(\S*)/);

		var score = matches[1];
		var date = matches[2];
		var id = matches[3];

		var ids = id.split('_');

		var teamId = ids[0];
		var userId = ids[1];
		var userName = ids[2];

		this.highScores.push({
			bold: bold,
			score: score,
			date: date,
			teamId: teamId,
			userId: userId,
			userName: userName,
			sameTeam: teamId == this.teamId
		});

	}

	translateAiCode(aiCode) {

		return aiCodesLookup[aiCode];

	}

	translateMsgCode(msgCode) {

		return msgCodesLookup[msgCode];

	}

	sendMessage(aiCode, msgCode, data) {

		var payload = "^" + this.translateAiCode(aiCode) + this.translateMsgCode(msgCode) + data;
		this.emit('debug', 'send:', aiCode, msgCode, data);

		this.connection.send(payload, {
			ors: '\r\n',
			waitfor: '\n'
		});

	}

	handleButtonClicked(payload, callback) {

		if (payload.actions[0].name === 'buy') {
			return this.initiateBuy(callback);
		} else if (payload.actions[0].name === 'buygun') {
			return this.initiateBuyGun(callback);
		} else if (payload.actions[0].name === 'buy.selectGun') {
			return this.buyGun(parseInt(payload.actions[0].value, 10), callback);
		} else if (payload.actions[0].name === 'sell') {
			return this.initiateSell(callback);
		} else if (payload.actions[0].name === 'buy.selectDrug') {
			return this.promptBuyAmount(parseInt(payload.actions[0].value, 10), callback);
		} else if (payload.actions[0].name === 'sell.selectDrug') {
			return this.promptSellAmount(parseInt(payload.actions[0].value, 10), callback);
		} else if (payload.actions[0].name === 'jet') {
			return this.selectLocation(callback);
		} else if (payload.actions[0].name === 'jet.selectLocation') {
			return this.jet(parseInt(payload.actions[0].value, 10), callback);
		} else if (payload.actions[0].name === 'handleAnswer') {
			return this.handleAnswer(payload.actions[0].value, callback);
		} else if (payload.actions[0].name === 'run') {
			return this.run(callback);
		} else if (payload.actions[0].name === 'fire') {
			return this.fire(callback);
		} else if (payload.actions[0].name === 'stand') {
			return this.stand(callback);
		} else if (payload.actions[0].name === 'leave') {
			return this.leave(callback);
		} else if (payload.actions[0].name === 'quit') {
			return this.quit(callback);
		} else if (payload.actions[0].name === 'deposit') {
			return this.promptDeposit(callback);
		} else if (payload.actions[0].name === 'withdraw') {
			return this.promptWithdraw(callback);
		} else if (payload.actions[0].name === 'leave_bank') {
			return this.leaveBank(callback);
		}

		return callback({});

	}

	initiateBuy(callback) {

		var self = this;

		var drugsHere = this.drugsHere;

		var attachments = [];

		var i = 0;

		drugsHere.drugs.forEach(function(drug) {

			if (i % 5 === 0) {

				attachments.push({
					text: '',
					callback_id: self.dmId + '-' + crypto.randomBytes(16).toString('hex'),
					actions: []
				});

			}

			attachments[attachments.length - 1].actions.push({
				type: 'button',
				value: drug.index,
				name: 'buy.selectDrug',
				text: drug.name
			});

			i++;

		});

		callback({
			text: 'What do you wish to buy?',
			attachments: attachments
		});

	}

	initiateBuyGun(callback) {

		var self = this;

		var guns = this.guns;

		var attachments = [];

		var i = 0;

		guns.forEach(function(gun) {

			if (i % 5 === 0) {

				attachments.push({
					text: '',
					callback_id: self.dmId + '-' + crypto.randomBytes(16).toString('hex'),
					actions: []
				});

			}

			attachments[attachments.length - 1].actions.push({
				type: 'button',
				value: i,
				name: 'buy.selectGun',
				text: gun.name
			});

			i++;

		});

		callback({
			text: 'What do you wish to buy?',
			attachments: attachments
		});

	}

	initiateSell(callback) {

		var self = this;

		var drugsHere = this.drugsHere;

		var attachments = [];

		var i = 0;

		drugsHere.drugs.forEach(function(drug) {

			if (self.state.drugs[drug.index] == 0) {
				return;
			}

			if (i % 5 === 0) {

				attachments.push({
					text: '',
					callback_id: self.dmId + '-' + crypto.randomBytes(16).toString('hex'),
					actions: []
				});

			}

			attachments[attachments.length - 1].actions.push({
				type: 'button',
				value: drug.index,
				name: 'sell.selectDrug',
				text: drug.name
			});

			i++;

		});

		if (attachments.length > 0) {

			callback({
				text: 'What do you wish to sell?',
				attachments: attachments
			});

		} else {

			callback({
				text: 'No buyers are available for the drugs that you have.'
			});

		}

	}    

	promptBuyAmount(drugIndex, callback) {

		var drug;

		this.drugsHere.drugs.forEach(function(thisDrug) {
			if (thisDrug.index === drugIndex) {
				drug = thisDrug;
			}
		});

		this.drugSelected = drugIndex;

		var canAfford = Math.floor(this.state.cash / drug.price);
		var canCarry = this.state.coatsize;

		this.expectMessage = 'buy';

		callback({
			text: `You can afford ${canAfford}, and can carry ${canCarry}. How many do you buy?`,
			delete_original: true
		});

	}

	promptSellAmount(drugIndex, callback) {

		var drug;

		this.drugsHere.drugs.forEach(function(thisDrug) {
			if (thisDrug.index === drugIndex) {
				drug = thisDrug;
			}
		});

		this.drugSelected = drugIndex;

		var amount = this.state.drugs[drugIndex];

		this.expectMessage = 'sell';

		callback({
			text: `You have ${amount}. How many do you sell?`,
			delete_original: true
		});

	}

	promptDeposit(callback) {

		this.expectMessage = 'deposit';
		this.emit('print', 'How much money?');

		callback({
			text: '',
			delete_original: true
		});

	}

	promptWithdraw(callback) {

		this.expectMessage = 'withdraw';
		this.emit('print', 'How much money?');

		callback({
			text: '',
			delete_original: true
		});

	}

	promptLoanShark() {

		this.expectMessage = 'pay_back_loan_shark';
		this.displayStatus(false);
		this.emit('print', 'How much money do you pay back?');

	}

	leaveBank() {

		this.sendMessage("C_NONE", "C_DONE");

		callback({
			text: '',
			delete_original: true
		});

	}

	handleSlackMessage(message) {

		if (this.expectMessage == 'buy') {

			var amount = parseInt(message.text, 10);
			if (amount >= 0) {
				this.buyDrug(this.drugSelected, amount);
			}

		} else if (this.expectMessage == 'sell') {

			var amount = parseInt(message.text, 10);
			if (amount >= 0) {
				this.sellDrug(this.drugSelected, amount);
			}

		} else if (this.expectMessage == 'pay_back_loan_shark') {

			var amount = parseInt(message.text, 10);
			if (amount >= 0) {
				this.payBackLoanShark(amount);
			}

		} else if (this.expectMessage == 'deposit') {

			var amount = parseInt(message.text, 10);
			if (amount >= 0) {
				this.deposit(amount);
			}

		} else if (this.expectMessage == 'withdraw') {

			var amount = parseInt(message.text, 10);
			if (amount >= 0) {
				this.withdraw(amount);
			}

		}

	}

	payBackLoanShark(amount) {

		this.promptAfterUpdate = true;

		if (amount == 0) {
			this.sendMessage("C_NONE", "C_DONE");
		} else {

			this.sendMessage("C_NONE", "C_PAYLOAN", amount);
			this.sendMessage("C_NONE", "C_DONE");

		}

	}

	buyGun(gunSelected, callback) {

		callback({
			text: '',
			delete_original: true
		});        

		this.sendMessage("C_NONE", "C_BUYOBJECT", 'gun' + '^' + gunSelected + '^' + 1);

	}

	buyDrug(drugSelected, amount) {

		this.promptAfterUpdate = true;
		this.sendMessage("C_NONE", "C_BUYOBJECT", 'drug' + '^' + drugSelected + '^' + amount);

	}

	sellDrug(drugSelected, amount) {

		this.promptAfterUpdate = true;
		this.sendMessage("C_NONE", "C_BUYOBJECT", 'drug' + '^' + drugSelected + '^' + '-' + amount);

	}

	deposit(amount) {

		this.promptAfterUpdate = true;
		this.sendMessage("C_NONE", "C_DEPOSIT", amount);
		this.sendMessage("C_NONE", "C_DONE");

	}

	withdraw(amount) {

		this.promptAfterUpdate = true;
		this.sendMessage("C_NONE", "C_DEPOSIT", '-' + amount);
		this.sendMessage("C_NONE", "C_DONE");

	}

	resetPromptState() {
		this.drugSelected = null;
		this.expectMessage = null;
		this.promptAfterUpdate = false;
	}

	selectLocation(callback) {

		var attachments = [];
		var actions = [];

		for (var i = 0; i < this.locations.length; i++) {

			if (i % 5 === 0) {

				attachments.push({
					text: '',
					callback_id: this.dmId + '-' + crypto.randomBytes(16).toString('hex'),
					actions: []
				});

			}

			attachments[attachments.length - 1].actions.push({
				type: 'button',
				value: i,
				name: 'jet.selectLocation',
				text: this.locations[i]
			});

		}

		callback({
			text: 'Where to, dude?',
			attachments: attachments
		});

	}

	jet(locationId, callback) {

		callback({
			text: '',
			delete_original: true
		});

		this.resetPromptState();
		this.sendMessage("C_NONE", "C_REQUESTJET", locationId);

	}

	handleAnswer(answer, callback) {

		callback({
			text: '',
			delete_original: true
		});

		this.sendMessage("C_NONE", "C_ANSWER", answer);

	}

	setFightTs(ts) {
		this.fightTs = ts;
	}

	getFightTs() {
		return this.fightTs;
	}

	setLastStatus(status) {
		this.lastStatus = status;
	}

	getLastStatus() {
		return this.lastStatus;
	}    

	run(callback) {

		this.setFightTs(null);

		callback({
			text: '',
			delete_original: true
		});

		this.sendMessage("C_NONE", "C_FIGHTACT", 'R');

	}

	stand(callback) {

		this.setFightTs(null);

		callback({
			text: '',
			delete_original: true
		});

		this.sendMessage("C_NONE", "C_FIGHTACT", 'S');

	}

	fire(callback) {

		this.setFightTs(null);

		callback({
			text: '',
			delete_original: true
		});

		this.sendMessage("C_NONE", "C_FIGHTACT", 'F');

	}


	leave(callback) {

		this.inGunShop = false;
		this.resetPromptState();

		callback({
			text: '',
			delete_original: true
		});

		this.sendMessage("C_NONE", "C_DONE");

	}

	quit(callback) {

		this.inGunShop = false;
		this.resetPromptState();

		callback({
			text: '',
			delete_original: true
		});

		this.sendMessage("C_NONE", "C_WANTQUIT");

	}

}

module.exports = Dopewars;