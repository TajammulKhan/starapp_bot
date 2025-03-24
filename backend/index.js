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

// Add this new function after createGoogleChatCard
function createOutcomeConfirmationCard(userName, outcomeCount) {
  return {
    cardsV2: [
      {
        cardId: "outcome-confirmation-card",
        card: {
          header: { title: `Great, ${userName}!` },
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: `You've selected ${outcomeCount} outcomes to complete today.`,
                  },
                },
                {
                  textParagraph: {
                    text: "<i>All the best! Have a great day ahead!</i> 🌟",
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
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

app.use((req, res, next) => {
  console.log("Raw Request Body:", req.rawBody);
  next();
});

// Default Route
app.get("/", (req, res) => {
  res.status(200).json({ message: "StarApp Bot is running!" });
});

// Handle Google Chat Webhook Requests
app.post("/", async (req, res) => {
  async function createOutcomeCard(userName, customOutcomes = []) {
    const outcomes = await getUserOutcomes();

    // Merge custom outcomes into Earning section
    if (customOutcomes.length > 0) {
      outcomes.Earning.push(
        ...customOutcomes.map((text) => ({
          id: `custom_${Date.now()}`,
          text: text,
          coins: 10,
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
                            type: item.type,
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
                                  value: JSON.stringify(customOutcomes) 
                                }
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

  try {
    console.log("[RAW REQUEST]", JSON.stringify(req.body, null, 2));

    // Handle ADD action first
    if (
      req.body.type === "CARD_CLICKED" &&
      req.body.action.actionMethodName === "addEarningOutcome"
    ) {
      const userName = req.body.user?.displayName || "User";

      // 1. Retrieve the custom outcome from formInputs (correct path)
      const customOutcome =
        req.body.common?.formInputs?.customEarningOutcome?.stringInputs?.value?.[0]?.trim();

      // 2. Get existing outcomes from action parameters
      const existingParam = req.body.action.parameters.find(
        (p) => p.key === "existingOutcomes"
      );
      const existingOutcomes = existingParam
        ? JSON.parse(existingParam.value)
        : [];

      // 3. Validate and update outcomes
      if (!customOutcome) {
        return res.json({
          text: "⚠️ Please enter an outcome before clicking ADD.",
          cardsV2: (await createOutcomeCard(userName, existingOutcomes))
            .cardsV2,
        });
      }
      existingOutcomes.push(customOutcome);

      // 4. Return updated card as message update
      return res.json({
        actionResponse: { type: "UPDATE_MESSAGE" }, // This is the critical change
        cardsV2: (await createOutcomeCard(userName, existingOutcomes)).cardsV2,
      });
    }
    

    // Handle initial 'progress' message
    if (
      req.body.type === "MESSAGE" &&
      req.body.message.text?.toLowerCase() === "progress"
    ) {
      const userName = req.body.message.sender.displayName || "User";
      return res.json(await createOutcomeCard(userName));
    }

    const email = req.body.user?.email || req.body.message?.sender?.email;

    const messageText = req.body.message?.text?.toLowerCase().trim();
    const userName = req.body?.message?.sender?.displayName || "User";

    // Handle "outcomes" command
    if (messageText === "outcomes") {
      const outcomeCount = 5; // Replace with actual count from DB
      return res.json(createOutcomeConfirmationCard(userName, outcomeCount));
    }
    if (messageText === "progress") {
      const outcomeCard = await createOutcomeCard(userName);
      return res.json(outcomeCard);
    }
    console.log(`Fetching user ID for email: ${email}`);
    const userId = await getUserIdByEmail(email);

    console.log(`Fetching total coins for user ID: ${userId}`);
    const totalCoins = await getTotalCoins(userId);

    console.log(`Fetching badge data for user ID: ${userId}`);
    const { completedBadges, assignedBadges } = await getUserBadges(userId);

    const coinsDifference = 10; // Placeholder

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
