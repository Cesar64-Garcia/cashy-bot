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

const dateMessageTemplate = {
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

const reasonMessageTemplate = {
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
  },
};

const goalValidationMessageTemplate = {
  type: "template",
  altText: "this is a buttons template",
  template: {
    type: "buttons",
    text: "Are you sure you want to change your goal? ",
    actions: [
      {
        type: "message",
        label: "Yes",
        text: "Yes",
      },
      {
        type: "message",
        label: "No",
        text: "No",
      },
    ],
  },
};

const states = {
  empty: "empty",
  waitingName: "waitingName",
  waitingPercentage: "waitingPercentage",
  waitingGoalReason: "waitingGoalReason",
  waitingGoalAmount: "waitingGoalAmount",
  waitingDate: "waitingDate",
  waitingOption: "waitingOption",
  waitingSavingAmount: "waitingSavingAmount",
  waitingGoalChangeValidation: "waitingGoalChangeValidation",
};

const menuOptions = {
  saveMoney: "I want to save some money.",
  changeGoal: "I want to change my savings goal.",
  savingTip: "Can you give me some savings tips?",
  showBalance: "Please show me my balance.",
};

const stateMessage = {
  askName: {
    type: "text",
    text: "Let's start by telling me about you. What is your name?",
  },
  nameSent: { type: "text", text: "Nice to meet you @name." },
  percentageExplaines: {
    type: "text",
    text: "Ca$hy will automatically save a percentage of all your purchases",
  },
  askPercentage: {
    type: "text",
    text: "Which percentage of your purchases you want to save? \n\nPlease input only number.",
  },
  askReason: reasonMessageTemplate,
  askAmount: {
    type: "text",
    text: "How much money (NTD) do you need to achieve your goal? \n\nPlease input only number.",
  },
  askDate: dateMessageTemplate,
  goalSet: {
    type: "text",
    text: "Your new goal is set to NTD@amount, and the expected date @date. \n\nLet's continue your saving journey by selecting an option from the menu.",
  },
  didntUnderstand: {
    type: "text",
    text: "I couldn't understand what your request, please select an option from the menu.",
  },
  askAmountToSave: {
    type: "text",
    text: "How much money (NTD) do you want to save today? \n\nPlease input only number.",
  },
  moneySaved: {
    type: "text",
    text: "Your saving has been recorded. \n\nThank you for your saving!",
  },
  currentGoal: {
    type: "text",
    text: "Your current goal is NTD@amount and expected date is @date.",
  },
  goalValidation: goalValidationMessageTemplate,
  goalToChange: {
    type: "text",
    text: "Please answer the following questions to change your goal.",
  },
  goalDoNotChange: {
    type: "text",
    text: "Your goal is NTD@amount and expected date is @date. \n\nHope you enjoy your saving journey!",
  },
  balance: {
    type: "text",
    text: "You have achieve @percentage% of your goal! \n\nBelow are your transaction's history.",
  },
};

// create LINE SDK client
const voluntaryClient = new line.Client(voluntaryConfig);
const compulsoryClient = new line.Client(compulsoryConfig);

// Files
const compulsoryUsers = "./compulsory-users.yml";
const voluntaryUsers = "./voluntary-users.yml";

const app = express();

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "alive",
  });
});

app.post("/reset-voluntary", (req, res) => {
  readUsersFile(true);
  updateUsersFile(true, []);

  res.status(200).json({
    success: true,
    message: "complete",
  });
});

app.post("/get-voluntary", (req, res) => {
  const users = readUsersFile(true);
  res.status(200).json({
    success: true,
    message: users,
  });
});

app.post("/reset-compulsory", (req, res) => {
  readUsersFile(false);
  updateUsersFile(false, []);

  res.status(200).json({
    success: true,
    message: "complete",
  });
});

app.post("/get-compulsory", (req, res) => {
  const users = readUsersFile(false);
  res.status(200).json({
    success: true,
    message: users,
  });
});

// webhook voluntary callback
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

