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

    const userName = req.body.user || "User"; // Default to "User" if not provided

    const response = {
        text: `Good morning, ${userName}!`,
        cards: [
            {
                header: {
                    title: "✨ Stars don’t shine without darkness. Embrace the journey and illuminate your path! ✨",
                },
                sections: [
                    {
                        widgets: [
                            {
                                textParagraph: {
                                    text: "**Impressive!** You’ve earned **50↑** coins more than yesterday! 🎉",
                                },
                            },
                            {
                                keyValue: {
                                    topLabel: "Total Coins",
                                    content: "120 🪙",
                                },
                            },
                            {
                                keyValue: {
                                    topLabel: "Badges Completed",
                                    content: "4/9 🏅",
                                },
                            },
                            {
                                buttonList: {
                                    buttons: [
                                        {
                                            text: "Go to Star App →",
                                            onClick: {
                                                openLink: {
                                                    url: "https://starapp.example.com",
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                ],
            },
            {
                header: {
                    title: "📌 Set your outcomes for the day",
                },
                sections: [
                    {
                        header: "📖 Learning",
                        widgets: [
                            {
                                textParagraph: {
                                    text: "**Mathematics Badge**",
                                },
                            },
                            {
                                keyValue: {
                                    content: "✔ Algebra basics (Complete by: 12 Feb 25)",
                                    bottomLabel: "10 🪙",
                                },
                            },
                            {
                                keyValue: {
                                    content: "◻ Inequalities",
                                },
                            },
                            {
                                keyValue: {
                                    content: "◻ Solving equations",
                                },
                            },
                        ],
                    },
                    {
                        header: "💰 Earning",
                        widgets: [
                            {
                                textParagraph: {
                                    text: "**Yesterday’s pending outcomes**",
                                },
                            },
                            {
                                keyValue: {
                                    content: "✔ Create user specs for Dashboard screen for Mobile SoundBox (Complete by: EOD)",
                                    bottomLabel: "10 🪙",
                                },
                            },
                            {
                                keyValue: {
                                    content: "◻ Design chat view for Star App",
                                },
                            },
                            {
                                textParagraph: {
                                    text: "**Today’s new outcomes**",
                                },
                            },
                            {
                                keyValue: {
                                    content: "◻ <new outcome typed here>",
                                    bottomLabel: "10 🪙",
                                },
                            },
                            {
                                keyValue: {
                                    content: "◻ <new outcome typed here>",
                                    bottomLabel: "10 🪙",
                                },
                            },
                        ],
                    },
                    {
                        header: "🏅 Contribution",
                        widgets: [
                            {
                                keyValue: {
                                    content: "✔ Create quizzes for Basics of Design lesson assessment",
                                    bottomLabel: "10 🪙",
                                },
                            },
                        ],
                    },
                ],
            },
            {
                widgets: [
                    {
                        buttonList: {
                            buttons: [
                                {
                                    text: "SUBMIT",
                                    onClick: {
                                        action: {
                                            actionMethodName: "submitOutcomes",
                                        },
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };

    res.json(response); // Google Chat expects a JSON response with cards
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
