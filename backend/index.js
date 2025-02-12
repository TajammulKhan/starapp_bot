const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
app.use(bodyParser.json());

const responsesFile = "./responses.json";

// Function to load responses from JSON file
const loadResponses = () => {
    const data = fs.readFileSync(responsesFile, "utf8");
    return JSON.parse(data);
};

// Function to save updated responses back to file
const saveResponses = (data) => {
    fs.writeFileSync(responsesFile, JSON.stringify(data, null, 2), "utf8");
};

// Health check route
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "StarApp Bot is running!" });
});

// Handle removing an outcome interactively
app.post("/remove-outcome", (req, res) => {
    console.log("🗑️ Remove Outcome Request:", JSON.stringify(req.body, null, 2));

    const { category, index } = req.body;
    let responses = loadResponses();

    const section = responses.progressMessage.sections.find(sec => sec.category === category);
    if (section && section.items[index]) {
        section.items.splice(index, 1); // Remove the item
        saveResponses(responses);
        res.json({ status: "success", message: `✅ Outcome removed from **${category}**`, updatedProgress: responses.progressMessage });
    } else {
        res.status(400).json({ status: "error", message: "Outcome not found" });
    }
});

// Handle bot interactions
app.post("/", (req, res) => {
    console.log("📩 Received Request:", JSON.stringify(req.body, null, 2));

    const responses = loadResponses();
    const userName = req.body.user?.displayName || "User";
    const userMessage = req.body.message?.text?.toLowerCase() || "";

    let responseText = "";

    // Check if the user is trying to remove an outcome
    if (userMessage.startsWith("remove_outcome_")) {
        const parts = userMessage.split("_");
        const category = parts.slice(2, parts.length - 1).join(" ");
        const index = parseInt(parts[parts.length - 1]);

        let section = responses.progressMessage.sections.find(sec => sec.category === category);
        if (section && section.items[index]) {
            section.items.splice(index, 1); // Remove the outcome
            saveResponses(responses);

            responseText = `✅ Outcome removed from **${category}**.\n\n`;
        } else {
            responseText = `⚠️ Could not find the outcome in **${category}**.\n\n`;
        }
    }

    // If user asks for "progress", send the structured response
    if (userMessage.includes("progress") || userMessage.startsWith("remove_outcome_")) {
        let progressData = responses.progressMessage;

        responseText += `**${progressData.title}**\n\n`;

        progressData.sections.forEach(section => {
            responseText += `**${section.category}**\n`;
            section.items.forEach((item, index) => {
                let coinsText = item.coins ? ` - *${item.coins} coins*` : "";
                let completeText = item.completeBy ? `(Complete by: ${item.completeBy}) ` : "";
                responseText += `${item.status} ${item.text} ${completeText}${coinsText} [➖ Remove](remove_outcome_${section.category}_${index})\n`;
            });
            responseText += `\n`;
        });

        responseText += `🔗 [Go to Star App](https://starapp.example.com)`;
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
