const express = require("express");
const pool = require("./db"); // Import database connection
require("dotenv").config(); // Load environment variables

const app = express();
app.use(express.json());

// Fetch User ID from Keycloak User Table
async function getUserIdByEmail(email) {
  try {
    const query = `SELECT id FROM keycloak.user_entity WHERE email = $1`;
    const result = await pool.query(query, [email]);
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error("Error in getUserIdByEmail:", error.message, error.stack);
    throw new Error("Failed to fetch user ID");
  }
}

// Fetch Total Coins from user_coins table
async function getTotalCoins(userId) {
  try {
    const query = `
      SELECT COALESCE(
        total_learning_coins + total_earning_coins + total_contribution_coins, 0
      ) AS total
      FROM registry.user_coins
      WHERE uid = $1
    `;
    const result = await pool.query(query, [userId]);
    return result.rows.length > 0 ? result.rows[0].total : 0;
  } catch (error) {
    console.error("Error in getTotalCoins:", error.message, error.stack);
    return 0; // Fallback to 0 if the query fails
  }
}

// Fetch Total Badges from badgelog table
async function getUserBadges(userId) {
  try {
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
  } catch (error) {
    console.error("Error in getUserBadges:", error.message, error.stack);
    return { completedBadges: 0, assignedBadges: 0 }; // Fallback to 0 if the query fails
  }
}

async function getUserOutcomes(userId) {
  try {
    const query = `
      SELECT b.bid, b.bname, b.btype 
      FROM registry.badges b
      LEFT JOIN registry.badgelog bl ON b.bid = bl.bid AND bl.uid = $1
      WHERE b.btype IN ('Learning', 'Earning', 'Contribution')
      AND (bl.outcome_status IS NULL OR bl.outcome_status != 'completed')
    `;
    const result = await pool.query(query, [userId]);
    const outcomes = { Learning: [], Earning: [], Contribution: [] };

    result.rows.forEach((row) => {
      outcomes[row.btype].push({
        id: row.bid,
        text: row.bname,
        coins: 10,
      });
    });

    return outcomes;
  } catch (error) {
    console.error("Error in getUserOutcomes:", error.message, error.stack);
    return { Learning: [], Earning: [], Contribution: [] }; // Fallback to empty outcomes
  }
}
// Add these new database functions
async function insertCustomOutcome(text) {
  const bcode = `CUSTOM_${text
    .replace(/\s+/g, "_")
    .toUpperCase()
    .slice(0, 10)}`; // e.g., "CUSTOM_STARAPP_BO"
  const query = `
    INSERT INTO registry.badges (bname, bcode, btype)
    VALUES ($1, $2, 'Earning')
    RETURNING bid
  `;
  try {
    const result = await pool.query(query, [text, bcode]);
    return result.rows[0].bid;
  } catch (error) {
    console.error("Insert custom outcome error:", error.message, error.stack);
    throw error;
  }
}

// New function to update existing outcomes
async function updateOutcomeStatus(bid, userId) {
  try {
    const query = `
      INSERT INTO registry.badgelog (uid, bid, bstatus, outcome_status, checked_at)
      VALUES ($1, $2, 'Assigned', 'checked', NOW())
      ON CONFLICT (uid, bid) DO UPDATE
      SET outcome_status = 'checked',
          checked_at = NOW()
    `;
    await pool.query(query, [userId, bid]);
  } catch (error) {
    console.error("Error in updateOutcomeStatus:", error.message, error.stack);
    throw error;
  }
}

async function logBadgeProgress(userId, bid) {
  console.log(`Logging badge progress for User ID: ${userId}, Badge ID: ${bid}`);
  const query = `
    INSERT INTO registry.badgelog (uid, bid, bstatus, outcome_status, checked_at)
    VALUES ($1, $2, 'Assigned', 'checked', NOW())
    ON CONFLICT (uid, bid) DO NOTHING`;
  try {
    const result = await pool.query(query, [userId, bid]);
    if (result.rowCount === 0) {
      console.log(`Badge log not inserted (already exists) for User ID: ${userId}, Badge ID: ${bid}`);
    } else {
      console.log("Badge log inserted, rows affected:", result.rowCount);
    }
  } catch (error) {
    console.error("Database Insert Error:", error.message, error.stack);
    throw error;
  }
}

