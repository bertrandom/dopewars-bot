# dopewars bot

dopewars bot is a [dopewars](http://dopewars.sourceforge.net/) client that acts as a proxy to Slack. It handles the UI and receiving input from Slack, while dopewars itself handles the gameplay, state, and high scores.

## prerequisites

* node v4.x.x or greater
* dopewars 1.5.12 or greater
* redis

## installation

Install dopewars on OS X with homebrew

```
brew install homebrew/games/dopewars
```

Install redis

```
brew install redis
```

Clone the repo into the directory of your choice.

Create a [new app on Slack](https://api.slack.com/apps/new).

Turn on Interactive Messages and Event Subscriptions.

Subscribe to `message.im` in Bot Events.

Start [ngrok](https://ngrok.com/) or set up HTTPs to your development environment.

Set the Redirect URI to `https://hostname/oauth`

Set the Interactive Messages endpoint to `https://hostname/button`

Set the Events endpoint to `https://hostname/event`

Copy `config/default.json5` to `config/local.json5` and fill in the client ID, client secret, verification token, and port.

Go to the state directory `cd state`.

Start dopewars:

```
dopewars -S -f dopewars.sco -g dopewars.cfg -r dopewars.pid -l dopewars.log &
```

Go back to the original directory `cd ..`.

```
npm install
node app
```

This should be enough to get your development environment started.

## architecture

```

  +----------+      +--------------+      +----------+
  |          <------+              +------>          |
  | dopewars |      | dopewars bot |      |  Slack   |
  |          +------>              <------+          |
  +----------+      +----------^---+      +----------+
                        |      |
                        |      |
                    +---v----------+
                    |              |
                    |    redis     |
                    |              |
                    +--------------+

```

When a game is started, dopewars bot creates and holds a telnet connection to dopewars. It receives DMs from Slack via the Events API and button clicks are received through the Interactive Messages endpoint. It sends messages through the Slack Web API. Redis is only used for storing bot access tokens, which are recorded when the app is first installed on a team.

## todo

* multiplayer fights
* test maximum number of simultaneous dopewars connections (currently limit is set to 1000)

## license

ISC