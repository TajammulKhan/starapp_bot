const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "34.47.207.238",
  database: process.env.DB_NAME || "starapp_new",
  password: process.env.DB_PASSWORD || "starapp@123",
  port: process.env.DB_PORT || 5432,
});

module.exports = pool;
