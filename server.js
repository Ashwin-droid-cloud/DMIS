require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Static files (serve HTML, CSS, JS from root)
app.use(express.static(path.join(__dirname)));

// API Routes
const shelterRoutes = require('./routes/shelters');
const incidentRoutes = require('./routes/incidents');
const predictionRoutes = require('./routes/predictions');

app.use('/api/shelters', shelterRoutes);
app.use('/api', incidentRoutes);
app.use('/api', predictionRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Default route → management2.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'management2.html'));
});

// Initialize DB then start server
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🛡️  DMIS India Backend`);
        console.log(`📡 Server running on http://localhost:${PORT}`);
        console.log(`   API docs:`);
        console.log(`     GET  /api/shelters         — List shelters`);
        console.log(`     GET  /api/shelters/stats    — Shelter stats`);
        console.log(`     GET  /api/shelters/:id      — Single shelter`);
        console.log(`     PUT  /api/shelters/:id      — Update shelter`);
        console.log(`     GET  /api/incidents         — List incidents`);
        console.log(`     POST /api/incidents         — Report incident`);
        console.log(`     GET  /api/alerts            — List alerts`);
        console.log(`     POST /api/alerts            — Create alert`);
        console.log(`     POST /api/sos               — Trigger SOS`);
        console.log(`     GET  /api/health            — Health check\n`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
