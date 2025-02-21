const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(bodyParser.json());
app.use(cors());

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

    let response = { type: "text", text: "I didn't understand that. Type 'hi' or 'progress'." };

    if (userMessage.includes("hi") || userMessage.includes("hello")) {
        response = {
            type: "welcome",
            userName: userName,
            badges: responses.badges
        };
    } 
    else if (userMessage.includes("progress")) {
        response = {
            type: "progress",
            title: responses.progressMessage.title,
            sections: responses.progressMessage.sections
        };
    }

    res.json(response);
});

// Fetch progress
app.get("/progress", (req, res) => {
    const responses = loadResponses();
    res.json({
        type: "progress",
        title: responses.progressMessage.title,
        sections: responses.progressMessage.sections
    });
});

// Remove Outcome
app.post("/remove-outcome", (req, res) => {
    const { category, index } = req.body;
    let responses = loadResponses();

    let section = responses.progressMessage.sections.find(sec => sec.category === category);
    if (section && section.items[index]) {
        section.items.splice(index, 1);
        saveResponses(responses);
        res.json({ status: "success", message: "Outcome removed successfully" });
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
        res.json({ status: "success", message: "Outcome added successfully" });
    } else {
        res.status(400).json({ status: "error", message: "Category not found" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
