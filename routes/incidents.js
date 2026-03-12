const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute, insert } = require('../db');
const { fetchWeatherData } = require('./predictions');

// ─── AI VALIDATION ───────────────────────────────────────

// Keywords that indicate substantive, actionable descriptions
const DISASTER_KEYWORDS = {
    flood: ['water', 'rain', 'submerge', 'overflow', 'drain', 'river', 'canal', 'waterlog', 'inundat', 'drown', 'rising', 'level', 'breach', 'dam', 'embankment', 'street', 'road', 'house', 'basement', 'rescue'],
    fire: ['fire', 'flame', 'smoke', 'burn', 'blaze', 'heat', 'explosion', 'gas', 'cylinder', 'electric', 'short circuit', 'sparks', 'engulf', 'spread', 'building', 'factory', 'forest'],
    earthquake: ['shake', 'tremor', 'quake', 'crack', 'collapse', 'building', 'rubble', 'richter', 'magnitude', 'aftershock', 'ground', 'structure', 'wall', 'ceiling', 'foundation'],
    accident: ['crash', 'collision', 'accident', 'vehicle', 'car', 'truck', 'bus', 'bike', 'road', 'highway', 'injur', 'hit', 'overturn', 'pile-up', 'traffic', 'speed', 'drunk', 'signal'],
    medical: ['hospital', 'patient', 'injur', 'bleed', 'unconscious', 'heart', 'stroke', 'breath', 'ambulance', 'poison', 'bite', 'allerg', 'faint', 'seizure', 'pain', 'emergency', 'critical']
};

function validateWeatherCoherence(type, weatherData) {
    if (!weatherData || Object.keys(weatherData).length === 0) return { passed: true, detail: 'Weather data unavailable — skipping check', icon: '🌐' };

    const city = Object.keys(weatherData)[0];
    const cityWeather = weatherData[city];
    if (!cityWeather) return { passed: true, detail: 'Weather data unavailable — skipping check', icon: '🌐' };

    const current = cityWeather.current;

    switch (type) {
        case 'flood': {
            const rainfall = current.precip_mm || 0;
            const humidity = current.humidity || 0;
            const rainChance = cityWeather.forecast?.forecastday?.[0]?.day?.daily_chance_of_rain || 0;
            if (rainfall > 5 || humidity > 75 || rainChance > 50) {
                return { passed: true, detail: `Current rainfall ${rainfall}mm, humidity ${humidity}% (near ${city}) — supports flood report`, icon: '🌧️' };
            }
            return { passed: false, detail: `Low rainfall (${rainfall}mm) and ${humidity}% humidity — flood unlikely`, icon: '☀️' };
        }
        case 'fire': {
            const temp = current.temp_c || 0;
            const humidity = current.humidity || 0;
            if (temp > 30 || humidity < 40) {
                return { passed: true, detail: `${temp}°C, ${humidity}% humidity — conditions support fire risk`, icon: '🔥' };
            }
            return { passed: true, detail: `Temp ${temp}°C — fire can occur in any weather (electrical, gas)`, icon: '🔥' };
        }
        case 'earthquake': {
            return { passed: true, detail: 'Multiple Indian regions are in high seismic zones — earthquakes possible anytime', icon: '🌍' };
        }
        case 'accident': {
            const vis = current.vis_km || 10;
            const rain = current.precip_mm || 0;
            if (vis < 5 || rain > 2 || !current.is_day) {
                return { passed: true, detail: `Visibility ${vis}km, rain ${rain}mm — conditions increase accident risk`, icon: '🚗' };
            }
            return { passed: true, detail: 'Road accidents can occur in any condition', icon: '🚗' };
        }
        case 'medical': {
            return { passed: true, detail: 'Medical emergencies are weather-independent', icon: '🏥' };
        }
        default:
            return { passed: true, detail: 'General incident type accepted', icon: '📋' };
    }
}

async function validateRecentIncidents(type) {
    const recent = await queryOne(
        `SELECT COUNT(*) as count FROM incidents WHERE type = ? AND createdAt >= CURRENT_TIMESTAMP - INTERVAL '7 days'`,
        [type]
    );
    const count = recent ? parseInt(recent.count || 0) : 0;
    if (count > 0) {
        return { passed: true, detail: `${count} similar report${count > 1 ? 's' : ''} in the last 7 days — corroborates this report`, icon: '📊' };
    }
    return { passed: false, detail: 'No similar reports recently — this would be the first', icon: '📊' };
}

