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

    let responseBlocks = [];

    if (userMessage.includes("hi") || userMessage.includes("hello")) {
        responseBlocks.push({
            type: "section",
            text: `**Good morning, ${userName}!**\n\n 🌟 *"Stars don’t shine without darkness. Embrace the journey and illuminate your path!"*`,
            style: "quote"
        });

        responseBlocks.push({
            type: "card",
            title: "Impressive! 🎉",
            subtitle: "You've earned **50⬆ coins** more than yesterday! ✨",
            stats: [
                { label: "Coins", value: "120", trend: "up" },
                { label: "Badges", value: "4/9", trend: "down" }
            ],
            link: { text: "Go to Star App ➝", url: "https://starapp.example.com" }
        });
    } else if (userMessage.includes("progress")) {
        let progressData = responses.progressMessage;

        responseBlocks.push({
            type: "section",
            text: `**📊 Set your outcomes for the day (05)**`,
            action: "edit"
        });

        progressData.sections.forEach(section => {
            let items = section.items.map(item => ({
                text: `${item.status} ${item.text} ${(item.completeBy ? `(Complete by: ${item.completeBy})` : "")} - **${item.coins} coins**`,
                action: "remove"
            }));

            responseBlocks.push({
                type: "list",
                title: section.category,
                items: items
            });
        });

        responseBlocks.push({
            type: "button",
            label: "SUBMIT",
            action: "submit"
        });
    } else {
        responseBlocks.push({
            type: "text",
            text: "I didn't understand that. Type **'hi'** to see your badges or **'progress'** to see your progress."
        });
    }

    res.json({ blocks: responseBlocks });
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
