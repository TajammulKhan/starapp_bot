const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const responsesFile = "./db.json";

const loadResponses = () => JSON.parse(fs.readFileSync(responsesFile, "utf8"));

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
    const responses = loadResponses();

    if (!userMessage) {
      return res.status(400).json({ message: "No message found in request." });
    }

    if (userMessage === "hi" || userMessage === "hello") {
      const { title, quote, coinsEarned, totalCoins, totalBadges } = responses.dailyProgress;

      return res.json({
        cardsV2: [
          {
            cardId: "daily-progress-card",
            card: {
              header: { title: `${title}, ${userName}!` },
              sections: [
                {
                  widgets: [
                    { textParagraph: { text: `<b><font color='#D4A017' size='14'>${quote}</font></b>` } }
                  ]
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
                              { image: { imageUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/impressive-bot.png", altText: "Impressive Emoji" } }
                            ]
                          },
                          {
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "CENTER",
                            widgets: [
                              { textParagraph: { text: "<b>Impressive!</b>" } },
                              { textParagraph: { text: `You’ve earned <b><font color='#4CAF50'>${coinsEarned} ↑</font></b> coins more than yesterday! ✨` } }
                            ]
                          }
                        ]
                      }
                    }
                  ]
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
                              { decoratedText: { icon: { iconUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png", altText: "Coin Icon" }, text: `<b>${totalCoins}</b> 🔼` } }
                            ]
                          },
                          {
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "CENTER",
                            widgets: [
                              { decoratedText: { icon: { iconUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Reward+(1)+(1).png", altText: "Badge Icon" }, text: `<b>${totalBadges}</b> 🔽` } }
                            ]
                          }
                        ]
                      }
                    }
                  ]
                },
                {
                  widgets: [
                    {
                      buttonList: {
                        buttons: [
                          { text: "Go to Star App →", onClick: { openLink: { url: "https://starapp.example.com" } } }
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
    } else if (userMessage === "progress" || userMessage === "prog") {
      console.log("Processing 'progress' request...");
      
      const progressData = responses.progressMessage;
      if (!progressData) {
        return res.json({ text: "No progress data available." });
      }

      return res.json({
        cardsV2: [
          {
            cardId: "daily-progress-card",
            card: {
              header: {
                title: progressData.title,
                subtitle: progressData.subtitle,
                imageType: "CIRCLE"
              },
              sections: progressData.outcomes.map(category => ({
                widgets: [
                  { textParagraph: { text: `<b>🏅 ${category.category}</b>` } },
                  { textParagraph: { text: `<b>${category.title}</b>` } },
                  ...category.items.map(item => ({
                    decoratedText: {
                      text: `${item.text}`,
                      bottomLabel: item.deadline ? `Complete by: ${item.deadline}` : undefined,
                      endIcon: item.coins ? { iconUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png", altText: `${item.coins} coins` } : undefined
                    }
                  }))
                ]
              }))
            }
          }
        ]
      });
    } else {
      return res.json({ text: "I didn't understand that. Type **'hi'** to see your progress." });
    }
  } catch (error) {
    console.error("❌ Error handling request:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Add Outcome
app.post("/add-outcome", (req, res) => {
  const { category, text, coins = 0 } = req.body;
  let responses = loadResponses();

  let section = responses.progressMessage.outcomes.find(sec => sec.category === category);
  if (section) {
    section.items.push({ text, coins });
    fs.writeFileSync(responsesFile, JSON.stringify(responses, null, 2), "utf8");
    res.json({ status: "success", message: `✅ Outcome added to **${category}**` });
  } else {
    res.status(400).json({ status: "error", message: "Category not found" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
