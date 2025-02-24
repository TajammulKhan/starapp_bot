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
                    "cardId": "unique-card-id",
                    "card": {
                      "header": {
                         "title": "Sasha",
                         "subtitle": "Software Engineer",
                         "imageUrl":
                         "https://developers.google.com/workspace/chat/images/quickstart-app-avatar.png",
                         "imageType": "CIRCLE",
                         "imageAltText": "Avatar for Sasha"
                       },
                       "sections": [
                         {
                           "header": "Contact Info",
                           "collapsible": true,
                           "uncollapsibleWidgetsCount": 1,
                           "widgets": [
                             {
                               "decoratedText": {
                                 "startIcon": {
                                   "knownIcon": "EMAIL"
                                 },
                                 "text": "sasha@example.com"
                               }
                             },
                             {
                               "decoratedText": {
                                 "startIcon": {
                                   "knownIcon": "PERSON"
                                 },
                                 "text": "<font color=\"#80e27e\">Online</font>"
                               }
                             },
                             {
                               "decoratedText": {
                                 "startIcon": {
                                   "knownIcon": "PHONE"
                                 },
                                 "text": "+1 (555) 555-1234"
                               }
                             },
                             {
                               "buttonList": {
                                 "buttons": [
                                   {
                                     "text": "Share",
                                     "onClick": {
                                      "openLink": {
                                         "url": "https://example.com/share"
                                       }
                                     }
                                   },
                                   {
                                     "text": "Edit",
                                     "onClick": {
                                       "action": {
                                         "function": "goToView",
                                         "parameters": [
                                           {
                                             "key": "viewType",
                                             "value": "EDIT"
                                           }
                                         ]
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
