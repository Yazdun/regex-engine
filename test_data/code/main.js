// Main application entry point
const express = require('express');
const { createConnection } = require('mysql2');
const bcrypt = require('bcrypt');

/**
 * Database configuration
 * TODO: Move to environment variables
 */
const dbConfig = {
    host: 'localhost',
    user: 'admin',
    password: 'secret123',
    database: 'app_db'
};

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

/* Global variables */
let connectionPool = null;
var userSessions = new Map();
const API_VERSION = "v2.1.0";

function initializeDatabase() {
    try {
        connectionPool = createConnection(dbConfig);
        console.log('Database connected successfully');
    } catch (error) {
        console.error('Failed to connect to database:', error.message);
        process.exit(1);
    }
}

// User authentication function
async function authenticateUser(email, password) {
    const query = "SELECT id, password_hash FROM users WHERE email = ?";
    const [rows] = await connectionPool.execute(query, [email]);

    if (rows.length === 0) {
        throw new Error('User not found');
    }

    const isValid = await bcrypt.compare(password, rows[0].password_hash);
    return isValid ? rows[0].id : null;
}

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInput(data) {
    const errors = [];

    if (!data.username || data.username.length < 3) {
        errors.push("Username must be at least 3 characters");
    }

    if (!emailRegex.test(data.email)) {
        errors.push("Invalid email format");
    }

    return errors;
}

// API Routes
app.get('/api/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);

    if (isNaN(userId) || userId <= 0) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Implementation here...
    res.json({ message: 'User data retrieved' });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userId = await authenticateUser(email, password);
        if (userId) {
            const sessionToken = generateToken();
            userSessions.set(sessionToken, { userId, timestamp: Date.now() });
            res.json({ token: sessionToken, success: true });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        console.log('Authentication error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Cleanup function for expired sessions
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of userSessions) {
        if (now - session.timestamp > 3600000) { // 1 hour
            userSessions.delete(token);
        }
    }
}, 300000); // Run every 5 minutes

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Something went wrong!',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API version: ${API_VERSION}`);
    initializeDatabase();
});

module.exports = { app, authenticateUser, validateInput };
