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

app.get("/db-status", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "connected", time: result.rows[0].now });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});


// Fetch user details
const getUserDetails = async (userId) => {
  const userCoins = await pool.query("SELECT total_coins FROM user_coins WHERE user_id = $1", [userId]);
  const badges = await pool.query("SELECT COUNT(*) AS total_badges FROM badges WHERE user_id = $1", [userId]);
  return {
    total_coins: userCoins.rows[0]?.total_coins || 0,
    total_badges: badges.rows[0]?.total_badges || 0,
  };
};

// Fetch quests (formerly outcomes) categorized by btype
const getQuestsByCategory = async (userId) => {
  const result = await pool.query(`
    SELECT q.id AS quest_id, b.btype AS category, q.qname AS quest_name,
           json_agg(json_build_object(
               'text', t.text,
               'deadline', t.deadline,
               'coins', t.coins,
               'completed', t.completed
           )) AS tasks
    FROM quests q
    JOIN badges b ON q.badge_id = b.id
    LEFT JOIN tasks t ON q.id = t.quest_id
    WHERE b.user_id = $1
    GROUP BY q.id, b.btype, q.qname;
  `, [userId]);
  
  const categorizedQuests = {
    Learning: [],
    Earning: [],
    Contribution: []
  };

  result.rows.forEach(quest => {
    if (categorizedQuests[quest.category]) {
      categorizedQuests[quest.category].push(quest);
    }
  });

  return categorizedQuests;
};

// Handle bot interactions
app.post("/", async (req, res) => {
  try {
    console.log("📩 Received Request:", JSON.stringify(req.body, null, 2));

    const userMessage = req.body?.message?.text?.trim().toLowerCase() || "";
    const userId = req.body?.message?.sender?.id || "";
    const userName = req.body?.message?.sender?.displayName || "User";

    if (!userMessage) {
      return res.status(400).json({ message: "No message found in request." });
    }

    if (!userId) {
      return res.status(400).json({ message: "User ID is missing." });
    }

    const userProgress = await getUserDetails(userId);
    const questsByCategory = await getQuestsByCategory(userId);

    if (userMessage === "hi" || userMessage === "hello") {
      return res.json({
        cardsV2: [
          {
            cardId: "daily-progress-card",
            card: {
              header: { title: `Hello, ${userName}!` },
              sections: [
                {
                  widgets: [
                    { decoratedText: { text: `You have <b>${userProgress.total_coins}</b> coins and <b>${userProgress.total_badges}</b> badges.` } }
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
      return res.json({
        cardsV2: [
          {
            cardId: "quest-card",
            card: {
              header: { title: "Today's Quests", subtitle: "Your categorized progress" },
              sections: [
                ...Object.entries(questsByCategory).map(([category, quests]) => ({
                  widgets: [
                    { textParagraph: { text: `<b>${category}</b>` } },
                    ...quests.map(quest => ({
                      widgets: [
                        { textParagraph: { text: `<b>${quest.quest_name}</b>` } },
                        {
                          selectionInput: {
                            name: `task_selection_${quest.quest_id}`,
                            type: "CHECK_BOX",
                            items: quest.tasks.map(task => ({
                              text: task.deadline ? `${task.text} [Complete by: ${task.deadline}]` : task.text,
                              value: `${quest.quest_id}::${task.text}`,
                              selected: task.completed
                            }))
                          }
                        }
                      ]
                    }))
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
