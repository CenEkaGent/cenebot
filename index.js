var fs = require('fs');
var MongoClient = require('mongodb').MongoClient;

const url = 'mongodb://localhost:27017/cenebot';
var db = null;

MongoClient.connect(url, function(err, db_scope) {
    if (err === null) {
        db = db_scope;
        console.log("Connected successfully to server");
    } else {
        console.log("Problem connecting to the database.");
        console.log(err);
        process.exit(1);
    }
});

var RtmClient = require('@slack/client').RtmClient;
const CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
const RTM_EVENTS = require('@slack/client').RTM_EVENTS;

const token = fs.readFileSync('token.txt', 'utf8').trim();
const bot = new RtmClient(token);

var teamData;
var userIdToUserData = {};

bot.on(CLIENT_EVENTS.RTM.AUTHENTICATED, function (botStartData) {
    var message = `Logged in as ${botStartData.self.name} of team ${botStartData.team.name}, `;
    if (botStartData.channels.length == 0 && botStartData.groups.length == 0)
        message += `but not yet connected to a channel`;
    else {
        message += `and is connected to the following channels:\n`;
        for (const c of botStartData.channels) {
            if (c.is_member)
                message += `#${c.name}\n`;
        }
        for (const c of botStartData.groups) {
            if (c.members.find(function(element) { return element == bot.activeUserId; }))
                message += `#${c.name}\n`;
        }
    }
    console.log(message);

    teamData = botStartData;

    extractUserData(teamData.users);
});

bot.on(RTM_EVENTS.MESSAGE, function(message) {
    const type = message.subtype || 'message_new';
    switch (type) {
        case "message_new":
        case "file_share":
            const data = {
                from: message.user,
                channel: message.channel,
                text: message.text
            };
            if (data.text.startsWith(`<@${bot.activeUserId}>`)) {
                data.text = data.text.replace(`<@${bot.activeUserId}>`, "").trim();
                processMessage(data);
            } else if (data.text.startsWith(`@cenebot`)) {
                data.text = data.text.replace(`@${teamData.self.name}`, "").trim();
                processMessage(data);
            }
            break;
    
        case "message_changed":
            // Do nothing (for now)
            break;

        case "message_deleted":
            // Do nothing (for now)
            break;

        default:
            // Log unknown message types, for future reference
            fs.appendFile('unknown-message-types.txt', type + '\n', function (err) {});
            break;
    }
});

/*
 * data: [JSON] {
 *     from: [string] userId,
 *     channel: [string] channelId,
 *     text: [string] content 
 * }
 * 
 * returns: void
 */
function processMessage(data) {
    if (data.text.length === 0) {
        // Reply the tag message
        const user = userIdToUserData[data.from];
        var name = "";
        if (user === undefined) {
            debugMessage(`Could not lookup user with id: ${data.from}.\n\`\`\`data = {\n\tfrom: ${data.from},\n\tchannel: ${data.channel}\n\ttext: ${data.text}\n}\`\`\``);
        } else {
            if (user.first_name) {
                name = ` ${user.first_name}`;
            } else {
                name = ` ${user.real_name}`;
            }
        }

        if (db === null) {
            debugMessage("Trying to post tag message without database connection");
        } else {
            let tagMessages = db.collection("tagMessages");
            tagMessages.find({}).toArray((err, tagMessages) => {
                let message = tagMessages[Math.floor(Math.random() * tagMessages.length)].text;
                message = message.replace(":name:", name);
                bot.sendMessage(message, data.channel, (err, msg) => {});
            });
        }
    } else {
        let command = data.text.split(" ")[0];
        if (command === "addTagMessage") {
            data.text = data.text.replace("addTagMessage", "").trim();
            let tagMessages = db.collection("tagMessages");
            tagMessages.insertOne({ text: data.text }, (err, result) => {
                bot.sendMessage("The tag message has been added to the list.", data.channel, (err, msg) => {});
            });
        } else if (command === "removeTagMessage") {

        } else if (command === "showTagMessages") {
            let tagMessages = db.collection("tagMessages");
            tagMessages.find({}).toArray((err, tagMessages) => {
                let tagMessage = "```";
                tagMessages.forEach(function(tagMessage) {
                    tagMessage += `id: ${tagMessage._id}, text: "${tagMessage.text}"\n`;
                }, this);
                let tagMessage = "```";
                bot.sendMessage(tagMessage, data.channel, (err, msg) => {});
            });
        }
    }
}

/*
 * users [Array] as defined in the Slack API
 * 
 * returns: object that maps user ids to the data for easier lookup
 */
function extractUserData(users) {
    users.forEach(function(user) {
        userIdToUserData[user.id] = user.profile;
    }, this);
}

/*
 * message: [string] message to send to the debug channel
 */
function debugMessage(message) {
    bot.sendMessage(message, "G7L4DUD6F", (err, msg) => {});
}

bot.start();