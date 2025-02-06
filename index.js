const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Health check route (optional but useful)
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "StarApp Bot is running!" });
});

// Bot message handling
app.post("/", (req, res) => {
    console.log("Received message:", req.body);

    const responseText = `
        Hello! Here's your daily StarApp update:\n
        - You have completed 2 badges today! 🎉\n
        - You earned 10 coins 🪙\n
        - Keep up the great work! 🚀
    `;

    res.json({ text: responseText.trim() }); // Google Chat expects a JSON response
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
