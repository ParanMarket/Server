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
db.connect((err) => {
  if (err) {
    console.error("MySQL 연결 오류: ", err);
  } else {
    console.log("MySQL에 성공적으로 연결되었습니다.");
  }
});

module.exports = db;
