const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

app.get("/", (req, res) => {
    res.json({ status: "ok", message: "StarApp Bot is running!" });
});

app.post("/", (req, res) => {
    console.log("Received message:", req.body);

    const response = {
        "cardsV2": [
            {
                "cardId": "morning_summary",
                "card": {
                    "header": {
                        "title": "🌟 Star Bot",
                        "subtitle": "Good morning, Muthu!",
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
            },
            {
                "cardId": "daily_outcomes",
                "card": {
                    "header": {
                        "title": "🎯 Set your outcomes for the day",
                        "subtitle": "Let's get your day started!",
                        "imageUrl": "https://imgur.com/8ghPwci",
                        "imageType": "CIRCLE"
                    },
                    "sections": [
                        {
                            "header": "📚 Learning",
                            "widgets": [
                                {
                                    "textParagraph": {
                                        "text": "**Mathematics Badge**\n✔️ Algebra basics _(Complete by: 12 Feb 25)_\n✔️ Inequalities\n✔️ Solving equations"
                                    }
                                },
                                {
                                    "decoratedText": {
                                        "startIcon": { "knownIcon": "STAR" },
                                        "text": "**+10 Coins**"
                                    }
                                }
                            ]
                        },
                        {
                            "header": "💰 Earning",
                            "widgets": [
                                {
                                    "textParagraph": {
                                        "text": "**Yesterday's pending outcomes:**\n✔️ Create user specs for Dashboard _(Complete by: EOD)_\n✔️ Design chat view for Star App"
                                    }
                                },
                                {
                                    "textParagraph": {
                                        "text": "**Today's new outcomes:**\n🔲 <new outcome typed here>\n🔲 <new outcome typed here>"
                                    }
                                },
                                {
                                    "decoratedText": {
                                        "startIcon": { "knownIcon": "STAR" },
                                        "text": "**+10 Coins each**"
                                    }
                                }
                            ]
                        },
                        {
                            "header": "🤝 Contribution",
                            "widgets": [
                                {
                                    "textParagraph": {
                                        "text": "✔️ Create quizzes for Basics of Design lesson assessment"
                                    }
                                },
                                {
                                    "decoratedText": {
                                        "startIcon": { "knownIcon": "STAR" },
                                        "text": "**+10 Coins**"
                                    }
                                }
                            ]
                        },
                        {
                            "buttonList": {
                                "buttons": [
                                    {
                                        "text": "SUBMIT",
                                        "onClick": {
                                            "action": {
                                                "function": "submitOutcomes"
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            }
        ]
    };

    res.json(response);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
