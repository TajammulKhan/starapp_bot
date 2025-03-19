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
      COUNT(CASE WHEN bstatus = 'Completed' THEN 1 END) AS completedBadges,
      COUNT(CASE WHEN bstatus IN ('Assigned', 'In Progress') THEN 1 END) AS assignedBadges
    FROM registry.badgelog
    WHERE uid = $1
  `;
  const result = await pool.query(query, [userId]);

  if (result.rows.length > 0) {
    return {
      totalBadges: result.rows[0].completedbadges || 0,
      assignedBadges: result.rows[0].assignedbadges || 0
    };
  }
  return { completedBadges: 0, assignedBadges: 0 };
}

// Construct Google Chat Bot Response
function createGoogleChatCard(
  userName,
  totalCoins,
  coinsDifference,
  completedBadges,
  assignedBadges
) {
  return {
    cardsV2: [
      {
        cardId: "daily-progress-card",
        card: {
          header: { title: `Good Morning, ${userName}!` },
          sections: [
            {
              widgets: [
                { textParagraph: { text: `<b><font color='#D4A017' size='14'></font></b>` } }
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

    const email = req.body.user?.email || req.body.message?.sender?.email;
    if (!email) {
      console.log("Error: Email is missing in request body.");
      return res.json({ text: "⚠️ Error: Missing email in request." });
    }

    const userName = req.body?.message?.sender?.displayName || "User";

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

   // Fetch Badge Data
   console.log(`Fetching badge data for user ID: ${userId}`);
   const { completedBadges, assignedBadges } = await getUserBadges(userId);
   console.log(`Completed Badges: ${completedBadges}, Assigned Badges: ${assignedBadges}`);

    const coinsDifference = 10; // Placeholder

    const responseCard = createGoogleChatCard(
      userName,
      totalCoins,
      coinsDifference,
      completedBadges,
      assignedBadges
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
