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
function createGoogleChatCard(userName, totalCoins, coinsDifference, totalBadges, maxBadges) {
  return {
    "cardsV2": [
      {
        "cardId": "daily_summary_card",
        "card": {
          "header": {
            "title": `Good  ${userName}!`,
            "subtitle": `"Stars don’t shine without darkness. Embrace the journey and illuminate your path!"`,
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
                    "text": "**Impressive!**\n\nYou've earned **" + coinsDifference + " ⬆️** coins more than yesterday! ✨"
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
                        "text": `**${totalCoins}**`
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
                        "text": `**${totalBadges}/${maxBadges}**`
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

// Handle Incoming Google Chat Webhook Request
app.post("/", async (req, res) => {
  try {
    const email = req.body.user.email;
    const userName = req.body?.message?.sender?.displayName || "User";
    if (!email) {
      return res.json({ text: "⚠️ Error: Email is missing in the request." });
    }

    // Get User ID from Keycloak
    const userId = await getUserIdByEmail(email);
    if (!userId) {
      return res.json({ text: `⚠️ Error: No user found for email ${email}` });
    }

    // Get Total Coins from badgelog
    const totalCoins = await getTotalCoins(userId);

    // Send the Google Chat bot response
    res.json(createGoogleChatCard);
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
