"use strict";

const util = require('util');
const EventEmitter = require('events');
const crypto = require('crypto');

var telnet = require('telnet-client');
var inquirer = require('inquirer');
 
var aiCodes = require('../data/aiCodes');
var msgCodes = require('../data/msgCodes');
var abilTypes = require('../data/abilTypes');
var dataTypes = require('../data/dataTypes');

var aiCodesLookup = {};
for (var code in aiCodes) {
    aiCodesLookup[aiCodes[code]] = code;
}

var msgCodesLookup = {};
for (var code in msgCodes) {
    msgCodesLookup[msgCodes[code]] = code;
}

class Dopewars extends EventEmitter {

    constructor(userId, userName, dmId, webClient) {

        super();

        var self = this;

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

        this.drugsHere = [];
        this.resetPromptState();

        var connection = new telnet();

        connection.on('connect', function() {

            connection.on('data', function(buffer) {

                var lines = buffer.toString().split("\n");
                lines.forEach(function(line) {
                    self.handleMessage(line);
                });

            });

            connection.send('^^Ar1111011' + "\r\n" + '^^Ac' + self.userId, {
                ors: '\r\n',
                waitfor: '\n'
            });

        });

        connection.connect({
          host: '127.0.0.1',
          port: 7902,
          negotiationMandatory: false
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

        this.state.cash = parts[0];
        this.state.debt = parts[1];
        this.state.bank = parts[2] ? parts[2] : 0;
        this.state.health = parts[3];
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
            this.state.drugsValue[i] = parseInt(this.state.drugsValue[i], 10);
        }

        this.state.bitches = parseInt(remainingParts.shift(), 10);

    }

    printMessage(data) {

        var self = this;

        var parts = data.split('^');
        parts.forEach(function(part) {
            self.emit('print', part);
            // console.log(part);
        });
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

    displayStatus() {
        this.emit('displayStatus', this.drugsHere, this.getStatus());
    }

    handleQuestion(aiCode, data) {

        var self = this;

        var parts = data.split('^');
        var choices = parts[0];
        var question = parts[1];

        console.log(parts);

        if (choices == 'YN') {

            console.log('emitting promptquestion');
            this.emit('promptQuestion', question);

            // inquirer.prompt([{
            //     type: 'confirm',
            //     name: 'question',
            //     message: question
            // }]).then(function (answers) {
            //     self.sendMessage("C_NONE", "C_ANSWER", answers.question ? 'Y' : 'N');
            // });

        }

    }

    handleMessage(messageString) {

      // if (HaveAbility(BufOwn, A_PLAYERID)) {
      //   if (To)
      //     g_string_sprintfa(text, "%d", To->ID);
      //   g_string_sprintfa(text, "^%c%c%s", AI, Code, Data ? Data : "");

        console.log(messageString);

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
                    // console.log(settings);
                    // console.log(locations);
                    // console.log(this.drugs);
                    // console.log(guns);
                    // console.log(players);
                    break;

                case "C_UPDATE":
                    this.handleState(data);
                    if (this.promptAfterUpdate) {
                        this.displayStatus();
                    }
                    break;

                case "C_PRINTMESSAGE":
                    this.printMessage(data);
                    break;

                case "C_FIGHTPRINT":
                    this.printMessage(data);
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

            }

            this.emit('debug', 'receive:', to, aiCode, msgCode, data);

        }


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

// dopewars-0 (out): { actions: [ { name: 'buy', value: 'buy' } ],
// dopewars-0 (out):   callback_id: 'D1G4QCJPJ-190a3cf0d3ed025bcd5bb81eecfc1498',
// dopewars-0 (out):   team: { id: 'T02PKCQ5T', domain: 'bertrandom' },
// dopewars-0 (out):   channel: { id: 'D1G4QCJPJ', name: 'directmessage' },
// dopewars-0 (out):   user: { id: 'U02PKCQ5V', name: 'bertrandom' },
// dopewars-0 (out):   action_ts: '1465879979.94163',
// dopewars-0 (out):   message_ts: '1465879974.000107',
// dopewars-0 (out):   attachment_id: '3',
// dopewars-0 (out):   token: 'CTWzv30RgyZgxrqxq2sOcDA5',
// dopewars-0 (out):   original_message:
// dopewars-0 (out):    { text: '*Bronx* 1-12-1984',
// dopewars-0 (out):      username: 'dopewars',
// dopewars-0 (out):      bot_id: 'B1G4LDNCE',
// dopewars-0 (out):      attachments: [ [Object], [Object], [Object] ],
// dopewars-0 (out):      type: 'message',
// dopewars-0 (out):      subtype: 'bot_message',
// dopewars-0 (out):      ts: '1465879974.000107' },
// dopewars-0 (out):   response_url: 'https://hooks.slack.com/actions/T02PKCQ5T/50653939365/zhIB91UJinPPVlKFEAEqp73W' }

        if (payload.actions[0].name === 'buy') {
            return this.initiateBuy(callback);
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

        callback({
            text: 'What do you wish to sell?',
            attachments: attachments
        });

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
            text: `You can afford ${canAfford}, and can carry ${canCarry}. How many do you buy?`
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
            text: `You have ${amount}. How many do you sell?`
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

        }

    }

    buyDrug(drugSelected, amount) {

        this.promptAfterUpdate = true;
        this.sendMessage("C_NONE", "C_BUYOBJECT", 'drug' + '^' + drugSelected + '^' + amount);

    }

    sellDrug(drugSelected, amount) {

        this.promptAfterUpdate = true;
        this.sendMessage("C_NONE", "C_BUYOBJECT", 'drug' + '^' + drugSelected + '^' + '-' + amount);

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

        this.sendMessage("C_NONE", "C_REQUESTJET", locationId);

    }

    handleAnswer(answer, callback) {

        callback({
            text: '',
            delete_original: true
        });

        this.sendMessage("C_NONE", "C_ANSWER", answer);

    }

}

module.exports = Dopewars;