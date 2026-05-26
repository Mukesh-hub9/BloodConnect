const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'bloodconnect.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database.');
        
        db.run(`CREATE TABLE IF NOT EXISTS donors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            weight INTEGER NOT NULL,
            blood_group TEXT NOT NULL,
            component TEXT NOT NULL,
            city TEXT NOT NULL,
            phone TEXT NOT NULL,
            available BOOLEAN NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            last_donation_date TEXT
        )`, (err) => {
            if (err) {
                console.error("Error creating donors table", err);
            } else {
                console.log("Donors table ready.");
                
                // Create Requests table if it doesn't exist
                db.run(`CREATE TABLE IF NOT EXISTS requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    patient_name TEXT,
                    hospital_name TEXT NOT NULL,
                    scenario_description TEXT,
                    blood_group TEXT NOT NULL,
                    component TEXT NOT NULL,
                    urgency TEXT NOT NULL,
                    city TEXT NOT NULL,
                    address TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    lat REAL NOT NULL,
                    lng REAL NOT NULL,
                    status TEXT NOT NULL,
                    units INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL
                )`, (err) => {
                    if (err) {
                        console.error("Error creating requests table", err);
                    } else {
                        console.log("Requests table ready.");
                        db.all("PRAGMA table_info(requests)", [], (err2, columns) => {
                            if (err2) {
                                console.error("Error checking requests schema", err2);
                                return;
                            }
                            const hasScenario = columns.some(col => col.name === 'scenario_description');
                            if (!hasScenario) {
                                db.run("ALTER TABLE requests ADD COLUMN scenario_description TEXT", (alterErr) => {
                                    if (alterErr) {
                                        console.error("Error adding scenario_description column", alterErr);
                                    } else {
                                        console.log("Added scenario_description column to requests table.");
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }
});

module.exports = db;
