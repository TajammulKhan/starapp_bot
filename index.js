const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
app.use(bodyParser.json());

const responsesFile = "./responses.json";

// Function to load responses from JSON file
const loadResponses = () => {
    if (!fs.existsSync(responsesFile)) {
        return { progressMessage: { sections: [] } };
    }
    const data = fs.readFileSync(responsesFile, "utf8");
    return JSON.parse(data);
};

// Function to save updated responses to JSON file
const saveResponses = (data) => {
    fs.writeFileSync(responsesFile, JSON.stringify(data, null, 2), "utf8");
};

// Health check route
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "StarApp Bot is running!" });
});

// Bot message handling
app.post("/", (req, res) => {
    console.log("📩 Received Request:", JSON.stringify(req.body, null, 2));

    let responses = loadResponses();
    const userName = req.body.user?.displayName || "User";
    const userMessage = req.body.message?.text?.toLowerCase() || "";

    let responseText = "";

    // If user asks for "progress", send the detailed structured response
    if (userMessage.includes("progress")) {
        let progressData = responses.progressMessage;

        responseText = `**${progressData.title}**\n\n`;

        progressData.sections.forEach((section) => {
            responseText += `**${section.category}**\n`;
            section.items.forEach((item, index) => {
                let coinsText = item.coins ? ` - *${item.coins} coins*` : "";
                let completeText = item.completeBy ? `(Complete by: ${item.completeBy}) ` : "";
                let removeButton = ` [- Remove Outcome](#remove_${section.category}_${index})`; // Dynamic remove link
                responseText += `${item.status} ${item.text} ${completeText}${coinsText} ${removeButton}\n`;
            });
            responseText += `\n`;
        });

        responseText += `🔗 [Go to Star App](https://starapp.example.com)`;
    } else if (userMessage.startsWith("remove")) {
        // Handling outcome removal
        let match = userMessage.match(/remove_(.*?)_(\d+)/);
        if (match) {
            let category = match[1];
            let index = parseInt(match[2]);

            let section = responses.progressMessage.sections.find((sec) => sec.category === category);
            if (section && section.items[index]) {
                section.items.splice(index, 1); // Remove the outcome
                saveResponses(responses);
                responseText = `✅ Outcome removed from **${category}**. Type "progress" to view updates.`;
            } else {
                responseText = `⚠️ Outcome not found!`;
            }
        } else {
            responseText = `⚠️ Invalid remove request format.`;
        }
    } else {
        // Default greeting message
        responseText = responses.defaultMessage.replace("{{userName}}", userName);
    }

    res.json({ text: responseText });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
