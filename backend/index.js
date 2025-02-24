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
    try {
        console.log("📩 Received Request:", JSON.stringify(req.body, null, 2));

        const userMessage = req.body?.message?.text?.trim().toLowerCase() || "";
        const userName = req.body?.message?.sender?.displayName || "User";

        if (!userMessage) {
            return res.status(400).json({ message: "No message found in request." });
        }

        if (userMessage === "hi" || userMessage === "hello") {
            res.json({
                "cardsV2": [
                  {
                    "cardId": "daily-progress-card",
                    "card": {
                      "header": {
                        "title": "Good morning, Muthu!",
                        "imageType": "CIRCLE",
                        "imageAltText": "Morning Icon"
                      },
                      "sections": [
                        {
                          "widgets": [
                            {
                              "textParagraph": {
                                "text": "<b><font color='#D4A017' size='14'>“ Stars don’t shine without darkness. Embrace the journey and illuminate your path! ”</font></b>"
                              }
                            }
                          ]
                        },
                        {
                          "widgets": [
                            {
                              "image": {
                                "imageUrl": "https://postimg.cc/MnZz0Jsn",
                                "altText": "Impressive Emoji"
                              }
                            },
                            {
                              "textParagraph": {
                                "text": "<b>Impressive!</b>"
                              }
                            },
                            {
                              "textParagraph": {
                                "text": "You’ve earned <b><font color='#4CAF50'>50 ↑</font></b> coins more than yesterday! ✨"
                              }
                            }
                          ]
                        },
                        {
                          "widgets": [
                            {
                              "columns": {
                                "columnItems": [
                                  {
                                    "horizontalAlignment": "CENTER",
                                    "verticalAlignment": "CENTER",
                                    "widgets": [
                                      {
                                        "image": {
                                          "imageUrl": "https://drive.google.com/file/d/1lWu_YaDkjAp0sEjbAQnowiR4pJ_DfYJV/view?usp=drive_link",
                                          "altText": "Coin Icon"
                                        }
                                      },
                                      {
                                        "textParagraph": {
                                          "text": "<b>120</b> 🔼"
                                        }
                                      }
                                    ]
                                  },
                                  {
                                    "horizontalAlignment": "CENTER",
                                    "verticalAlignment": "CENTER",
                                    "widgets": [
                                      {
                                        "image": {
                                          "imageUrl": "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Reward+(1).png",
                                          "altText": "Badge Icon"
                                        }
                                      },
                                      {
                                        "textParagraph": {
                                          "text": "<b>4/9</b> 🔽"
                                        }
                                      }
                                    ]
                                  }
                                ]
                              }
                            }
                          ]
                        },
                        {
                          "widgets": [
                            {
                              "buttonList": {
                                "buttons": [
                                  {
                                    "text": "Go to Star App →",
                                    "onClick": {
                                      "openLink": {
                                        "url": "https://starapp.example.com"
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
              }              
              );
        } else {
            res.json({
                text: "I didn't understand that. Type **'hi'** to see your progress."
            });
        }

    } catch (error) {
        console.error("❌ Error handling request:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});



// Fetch progress
app.get("/progress", (req, res) => {
    const responses = loadResponses();
    const progressData = responses.progressMessage;

    res.json({
        cardsV2: [
            {
                cardId: "outcomeCard",
                card: {
                    header: {
                        title: "Set your outcomes for the day",
                        subtitle: "📌 05",
                        imageUrl: "https://example.com/task-icon.png", // Replace with actual icon
                        imageType: "SQUARE"
                    },
                    sections: progressData.sections.map(section => ({
                        header: section.category,
                        widgets: section.items.map(item => ({
                            decoratedText: {
                                text: `✔ ${item.text}`,
                                bottomLabel: item.completeBy ? `Complete by: ${item.completeBy}` : "",
                                endIcon: item.coins ? { iconUrl: "https://example.com/coin-icon.png", altText: `${item.coins} coins` } : null
                            }
                        }))
                    }))
                }
            }
        ]
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
