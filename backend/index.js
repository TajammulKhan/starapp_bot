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
                              { decoratedText: { icon: { iconUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/impressive-bot.png", altText: "Impressive Emoji" } } }
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
      console.log("Loaded progress data:", progressData);
  
      if (!progressData || !progressData.outcomes) {
          return res.json({ text: "No progress data available." });
      }
  
      return res.json({
          cardsV2: [
            {
              cardId: "outcome-card",
              card: {
                header: {
                  title: progressData.title || "Set your outcomes for the day",
                  subtitle: progressData.subtitle || "",
                  imageType: "SQUARE",
                },
                sections: [
                  ...progressData.outcomes.map(category => ({
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
                                    icon: { iconUrl: category.imageUrl, altText: category.category },
                                    text: `<b><font color='#333' size='12'>${category.category}</font></b>`,
                                  }
                                }
                              ]
                            }
                          ]
                        }
                      },
                      {
                        textParagraph: { text: `<b>${category.title}</b>` }
                      },
                      {
                        selectionInput: {
                          name: `item_selection_${category.category}`,
                          type: "CHECK_BOX",
                          items: category.items.map(item => ({
                            text: item.deadline
                              ? `${item.text} [Complete by: ${item.deadline}]`
                              : item.text,
                            value: `${category.category}::${item.text}`, // Unique value for each item
                            selected: item.completed || false
                          }))
                        }
                      }
                    ]
                  })),
                  {
                    widgets: [
                      {
                        buttonList: {
                          buttons: [
                            {
                              text: "Submit",  // ✅ Single submit button at the bottom
                              onClick: {
                                action: {
                                  function: "submitProgress",
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
   else {
      return res.json({ text: "I didn't understand that. Type **'hi'** to see your progress." });
    }
  } catch (error) {
    console.error("❌ Error handling request:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/submit-progress", (req, res) => {
  const selectedItems = req.body.selectedItems; // Array of selected items
  let responses = loadResponses();

  if (!selectedItems || selectedItems.length === 0) {
    return res.status(400).json({ message: "No items selected" });
  }

  selectedItems.forEach(itemValue => {
    const [category, itemText] = itemValue.split("::"); // Extract category and item name
    let section = responses.progressMessage.outcomes.find(sec => sec.category === category);

    if (section) {
      let item = section.items.find(i => i.text === itemText);
      if (item) {
        item.completed = !item.completed; // Toggle completion status
      }
    }
  });

  fs.writeFileSync(responsesFile, JSON.stringify(responses, null, 2), "utf8");
  res.json({ message: `✅ Submitted ${selectedItems.length} selected outcomes.` });
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
