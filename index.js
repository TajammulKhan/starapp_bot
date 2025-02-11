const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Health check route
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "StarApp Bot is running!" });
});

// Bot message handling
app.post("/", (req, res) => {
    console.log("📩 Received Request:", JSON.stringify(req.body, null, 2));

    const userName = req.body.user?.displayName || "User";
    const userMessage = req.body.message?.text?.toLowerCase() || "";

    let responseText = "";

    // If user asks for "progress", send the second message
    if (userMessage.includes("progress")) {
        responseText = `Let's get your day started! 🚀\n\n` +
            `📌 **Set your outcomes for the day:**\n\n` +
            `📖 **Learning:**\n` +
            `✔ Algebra basics (Complete by: 12 Feb 25) - *10 coins*\n` +
            `◻ Inequalities\n` +
            `◻ Solving equations\n\n` +
            `💰 **Earning:**\n` +
            `✔ Create user specs for Dashboard screen (EOD) - *10 coins*\n` +
            `◻ Design chat view for Star App\n\n` +
            `🏅 **Contribution:**\n` +
            `✔ Create quizzes for Basics of Design lesson - *10 coins*\n\n` +
            `🔗 [Go to Star App](https://starapp.example.com)`;
    } else {
        // Default response (first message)
        responseText = `Good morning, ${userName}! ☀️\n\n` +
            `✨ *Stars don’t shine without darkness. Embrace the journey and illuminate your path!* ✨\n\n` +
            `🎉 **Impressive!** You’ve earned **50↑** coins more than yesterday!\n` +
            `🪙 **Total Coins:** 120\n` +
            `🏅 **Badges Completed:** 4/9\n\n` +
            `🔗 [Go to Star App](https://starapp.example.com)`;
    }

    res.json({ text: responseText });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
