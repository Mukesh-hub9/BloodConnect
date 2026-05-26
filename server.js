const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Add a new donor
app.post('/api/donors', (req, res) => {
    const { name, age, weight, blood_group, component, city, phone, available, lat, lng, last_donation_date } = req.body;
    
    if (!name || !age || !weight || !blood_group || !city || !phone) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = `INSERT INTO donors (name, age, weight, blood_group, component, city, phone, available, lat, lng, last_donation_date) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [name, age, weight, blood_group, component, city, phone, available ? 1 : 0, lat, lng, last_donation_date];
    
    db.run(sql, params, function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: 'Donor registered successfully' });
    });
});

// Get donors (optional filtering by blood_group, city and compatibility)
app.get('/api/donors', (req, res) => {
    const { blood_group, city, compatible } = req.query;
    
    let sql = "SELECT * FROM donors WHERE available = 1";
    let params = [];
    
    if (blood_group) {
        if (compatible === 'true') {
            const compatibilityMap = {
                'A+': ['A+', 'A-', 'O+', 'O-'],
                'A-': ['A-', 'O-'],
                'B+': ['B+', 'B-', 'O+', 'O-'],
                'B-': ['B-', 'O-'],
                'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
                'AB-': ['AB-', 'A-', 'B-', 'O-'],
                'O+': ['O+', 'O-'],
                'O-': ['O-']
            };
            const allowedGroups = compatibilityMap[blood_group] || [blood_group];
            const placeholders = allowedGroups.map(() => '?').join(',');
            sql += ` AND blood_group IN (${placeholders})`;
            params.push(...allowedGroups);
        } else {
            sql += " AND blood_group = ?";
            params.push(blood_group);
        }
    }
    
    if (city) {
        sql += " AND LOWER(city) LIKE LOWER(?)";
        params.push(`%${city}%`);
    }

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Convert integer boolean back to true/false for frontend
        const formattedRows = rows.map(r => ({
            ...r,
            available: r.available === 1
        }));
        
        res.json({ donors: formattedRows });
    });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'Bloodconnect' && password === '1234') {
        res.json({ success: true, token: 'fake-jwt-token' });
    } else {
        res.status(401).json({ success: false, error: 'Invalid Credentials' });
    }
});

// Get all donors for admin
app.get('/api/admin/donors', (req, res) => {
    db.all("SELECT * FROM donors", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const formattedRows = rows.map(r => ({
            ...r,
            available: r.available === 1,
            blood: r.blood_group // map to match frontend's expected format
        }));
        
        res.json({ donors: formattedRows });
    });
});

// Create an urgent blood request (hospital/patient)
app.post('/api/requests', (req, res) => {
    const { patient_name, hospital_name, scenario_description, blood_group, component, urgency, city, address, phone, lat, lng, units } = req.body;
    
    if (!hospital_name || !blood_group || !component || !urgency || !city || !address || !phone || lat === undefined || lng === undefined) {
        return res.status(400).json({ error: 'Missing required fields for request' });
    }

    const sql = `INSERT INTO requests (patient_name, hospital_name, scenario_description, blood_group, component, urgency, city, address, phone, lat, lng, status, units, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?)`;
    
    const createdAt = new Date().toISOString();
    const params = [patient_name || '', hospital_name, scenario_description || '', blood_group, component, urgency, city, address, phone, lat, lng, units || 1, createdAt];
    
    db.run(sql, params, function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: 'Urgent blood request posted successfully' });
    });
});

// Get all actual urgent blood requests
app.get('/api/requests', (req, res) => {
    const { status, city } = req.query;
    
    let sql = "SELECT * FROM requests WHERE 1=1";
    let params = [];
    
    if (status && status.toLowerCase() !== 'all') {
        sql += " AND status = ?";
        params.push(status);
    } else if (!status) {
        // Default to showing Open requests
        sql += " AND status = 'Open'";
    }
    
    if (city) {
        sql += " AND LOWER(city) LIKE LOWER(?)";
        params.push(`%${city}%`);
    }

    // Sort requests: Critical first, then date created
    sql += " ORDER BY CASE urgency WHEN 'Critical' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END, created_at DESC";

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ requests: rows });
    });
});

// Update request status (e.g. mark as Fulfilled)
app.put('/api/requests/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    const sql = "UPDATE requests SET status = ? WHERE id = ?";
    db.run(sql, [status, id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }
        res.json({ message: `Request status updated to ${status} successfully` });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