// Fetch the number of checked outcomes for the current day
async function getCheckedOutcomesCount(userId) {
  try {
    const currentDate = new Date().toISOString().split('T')[0]; // e.g., "2025-03-28"
    const query = `
      SELECT COUNT(*) AS checked_count
      FROM registry.badgelog
      WHERE uid = $1
        AND outcome_status = 'checked'
        AND DATE(checked_at) = $2
    `;
    const result = await pool.query(query, [userId, currentDate]);
    return parseInt(result.rows[0].checked_count) || 0;
  } catch (error) {
    console.error("Error in getCheckedOutcomesCount:", error.message, error.stack);
    return 0; // Fallback to 0 if the query fails
  }
}

// Fetch the number of completed outcomes for the current day
async function getCompletedOutcomesCount(userId) {
  try {
    const currentDate = new Date().toISOString().split('T')[0]; // e.g., "2025-03-28"
    const query = `
      SELECT COUNT(*) AS completed_count
      FROM registry.badgelog
      WHERE uid = $1
        AND outcome_status = 'completed'
        AND DATE(checked_at) = $2
    `;
    const result = await pool.query(query, [userId, currentDate]);
    return parseInt(result.rows[0].completed_count) || 0;
  } catch (error) {
    console.error("Error in getCompletedOutcomesCount:", error.message, error.stack);
    return 0; // Fallback to 0 if the query fails
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
                          openLink: { url: "https://starapp-frontend.web.app/" },
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

// New function to create the Smiley Meter Card
// Updated function to create the Smiley Meter Card
function createSmileyMeterCard(userName, userId, coinsEarned = 10) {
  const checkedCountPromise = getCheckedOutcomesCount(userId);
  const completedCountPromise = getCompletedOutcomesCount(userId);

  return Promise.all([checkedCountPromise, completedCountPromise]).then(
    ([checkedCount, completedCount]) => {
      const completionRatio =
        checkedCount > 0 ? (completedCount / checkedCount) * 100 : 0;
      let sadSmileyUrl, neutralSmileyUrl, happySmileyUrl;
      if (completionRatio <= 33) {
        // Sad smiley is active (in color), others are greyed out
        sadSmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/happy-face-low.png";
        neutralSmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/greyed-neutral-face.png";
        happySmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/greyed-happy-face.png";
      } else if (completionRatio <= 66) {
        // Neutral smiley is active (in color), others are greyed out
        sadSmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/greyed-sad-face.png";
        neutralSmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/happy-face-average.png";
        happySmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/greyed-happy-face.png";
      } else {
        // Happy smiley is active (in color), others are greyed out
        sadSmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/greyed-sad-face.png";
        neutralSmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/greyed-neutral-face.png";
        happySmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/happy-face-Best.png";
      }

      return {
        cardsV2: [
          {
            cardId: "smiley-meter-card",
            card: {
              header: { title: "Today's Performance" },
              sections: [
                {
                  widgets: [
                    {
                      textParagraph: {
                        text: "<b>Smiley Meter</b>",
                      },
                    },
                    {
                      columns: {
                        columnItems: [
                          {
                            horizontalSizeStyle: "FILL_AVAILABLE_SPACE", // Ensure equal spacing
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "CENTER",
                            widgets: [
                              {
                                image: {
                                  imageUrl: sadSmileyUrl,
                                  altText: "Sad Smiley",
                                  aspectRatio: 1, // Ensure consistent sizing
                                },
                              },
                            ],
                          },
                          {
                            horizontalSizeStyle: "FILL_AVAILABLE_SPACE", // Ensure equal spacing
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "CENTER",
                            widgets: [
                              {
                                image: {
                                  imageUrl: neutralSmileyUrl,
                                  altText: "Neutral Smiley",
                                  aspectRatio: 1, // Ensure consistent sizing
                                },
                              },
                            ],
                          },
                          {
                            horizontalSizeStyle: "FILL_AVAILABLE_SPACE", // Ensure equal spacing
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "CENTER",
                            widgets: [
                              {
                                image: {
                                  imageUrl: happySmileyUrl,
                                  altText: "Happy Smiley",
                                  aspectRatio: 1, // Ensure consistent sizing
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
                      textParagraph: {
                        text: `<b>Impressive!! Keep up the performance!</b>`,
                      },
                    },
                    {
                      textParagraph: {
                        text: `Well done! You have completed more outcomes today than yesterday!`,
                      },
                    },
                  ],
                },
                {
                  widgets: [
                    {
                      decoratedText: {
                        topLabel: "Coins Earned",
                        icon: {
                          iconUrl:
                            "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/star-bot.png",
                          altText: "Coin Icon",
                        },
                        text: `<b>${coinsEarned}</b>`,
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
                              openLink: {
                                url: "https://starapp-frontend.web.app/",
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
                {
                  widgets: [
                    {
                      textParagraph: {
                        text: `<b>Have a happy evening!</b>`,
                      },
                    },
                    {
                      textParagraph: {
                        text: `<font color='#D4A017'>"What do you call a factory that makes good products? A satisfactory!"</font>`,
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
  );
}

async function createOutcomeCard(userName, email, customOutcomes = []) {
  const userId = await getUserIdByEmail(email);
  if (!userId) {
    throw new Error("User not found");
  }

  const outcomes = await getUserOutcomes(userId);

  // Merge custom outcomes into Earning section
  outcomes.Earning.push(...customOutcomes);

  // Calculate total number of outcomes (including custom ones)
  const totalOutcomes =
    outcomes.Learning.length +
    outcomes.Earning.length +
    outcomes.Contribution.length;
  const formattedCount = totalOutcomes.toString().padStart(2, "0"); // e.g., "05"

  return {
    cardsV2: [
      {
        cardId: "outcome-card",
        card: {
          header: {
            title: `Let's get your day started!`,
          },
          sections: [
            {
              header: `Set your outcomes for the day <b><font color='#4CAF50'>${formattedCount}</font></b>`,
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
                {
                  selectionInput: {
                    name: "learningOutcomes",
                    type: "CHECK_BOX",
                    items: outcomes.Learning.map((item) => ({
                      text: `${item.text} 💰 ${item.coins}`,
                      value: JSON.stringify({ id: item.id, type: "Learning" }),
                      selected: false,
                    })),
                  },
                },
              ],
            },
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
                {
                  selectionInput: {
                    name: "earningOutcomes",
                    type: "CHECK_BOX",
                    items: outcomes.Earning.map((item) => ({
                      text: `${item.text} 💰 ${item.coins}`,
                      value: JSON.stringify({
                        id: item.id,
                        type: "Earning",
                        text: item.text,
                        isCustom: item.isCustom || false,
                      }),
                      selected: false,
                    })),
                  },
                },
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
                        text: "ADD",
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
                {
                  selectionInput: {
                    name: "contributionOutcomes",
                    type: "CHECK_BOX",
                    items: outcomes.Contribution.map((item) => ({
                      text: `${item.text} 💰 ${item.coins}`,
                      value: JSON.stringify({
                        id: item.id,
                        type: "Contribution",
                      }),
                      selected: false,
                    })),
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
                        text: "SUBMIT",
                        onClick: {
                          action: {
                            function: "submitOutcomes",
                            parameters: [],
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

async function createCheckedOutcomeCard(userName, userId, customOutcomes = []) {
  // Get the current date in YYYY-MM-DD format for comparison
  const currentDate = new Date().toISOString().split('T')[0]; // e.g., "2025-03-27"

  const query = `
    SELECT b.bid, b.bname, b.btype
    FROM registry.badges b
    JOIN registry.badgelog bl ON b.bid = bl.bid
    WHERE bl.uid = $1 
      AND bl.outcome_status = 'checked'
      AND DATE(bl.checked_at) = $2
  `;
  const result = await pool.query(query, [userId, currentDate]);
  const outcomes = { Learning: [], Earning: [], Contribution: [] };

  result.rows.forEach((row) => {
    outcomes[row.btype].push({
      id: row.bid,
      text: row.bname,
      coins: 10,
    });
  });

  // Merge custom outcomes into Earning section
  outcomes.Earning.push(...customOutcomes);

  // Calculate total number of checked outcomes (including custom ones)
  const totalCheckedOutcomes =
    outcomes.Learning.length +
    outcomes.Earning.length +
    outcomes.Contribution.length;
  const formattedCount = totalCheckedOutcomes.toString().padStart(2, "0"); // e.g., "06"

  return {
    cardsV2: [
      {
        cardId: "checked-outcome-card",
        card: {
          header: { title: `Good evening, ${userName}!` },
          sections: [
            {
              header: `Submit your completed outcomes <b><font color='#4CAF50'>${formattedCount}</font></b>`,
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
                ...(outcomes.Learning.length > 0
                  ? [
                      {
                        selectionInput: {
                          name: "learningOutcomes",
                          type: "CHECK_BOX",
                          items: outcomes.Learning.map((item) => ({
                            text: `${item.text} 💰 ${item.coins}`,
                            value: JSON.stringify({
                              id: item.id,
                              type: "Learning",
                            }),
                            selected: true,
                          })),
                        },
                      },
                    ]
                  : [
                      {
                        textParagraph: {
                          text: "No submitted Learning outcomes.",
                        },
                      },
                    ]),
              ],
            },
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
                ...(outcomes.Earning.length > 0
                  ? [
                      {
                        selectionInput: {
                          name: "earningOutcomes",
                          type: "CHECK_BOX",
                          items: outcomes.Earning.map((item) => ({
                            text: `${item.text} 💰 ${item.coins}`,
                            value: JSON.stringify({
                              id: item.id,
                              type: "Earning",
                              text: item.text,
                              isCustom: item.isCustom || false,
                            }),
                            selected: true,
                          })),
                        },
                      },
                    ]
                  : [
                      {
                        textParagraph: {
                          text: "No submitted Earning outcomes.",
                        },
                      },
                    ]),
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
                        text: "ADD",
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
                              {
                                key: "cardType",
                                value: "checkedOutcomeCard", // To identify which card to update
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
                ...(outcomes.Contribution.length > 0
                  ? [
                      {
                        selectionInput: {
                          name: "contributionOutcomes",
                          type: "CHECK_BOX",
                          items: outcomes.Contribution.map((item) => ({
                            text: `${item.text} 💰 ${item.coins}`,
                            value: JSON.stringify({
                              id: item.id,
                              type: "Contribution",
                            }),
                            selected: true,
                          })),
                        },
                      },
                    ]
                  : [
                      {
                        textParagraph: {
                          text: "No submitted Contribution outcomes.",
                        },
                      },
                    ]),
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
                            function: "submitCompletedOutcomes",
                            parameters: [],
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
    case "addEarningOutcome":
      const customOutcomeText =
        req.body.common?.formInputs?.customEarningOutcome?.stringInputs?.value?.[0]?.trim();
      let existingOutcomes = [];
      const existingParam = action.parameters.find(
        (p) => p.key === "existingOutcomes"
      );
      const cardTypeParam = action.parameters.find((p) => p.key === "cardType");
      const cardType = cardTypeParam ? cardTypeParam.value : "outcomeCard"; // Default to outcomeCard
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
          cardsV2:
            cardType === "checkedOutcomeCard"
              ? (
                  await createCheckedOutcomeCard(
                    userName,
                    await getUserIdByEmail(email),
                    existingOutcomes
                  )
                ).cardsV2
              : (await createOutcomeCard(userName, existingOutcomes)).cardsV2,
          text: "Please enter a valid outcome!",
        });
      }

      const newOutcome = {
        id: `custom_${Date.now()}`,
        text: customOutcomeText,
        coins: 10,
        type: "Earning",
        isCustom: true,
      };

      return res.json({
        actionResponse: { type: "UPDATE_MESSAGE" },
        cardsV2:
          cardType === "checkedOutcomeCard"
            ? (
                await createCheckedOutcomeCard(
                  userName,
                  await getUserIdByEmail(email),
                  [...existingOutcomes, newOutcome]
                )
              ).cardsV2
            : (
                await createOutcomeCard(userName, [
                  ...existingOutcomes,
                  newOutcome,
                ])
              ).cardsV2,
      });

    case "submitOutcomes":
      try {
        console.log(
          "Submit action triggered with body:",
          JSON.stringify(req.body, null, 2)
        );
        const userId = await getUserIdByEmail(email);
        if (!userId) {
          console.error("User not found for email:", email);
          return res.status(400).json({ text: "User not found" });
        }

        const formInputs = req.body.common?.formInputs || {};
        console.log("Full formInputs:", JSON.stringify(formInputs, null, 2));

        // Aggregate selections from all sections
        const learningItems =
          formInputs.learningOutcomes?.stringInputs?.value || [];
        const earningItems =
          formInputs.earningOutcomes?.stringInputs?.value || [];
        const contributionItems =
          formInputs.contributionOutcomes?.stringInputs?.value || [];
        const selectedItems = [
          ...learningItems,
          ...earningItems,
          ...contributionItems,
        ];
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
              console.log("Custom outcome inserted with bid:", bid);
            } else {
              bid = parseInt(outcome.id);
              if (isNaN(bid)) {
                console.error("Invalid bid format:", outcome.id);
                continue;
              }
              console.log("Updating status for existing outcome:", bid);
              await updateOutcomeStatus(bid, userId); // Pass userId
            }

            console.log(
              `Logging badge progress for ${bid} (${
                outcome.text || "Existing Badge"
              })`
            );
            await logBadgeProgress(userId, bid);
          } catch (error) {
            console.error(
              "Error processing outcome:",
              error.message,
              error.stack
            );
            throw error;
          }
        }

        console.log(
          "Successfully processed",
          selectedOutcomes.length,
          "outcomes"
        );
        return res.json(
          createOutcomeConfirmationCard(userName, selectedOutcomes.length)
        );
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

async function handleCardAction(req, res) {
  const { action, user } = req.body;
  const userName = user?.displayName || "User";
  const email = user?.email;

  switch (action.actionMethodName) {
    case "addEarningOutcome":
      const customOutcomeText =
        req.body.common?.formInputs?.customEarningOutcome?.stringInputs?.value?.[0]?.trim();
      let existingOutcomes = [];
      const existingParam = action.parameters.find(
        (p) => p.key === "existingOutcomes"
      );
      const cardTypeParam = action.parameters.find((p) => p.key === "cardType");
      const cardType = cardTypeParam ? cardTypeParam.value : "outcomeCard";
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
          cardsV2:
            cardType === "checkedOutcomeCard"
              ? (
                  await createCheckedOutcomeCard(
                    userName,
                    await getUserIdByEmail(email),
                    existingOutcomes
                  )
                ).cardsV2
              : (await createOutcomeCard(userName, email, existingOutcomes))
                  .cardsV2,
          text: "Please enter a valid outcome!",
        });
      }

      const newOutcome = {
        id: `custom_${Date.now()}`,
        text: customOutcomeText,
        coins: 10,
        type: "Earning",
        isCustom: true,
      };

      return res.json({
        actionResponse: { type: "UPDATE_MESSAGE" },
        cardsV2:
          cardType === "checkedOutcomeCard"
            ? (
                await createCheckedOutcomeCard(
                  userName,
                  await getUserIdByEmail(email),
                  [...existingOutcomes, newOutcome]
                )
              ).cardsV2
            : (
                await createOutcomeCard(userName, email, [
                  ...existingOutcomes,
                  newOutcome,
                ])
              ).cardsV2,
      });

    case "submitOutcomes":
      try {
        console.log(
          "Submit action triggered with body:",
          JSON.stringify(req.body, null, 2)
        );
        const userId = await getUserIdByEmail(email);
        if (!userId) {
          console.error("User not found for email:", email);
          return res.status(400).json({ text: "User not found" });
        }

        const formInputs = req.body.common?.formInputs || {};
        console.log("Full formInputs:", JSON.stringify(formInputs, null, 2));

        const learningItems =
          formInputs.learningOutcomes?.stringInputs?.value || [];
        const earningItems =
          formInputs.earningOutcomes?.stringInputs?.value || [];
        const contributionItems =
          formInputs.contributionOutcomes?.stringInputs?.value || [];
        const selectedItems = [
          ...learningItems,
          ...earningItems,
          ...contributionItems,
        ];
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
              console.log("Custom outcome inserted with bid:", bid);
            } else {
              bid = parseInt(outcome.id);
              if (isNaN(bid)) {
                console.error("Invalid bid format:", outcome.id);
                continue;
              }
              console.log("Updating status for existing outcome:", bid);
              await updateOutcomeStatus(bid, userId);
            }

            console.log(
              `Logging badge progress for ${bid} (${
                outcome.text || "Existing Badge"
              })`
            );
            await logBadgeProgress(userId, bid);
          } catch (error) {
            console.error(
              "Error processing outcome:",
              error.message,
              error.stack
            );
            throw error;
          }
        }

        console.log(
          "Successfully processed",
          selectedOutcomes.length,
          "outcomes"
        );
        return res.json(
          createOutcomeConfirmationCard(userName, selectedOutcomes.length)
        );
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

// Updated handleTextMessage function with improved error handling
async function handleTextMessage(req, res) {
  const { message } = req.body;
  const messageText = message?.text?.toLowerCase().trim();
  const userName = message?.sender?.displayName || "User";
  const email = message?.sender?.email;

  try {
    switch (messageText) {
      case "greet":
        const userIdGreet = await getUserIdByEmail(email);
        if (!userIdGreet) {
          console.log(`User not found for email: ${email}`);
          return res.status(400).json({ text: "User not found. Please register with StarApp to get started!" });
        }

        const totalCoins = await getTotalCoins(userIdGreet);
        const { completedBadges, assignedBadges } = await getUserBadges(userIdGreet);
        return res.json(
          createGoogleChatCard(
            userName,
            totalCoins,
            10, // coinsDifference (hardcoded as per original code)
            completedBadges,
            assignedBadges
          )
        );

      case "outcomes":
        return res.json(await createOutcomeCard(userName, email));

      case "selected":
        const userIdChecked = await getUserIdByEmail(email);
        if (!userIdChecked) {
          return res.status(400).json({ text: "User not found. Please register with StarApp to get started!" });
        }
        return res.json(await createCheckedOutcomeCard(userName, userIdChecked));

      case "smiley":
        const userIdSmiley = await getUserIdByEmail(email);
        if (!userIdSmiley) {
          return res.status(400).json({ text: "User not found. Please register with StarApp to get started!" });
        }
        return res.json(await createSmileyMeterCard(userName, userIdSmiley));

      default:
        return res.json({ text: `Unsupported command: ${messageText}` });
    }
  } catch (error) {
    console.error("Error in handleTextMessage:", error.message, error.stack);
    return res.status(500).json({ text: "⚠️ An error occurred while processing your request. Please try again later." });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
