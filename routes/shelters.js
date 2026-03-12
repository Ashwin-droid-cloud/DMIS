const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute, insert } = require('../db');

// POST /api/shelters — register a custom safe place
router.post('/', async (req, res) => {
    try {
        const { name, lat, lng, capacity, facilities, contactPerson, phone, address, city } = req.body;

        if (!name || lat == null || lng == null || !capacity) {
            return res.status(400).json({ error: 'name, lat, lng, and capacity are required' });
        }

        const shelterId = await insert(
            `INSERT INTO shelters (name, lat, lng, capacity, currentOccupancy, facilities, contactPerson, phone, address, city)
             VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
            [
                name,
                parseFloat(lat),
                parseFloat(lng),
                parseInt(capacity),
                JSON.stringify(facilities || []),
                contactPerson || null,
                phone || null,
                address || null,
                city || null
            ]
        );

        // Auto-create an alert about the new shelter
        await execute(
            `INSERT INTO alerts (type, title, description, location) VALUES ('info', ?, ?, ?)`,
            [
                'New Safe Place Registered',
                `${name} has been registered as an emergency shelter with capacity for ${capacity} people`,
                address || city || 'Custom Location'
            ]
        );

        const shelter = await queryOne('SELECT * FROM shelters WHERE id = ?', [shelterId]);
        if (shelter) shelter.facilities = JSON.parse(shelter.facilities);
        res.status(201).json(shelter);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create shelter' });
    }
});

// GET /api/shelters — list all shelters
router.get('/', async (req, res) => {
    try {
        const { city, available } = req.query;
        let sql = 'SELECT * FROM shelters';
        const conditions = [];
        const params = [];

        if (city) {
            conditions.push('city = ?');
            params.push(city);
        }
        if (available === 'true') {
            conditions.push('currentOccupancy < capacity');
        }
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        sql += ' ORDER BY city, name';

        const shelters = await queryAll(sql, params);
        const result = shelters.map(s => ({
            ...s,
            facilities: JSON.parse(s.facilities)
        }));
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch shelters' });
    }
});

// GET /api/shelters/stats — aggregate stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await queryOne(`
        SELECT
          COUNT(*) as "totalShelters",
          SUM(capacity) as "totalCapacity",
          SUM(currentOccupancy) as "totalOccupancy",
          SUM(capacity - currentOccupancy) as "availableCapacity",
          SUM(CASE WHEN currentOccupancy < capacity THEN 1 ELSE 0 END) as "activeShelters"
        FROM shelters
      `);

        const activeAlerts = await queryOne('SELECT COUNT(*) as count FROM alerts WHERE isActive = 1');

        res.json({
            activeShelters: stats ? parseInt(stats.activeShelters || 0) : 0,
            totalCapacity: stats ? parseInt(stats.totalCapacity || 0) : 0,
            availableCapacity: stats ? parseInt(stats.availableCapacity || 0) : 0,
            totalOccupancy: stats ? parseInt(stats.totalOccupancy || 0) : 0,
            activeAlerts: activeAlerts ? parseInt(activeAlerts.count || 0) : 0,
            avgResponseTime: '< 5'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/shelters/:id — single shelter
router.get('/:id', async (req, res) => {
    try {
        const shelter = await queryOne('SELECT * FROM shelters WHERE id = ?', [parseInt(req.params.id)]);
        if (!shelter) {
            return res.status(404).json({ error: 'Shelter not found' });
        }
        shelter.facilities = JSON.parse(shelter.facilities);
        res.json(shelter);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch shelter' });
    }
});

// PUT /api/shelters/:id — update shelter
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = await queryOne('SELECT * FROM shelters WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Shelter not found' });
        }

        const { name, capacity, currentOccupancy, facilities, contactPerson, phone, address } = req.body;

        await execute(`
        UPDATE shelters SET
          name = ?,
          capacity = ?,
          currentOccupancy = ?,
          facilities = ?,
          contactPerson = ?,
          phone = ?,
          address = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
            name || existing.name,
            capacity != null ? capacity : existing.capacity,
            currentOccupancy != null ? currentOccupancy : existing.currentOccupancy,
            facilities ? JSON.stringify(facilities) : existing.facilities,
            contactPerson || existing.contactPerson,
            phone || existing.phone,
            address || existing.address,
            id
        ]);

        const shelter = await queryOne('SELECT * FROM shelters WHERE id = ?', [id]);
        shelter.facilities = JSON.parse(shelter.facilities);
        res.json(shelter);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update shelter' });
    }
});

// PATCH /api/shelters/:id/occupancy — quick occupancy update
router.patch('/:id/occupancy', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { currentOccupancy } = req.body;
        if (currentOccupancy == null) {
            return res.status(400).json({ error: 'currentOccupancy is required' });
        }

        const existing = await queryOne('SELECT * FROM shelters WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Shelter not found' });
        }

        await execute("UPDATE shelters SET currentOccupancy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [currentOccupancy, id]);

        const shelter = await queryOne('SELECT * FROM shelters WHERE id = ?', [id]);
        shelter.facilities = JSON.parse(shelter.facilities);
        res.json(shelter);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update occupancy' });
    }
});

module.exports = router;
