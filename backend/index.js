const express = require("express");
const pool = require("./db"); // Import database connection
require("dotenv").config(); // Load environment variables

const app = express();
app.use(express.json());

// Fetch User ID from Keycloak User Table
async function getUserIdByEmail(email) {
  const query = `SELECT id FROM keycloak.user_entity WHERE email = $1`;
  const result = await pool.query(query, [email]);
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// Fetch Total Coins from badgelog table
async function getTotalCoins(userId) {
  const query = `
    SELECT COALESCE(
      total_learning_coins + total_earning_coins + total_contribution_coins, 0
    ) AS total
    FROM registry.user_coins
    WHERE uid = $1
  `;
  const result = await pool.query(query, [userId]);
  return result.rows.length > 0 ? result.rows[0].total : 0;
}

// Fetch Total Badges from badgelog table
async function getUserBadges(userId) {
  const query = `
    SELECT 
      COUNT(CASE WHEN bstatus = 'Completed' THEN 1 END) AS "completedBadges",
      COUNT(CASE WHEN bstatus IN ('Assigned', 'In Progress') THEN 1 END) AS "assignedBadges"
    FROM registry.badgelog
    WHERE uid = $1
  `;
  const result = await pool.query(query, [userId]);
  return result.rows.length > 0
    ? {
        completedBadges: result.rows[0].completedBadges || 0,
        assignedBadges: result.rows[0].assignedBadges || 0,
      }
    : { completedBadges: 0, assignedBadges: 0 };
}

// Construct Daily Progress Card
function createGoogleChatCard(userName, totalCoins, coinsDifference, completedBadges, assignedBadges) {
  return {
    cardsV2: [
      {
        cardId: "daily-progress-card",
        card: {
          header: { title: `Good Morning, ${userName}!` },
          sections: [
            {
              widgets: [
                { 
                  textParagraph: { 
                    text: `<b><font color='#D4A017' size='14'>" Stars don’t shine without darkness.<br> Embrace the journey and illuminate your path! "</font></b>` 
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
                          { decoratedText: { icon: { iconUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/impressive-bot.png", altText: "Impressive Emoji" } } }
                        ]
                      },
                      {
                        horizontalAlignment: "CENTER",
                        verticalAlignment: "CENTER",
                        widgets: [
                          { textParagraph: { text: "<b>Impressive!</b>" } },
                          { textParagraph: { text: `You’ve earned <b><font color='#4CAF50'> ↑</font></b> coins more than yesterday! ✨` } }
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
                          { decoratedText: { icon: { iconUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png", altText: "Coin Icon" }, text: `<b>${totalCoins}</b> ` } }
                        ]
                      },
                      {
                        horizontalAlignment: "CENTER",
                        verticalAlignment: "CENTER",
                        widgets: [
                          { decoratedText: { icon: { iconUrl: "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Reward+(1)+(1).png", altText: "Badge Icon" }, text: `<b>${completedBadges} / ${assignedBadges}</b>` } }
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
  };
}

// Middleware for Logging Requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log("Request Body:", JSON.stringify(req.body, null, 2));
  next();
});

// Default Route
app.get("/", (req, res) => {
  res.status(200).json({ message: "StarApp Bot is running!" });
});

// Handle Google Chat Webhook Requests
app.post("/", async (req, res) => {
  try {
    console.log("Incoming request:", req.body);

    const email = req.body.user?.email || req.body.message?.sender?.email;
    const userMessage = req.body.message?.text?.toLowerCase().trim();

    if (!email) {
      return res.json({ text: "⚠️ Error: Missing email in request." });
    }

    const userName = req.body?.message?.sender?.displayName || "User";
    console.log(`Fetching user ID for email: ${email}`);
    const userId = await getUserIdByEmail(email);

    if (!userId) {
      return res.json({ text: `⚠️ Error: No user found for email ${email}` });
    }

    console.log(`Fetching total coins for user ID: ${userId}`);
    const totalCoins = await getTotalCoins(userId);

    console.log(`Fetching badge data for user ID: ${userId}`);
    const { completedBadges, assignedBadges } = await getUserBadges(userId);

    const coinsDifference = 10; // Placeholder

    if (userMessage === "progress" || userMessage === "prog") {
      console.log("Processing 'progress' request...");

      const progressData = responses.progressMessage; // Ensure this is defined
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
                                  text: `<b><font color='#333' size='12'></font></b>`,
                                }
                              }
                            ]
                          }
                        ]
                      }
                    },
                    { textParagraph: { text: `<b></b>` } },
                    {
                      selectionInput: {
                        name: `item_selection_${category.category}`,
                        type: "CHECK_BOX",
                        items: category.items.map(item => ({
                          text: item.deadline ? `${item.text} [Complete by: ${item.deadline}]` : item.text,
                          value: `${category.category}::${item.text}`,
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
                        buttons: [{ text: "Submit", onClick: { action: { function: "submitProgress" } } }]
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

    const responseCard = createGoogleChatCard(userName, totalCoins, coinsDifference, completedBadges, assignedBadges);
    res.json(responseCard);
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ text: "⚠️ Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
