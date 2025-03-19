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

// Construct Google Chat Bot Response
function createGoogleChatCard(
  userName,
  totalCoins,
  coinsDifference,
  totalBadges,
  maxBadges
) {
  return {
    "cardsV2": [
      {
        "cardId": "daily_summary_card",
        "card": {
          "header": {
            "title": "Good Morning, User!",
            "subtitle": "Stars don’t shine without darkness. Embrace the journey and illuminate your path!",
            "imageUrl": "https://example.com/your-quote-image.png",
            "imageType": "SQUARE"
          },
          "sections": [
            {
              "widgets": [
                {
                  "image": {
                    "imageUrl": "https://example.com/star-emoji.png",
                    "altText": "Star Achievement"
                  }
                },
                {
                  "textParagraph": {
                    "text": "**Impressive!**\n\nYou've earned **10 ⬆️** coins more than yesterday! ✨"
                  }
                }
              ]
            },
            {
              "columns": [
                {
                  "horizontalAlignment": "CENTER",
                  "widgets": [
                    {
                      "image": {
                        "imageUrl": "https://example.com/coin-icon.png",
                        "altText": "Total Coins"
                      }
                    },
                    {
                      "textParagraph": {
                        "text": "**1500**"
                      }
                    }
                  ]
                },
                {
                  "horizontalAlignment": "CENTER",
                  "widgets": [
                    {
                      "image": {
                        "imageUrl": "https://example.com/badge-icon.png",
                        "altText": "Total Badges"
                      }
                    },
                    {
                      "textParagraph": {
                        "text": "**5/10**"
                      }
                    }
                  ]
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
  };
}

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log("Request Body:", JSON.stringify(req.body, null, 2));
  next();
});

app.get("/", (req, res) => {
  res.status(200).json({ message: "StarApp Bot is running!" });
});

// Handle Incoming Google Chat Webhook Request
app.post("/", async (req, res) => {
  try {
    console.log("Incoming request:", req.body); // Debugging logs

    console.log("Full request body:", JSON.stringify(req.body, null, 2));
    const email = req.body.user?.email || req.body.message?.sender?.email;
    if (!email) {
      console.log("Error: Email is missing in request body.");
      return res.json({ text: "⚠️ Error: Missing email in request." });
    }

    const userName = req.body?.message?.sender?.displayName || "User";

    if (!email) {
      console.log("Error: Missing email in request");
      return res.json({ text: "⚠️ Error: Email is missing in the request." });
    }

    // Fetch User ID
    console.log(`Fetching user ID for email: ${email}`);
    const userId = await getUserIdByEmail(email);
    console.log(`User ID found: ${userId}`);
    if (!userId) {
      console.log(`Error: No user found for email ${email}`);
      return res.json({ text: `⚠️ Error: No user found for email ${email}` });
    }

    // Fetch User Coins
    console.log(`Fetching total coins for user ID: ${userId}`);
    const totalCoins = await getTotalCoins(userId);
    console.log(`Total Coins: ${totalCoins}`);
    const coinsDifference = 10; // Placeholder
    const totalBadges = 5; // Placeholder
    const maxBadges = 10; // Placeholder

    const responseCard = createGoogleChatCard(
      userName,
      totalCoins,
      coinsDifference,
      totalBadges,
      maxBadges
    );

    console.log("Response to be sent:", JSON.stringify(responseCard, null, 2));

    res.json(responseCard);
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ text: "⚠️ Internal server error" });
  }
});

// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
