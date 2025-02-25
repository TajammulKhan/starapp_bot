const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(bodyParser.json());

const responsesFile = "./db.json";

const loadResponses = () => JSON.parse(fs.readFileSync(responsesFile, "utf8"));
const saveResponses = (data) =>
  fs.writeFileSync(responsesFile, JSON.stringify(data, null, 2), "utf8");

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
        cardsV2: [
          {
            cardId: "daily-progress-card",
            card: {
              header: {
                title: `Good morning, ${userName}!`,
              },
              sections: [
                {
                  widgets: [
                    {
                      textParagraph: {
                        text: "<b><font color='#D4A017' size='14'>“Stars don’t shine without darkness. Embrace the journey and illuminate your path!”</font></b>",
                      },
                    },
                  ],
                },
                {
                  widgets: [
                    {
                      columns: {
                        columnItems: [
                          {
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "CENTER",
                            widgets: [
                              {
                                image: {
                                  imageUrl:
                                    "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/impressive-bot.png",
                                  altText: "Impressive Emoji",
                                },
                              },
                            ],
                          },
                          {
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "CENTER",
                            widgets: [
                              {
                                textParagraph: {
                                  text: "<b>Impressive!</b>",
                                },
                              },
                              {
                                textParagraph: {
                                  text: "You’ve earned <b><font color='#4CAF50'>50 ↑</font></b> coins more than yesterday! ✨",
                                },
                              },
                            ],
                          },
                        ],
                      },
                    },
                  ],
                },
                {
                  widgets: [
                    {
                      columns: {
                        columnItems: [
                          {
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "CENTER",
                            widgets: [
                              {
                                decoratedText: {
                                  icon: {
                                    iconUrl:
                                      "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png",
                                    altText: "Coin Icon",
                                  },
                                  text: "<b>120</b> 🔼",
                                },
                              },
                            ],
                          },
                          {
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "CENTER",
                            widgets: [
                              {
                                decoratedText: {
                                  icon: {
                                    iconUrl:
                                      "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Reward+(1)+(1).png",
                                    altText: "Badge Icon",
                                  },
                                  text: "<b>4/9</b> 🔽",
                                },
                              },
                            ],
                          },
                        ],
                      },
                    },
                  ],
                },
                {
                  widgets: [
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
          },
        ],
      });
    } else if (userMessage === "progress" || userMessage === "prog") {
      console.log("Processing 'progress' request...");
      const responses = loadResponses();
      console.log("🔍 Loaded Responses:", JSON.stringify(responses, null, 2));

      if (!responses.progressMessage || !responses.progressMessage.sections) {
        return res.json({ text: "No progress data available." });
      }

      res.json({
        "cardsV2": [
          {
            "cardId": "daily-progress-card",
            "card": {
              "header": {
                "title": "Let’s get your day started!",
                "subtitle": "Track your progress and stay motivated!",
                "imageType": "CIRCLE"
              },
              "sections": [
                {
                  "widgets": [
                    {
                      "textParagraph": {
                        "text": "<b><font size='14'>Set your outcomes for the day</font></b> <font color='#FFA500'><b>05</b></font>"
                      }
                    }
                  ]
                },
                {
                  "widgets": [
                    {
                      "textParagraph": {
                        "text": "<b>🏅 Learning</b>"
                      }
                    },
                    {
                      "textParagraph": {
                        "text": "<b>Mathematics Badge</b>"
                      }
                    },
                    {
                      "decoratedText": {
                        "text": "✔ Algebra basics",
                        "bottomLabel": "Complete by: 12 Feb 25",
                        "endIcon": {
                          "iconUrl": "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png",
                          "altText": "10 coins"
                        }
                      }
                    },
                    {
                      "decoratedText": {
                        "text": "✔ Inequalities"
                      }
                    },
                    {
                      "decoratedText": {
                        "text": "✔ Solving equations"
                      }
                    }
                  ]
                },
                {
                  "widgets": [
                    {
                      "textParagraph": {
                        "text": "<b>💰 Earning</b>"
                      }
                    },
                    {
                      "textParagraph": {
                        "text": "<b>Yesterday’s pending outcomes</b>"
                      }
                    },
                    {
                      "decoratedText": {
                        "text": "✔ Create user specs for Dashboard screen for Mobile SoundBox",
                        "bottomLabel": "Complete by: EOD",
                        "endIcon": {
                          "iconUrl": "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png",
                          "altText": "10 coins"
                        }
                      }
                    },
                    {
                      "decoratedText": {
                        "text": "✔ Design chat view for Star App"
                      }
                    },
                    {
                      "textParagraph": {
                        "text": "<b>Today’s new outcomes</b>"
                      }
                    },
                    {
                      "decoratedText": {
                        "text": "✔ <new outcome typed here>",
                        "endIcon": {
                          "iconUrl": "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png",
                          "altText": "10 coins"
                        }
                      }
                    },
                    {
                      "decoratedText": {
                        "text": "✔ <new outcome typed here>",
                        "endIcon": {
                          "iconUrl": "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png",
                          "altText": "10 coins"
                        }
                      }
                    }
                  ]
                },
                {
                  "widgets": [
                    {
                      "textParagraph": {
                        "text": "<b>🎖 Contribution</b>"
                      }
                    },
                    {
                      "decoratedText": {
                        "text": "✔ Create quizzes for Basics of Design lesson assessment",
                        "endIcon": {
                          "iconUrl": "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png",
                          "altText": "10 coins"
                        }
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
    }  else {
      res.json({
        text: "I didn't understand that. Type **'hi'** to see your progress.",
      });
    }
  } catch (error) {
    console.error("❌ Error handling request:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Remove Outcome
app.post("/remove-outcome", (req, res) => {
  const { category, index } = req.body;
  let responses = loadResponses();

  let section = responses.progressMessage.sections.find(
    (sec) => sec.category === category
  );
  if (section && section.items[index]) {
    section.items.splice(index, 1);
    saveResponses(responses);
    res.json({
      status: "success",
      message: `✅ Outcome removed from **${category}**`,
    });
  } else {
    res.status(400).json({ status: "error", message: "Outcome not found" });
  }
});

// Add Outcome
app.post("/add-outcome", (req, res) => {
  const { category, text, coins = 0 } = req.body;
  let responses = loadResponses();

  let section = responses.progressMessage.sections.find(
    (sec) => sec.category === category
  );
  if (section) {
    section.items.push({ status: "◻", text, coins });
    saveResponses(responses);
    res.json({
      status: "success",
      message: `✅ Outcome added to **${category}**`,
    });
  } else {
    res.status(400).json({ status: "error", message: "Category not found" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
