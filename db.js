// 이거 없으면 실행 오류남
require('dotenv').config();

var mysql = require("mysql2");

const db = mysql.createConnection({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PSWORD,
  database: process.env.DB_DATABASE,
});
db.connect();

module.exports = db;
