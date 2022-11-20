'use strict';

const yaml = require('js-yaml');
const fs = require('fs');
require('dotenv').config();

const line = require('@line/bot-sdk');
const express = require('express');
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();

const config = {
  channelAccessToken: process.env.NODE_ACCESS_TOKEN,
  channelSecret: process.env.NODE_SECRET,
};

// create LINE SDK client
const client = new line.Client(config);
const app = express();
let users = [];
const states = {
  empty: 0,
  newUser: 1,
  nameGiven: 2,
};
const stateMessage = {
  0: '',
  1: "Let's start by telling me about you. What is your name?",
  2: 'Nice to meet you, why you want to start saving money?',
};

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'alive',
  });
});

// webhook callback
app.post('/webhook', jsonParser, (req, res) => {
  console.log(req.body);
  readFile();
  // req.body.events should be an array of events
  if (!Array.isArray(req.body.events)) {
    return res.status(500).end();
  }

  // handle events separately
  Promise.all(
    req.body.events.map((event) => {
      // check verify webhook event
      if (
        event.replyToken === '00000000000000000000000000000000' ||
        event.replyToken === 'ffffffffffffffffffffffffffffffff'
      ) {
        return;
      }
      return handleEvent(event, event.source.userId);
    })
  )
    .then(() => res.end())
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// simple reply function
const replyText = (token, texts) => {
  texts = Array.isArray(texts) ? texts : [texts];
  return client.replyMessage(
    token,
    texts.map((text) => ({ type: 'text', text }))
  );
};

// callback function to handle a single event
function handleEvent(event, userId) {
  if (!users.find((x) => x.userId === userId)) {
    users.push({ userId: userId, state: states.empty });
  }
  switch (event.type) {
    case 'message':
      const message = event.message;
      switch (message.type) {
        case 'text':
          return handleText(message, event.replyToken, userId);
        case 'image':
          return handleImage(message, event.replyToken);
        case 'video':
          return handleVideo(message, event.replyToken);
        case 'audio':
          return handleAudio(message, event.replyToken);
        case 'location':
          return handleLocation(message, event.replyToken);
        case 'sticker':
          return handleSticker(message, event.replyToken);
        default:
          throw new Error(`Unknown message: ${JSON.stringify(message)}`);
      }

    case 'follow':
      return console.log(`New follow: ${JSON.stringify(event)}`);

    case 'unfollow':
      return console.log(`Unfollowed this bot: ${JSON.stringify(event)}`);

    case 'join':
      return replyText(event.replyToken, `Joined ${event.source.type}`);

    case 'leave':
      return console.log(`Left: ${JSON.stringify(event)}`);

    case 'postback':
      let data = event.postback.data;
      return replyText(event.replyToken, `Got postback: ${data}`);

    case 'beacon':
      const dm = `${Buffer.from(event.beacon.dm || '', 'hex').toString(
        'utf8'
      )}`;
      return replyText(
        event.replyToken,
        `${event.beacon.type} beacon hwid : ${event.beacon.hwid} with device message = ${dm}`
      );

    default:
      throw new Error(`Unknown event: ${JSON.stringify(event)}`);
  }
}

function handleText(message, replyToken, userId) {
  const user = users.find((x) => x.userId === userId);
  switch (user.state) {
    case states.empty:
      user.state = states.newUser;
      break;
    case states.newUser:
      user.name = message;
      user.state = states.nameGiven;
      break;

    default:
      break;
  }
  const reply = stateMessage[user.state];
  updateFile();
  return replyText(replyToken, reply);
}

function handleImage(message, replyToken) {
  return replyText(replyToken, 'Got Image');
}

function handleVideo(message, replyToken) {
  return replyText(replyToken, 'Got Video');
}

function handleAudio(message, replyToken) {
  return replyText(replyToken, 'Got Audio');
}

function handleLocation(message, replyToken) {
  return replyText(replyToken, 'Got Location');
}

function handleSticker(message, replyToken) {
  return replyText(replyToken, 'Got Sticker');
}

function readFile() {
  if (!fs.existsSync('./users.yml')) {
    fs.writeFileSync('./users.yml', '');
  }
  const file = yaml.load(fs.readFileSync('./users.yml', 'utf8'));
  users = file || [];
}

function updateFile() {
  let doc = yaml.load(fs.readFileSync('./users.yml', 'utf8'));
  doc = users;
  fs.writeFile('./users.yml', yaml.dump(doc), (err) => {
    if (err) {
      console.log(err);
    }
  });
}

app.listen(process.env.PORT || 3000, () => {});
