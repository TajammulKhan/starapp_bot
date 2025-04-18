require("dotenv").config(); // Load environment variables
// console.log("All environment variables:", JSON.stringify(process.env, null, 2));
// console.log("Loaded env vars:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
  console.error("Error: One or both Google service account environment variables are missing.");
  process.exit(1);
}

const express = require("express");
const pool = require("./db"); // Import database connection
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

const app = express();
const cron = require('node-cron');
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
        COUNT(CASE WHEN bstatus IN ('Assigned', 'In Progress','Completed') THEN 1 END) AS "assignedBadges"
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
      AND (
        (b.btype = 'Learning' AND bl.bstatus = 'Assigned' AND bl.uid = $1)
        OR (b.btype IN ('Earning', 'Contribution') AND (bl.outcome_status IS NULL OR bl.outcome_status != 'completed'))
      )
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

// Add this helper function to fetch yesterday's total coins
async function getYesterdayTotalCoins(userId) {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const formattedToday = today.toISOString().split("T")[0]; // e.g., "2025-04-07"
    const formattedYesterday = yesterday.toISOString().split("T")[0]; // e.g., "2025-04-06"

    // Fetch the current total coins
    const currentQuery = `
      SELECT COALESCE(
        total_learning_coins + total_earning_coins + total_contribution_coins, 0
      ) AS total,
      last_updated
      FROM registry.user_coins
      WHERE uid = $1
    `;
    const currentResult = await pool.query(currentQuery, [userId]);
    if (currentResult.rows.length === 0) return 0;

    const { total: currentTotal, last_updated } = currentResult.rows[0];
    const lastUpdatedDate = new Date(last_updated).toISOString().split("T")[0];

    // If last_updated is yesterday or earlier, use current total as yesterday's value
    if (lastUpdatedDate <= formattedYesterday) {
      return currentTotal;
    }

    // If last_updated is today, we need a better way to estimate yesterday's total
    // This is a simplification; ideally, you'd track daily changes
    return 0; // Fallback to 0 if no historical data is available
  } catch (error) {
    console.error("Error in getYesterdayTotalCoins:", error.message, error.stack);
    return 0; // Fallback to 0 if the query fails
  }
}

