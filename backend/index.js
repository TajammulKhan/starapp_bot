const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Health Check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "StarApp Bot is running with PostgreSQL!" });
});

// Fetch daily progress from PostgreSQL
const getDailyProgress = async () => {
  const result = await pool.query("SELECT * FROM daily_progress LIMIT 1");
  return result.rows[0];
};

// Fetch outcomes from PostgreSQL
const getOutcomes = async () => {
  const result = await pool.query(`
    SELECT o.id AS outcome_id, c.name AS category, o.title, o.image_url, 
           json_agg(json_build_object(
               'text', oi.text,
               'deadline', oi.deadline,
               'coins', oi.coins,
               'completed', oi.completed
           )) AS items
    FROM outcomes o
    JOIN categories c ON o.category_id = c.id
    LEFT JOIN outcome_items oi ON o.id = oi.outcome_id
    GROUP BY o.id, c.name, o.title, o.image_url;
  `);
  return result.rows;
};

// Handle bot interactions
app.post("/", async (req, res) => {
  try {
    console.log("📩 Received Request:", JSON.stringify(req.body, null, 2));

    const userMessage = req.body?.message?.text?.trim().toLowerCase() || "";
    const userName = req.body?.message?.sender?.displayName || "User";

    if (!userMessage) {
      return res.status(400).json({ message: "No message found in request." });
    }

    if (userMessage === "hi" || userMessage === "hello") {
      const dailyProgress = await getDailyProgress();
      return res.json({
        cardsV2: [
          {
            cardId: "daily-progress-card",
            card: {
              header: { title: `${dailyProgress.title}, ${userName}!` },
              sections: [
                {
                  widgets: [
                    { textParagraph: { text: `<b><font color='#D4A017' size='14'>${dailyProgress.quote}</font></b>` } }
                  ]
                },
                {
                  widgets: [
                    {
                      columns: {
                        columnItems: [
                          { horizontalAlignment: "CENTER", verticalAlignment: "CENTER", widgets: [{ decoratedText: { icon: { iconUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/impressive-bot.png", altText: "Impressive Emoji" } } }] },
                          { horizontalAlignment: "CENTER", verticalAlignment: "CENTER", widgets: [{ textParagraph: { text: "<b>Impressive!</b>" } }, { textParagraph: { text: `You’ve earned <b><font color='#4CAF50'>${dailyProgress.coins_earned} ↑</font></b> coins more than yesterday! ✨` } }] }
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
                          { horizontalAlignment: "CENTER", verticalAlignment: "CENTER", widgets: [{ decoratedText: { icon: { iconUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png", altText: "Coin Icon" }, text: `<b>${dailyProgress.total_coins}</b> 🔼` } }] },
                          { horizontalAlignment: "CENTER", verticalAlignment: "CENTER", widgets: [{ decoratedText: { icon: { iconUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Reward+(1)+(1).png", altText: "Badge Icon" }, text: `<b>${dailyProgress.total_badges}</b> 🔽` } }] }
                        ]
                      }
                    }
                  ]
                },
                {
                  widgets: [
                    { buttonList: { buttons: [{ text: "Go to Star App →", onClick: { openLink: { url: "https://starapp.example.com" } } }] } }
                  ]
                }
              ]
            }
          }
        ]
      });
    } else if (userMessage === "progress" || userMessage === "prog") {
      console.log("Processing 'progress' request...");
      const outcomes = await getOutcomes();
      return res.json({
        cardsV2: [
          {
            cardId: "outcome-card",
            card: {
              header: { title: "Set your outcomes for the day", subtitle: "Track your progress and stay motivated!" },
              sections: [
                ...outcomes.map(category => ({
                  widgets: [
                    {
                      columns: {
                        columnItems: [
                          { horizontalAlignment: "CENTER", verticalAlignment: "CENTER", widgets: [{ decoratedText: { icon: { iconUrl: category.image_url, altText: category.category }, text: `<b><font color='#333' size='12'>${category.category}</font></b>` } }] }
                        ]
                      }
                    },
                    { textParagraph: { text: `<b>${category.title}</b>` } },
                    {
                      selectionInput: {
                        name: `item_selection_${category.category}`,
                        type: "CHECK_BOX",
                        items: category.items.map(item => ({
                          text: item.deadline ? `${item.text} [Complete by: ${item.deadline}]` : item.text,
                          value: `${category.category}::${item.text}`,
                          selected: item.completed
                        }))
                      }
                    }
                  ]
                })),
                {
                  widgets: [
                    { buttonList: { buttons: [{ text: "Submit", onClick: { action: { function: "submitProgress" } } }] } }
                  ]
                }
              ]
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

// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ StarApp Bot is running on port ${PORT}`);
});
