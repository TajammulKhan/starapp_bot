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
// Add these new database functions
async function insertCustomOutcome(text) {
  const query = `
    INSERT INTO registry.badges (bname, btype)
    VALUES ($1, 'Earning')
    RETURNING bid
  `;
  const result = await pool.query(query, [text]);
  return result.rows[0].bid;
}
// New function to update existing outcomes
async function updateOutcomeStatus(bid) {
  const query = `UPDATE registry.badgelog
    SET outcome_status = 'checked' 
    WHERE bid = $1`;
  await pool.query(query, [bid]);
}

async function logBadgeProgress(userId, bid) {
  console.log(`Logging badge progress for User ID: ${userId}, Badge ID: ${bid}`);
  
  const query = `
    INSERT INTO registry.badgelog (uid, bid, bstatus, outcome_status)
    VALUES ($1, $2, 'Assigned', 'checked')
  `;

  try {
    await pool.query(query, [userId, bid]);
    console.log("Badge log successfully inserted.");
  } catch (error) {
    console.error("Database Insert Error:", error);
  }
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
                    text: `You've selected <b>${outcomeCount}</b> outcomes to complete today.`,
                  },
                },
                {
                  textParagraph: {
                    text: "<b>All the best! Have a great day ahead!</b>",
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

async function createOutcomeCard(userName, customOutcomes = []) {
  const outcomes = await getUserOutcomes();

  // Merge custom outcomes into Earning section
  outcomes.Earning.push(...customOutcomes);

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
                        text: `${item.text} 💰 ${item.coins}`,
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
                        text: `${item.text} 💰 ${item.coins}`,
                        value: JSON.stringify({
                          id: item.id,
                          type: "Earning",
                          text: item.text,
                          isCustom: item.isCustom, // Add custom flag
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
                                value: "${formInputs.customEarningOutcome}",
                              },
                              {
                                key: "existingOutcomes",
                                value: JSON.stringify(
                                  customOutcomes.map((oc) => ({
                                    id: oc.id,
                                    text: oc.text,
                                    coins: oc.coins,
                                    isCustom: oc.isCustom,
                                  }))
                                ),
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
                        text: `${item.text} 💰 ${item.coins}`,
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
                                value: "${formInputs.selectedOutcomes}",
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
app.post("/", async (req, res) => {
  try {
    console.log("[REQUEST]", JSON.stringify(req.body, null, 2));

    // Handle different Google Chat event types
    switch (req.body.type) {
      case "CARD_CLICKED":
        return handleCardAction(req, res);

      case "MESSAGE":
        return handleTextMessage(req, res);

      default:
        return res.status(400).json({ text: "Unsupported event type" });
    }
  } catch (error) {
    console.error("Processing error:", error);
    res.status(500).json({ text: "⚠️ Internal server error" });
  }
});

app.post("/submitOutcomes", async (req, res) => {
  try {
    console.log("Submit outcomes triggered:", req.body);
    
    const selectedOutcomes = req.body.selectedOutcomes
      ? JSON.parse(req.body.selectedOutcomes)
      : [];

    if (selectedOutcomes.length === 0) {
      return res.status(400).json({ error: "No outcomes selected" });
    }

    console.log("Parsed Outcomes:", selectedOutcomes);

    return res.status(200).json({ message: "Outcomes received successfully" });
  } catch (error) {
    console.error("Error processing outcomes:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


async function handleCardAction(req, res) {
  const { action, user } = req.body;
  const userName = user?.displayName || "User";
  const email = user?.email;

  switch (action.actionMethodName) {
    // Modified handleCardAction for ADD case
    case "addEarningOutcome":
      const customOutcomeText =
        req.body.common?.formInputs?.customEarningOutcome?.stringInputs?.value?.[0]?.trim();
      // const existingOutcomes = action.parameters
      //   ? JSON.parse(action.parameters.find(p => p.key === "existingOutcomes")?.value || "[]")
      //   : [];

      // Retrieve existing outcomes with error handling
      let existingOutcomes = [];
      const existingParam = action.parameters.find(p => p.key === "existingOutcomes");
      // const existingOutcomes = existingParam ? JSON.parse(existingParam.value) : [];
      if (existingParam) {
        try {
          existingOutcomes = JSON.parse(existingParam.value);
        } catch (e) {
          console.error("Error parsing existingOutcomes:", e);
          existingOutcomes = [];
        }
      }

      if (!customOutcomeText) {
        return res.json({
          actionResponse: { type: "UPDATE_MESSAGE" },
          cardsV2: (await createOutcomeCard(userName, existingOutcomes))
            .cardsV2,
          text: "Please enter a valid outcome!",
        });
      }

      // Generate new outcome with required fields
      const newOutcome = {
        id: `custom_${Date.now()}`,
        text: customOutcomeText,
        coins: 10,
        type: "Earning",
        isCustom: true,
      };

      return res.json({
        actionResponse: { type: "UPDATE_MESSAGE" },
        cardsV2: (
          await createOutcomeCard(userName, [...existingOutcomes, newOutcome])
        ).cardsV2,
      });

      case "submitOutcomes":
        try {
          console.log("Submit action triggered with body:", JSON.stringify(req.body, null, 2));
          const userId = await getUserIdByEmail(email);
          if (!userId) {
            console.error("User not found for email:", email);
            return res.status(400).json({ text: "User not found" });
          }
      
          // Correct way to get selected outcomes from Google Chat form
          const formInputs = req.body.common?.formInputs || {};
          const selectedItems = formInputs.selectedOutcomes?.multiSelectInputs?.value || [];
          console.log("Raw selected items:", selectedItems);
      
          const selectedOutcomes = selectedItems
            .map((item) => {
              try {
                return JSON.parse(item);
              } catch (e) {
                console.error("Failed to parse outcome:", item, e);
                return null;
              }
            })
            .filter(Boolean);
      
          console.log("Parsed outcomes:", selectedOutcomes);
      
          if (selectedOutcomes.length === 0) {
            console.log("No valid outcomes selected");
            return res.json(createOutcomeConfirmationCard(userName, 0));
          }
      
          // Process outcomes
          for (const outcome of selectedOutcomes) {
            try {
              console.log("Processing outcome:", JSON.stringify(outcome));
      
              if (!outcome.id && !outcome.isCustom) {
                console.error("Invalid outcome structure:", outcome);
                continue;
              }
      
              let bid;
              if (outcome.isCustom) {
                console.log("Inserting custom outcome:", outcome.text);
                bid = await insertCustomOutcome(outcome.text);
              } else {
                bid = parseInt(outcome.id);
                if (isNaN(bid)) {
                  console.error("Invalid bid format:", outcome.id);
                  continue;
                }
                console.log("Updating status for existing outcome:", bid);
                await updateOutcomeStatus(bid);
              }
      
              console.log(`Logging badge progress for ${bid} (${outcome.text})`);
              await logBadgeProgress(userId, bid);
            } catch (error) {
              console.error("Error processing outcome:", error);
              throw error; // Re-throw to catch in outer try-catch
            }
          }
      
          console.log("Successfully processed", selectedOutcomes.length, "outcomes");
          return res.json(createOutcomeConfirmationCard(userName, selectedOutcomes.length));
        } catch (error) {
          console.error("Submission error:", error.message);
          console.error("Error stack:", error.stack);
          return res.status(500).json({
            text: "⚠️ Failed to save outcomes. Please try again later.",
          });
        }
    default:
      return res.status(400).json({ text: "Unsupported action" });
  }
}

async function handleTextMessage(req, res) {
  const { message } = req.body;
  const messageText = message?.text?.toLowerCase().trim();
  const userName = message?.sender?.displayName || "User";
  const email = message?.sender?.email;

  switch (messageText) {
    case "progress":
      // Return daily progress summary
      const userId = await getUserIdByEmail(email);
      const totalCoins = await getTotalCoins(userId);
      const { completedBadges, assignedBadges } = await getUserBadges(userId);

      return res.json(
        createGoogleChatCard(
          userName,
          totalCoins,
          10, // coinsDifference
          completedBadges,
          assignedBadges
        )
      );

    case "outcomes":
      return res.json(await createOutcomeCard(userName));

    default:
      return res.json({ text: `Unsupported command: ${messageText}` });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
