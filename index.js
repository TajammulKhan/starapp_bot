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

// Health check route
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "StarApp Bot is running!" });
});

// Bot message handling
app.post("/", (req, res) => {
    console.log("📩 Received Request:", JSON.stringify(req.body, null, 2));

    const responses = loadResponses();
    const userName = req.body.user?.displayName || "User";
    const userMessage = req.body.message?.text?.toLowerCase() || "";

    let responseText = "";

    // If user asks for "progress", send the detailed structured response
    if (userMessage.includes("progress")) {
        let progressData = responses.progressMessage;

        responseText = `**${progressData.title}**\n\n`;

        progressData.sections.forEach(section => {
            responseText += `**${section.category}**\n`;
            section.items.forEach(item => {
                let coinsText = item.coins ? ` - *${item.coins} coins*` : "";
                let completeText = item.completeBy ? `(Complete by: ${item.completeBy}) ` : "";
                responseText += `${item.status} ${item.text} ${completeText}${coinsText}\n`;
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
