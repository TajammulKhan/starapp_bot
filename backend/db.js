const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "192.168.1.108",
  database: process.env.DB_NAME || "starapp_bot",
  password: process.env.DB_PASSWORD || "12345678",
  port: process.env.DB_PORT || 5432,
});

module.exports = pool;
