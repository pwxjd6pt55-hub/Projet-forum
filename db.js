const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Killer228",
  database: "forum"
});

db.connect((err) => {
  if (err) {
    console.error("Erreur MySQL :", err);
    return;
  }
  console.log("MySQL connecté");
});

module.exports = db;