async function logBadgeProgress(userId, bid) {
  console.log(
    `Logging badge progress for User ID: ${userId}, Badge ID: ${bid}`
  );
  const query = `
    INSERT INTO registry.badgelog (uid, bid, bstatus, outcome_status, checked_at)
    VALUES ($1, $2, 'Assigned', 'checked', NOW())
    ON CONFLICT (uid, bid) DO NOTHING`;
  try {
    const result = await pool.query(query, [userId, bid]);
    if (result.rowCount === 0) {
      console.log(
        `Badge log not inserted (already exists) for User ID: ${userId}, Badge ID: ${bid}`
      );
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
    const currentDate = new Date().toISOString().split("T")[0]; // e.g., "2025-04-04"
    const query = `
      SELECT COUNT(*) AS checked_count
      FROM registry.badgelog
      WHERE uid = $1
        AND (outcome_status = 'checked' OR outcome_status = 'completed')
        AND DATE(checked_at) = $2
    `;
    const result = await pool.query(query, [userId, currentDate]);
    const checkedCount = parseInt(result.rows[0].checked_count) || 0;
    console.log(
      `Total checked outcomes (including completed) for ${userId} on ${currentDate}: ${checkedCount}`
    ); // Debug log
    return checkedCount;
  } catch (error) {
    console.error("Error in getCheckedOutcomesCount:", error.message, error.stack);
    return 0; // Fallback to 0 if the query fails
  }
}

async function getCompletedOutcomesCount(userId) {
  try {
    const currentDate = new Date().toISOString().split("T")[0]; // e.g., "2025-04-03"
    const query = `
      SELECT COUNT(*) AS completed_count
      FROM registry.badgelog
      WHERE uid = $1
        AND outcome_status = 'completed'
        AND DATE(checked_at) = $2
    `;
    const result = await pool.query(query, [userId, currentDate]);
    const completedCount = parseInt(result.rows[0].completed_count) || 0;
    console.log(
      `Completed outcomes count for ${userId} on ${currentDate}: ${completedCount}`
    ); // Debug log
    return completedCount;
  } catch (error) {
    console.error("Error in getCompletedOutcomesCount:", error.message, error.stack);
    return 0; // Fallback to 0 if the query fails
  }
}

async function updateOutcomeToCompleted(userId, bid) {
  try {
    const query = `
      UPDATE registry.badgelog
      SET outcome_status = 'completed',
          checked_at = NOW()
      WHERE uid = $1
        AND bid = $2
        AND outcome_status = 'checked'
      RETURNING *;
    `;
    const result = await pool.query(query, [userId, bid]);
    if (result.rowCount > 0) {
      console.log(`Successfully marked bid ${bid} as completed for user ${userId}:`, result.rows[0]);
    } else {
      console.log(`No update for bid ${bid} for user ${userId} - already completed or not checked.`);
    }
    return result.rowCount > 0; // Return true if update was successful
  } catch (error) {
    console.error("Error in updateOutcomeToCompleted:", error.message, error.stack);
    throw error;
  }
}

// Construct Daily Progress Card
function createGoogleChatCard(
  userName,
  totalCoins,
  coinsDifference, // This will now be dynamically calculated
  completedBadges,
  assignedBadges
) {
  let iconUrl, message1, message2;

  // Determine the icon and messages based on coinsDifference
  if (totalCoins === 0 && coinsDifference === 0) {
    // Condition 1: 0 coins compared to 0 coins
    iconUrl = "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/happy-face-low.png";
    message1 = "Uh-Oh! You haven't earned any coins yet.";
    message2 = "Set and complete your outcomes for the day to start!";
  } else if (coinsDifference < 0) {
    // Condition 2: Less coins earned than yesterday
    iconUrl = "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/happy-face-low.png";
    message1 = "It's okay to have an off day. You can bounce back!";
    message2 = `You've earned <b>${Math.abs(coinsDifference)}</b> coins less than yesterday`;
  } else if (coinsDifference === 0) {
    // Condition 3: Same number of coins as yesterday
    iconUrl = "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/happy-face-average.png";
    message1 = "You've hit a balance! Let's see if tomorrow tips the scales";
    message2 = "You've earned the same number of coins as yesterday!";
  } else {
    // Condition 4: More coins earned than yesterday
    iconUrl = "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/happy-face-Best.png";
    message1 = "Awesome progress!";
    message2 = `You've earned <b>${coinsDifference}</b> coins more than yesterday!`;
  }

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
                                iconUrl: iconUrl,
                                altText: "Progress Emoji",
                              },
                            },
                          },
                        ],
                      },
                      {
                        horizontalAlignment: "CENTER",
                        verticalAlignment: "CENTER",
                        widgets: [
                          { textParagraph: { text: `<b>${message1}</b>` } },
                          {
                            textParagraph: {
                              text: message2,
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
  console.log("Parsed Request Body:", req.body); // Add this to debug the parsed body
  next();
});

// Default Route
app.get("/", (req, res) => {
  res.status(200).json({ message: "StarApp Bot is running!" });
});

// Updated function to create the Smiley Meter Card
function createSmileyMeterCard(userName, userId) {
  console.log(
    "Starting createSmileyMeterCard for user:",
    userName,
    "with userId:",
    userId
  );
  const checkedCountPromise = getCheckedOutcomesCount(userId);
  const completedCountPromise = getCompletedOutcomesCount(userId);
  const totalCoinsPromise = getTotalCoins(userId);
  const yesterdayCoinsPromise = getYesterdayTotalCoins(userId);

  return Promise.all([checkedCountPromise, completedCountPromise, totalCoinsPromise, yesterdayCoinsPromise])
    .then(([checkedCount, completedCount, totalCoins, yesterdayCoins]) => {
      console.log(
        "Total outcomes initially checked (including completed):",
        checkedCount,
        "Completed outcomes:",
        completedCount,
        "Total coins:",
        totalCoins,
        "Yesterday coins:",
        yesterdayCoins
      );
      if (completedCount > checkedCount) {
        console.warn(
          `Inconsistent counts detected: Completed (${completedCount}) exceeds Total Checked (${checkedCount}) for user ${userId}`
        );
        completedCount = checkedCount; // Temporary fix to ensure logical consistency
      }
      const completionRatio =
        checkedCount > 0
          ? Math.min((completedCount / checkedCount) * 100, 100)
          : 0;
      console.log(`Completion ratio for user ${userId}: ${completionRatio}%`);

      // Calculate coins earned today
      const coinsEarned = totalCoins - yesterdayCoins;
      console.log(`Coins earned today for user ${userId}: ${coinsEarned}`);

      // Define composite image URL and messages based on completion ratio
      let compositeSmileyUrl, message1, message2;
      if (completionRatio <= 33) {
        compositeSmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/poor+perfomance.png";
        message1 = "<b>Keep your chin up!</b>";
        message2 = "Tomorrow is a new day, you can do better!";
        console.log("Selected poor performance image (0-33%)");
      } else if (completionRatio <= 66) {
        compositeSmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/neutral+perfomance.png";
        message1 = "<b>Good going. Keep up the efforts</b>";
        message2 = "You're on track. You've completed the same number of outcomes today as yesterday";
        console.log("Selected neutral performance image (34-66%)");
      } else {
        compositeSmileyUrl =
          "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/great+perfomance.png";
        message1 = "<b>Impressive! Consistency is key!</b>";
        message2 = "Well done! You've completed the more outcomes today than yesterday";
        console.log("Selected great performance image (67-100%)");
      }

      console.log("Composite Smiley URL:", compositeSmileyUrl);

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
                      image: {
                        imageUrl: compositeSmileyUrl,
                        altText: "Smiley Meter",
                      },
                    },
                  ],
                },
                {
                  widgets: [
                    {
                      textParagraph: {
                        text: message1,
                      },
                    },
                    {
                      textParagraph: {
                        text: message2,
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
    })
    .catch((error) => {
      console.error(
        "Error in createSmileyMeterCard:",
        error.message,
        error.stack
      );
      return { text: "⚠️ Failed to generate smiley card due to an internal error." };
    });
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
            // {
            //   widgets: [
            //     {
            //       decoratedText: {
            //         icon: {
            //           iconUrl:
            //             "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Medal+(1).png",
            //           altText: "Earning icon",
            //         },
            //         text: `<b><font color='#FF6C6C'>Earning</font></b>`,
            //       },
            //     },
            //     {
            //       selectionInput: {
            //         name: "earningOutcomes",
            //         type: "CHECK_BOX",
            //         items: outcomes.Earning.map((item) => ({
            //           text: `${item.text} 💰 ${item.coins}`,
            //           value: JSON.stringify({
            //             id: item.id,
            //             type: "Earning",
            //             text: item.text,
            //             isCustom: item.isCustom || false,
            //           }),
            //           selected: false,
            //         })),
            //       },
            //     },
            //     {
            //       textInput: {
            //         name: "customEarningOutcome",
            //         label: "Add your own Earning outcome",
            //       },
            //     },
            //     {
            //       buttonList: {
            //         buttons: [
            //           {
            //             text: "ADD",
            //             onClick: {
            //               action: {
            //                 function: "addEarningOutcome",
            //                 parameters: [
            //                   {
            //                     key: "customEarningOutcome",
            //                     value: "${formInputs.customEarningOutcome}",
            //                   },
            //                   {
            //                     key: "existingOutcomes",
            //                     value: JSON.stringify(
            //                       customOutcomes.map((oc) => ({
            //                         id: oc.id,
            //                         text: oc.text,
            //                         coins: oc.coins,
            //                         isCustom: oc.isCustom,
            //                       }))
            //                     ),
            //                   },
            //                 ],
            //               },
            //             },
            //           },
            //         ],
            //       },
            //     },
            //   ],
            // },
            // {
            //   widgets: [
            //     {
            //       decoratedText: {
            //         icon: {
            //           iconUrl:
            //             "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Shield+(1).png",
            //           altText: "Contribution icon",
            //         },
            //         text: `<b><font color='#3CAF91'>Contribution</font></b>`,
            //       },
            //     },
            //     {
            //       selectionInput: {
            //         name: "contributionOutcomes",
            //         type: "CHECK_BOX",
            //         items: outcomes.Contribution.map((item) => ({
            //           text: `${item.text} 💰 ${item.coins}`,
            //           value: JSON.stringify({
            //             id: item.id,
            //             type: "Contribution",
            //           }),
            //           selected: false,
            //         })),
            //       },
            //     },
            //   ],
            // },
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
  const currentDate = new Date().toISOString().split("T")[0]; // e.g., "2025-03-27"

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
            // {
            //   widgets: [
            //     {
            //       decoratedText: {
            //         icon: {
            //           iconUrl:
            //             "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Medal+(1).png",
            //           altText: "Earning icon",
            //         },
            //         text: `<b><font color='#FF6C6C'>Earning</font></b>`,
            //       },
            //     },
            //     ...(outcomes.Earning.length > 0
            //       ? [
            //           {
            //             selectionInput: {
            //               name: "earningOutcomes",
            //               type: "CHECK_BOX",
            //               items: outcomes.Earning.map((item) => ({
            //                 text: `${item.text} 💰 ${item.coins}`,
            //                 value: JSON.stringify({
            //                   id: item.id,
            //                   type: "Earning",
            //                   text: item.text,
            //                   isCustom: item.isCustom || false,
            //                 }),
            //                 selected: true,
            //               })),
            //             },
            //           },
            //         ]
            //       : [
            //           {
            //             textParagraph: {
            //               text: "No submitted Earning outcomes.",
            //             },
            //           },
            //         ]),
            //     {
            //       textInput: {
            //         name: "customEarningOutcome",
            //         label: "Add your own Earning outcome",
            //       },
            //     },
            //     {
            //       buttonList: {
            //         buttons: [
            //           {
            //             text: "ADD",
            //             onClick: {
            //               action: {
            //                 function: "addEarningOutcome",
            //                 parameters: [
            //                   {
            //                     key: "customEarningOutcome",
            //                     value: "${formInputs.customEarningOutcome}",
            //                   },
            //                   {
            //                     key: "existingOutcomes",
            //                     value: JSON.stringify(
            //                       customOutcomes.map((oc) => ({
            //                         id: oc.id,
            //                         text: oc.text,
            //                         coins: oc.coins,
            //                         isCustom: oc.isCustom,
            //                       }))
            //                     ),
            //                   },
            //                   {
            //                     key: "cardType",
            //                     value: "checkedOutcomeCard", // To identify which card to update
            //                   },
            //                 ],
            //               },
            //             },
            //           },
            //         ],
            //       },
            //     },
            //   ],
            // },
            // {
            //   widgets: [
            //     {
            //       decoratedText: {
            //         icon: {
            //           iconUrl:
            //             "https://startapp-images-tibil.s3.us-east-1.amazonaws.com/Shield+(1).png",
            //           altText: "Contribution icon",
            //         },
            //         text: `<b><font color='#3CAF91'>Contribution</font></b>`,
            //       },
            //     },
            //     ...(outcomes.Contribution.length > 0
            //       ? [
            //           {
            //             selectionInput: {
            //               name: "contributionOutcomes",
            //               type: "CHECK_BOX",
            //               items: outcomes.Contribution.map((item) => ({
            //                 text: `${item.text} 💰 ${item.coins}`,
            //                 value: JSON.stringify({
            //                   id: item.id,
            //                   type: "Contribution",
            //                 }),
            //                 selected: true,
            //               })),
            //             },
            //           },
            //         ]
            //       : [
            //           {
            //             textParagraph: {
            //               text: "No submitted Contribution outcomes.",
            //             },
            //           },
            //         ]),
            //   ],
            // },
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

      case "submitCompletedOutcomes":
        try {
          console.log(
            "Submit completed outcomes triggered with body:",
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
      
          console.log("Parsed completed outcomes:", selectedOutcomes);
      
          if (selectedOutcomes.length === 0) {
            console.log("No outcomes selected for completion");
            return res.json({
              text: "Please select at least one outcome to mark as completed.",
            });
          }
      
          // Update outcome_status to "completed" for selected outcomes
          for (const outcome of selectedOutcomes) {
            try {
              const bid = parseInt(outcome.id);
              if (isNaN(bid)) {
                console.error("Invalid bid format:", outcome.id);
                continue;
              }
      
              const updated = await updateOutcomeToCompleted(userId, bid);
              if (updated) {
                console.log(`Successfully marked bid ${bid} as completed for user ${userId}`);
              } else {
                console.log(`No update for bid ${bid} - already completed or not checked`);
              }
            } catch (error) {
              console.error(
                "Error updating outcome status:",
                error.message,
                error.stack
              );
              throw error;
            }
          }
      
          // Fetch updated counts for debugging
          const updatedCheckedCount = await getCheckedOutcomesCount(userId);
          const updatedCompletedCount = await getCompletedOutcomesCount(userId);
          console.log(
            `After submission - Checked: ${updatedCheckedCount}, Completed: ${updatedCompletedCount}`
          );
      
          // Return the smiley-meter-card with updated completion ratio
          const smileyCard = await createSmileyMeterCard(userName, userId);
          console.log(
            "Smiley card generated in submitCompletedOutcomes:",
            JSON.stringify(smileyCard, null, 2)
          );
          return res.json(
            smileyCard || { text: "Failed to generate smiley card." }
          );
        } catch (error) {
          console.error(
            "Error in submitCompletedOutcomes:",
            error.message,
            error.stack
          );
          return res.status(500).json({
            text: "⚠️ StarApp Bot is unable to process your request. Please try again later.",
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
          return res.status(400).json({
            text: "User not found. Please register with StarApp to get started!",
          });
        }

        const totalCoins = await getTotalCoins(userIdGreet);
        const yesterdayCoins = await getYesterdayTotalCoins(userIdGreet);
        const coinsDifference = totalCoins - yesterdayCoins; // Calculate the difference
        const { completedBadges, assignedBadges } = await getUserBadges(userIdGreet);

        return res.json(
          createGoogleChatCard(
            userName,
            totalCoins,
            coinsDifference,
            completedBadges,
            assignedBadges
          )
        );

      case "outcomes":
        return res.json(await createOutcomeCard(userName, email));

      case "selected":
        const userIdChecked = await getUserIdByEmail(email);
        if (!userIdChecked) {
          return res.status(400).json({
            text: "User not found. Please register with StarApp to get started!",
          });
        }
        return res.json(
          await createCheckedOutcomeCard(userName, userIdChecked)
        );

      case "smiley":
        const userIdSmiley = await getUserIdByEmail(email);
        if (!userIdSmiley) {
          return res.status(400).json({
            text: "User not found. Please register with StarApp to get started!",
          });
        }
        try {
          const smileyCard = await createSmileyMeterCard(
            userName,
            userIdSmiley
          );
          console.log(
            "Smiley card generated:",
            JSON.stringify(smileyCard, null, 2)
          ); // Detailed log
          return res.json(smileyCard);
        } catch (error) {
          console.error(
            "Error generating smiley card:",
            error.message,
            error.stack
          );
          return res.status(500).json({
            text: "⚠️ An error occurred while generating the smiley card. Please try again later.",
          });
        }

      default:
        return res.json({ text: `Unsupported command: ${messageText}` });
    }
  } catch (error) {
    console.error("Error in handleTextMessage:", error.message, error.stack);
    return res.status(500).json({
      text: "⚠️ An error occurred while processing your request. Please try again later.",
    });
  }
}

async function sendCardToUser(userEmail, cardFunction, userName) {
  console.log(`Starting sendCardToUser for ${userEmail} with function ${cardFunction.name} at ${new Date().toISOString()}`);
  try {
    const userId = await getUserIdByEmail(userEmail);
    console.log(`Retrieved userId: ${userId} for email: ${userEmail}`);
    if (!userId) {
      console.log(`User not found for email: ${userEmail}, skipping`);
      return;
    }

    let card;
    switch (cardFunction.name) {
      case 'createGoogleChatCard':
        const totalCoins = await getTotalCoins(userId);
        const yesterdayCoins = await getYesterdayTotalCoins(userId);
        const coinsDifference = totalCoins - yesterdayCoins;
        const { completedBadges, assignedBadges } = await getUserBadges(userId);
        card = cardFunction(userName, totalCoins, coinsDifference, completedBadges, assignedBadges);
        console.log(`Generated card data: ${JSON.stringify(card, null, 2)}`);
        break;
      case 'createOutcomeCard':
        card = await cardFunction(userName, userEmail);
        break;
      case 'createCheckedOutcomeCard':
        card = await cardFunction(userName, userId);
        break;
      case 'createSmileyMeterCard':
        card = await cardFunction(userName, userId);
        break;
      default:
        throw new Error('Unsupported card function');
    }

    console.log(`Authenticating with email: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
    // Impersonate a user with domain-wide delegation
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/chat.bot'],
      subject: 'tajammul.khan@tibilsolutions.com', // Impersonate this user (or an admin user)
    });

    // Debug authentication
    console.log('Attempting to get access token...');
    const token = await auth.getAccessToken();
    console.log(`Access token retrieved: ${token.token}`);

    // Initialize the Chat API client
    const chat = google.chat({ version: 'v1', auth });

    // Find the direct message space
    console.log(`Finding direct message space for user: ${userEmail}`);
    const findDirectMessageRequest = {
      name: `users/${userEmail}`, // Using email alias, now supported with impersonation
    };
    const [space] = await chat.spaces.findDirectMessage(findDirectMessageRequest);
    if (!space || !space.name) {
      throw new Error(`Direct message space not found for ${userEmail}`);
    }
    const spaceId = space.name.split('/').pop(); // Extract space ID
    console.log(`Found space ID: ${spaceId} for user ${userEmail}`);

    // Send the message to the space
    console.log(`Sending message to parent: spaces/${spaceId}`);
    const response = await chat.spaces.messages.create({
      parent: `spaces/${spaceId}`,
      requestBody: {
        cardsV2: card.cardsV2,
      },
    });
    console.log(`API response: ${JSON.stringify(response.data)}`);
    console.log(`Successfully sent ${cardFunction.name} to ${userEmail}`);
  } catch (error) {
    console.error(`Error sending card to ${userEmail}:`, error.message, error.stack);
  }
}
// Function to get all users (replace with your user retrieval logic)
async function getAllUsers() {
  try {
    const query = `SELECT email, id, username FROM keycloak.user_entity WHERE email = $1`;
    const result = await pool.query(query, ['tajammul.khan@tibilsolutions.com']);
    return result.rows
      .filter(row => row.email)
      .map(row => ({
        email: row.email,
        userName: row.username || row.email.split('@')[0],
      }));
  } catch (error) {
    console.error('Error fetching users:', error.message, error.stack);
    return [];
  }
}

// Schedule cron jobs
cron.schedule('0 0 9 * * *', async () => {
  const now = new Date().toISOString();
  console.log(`Running daily progress card cron job at ${now} (12:53 PM UTC)`);
  const users = await getAllUsers();
  for (const user of users) {
    await sendCardToUser(user.email, createGoogleChatCard, user.userName);
  }
}, {
  timezone: 'UTC',
});

cron.schedule('0 0 10 * * *', async () => {
  console.log('Running outcome card cron job at 10:00 AM');
  const users = await getAllUsers();
  for (const user of users) {
    await sendCardToUser(user.email, createOutcomeCard, user.userName);
  }
}, {
  timezone: 'UTC', // Adjust timezone as needed
});

cron.schedule('0 0 18 * * *', async () => {
  console.log('Running checked outcome card cron job at 6:00 PM');
  const users = await getAllUsers();
  for (const user of users) {
    await sendCardToUser(user.email, createCheckedOutcomeCard, user.userName);
  }
}, {
  timezone: 'UTC', // Adjust timezone as needed
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
