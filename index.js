const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Root endpoint to check if the bot is running
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "StarApp Bot is running!" });
});

// Endpoint to handle Google Chat messages
app.post("/", (req, res) => {
    console.log("Received request body:", JSON.stringify(req.body, null, 2));

    // Extract the user's message correctly
    const userMessage = req.body?.message?.argumentText?.trim().toLowerCase() ||
                        req.body?.message?.text?.trim().toLowerCase() || "";

    console.log("User message received:", userMessage); // Debugging log

    // Define greeting keywords
    const greetings = ["hi", "hello", "hey", "start"];

    if (greetings.includes(userMessage)) {
        // Respond with a greeting and a card
        return res.json({
            text: "👋 Hello, Tajammul! StarApp Bot is here to assist you. How can I help you today?",
            cardsV2: [
                {
                    cardId: "greeting_card",
                    card: {
                        header: {
                            title: "🌟 Star Bot",
                            subtitle: "Welcome, Tajammul!",
                            imageUrl: "https://imgur.com/8ghPwci.png",
                            imageType: "CIRCLE"
                        },
                        sections: [
                            {
                                widgets: [
                                    {
                                        textParagraph: {
                                            text: "*✨ Stars don’t shine without darkness. Embrace the journey and illuminate your path! ✨*"
                                        }
                                    },
                                    {
                                        decoratedText: {
                                            startIcon: {
                                                knownIcon: "STAR"
                                            },
                                            text: "**Impressive!**\nYou've earned *50 ⬆ coins more* than yesterday! 🎉"
                                        }
                                    },
                                    {
                                        columns: {
                                            columnItems: [
                                                {
                                                    horizontalAlignment: "CENTER",
                                                    text: "**🪙 120**",
                                                    subtext: "Total Coins"
                                                },
                                                {
                                                    horizontalAlignment: "CENTER",
                                                    text: "**🏅 4/9**",
                                                    subtext: "Badges Completed"
                                                }
                                            ]
                                        }
                                    },
                                    {
                                        buttonList: {
                                            buttons: [
                                                {
                                                    text: "Go to Star App →",
                                                    onClick: {
                                                        openLink: {
                                                            url: "https://www.google.com/"
                                                        }
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        });
    }

    // Default response for unrecognized inputs
    return res.json({
        text: "I'm here to help! Type 'hi' or 'hello' to get started."
    });
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