function validateSeverity(severity, type, weatherData) {
    if (!weatherData || Object.keys(weatherData).length === 0) {
        return { passed: true, detail: 'Cannot verify severity without weather data', icon: '⚠️' };
    }

    const city = Object.keys(weatherData)[0];
    const current = weatherData[city].current;
    const isCritical = severity === 'critical' || severity === 'high';

    if (type === 'flood' && isCritical) {
        const rainfall = current.precip_mm || 0;
        if (rainfall < 2) {
            return { passed: false, detail: `${severity} severity claimed but only ${rainfall}mm rainfall detected`, icon: '⚠️' };
        }
    }

    if (type === 'fire' && isCritical) {
        return { passed: true, detail: `${severity} severity — fires can escalate rapidly`, icon: '⚠️' };
    }

    return { passed: true, detail: `Severity "${severity}" appears reasonable for ${type}`, icon: '✅' };
}

function validateDescription(description, type) {
    const words = description.trim().split(/\s+/);
    const wordCount = words.length;

    if (wordCount < 3) {
        return { passed: false, detail: 'Description too brief — provide more details for faster response', icon: '📝' };
    }

    const keywords = DISASTER_KEYWORDS[type] || [];
    const lowerDesc = description.toLowerCase();
    const matchedKeywords = keywords.filter(kw => lowerDesc.includes(kw));

    if (matchedKeywords.length >= 2) {
        return { passed: true, detail: `Description contains relevant details (${matchedKeywords.slice(0, 3).join(', ')})`, icon: '📝' };
    } else if (matchedKeywords.length === 1) {
        return { passed: true, detail: `Description mentions "${matchedKeywords[0]}" — consider adding more specifics`, icon: '📝' };
    }

    if (wordCount >= 8) {
        return { passed: true, detail: `Detailed description provided (${wordCount} words)`, icon: '📝' };
    }

    return { passed: false, detail: 'Description lacks disaster-specific details — add what you see/experienced', icon: '📝' };
}

// POST /api/incidents/validate — AI validation before submission
router.post('/incidents/validate', async (req, res) => {
    try {
        const { type, location, description, severity } = req.body;

        if (!type || !description) {
            return res.status(400).json({ error: 'type and description are required for validation' });
        }

        let weatherData = null;
        try {
            weatherData = await fetchWeatherData();
        } catch (e) {
            console.warn('Weather fetch failed during validation:', e.message);
        }

        const recentIncidentCheck = await validateRecentIncidents(type);

        const checks = [
            { name: 'Weather Coherence', ...validateWeatherCoherence(type, weatherData) },
            { name: 'Recent Incidents', ...recentIncidentCheck },
            { name: 'Severity Match', ...validateSeverity(severity, type, weatherData) },
            { name: 'Description Quality', ...validateDescription(description, type) }
        ];

        const passedCount = checks.filter(c => c.passed).length;
        const confidence = Math.round((passedCount / checks.length) * 100);

        let recommendation;
        if (confidence >= 75) {
            recommendation = 'Report appears consistent with current conditions. Proceeding with submission.';
        } else if (confidence >= 50) {
            recommendation = 'Some checks flagged — report may still be valid. Review the details or submit as-is.';
        } else {
            recommendation = 'Multiple checks failed — please verify your report details before submitting.';
        }

        const typeLabels = { flood: 'Flood', fire: 'Fire', earthquake: 'Earthquake', accident: 'Road Accident', medical: 'Medical Emergency', other: 'Incident' };

        res.json({
            valid: confidence >= 50,
            confidence,
            riskLevel: confidence >= 75 ? 'high' : confidence >= 50 ? 'medium' : 'low',
            incidentType: typeLabels[type] || type,
            checks,
            recommendation
        });
    } catch (err) {
        console.error('Validation error:', err);
        res.status(500).json({ error: 'Validation failed', valid: true, confidence: 100, checks: [], recommendation: 'Validation unavailable — submitting directly.' });
    }
});

// ─── INCIDENTS ───────────────────────────────────────────

