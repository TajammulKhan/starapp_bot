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
    console.error("❌ Database connection error:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Fetch user details (Total Coins & Badges Summary)
const getUserDetails = async (userId) => {
  try {
    // Fetch coins
    const userCoins = await pool.query(
      `SELECT total_learning_coins + total_earning_coins + total_contribution_coins AS total_coins 
       FROM user_coins WHERE uid = $1`, 
      [userId]
    );

    // Fetch badges summary
    const badges = await pool.query(
      `SELECT 
         COUNT(CASE WHEN bstatus = 'Assigned' THEN 1 END) AS assigned,
         COUNT(CASE WHEN bstatus = 'In Progress' THEN 1 END) AS in_progress,
         COUNT(CASE WHEN bstatus = 'Completed' THEN 1 END) AS completed
       FROM badge_log WHERE uid = $1`, 
      [userId]
    );

    return {
      total_coins: userCoins.rows[0]?.total_coins || 0,
      assigned_badges: badges.rows[0]?.assigned || 0,
      in_progress_badges: badges.rows[0]?.in_progress || 0,
      completed_badges: badges.rows[0]?.completed || 0
    };
  } catch (error) {
    console.error("❌ Error fetching user details:", error);
    throw new Error("Failed to fetch user details.");
  }
};

// Handle bot interactions
app.post("/", async (req, res) => {
  try {
    console.log("📩 Received Request:", JSON.stringify(req.body, null, 2));

    const userMessage = req.body?.message?.text?.trim().toLowerCase() || "";
    const userId = req.body?.message?.sender?.id || "";
    const userName = req.body?.message?.sender?.displayName || "User";

    if (!userMessage) {
      console.error("⚠️ No message found in request.");
      return res.status(400).json({ message: "No message found in request." });
    }

    if (!userId) {
      console.error("⚠️ User ID is missing.");
      return res.status(400).json({ message: "User ID is missing." });
    }

    // Fetch user details
    const userProgress = await getUserDetails(userId);
    console.log("✅ User Progress Data:", userProgress);

    if (userMessage === "hi" || userMessage === "hello") {
      return res.json({
        cardsV2: [
          {
            cardId: "daily-progress-card",
            card: {
              header: {
                title: `Hello, ${userName}!`,
                subtitle: "Here’s your latest progress summary."
              },
              sections: [
                {
                  widgets: [
                    {
                      decoratedText: {
                        text: `🌟 **Total Coins:** ${userProgress.total_coins}`
                      }
                    },
                    {
                      decoratedText: {
                        text: `🏆 **Badges Completed:** ${userProgress.completed_badges}`
                      }
                    },
                    {
                      decoratedText: {
                        text: `📌 **Badges Assigned:** ${userProgress.assigned_badges}`
                      }
                    },
                    {
                      decoratedText: {
                        text: `⚡ **Badges In Progress:** ${userProgress.in_progress_badges}`
                      }
                    }
                  ]
                },
                {
                  widgets: [
                    {
                      buttonList: {
                        buttons: [
                          {
                            text: "Go to Star App →",
                            onClick: {
                              openLink: { url: "https://starapp.example.com" }
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
    } else {
      console.warn("⚠️ Unrecognized user message:", userMessage);
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
