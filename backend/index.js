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

async function getUserOutcomes() {
  const query = `
    SELECT bid, bname, btype 
    FROM registry.badges 
    WHERE btype IN ('Learning', 'Earning', 'Contribution')
  `;
  const result = await pool.query(query);
  const outcomes = { Learning: [], Earning: [], Contribution: [] };

  result.rows.forEach((row) => {
    outcomes[row.btype].push({
      id: row.bid,
      text: row.bname,
      coins: 10,
    });
  });

  return outcomes;
}

// Construct Daily Progress Card
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
                {
                  textParagraph: {
                    text: `<b><font color='#D4A017' size='14'>" Stars don’t shine without darkness.<br> Embrace the journey and illuminate your path! "</font></b>`,
                  },
                },
              ],
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
                          {
                            decoratedText: {
                              icon: {
                                iconUrl:
                                  "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/impressive-bot.png",
                                altText: "Impressive Emoji",
                              },
                            },
                          },
                        ],
                      },
                      {
                        horizontalAlignment: "CENTER",
                        verticalAlignment: "CENTER",
                        widgets: [
                          { textParagraph: { text: "<b>Impressive!</b>" } },
                          {
                            textParagraph: {
                              text: `You’ve earned <b><font color='#4CAF50'> ↑</font></b> coins more than yesterday! ✨`,
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
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
                          {
                            decoratedText: {
                              icon: {
                                iconUrl:
                                  "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png",
                                altText: "Coin Icon",
                              },
                              text: `<b>${totalCoins}</b> `,
                            },
                          },
                        ],
                      },
                      {
                        horizontalAlignment: "CENTER",
                        verticalAlignment: "CENTER",
                        widgets: [
                          {
                            decoratedText: {
                              icon: {
                                iconUrl:
                                  "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Reward+(1)+(1).png",
                                altText: "Badge Icon",
                              },
                              text: `<b>${completedBadges} / ${assignedBadges}</b>`,
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: "Go to Star App →",
                        onClick: {
                          openLink: { url: "https://starapp.example.com" },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
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
    console.log("[RAW REQUEST]", JSON.stringify(req.body, null, 2));

    // Handle ADD action first
    if (
      req.body.type === "CARD_CLICKED" &&
      req.body.action.actionMethodName === "addEarningOutcome"
    ) {
      console.log("[ADD ACTION] Handling custom outcome addition");

      // Log the full request body to inspect formInputs
      console.log(
        "[ADD ACTION] Request Body:",
        JSON.stringify(req.body, null, 2)
      );

      // 1. Get parameters from action
  const params = req.body.action.parameters || [];
  const customOutcomeParam = params.find(p => p.key === 'customEarningOutcome')?.value;
  const existingOutcomesParam = params.find(p => p.key === 'existingOutcomes')?.value;

  // 2. Get form input value (fallback method)
  const formInputValue = req.body.formInputs?.customEarningOutcome?.stringInputs?.value?.[0]?.trim();

  // 3. Priority: Form Input > Parameter
  const customOutcome = formInputValue || customOutcomeParam?.trim();
  
  // 4. Process existing outcomes
  const existingOutcomes = existingOutcomesParam ? JSON.parse(existingOutcomesParam) : [];

  console.log('[DEBUG] Custom outcome:', customOutcome);
  console.log('[DEBUG] Existing outcomes:', existingOutcomes);

      // Add new outcome if valid
      if (customOutcome && customOutcome.length > 0) {
        existingOutcomes.push(customOutcome);
        console.log("[ADD ACTION] Updated outcomes:", existingOutcomes);
      }

      // Add this in the ADD action handler
      if (!customOutcome || customOutcome.length === 0) {
        console.log("[ADD ACTION] Empty custom outcome ignored");
        return res.json(await createOutcomeCard(userName, existingOutcomes));
      }

      const userName = req.body.user?.displayName || "User";
      return res.json(await createOutcomeCard(userName, existingOutcomes));
    }

    // Handle initial message
    if (req.body.type === "MESSAGE") {
      console.log("[MESSAGE] Handling initial request");
      const email = req.body.message.sender.email;
      const messageText = req.body.message.text?.toLowerCase();

      if (!email) {
        console.log("[ERROR] Missing email in request");
        return res.json({ text: "⚠️ Error: Missing email in request." });
      }

      if (messageText === "progress") {
        console.log("[PROGRESS] Generating outcome card");
        const userName = req.body.message.sender.displayName || "User";
        return res.json(await createOutcomeCard(userName));
      }
    }

    const email = req.body.user?.email || req.body.message?.sender?.email;
    if (!email) {
      return res.json({ text: "⚠️ Error: Missing email in request." });
    }

    const messageText = req.body.message?.text?.toLowerCase();
    const userName = req.body?.message?.sender?.displayName || "User";
    if (messageText === "progress") {
      const outcomeCard = await createOutcomeCard(userName);
      return res.json(outcomeCard);
    }
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

    async function createOutcomeCard(userName, customOutcomes = []) {
      const outcomes = await getUserOutcomes();

      // Add any custom outcomes provided in the request
      if (customOutcomes.length > 0) {
        outcomes.Earning.push(
          ...customOutcomes.map((item, index) => ({
            id: `custom_${Date.now()}_${index}`, // Assign unique ID for custom outcomes
            text: item, // Use the entered custom outcome
            coins: 10, // Default coin value
            type: "Earning",
          }))
        );
      }

      return {
        cardsV2: [
          {
            cardId: "outcome-card",
            card: {
              header: {
                title: `Set your outcomes for the day`,
              },
              sections: [
                // Learning Section
                {
                  widgets: [
                    {
                      decoratedText: {
                        icon: {
                          iconUrl:
                            "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Reward+(2).png",
                          altText: "Learning icon",
                        },
                        text: `<b><font color='#7A3BBB'>Learning</font></b>`,
                      },
                    },
                    ...outcomes.Learning.map((item) => ({
                      selectionInput: {
                        name: "selectedOutcomes",
                        type: "CHECK_BOX",
                        items: [
                          {
                            text: `${item.text} ⭐ ${item.coins} Coins`,
                            value: JSON.stringify({
                              id: item.id,
                              type: "Learning",
                            }),
                          },
                        ],
                      },
                    })),
                  ],
                },
                // Earning Section
                {
                  widgets: [
                    {
                      decoratedText: {
                        icon: {
                          iconUrl:
                            "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Medal+(1).png",
                          altText: "Earning icon",
                        },
                        text: `<b><font color='#FF6C6C'>Earning</font></b>`,
                      },
                    },
                    ...outcomes.Earning.map((item) => ({
                      selectionInput: {
                        name: "selectedOutcomes",
                        type: "CHECK_BOX",
                        items: [
                          {
                            text: `${item.text} ⭐ ${item.coins} Coins`,
                            value: JSON.stringify({
                              id: item.id,
                              type: "Earning",
                            }),
                          },
                        ],
                      },
                    })),
                    {
                      textInput: {
                        name: "customEarningOutcome",
                        label: "Add your own Earning outcome",
                      },
                    },
                    {
                      buttonList: {
                        buttons: [
                          {
                            text: "ADD", // ✅ Single submit button at the bottom
                            onClick: {
                              action: {
                                function: "addEarningOutcome",
                                parameters: [
                                  { 
                                    key: "customEarningOutcome",
                                    value: "${formInputs.customEarningOutcome}"
                                  },
                                  {
                                    key: "existingOutcomes",
                                    value: JSON.stringify(customOutcomes),
                                  },
                                ],
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
                // Contribution Section
                {
                  widgets: [
                    {
                      decoratedText: {
                        icon: {
                          iconUrl:
                            "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Shield+(1).png",
                          altText: "Contribution icon",
                        },
                        text: `<b><font color='#3CAF91'>Contribution</font></b>`,
                      },
                    },
                    ...outcomes.Contribution.map((item) => ({
                      selectionInput: {
                        name: "selectedOutcomes",
                        type: "CHECK_BOX",
                        items: [
                          {
                            text: `${item.text} ⭐ ${item.coins} Coins`,
                            value: JSON.stringify({
                              id: item.id,
                              type: "Contribution",
                            }),
                          },
                        ],
                      },
                    })),
                  ],
                },
                // Submit Button
                {
                  widgets: [
                    {
                      buttonList: {
                        buttons: [
                          {
                            text: "SUBMIT",
                            onClick: {
                              action: {
                                function: "submitOutcomes",
                                parameters: [
                                  {
                                    key: "selectedOutcomes",
                                    value: "${selectedOutcomes}",
                                  },
                                ],
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      };
    }

    const responseCard = createGoogleChatCard(
      userName,
      totalCoins,
      coinsDifference,
      completedBadges,
      assignedBadges
    );
    res.json(responseCard);
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ text: "⚠️ Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