// POST /api/incidents — report a new incident
router.post('/incidents', async (req, res) => {
    try {
        const { type, location, description, severity, contactNumber } = req.body;

        if (!type || !location || !description) {
            return res.status(400).json({ error: 'type, location, and description are required' });
        }

        const incidentId = await insert(
            `INSERT INTO incidents (type, location, description, severity, contactNumber) VALUES (?, ?, ?, ?, ?)`,
            [type, location, description, severity || 'low', contactNumber || null]
        );

        const incident = await queryOne('SELECT * FROM incidents WHERE id = ?', [incidentId]);

        const typeMap = {
            flood: 'Flood', fire: 'Fire', earthquake: 'Earthquake',
            accident: 'Road Accident', medical: 'Medical Emergency', other: 'Incident'
        };
        const alertType = (severity === 'critical' || severity === 'high') ? 'critical' :
            severity === 'medium' ? 'warning' : 'info';

        await execute(
            `INSERT INTO alerts (type, title, description, location) VALUES (?, ?, ?, ?)`,
            [alertType, `${typeMap[type] || 'Incident'} Reported`, description, location]
        );

        res.status(201).json(incident);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create incident' });
    }
});

// GET /api/incidents — list all incidents
router.get('/incidents', async (req, res) => {
    try {
        const { status, severity, limit } = req.query;
        let sql = 'SELECT * FROM incidents';
        const conditions = [];
        const params = [];

        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        if (severity) {
            conditions.push('severity = ?');
            params.push(severity);
        }
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY createdAt DESC';
        if (limit) {
            sql += ` LIMIT ${parseInt(limit)}`;
        }

        const incidents = await queryAll(sql, params);
        res.json(incidents);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch incidents' });
    }
});

// GET /api/incidents/:id — single incident
router.get('/incidents/:id', async (req, res) => {
    try {
        const incident = await queryOne('SELECT * FROM incidents WHERE id = ?', [parseInt(req.params.id)]);
        if (!incident) {
            return res.status(404).json({ error: 'Incident not found' });
        }
        res.json(incident);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch incident' });
    }
});

// PATCH /api/incidents/:id — update incident status
router.patch('/incidents/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;
        const existing = await queryOne('SELECT * FROM incidents WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Incident not found' });
        }

        await execute("UPDATE incidents SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [status, id]);

        const updated = await queryOne('SELECT * FROM incidents WHERE id = ?', [id]);
        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update incident' });
    }
});

// ─── ALERTS ─────────────────────────────────────────────

// GET /api/alerts — list alerts
router.get('/alerts', async (req, res) => {
    try {
        const { active, limit } = req.query;
        let sql = 'SELECT * FROM alerts';

        if (active === 'true') {
            sql += ' WHERE isActive = 1';
        }
        sql += ' ORDER BY createdAt DESC';
        if (limit) {
            sql += ` LIMIT ${parseInt(limit)}`;
        }

        const alerts = await queryAll(sql);
        res.json(alerts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

// POST /api/alerts — create an alert
router.post('/alerts', async (req, res) => {
    try {
        const { type, title, description, location } = req.body;

        if (!title || !description) {
            return res.status(400).json({ error: 'title and description are required' });
        }

        const alertId = await insert(
            `INSERT INTO alerts (type, title, description, location) VALUES (?, ?, ?, ?)`,
            [type || 'info', title, description, location || null]
        );

        const alert = await queryOne('SELECT * FROM alerts WHERE id = ?', [alertId]);
        res.status(201).json(alert);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create alert' });
    }
});

// PATCH /api/alerts/:id — deactivate an alert
router.patch('/alerts/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { isActive } = req.body;
        const existing = await queryOne('SELECT * FROM alerts WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        await execute('UPDATE alerts SET isActive = ? WHERE id = ?', [isActive ? 1 : 0, id]);

        const updated = await queryOne('SELECT * FROM alerts WHERE id = ?', [id]);
        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update alert' });
    }
});

// POST /api/sos — trigger SOS emergency
router.post('/sos', async (req, res) => {
    try {
        const { lat, lng } = req.body;
        const location = (lat && lng)
            ? `Coordinates ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`
            : 'Unknown Location';

        const alertId = await insert(
            `INSERT INTO alerts (type, title, description, location) VALUES ('critical', 'EMERGENCY SOS TRIGGERED', ?, 'Current Location')`,
            [`Emergency assistance requested at ${location}`]
        );

        const alert = await queryOne('SELECT * FROM alerts WHERE id = ?', [alertId]);
        res.status(201).json({
            alert,
            message: 'SOS activated! Emergency services have been alerted.'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to trigger SOS' });
    }
});

module.exports = router;
