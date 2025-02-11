const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

app.get("/", (req, res) => {
    res.json({ status: "ok", message: "StarApp Bot is running!" });
});

app.post("/", (req, res) => {
    console.log("Received request body:", JSON.stringify(req.body, null, 2));

    const userMessage = (req.body.text || req.body.argumentText || "").toLowerCase();

    // Check if user has sent a greeting or opened the bot
    const greetings = ["hi", "hello", "hey", "start"];
    if (greetings.includes(userMessage)) {
        return res.json({
            "cardsV2": [
                {
                    "cardId": "morning_summary",
                    "card": {
                        "header": {
                            "title": "🌟 Star Bot",
                            "subtitle": "Good morning, Tajammul!",
                            "imageUrl": "https://imgur.com/8ghPwci",
                            "imageType": "CIRCLE"
                        },
                        "sections": [
                            {
                                "widgets": [
                                    {
                                        "textParagraph": {
                                            "text": "*✨ Stars don’t shine without darkness. Embrace the journey and illuminate your path! ✨*"
                                        }
                                    },
                                    {
                                        "decoratedText": {
                                            "startIcon": {
                                                "knownIcon": "STAR"
                                            },
                                            "text": "**Impressive!**\nYou've earned *50 ⬆ coins more* than yesterday! 🎉"
                                        }
                                    },
                                    {
                                        "columns": {
                                            "columnItems": [
                                                {
                                                    "horizontalAlignment": "CENTER",
                                                    "text": "**🪙 120**",
                                                    "subtext": "Total Coins"
                                                },
                                                {
                                                    "horizontalAlignment": "CENTER",
                                                    "text": "**🏅 4/9**",
                                                    "subtext": "Badges Completed"
                                                }
                                            ]
                                        }
                                    },
                                    {
                                        "buttonList": {
                                            "buttons": [
                                                {
                                                    "text": "Go to Star App →",
                                                    "onClick": {
                                                        "openLink": {
                                                            "url": "https://www.google.com/"
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
    res.json({
        text: "I'm here to help! Type 'hi' or 'hello' to get started."
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
