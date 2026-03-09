const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
// Glitch uses a hidden .data folder for persistent data. We use that path if we aren't using DB_PATH from Render.
const dbPath = process.env.DB_PATH || path.join(__dirname, '.data', 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create tables
        db.run(`CREATE TABLE IF NOT EXISTS lists (
            id TEXT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            list_id TEXT,
            name TEXT NOT NULL,
            image_url TEXT,
            checked BOOLEAN DEFAULT 0,
            FOREIGN KEY (list_id) REFERENCES lists(id)
        )`);
    }
});

// --- API Endpoints ---

// 1. Create a new list
app.post('/api/lists', (req, res) => {
    const listId = uuidv4();
    db.run('INSERT INTO lists (id) VALUES (?)', [listId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: listId });
    });
});

// 2. Get all items in a list
app.get('/api/lists/:id/items', (req, res) => {
    const listId = req.params.id;
    db.all('SELECT * FROM items WHERE list_id = ?', [listId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 3. Add an item to a list
app.post('/api/lists/:id/items', (req, res) => {
    const listId = req.params.id;
    const { name, image_url } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Item name is required' });
    }

    const sql = 'INSERT INTO items (list_id, name, image_url) VALUES (?, ?, ?)';
    db.run(sql, [listId, name, image_url], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ 
            id: this.lastID, 
            list_id: listId, 
            name, 
            image_url, 
            checked: 0 
        });
    });
});

// 4. Toggle item checked status
app.patch('/api/items/:itemId', (req, res) => {
    const { itemId } = req.params;
    const { checked } = req.body;

    const sql = 'UPDATE items SET checked = ? WHERE id = ?';
    db.run(sql, [checked ? 1 : 0, itemId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, changes: this.changes });
    });
});

// 5. Delete an item
app.delete('/api/items/:itemId', (req, res) => {
    const { itemId } = req.params;
    
    db.run('DELETE FROM items WHERE id = ?', [itemId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, changes: this.changes });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
