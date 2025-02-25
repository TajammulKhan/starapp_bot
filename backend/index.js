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

    if (userMessage === "progress" || userMessage === "prog") {
      console.log("Processing 'progress' request...");
      const responses = loadResponses(); // Load from db.json

      if (!responses.progressMessage || !responses.progressMessage.sections) {
        return res.json({ text: "No progress data available." });
      }

      // Dynamically construct the response
      const progressCard = {
        cardId: "daily-progress-card",
        card: {
          header: {
            title: responses.progressMessage.title,
            subtitle: responses.progressMessage.subtitle
          },
          sections: responses.progressMessage.sections.map((section) => ({
            widgets: [
              {
                textParagraph: {
                  text: `<b>🏅 ${section.category}</b>`
                }
              },
              ...(section.badge
                ? [
                    {
                      textParagraph: {
                        text: `<b>${section.badge}</b>`
                      }
                    }
                  ]
                : []),
              ...section.items.map((item) => ({
                decoratedText: {
                  text: item.text,
                  bottomLabel: item.dueDate ? `Complete by: ${item.dueDate}` : "",
                  endIcon: {
                    iconUrl:
                      "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png",
                    altText: `${item.coins} coins`
                  }
                }
              }))
            ]
          }))
        }
      };

      res.json({ cardsV2: [progressCard] });
    } else {
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
