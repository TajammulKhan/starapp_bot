const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const cors = require('cors');
const app = express();
app.use(cors());

app.use(bodyParser.json());

const responsesFile = "./db.json";

const loadResponses = () => JSON.parse(fs.readFileSync(responsesFile, "utf8"));
const saveResponses = (data) => fs.writeFileSync(responsesFile, JSON.stringify(data, null, 2), "utf8");

// Health Check
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "StarApp Bot is running!" });
});

// Handle bot interactions
app.post("/", (req, res) => {
    console.log("📩 Received Request:", JSON.stringify(req.body, null, 2));
    const responses = loadResponses();

    const userName = req.body.user?.displayName || "User";
    const userMessage = req.body.message?.text?.toLowerCase() || "";

    let responseText = "";

    // Check user input
    if (userMessage.includes("hi") || userMessage.includes("hello")) {
        responseText = responses.defaultMessage.replace("{{userName}}", userName);
        responseText = responseText.replace("{{badges}}", responses.badges.join("\n"));
    } 
    else if (userMessage.includes("progress")) {
        let progressData = responses.progressMessage;
        responseText = `**${progressData.title}**\n\n`;

        progressData.sections.forEach(section => {
            responseText += `**${section.category}**\n`;
            section.items.forEach((item, index) => {
                let coinsText = item.coins ? ` - *${item.coins} coins*` : "";
                let completeText = item.completeBy ? `(Complete by: ${item.completeBy})` : "";
                responseText += `${item.status} ${item.text} ${completeText} ${coinsText} [➖ Remove](remove_outcome_${section.category}_${index})\n`;
            });
            responseText += "\n";
        });
    } 
    else {
        responseText = "I didn't understand that. Type 'hi' to see your badges or 'progress' to see your progress.";
    }

    res.json({ text: responseText });
});

// Fetch progress
app.get("/progress", (req, res) => {
    const responses = loadResponses();
    let progressData = responses.progressMessage;
    let responseText = `**${progressData.title}**\n\n`;

    progressData.sections.forEach(section => {
        responseText += `**${section.category}**\n`;
        section.items.forEach((item, index) => {
            let coinsText = item.coins ? ` - *${item.coins} coins*` : "";
            let completeText = item.completeBy ? `(Complete by: ${item.completeBy})` : "";
            responseText += `${item.status} ${item.text} ${completeText} ${coinsText} [➖ Remove](remove_outcome_${section.category}_${index})\n`;
        });
        responseText += "\n";
    });

    res.json({ text: responseText });
});

// Remove Outcome
app.post("/remove-outcome", (req, res) => {
    const { category, index } = req.body;
    let responses = loadResponses();

    let section = responses.progressMessage.sections.find(sec => sec.category === category);
    if (section && section.items[index]) {
        section.items.splice(index, 1);
        saveResponses(responses);
        res.json({ status: "success", message: `✅ Outcome removed from **${category}**` });
    } else {
        res.status(400).json({ status: "error", message: "Outcome not found" });
    }
});

// Add Outcome
app.post("/add-outcome", (req, res) => {
    const { category, text, coins = 0 } = req.body;
    let responses = loadResponses();

    let section = responses.progressMessage.sections.find(sec => sec.category === category);
    if (section) {
        section.items.push({ status: "◻", text, coins });
        saveResponses(responses);
        res.json({ status: "success", message: `✅ Outcome added to **${category}**` });
    } else {
        res.status(400).json({ status: "error", message: "Category not found" });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
