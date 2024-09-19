var mysql = require("mysql2");

const db = mysql.createConnection({
  database: "paranmarket",
  connectionLimit: 10,
  host: "127.0.0.1",
  user: "root",
  password: "dkbaek1256!",
});
db.connect();

module.exports = db;
