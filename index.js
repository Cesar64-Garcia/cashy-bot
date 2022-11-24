/* eslint-disable quotes */

"use strict";

const yaml = require("js-yaml");
const fs = require("fs");
require("dotenv").config();

const line = require("@line/bot-sdk");
const express = require("express");
const bodyParser = require("body-parser");
const jsonParser = bodyParser.json();

const voluntaryConfig = {
  channelAccessToken: process.env.VOLUNTARY_ACCESS_TOKEN,
  channelSecret: process.env.VOLUNTARY_SECRET,
};

const compulsoryConfig = {
  channelAccessToken: process.env.COMPULSORY_ACCESS_TOKEN,
  channelSecret: process.env.COMPULSORY_SECRET,
};

const dateMessage = {
  type: "template",
  template: {
    type: "buttons",
    actions: [
      {
        label: "Expected Date",
        min: "2022-11-08",
        mode: "date",
        initial: "2022-11-09",
        data: "Data 1",
        type: "datetimepicker",
        max: "2025-12-31",
      },
    ],
    title: "When do you want to achieve your goal?",
    text: "Please select the expected date below",
  },
  altText: "this is a buttons template",
};

const reasonMessage = {
  altText: "this is a buttons template",
  type: "template",
  template: {
    type: "buttons",
    actions: [
      {
        text: "Retirement",
        type: "message",
        label: "Retirement",
      },
      {
        type: "message",
        text: "Investment",
        label: "Investment",
      },
      {
        label: "Emergency Fund",
        type: "message",
        text: "Emergency Fund",
      },
      {
        text: "Others",
        label: "Others",
        type: "message",
      },
    ],
    text: "What is your main reason to save money?",
    title: "Your main reason to save money",
  },
};

// create LINE SDK client
const voluntaryClient = new line.Client(voluntaryConfig);
const compulsoryClient = new line.Client(compulsoryConfig);

// Files
const compulsoryUsers = "./compulsory-users.yml";
const voluntaryUsers = "./voluntary-users.yml";

const app = express();

const states = {
  empty: 0,
  waitingName: 1,
  waitingReason: 2,
  waitingAmount: 3,
  waitingDate: 4,
  waitingOption: 5,
};

const stateMessage = {
  askName: "Let's start by telling me about you. What is your name?",
  askReason: "Nice to meet you @name, why you want to start saving money?",
  askAmount:
    "Sounds good, how much money you need to save to achieve your goal? eg. NTD34000",
  askDate: "When do you want to achieve the goal (YYYY-MM-DD)? eg. 2022-12-31",
  askOption:
    "Goal set for: @date. Please select an option in the menu to continue.",
};

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "alive",
  });
});

app.post("/reset-voluntary", (req, res) => {
  readFile(true);
  updateFile(true, []);

  res.status(200).json({
    success: true,
    message: "complete",
  });
});

app.post("/get-voluntary", (req, res) => {
  const users = readFile(true);
  res.status(200).json({
    success: true,
    message: users,
  });
});

app.post("/reset-compulsory", (req, res) => {
  readFile(false);
  updateFile(false, []);

  res.status(200).json({
    success: true,
    message: "complete",
  });
});

app.post("/get-compulsory", (req, res) => {
  const users = readFile(false);
  res.status(200).json({
    success: true,
    message: users,
  });
});

// webhook callback
app.post("/webhook-voluntary", jsonParser, (req, res) => {
  // req.body.events should be an array of events
  if (!Array.isArray(req.body.events)) {
    return res.status(500).end();
  }

  // handle events separately
  Promise.all(
    req.body.events.map((event) => {
      // check verify webhook event
      if (
        event.replyToken === "00000000000000000000000000000000" ||
        event.replyToken === "ffffffffffffffffffffffffffffffff"
      ) {
        return;
      }
      return handleEvent(event, event.source.userId, true);
    })
  )
    .then(() => res.end())
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// simple reply function
const replyText = (token, texts, isVolunary) => {
  console.log({ token, texts, isVolunary });
  texts = Array.isArray(texts) ? texts : [texts];
  return (isVolunary ? voluntaryClient : compulsoryClient).replyMessage(
    token,
    texts.map((text) => ({ type: "text", text }))
  );
};

const replyTemplate = (token, template, isVolunary) => {
  return (isVolunary ? voluntaryClient : compulsoryClient).replyMessage(
    token,
    template
  );
};

// callback function to handle a single event
function handleEvent(event, userId, isVolunary) {
  switch (event.type) {
    case "message":
      const message = event.message;
      switch (message.type) {
        case "text":
          return handleText(message.text, event.replyToken, userId, isVolunary);
        default:
          throw new Error(`Unknown message: ${JSON.stringify(message)}`);
      }

    case "follow":
      return console.log(`New follow: ${JSON.stringify(event)}`);

    case "unfollow":
      return console.log(`Unfollowed this bot: ${JSON.stringify(event)}`);

    case "postback":
      const date = event.postback.params.date;
      return handleText(date, event.replyToken, userId, isVolunary);

    default:
      throw new Error(`Unknown event: ${JSON.stringify(event)}`);
  }
}

function handleText(text, replyToken, userId, isVolunary) {
  const users = readFile(true);
  let user = users.find((x) => x.userId === userId);

  if (!user) {
    user = { userId: userId, state: states.empty };
    users.push(user);
  }

  const { isTemplateReply, reply } = routingCompulsory(text, user);

  updateFile(isVolunary, users);

  return isTemplateReply
    ? replyTemplate(replyToken, reply, isVolunary)
    : replyText(replyToken, reply, isVolunary);
}

function routingCompulsory(text, user) {
  let isTemplateReply = false;
  let reply = "";

  switch (user.state) {
    case states.empty:
      user.state = states.waitingName;
      reply = stateMessage.askName;
      break;
    case states.waitingName:
      user.name = text;
      user.state = states.waitingReason;
      reply = reasonMessage;
      isTemplateReply = true;
      break;
    case states.waitingReason:
      user.reason = text;
      user.state = states.waitingAmount;
      reply = stateMessage.askAmount;
      break;
    case states.waitingAmount:
      user.amount = text;
      user.state = states.waitingDate;
      reply = dateMessage;
      isTemplateReply = true;
      break;
    case states.waitingDate:
      user.date = text;
      user.state = states.waitingOption;
      reply = stateMessage.askOption.replace("@date", user.date);
      break;
    default:
      break;
  }

  return { isTemplateReply, reply };
}

function readFile(isVolunary) {
  if (!fs.existsSync(isVolunary ? voluntaryUsers : compulsoryUsers)) {
    fs.writeFileSync(isVolunary ? voluntaryUsers : compulsoryUsers, "");
  }
  const file = yaml.load(
    fs.readFileSync(isVolunary ? voluntaryUsers : compulsoryUsers, "utf8")
  );

  return file || [];
}

function updateFile(isVolunary, users) {
  fs.writeFile(
    isVolunary ? voluntaryUsers : compulsoryUsers,
    yaml.dump(users),
    (err) => {
      if (err) {
        console.log(err);
      }
    }
  );
}

app.listen(process.env.PORT || 3000, () => {});