// webhook compulsory callback
app.post("/webhook-compulsory", jsonParser, (req, res) => {
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
      return handleEvent(event, event.source.userId, false);
    })
  )
    .then(() => res.end())
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// simple reply function
const sendReply = (token, messages, isVolunary) => {
  return (isVolunary ? voluntaryClient : compulsoryClient).replyMessage(
    token,
    messages
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
  const users = readUsersFile(true);
  let user = users.find((x) => x.userId === userId);

  if (!user) {
    user = { userId: userId, state: states.empty };
    users.push(user);
  }

  const replies = routing(text, user, isVolunary);
  updateUsersFile(isVolunary, users);

  return sendReply(replyToken, replies, isVolunary);
}

function routing(text, user, isVolunary) {
  let replies = [];

  switch (user.state) {
    case states.empty:
      user.state = states.waitingName;
      replies.push(stateMessage.askName);
      break;
    case states.waitingName:
      user.name = text;
      const nameSentMessage = { ...stateMessage.nameSent };
      nameSentMessage.text = nameSentMessage.text.replaceAll(
        "@name",
        user.name
      );

      replies.push(nameSentMessage);

      if (isVolunary) {
        user.state = states.waitingGoalReason;
        replies.push(stateMessage.askReason);
      } else {
        user.state = states.waitingPercentage;
        replies.push(stateMessage.percentageExplaines);
        replies.push(stateMessage.askPercentage);
      }
      break;
    case states.waitingGoalReason:
      user.reason = text;
      user.state = states.waitingGoalAmount;
      replies.push(stateMessage.askAmount);
      break;
    case states.waitingGoalAmount:
      const amount = parseInt(text);
      if (isNaN(amount)) {
        user.state = states.waitingGoalAmount;
        replies.push(stateMessage.askAmount);
      } else {
        user.amount = amount;
        user.state = states.waitingDate;
        replies.push(stateMessage.askDate);
      }

      break;
    case states.waitingDate:
      user.date = text;
      user.state = states.waitingOption;

      const goalSetMessage = { ...stateMessage.goalSet };
      goalSetMessage.text = goalSetMessage.text
        .replaceAll("@amount", user.amount)
        .replaceAll("@date", user.date);

      replies.push(goalSetMessage);
      break;
    case states.waitingOption:
      replies = handleMenuOption(text, user, isVolunary);
      break;
    case states.waitingSavingAmount:
      user.state = states.waitingOption;
      user.savings = user.savings || [];

      const savingAmount = parseInt(text);
      if (isNaN(savingAmount)) {
        user.state = states.waitingSavingAmount;
        replies.push(stateMessage.askAmountToSave);
      } else {
        user.savings.push({
          date: Date.now(),
          amount: savingAmount,
        });
        user.state = states.waitingOption;
        replies.push(stateMessage.moneySaved);
      }
      break;
    case states.waitingGoalChangeValidation:
      if (text === "Yes") {
        user.state = states.waitingGoalReason;
        replies.push(stateMessage.goalToChange);
        replies.push(stateMessage.askReason);
      } else {
        user.state = states.waitingOption;

        const goalDoNotChangeMessage = { ...stateMessage.goalDoNotChange };
        goalDoNotChangeMessage.text = goalDoNotChangeMessage.text
          .replaceAll("@amount", user.amount)
          .replaceAll("@date", user.date);

        replies.push(goalDoNotChangeMessage);
      }
      break;
    default:
      break;
  }

  return replies;
}

function handleMenuOption(text, user, isVolunary) {
  let replies = [];

  switch (text) {
    case menuOptions.saveMoney:
      user.state = states.waitingSavingAmount;
      replies.push(stateMessage.askAmountToSave);
      break;
    case menuOptions.changeGoal:
      user.state = states.waitingGoalChangeValidation;
      const currentGoalMessage = { ...stateMessage.currentGoal };
      currentGoalMessage.text = currentGoalMessage.text
        .replaceAll("@amount", user.amount)
        .replaceAll("@date", user.date);

      replies.push(currentGoalMessage);
      replies.push(stateMessage.goalValidation);
      break;
    case menuOptions.savingTip:
      const tips = readTipsFile();
      const random = Math.floor(Math.random() * tips.length);
      const tip = tips[random];

      replies.push({
        type: "text",
        text: tip.title,
      });

      replies.push({
        type: "text",
        text: tip.body,
      });
      break;
    case menuOptions.showBalance:
      const transactions = user.savings.map((x) => {
        const date = new Date(x.date);
        const dateString = date.toLocaleDateString("zh-TW", {
          timeZone: "Asia/Taipei",
        });
        x.message = dateString + " - NTD" + x.amount;
        return x;
      });

      const total = transactions.reduce(getSum, 0);
      const percentage = ((total / user.amount) * 100).toFixed(2);

      const balanceMessage = { ...stateMessage.balance };
      balanceMessage.text = balanceMessage.text.replaceAll(
        "@percentage",
        percentage
      );

      replies.push(balanceMessage);
      replies.push({
        type: "text",
        text: transactions.map((x) => x.message).join("\n"),
      });
      break;
    default:
      user.state = states.waitingOption;
      replies.push(stateMessage.didntUnderstand);
      break;
  }

  return replies;
}

function getSum(total, transaction) {
  return total + Math.round(transaction.amount);
}

function readUsersFile(isVolunary) {
  if (!fs.existsSync(isVolunary ? voluntaryUsers : compulsoryUsers)) {
    fs.writeFileSync(isVolunary ? voluntaryUsers : compulsoryUsers, "");
  }
  const file = yaml.load(
    fs.readFileSync(isVolunary ? voluntaryUsers : compulsoryUsers, "utf8")
  );

  return file || [];
}

function readTipsFile() {
  if (!fs.existsSync("./tips.yml")) {
    fs.writeFileSync("./tips.yml", "");
  }
  const file = yaml.load(fs.readFileSync("./tips.yml", "utf8"));

  return file || [];
}

function updateUsersFile(isVolunary, users) {
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
