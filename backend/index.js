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
    SELECT COALESCE(SUM(earned + learning + contributions), 0) AS total
    FROM registry.badgelog
    WHERE uid = $1
  `;
  const result = await pool.query(query, [userId]);
  return result.rows[0]?.total || 0;
}

// Construct Google Chat Bot Response
function createGoogleChatCard(userId, totalCoins) {
  return {
    "cardsV2": [
      {
        "cardId": "total_coins_card",
        "card": {
          "header": {
            "title": "🏆 Total Coins Earned",
            "subtitle": `User ID: ${userId}`,
            "imageUrl": "https://example.com/coin-icon.png",
            "imageType": "CIRCLE"
          },
          "sections": [
            {
              "widgets": [
                {
                  "textParagraph": {
                    "text": `✨ Congratulations! You have a total of **${totalCoins} coins** from your learning, earning, and contributions! Keep up the great work! 🎉`
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
    res.json(createGoogleChatCard(userId, totalCoins));
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
