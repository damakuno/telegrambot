const fs = require("fs");
const path = require("path");
let config_file = fs.readFileSync("config.json");
let config = JSON.parse(config_file);
const haikudos = require("haikudos");
const _ = require("lodash");
const TelegramBot = require("node-telegram-bot-api");
const chrono = require("chrono-node");
// replace the value below with the Telegram token you receive from @BotFather
const token = config.token;
const commandPrefix = config.commandPrefix;
// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });
const cron = require("cron");

const MongoClient = require("mongodb").MongoClient;
const uri = `mongodb+srv://${config.mongodb.user}:${config.mongodb.pass}@protocluster.wngrr.mongodb.net/${config.mongodb.dbname}?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true });

client.connect((err) => {
  let knownCommands = { haiku, todo };
  // Function called when the "haiku" command is issued:
  function haiku(params, message, callback) {
    // Generate a new haiku:
    haikudos((newHaiku) => {
      // Split it line-by-line:
      callback(`\n${newHaiku.split("\n")}`);
    });
  }

  function todo(params, message, callback) {
    if (params.length > 0) {
      let dt = chrono.parse(params.join(" "));
      let text = params.join(" ").substring(0, dt[0].index - 1);
      let date = dt[0].start.date();
      const collection = client.db("dama").collection("todo");
      // perform actions on the collection object
      collection.insertOne({ type: "test", text: text, current_date: new Date(), todo_date: date, chat: message.chat, user: message.from });
      callback(`I will remind you: "${text}" at ${new Date(date)}`);
    }
  }

  function parseCommand(msg, callback) {
    // Split the message into individual words:
    const parse = msg.text.slice(1).split(" ");
    // The command name is the first (0th) one:
    const commandName = parse[0].toLowerCase();
    // The rest (if any) are the parameters:
    const params = parse.splice(1);

    if (commandName in knownCommands) {
      // Retrieve the function by its name:
      const command = _.debounce(knownCommands[commandName], 500);
      // Then call the command with parameters:
      console.log(`* Executed ${commandName} command for ${msg.from.username}`);

      command(params, msg, (result) => {
        callback(result);
      });
    } else {
      console.log(`* Unknown command ${commandName} from ${msg.from.username}`);
    }
  }

  bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    if (msg.text.substr(0, 1) === commandPrefix) {
      parseCommand(msg, (result) => {
        bot.sendMessage(chatId, result);
      });
    }
  });

  let reminder_job = cron.job("*/1 * * * *", () => {
    const collection = client.db("dama").collection("todo");
    let cur_date = new Date();
    collection.updateMany({}, { $set: { current_date: cur_date } });

    collection.find({ $expr: { $lt: [{ $subtract: ["$todo_date", "$current_date"] }, 1000 * 60 * 5] } }).toArray((err, todos) => {
      for (let todo of todos) {
        console.log(todo);
        let content = todo.text;
        bot.sendMessage(todo.chat.id, content, { parse_mode: "markdown" });
        collection.deleteOne({ _id: todo._id });
      }
    });
  });

  reminder_job.start();
});
