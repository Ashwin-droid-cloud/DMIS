const { initDb, execute, insert } = require('./db');

// Major shelter locations across India
const shelters = [
    { id: 1, name: "Indira Gandhi Indoor Stadium", lat: 28.6295, lng: 77.2407, capacity: 5000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity", "Blankets"], contactPerson: "NDMA Delhi", phone: "011-2343809", address: "I.P. Estate, New Delhi", city: "Delhi" },
    { id: 2, name: "Jawaharlal Nehru Stadium Complex", lat: 28.5828, lng: 77.2344, capacity: 4000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "Delhi Disaster Relief", phone: "011-2436952", address: "Pragati Vihar, New Delhi", city: "Delhi" },
    { id: 3, name: "Bombay Exhibition Centre", lat: 19.1466, lng: 72.8541, capacity: 6000, currentOccupancy: 0, facilities: ["Medical Aid", "Emergency Care", "Food", "Water", "Electricity"], contactPerson: "BMC Emergency Cell", phone: "022-2269472", address: "Goregaon East, Mumbai", city: "Mumbai" },
    { id: 4, name: "NSCI Dome", lat: 18.9837, lng: 72.8122, capacity: 3000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Blankets", "Electricity"], contactPerson: "Mumbai Relief", phone: "022-2493888", address: "Worli, Mumbai", city: "Mumbai" },
    { id: 5, name: "Sree Kanteerava Indoor Stadium", lat: 12.9698, lng: 77.5954, capacity: 3500, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "BBMP Control Room", phone: "080-2222118", address: "Sampangi Rama Nagar, Bangalore", city: "Bangalore" },
    { id: 6, name: "BIEC Relief Center", lat: 13.0645, lng: 77.4725, capacity: 8000, currentOccupancy: 0, facilities: ["Medical Aid", "Emergency Care", "Food", "Water", "Blankets", "Electricity", "Generator"], contactPerson: "State Disaster Authority", phone: "080-2234067", address: "Tumkur Road, Bangalore", city: "Bangalore" },
    { id: 7, name: "Jawaharlal Nehru Stadium", lat: 13.0827, lng: 80.2707, capacity: 4500, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "Chennai Relief Center", phone: "044-2561920", address: "Periamet, Chennai", city: "Chennai" },
    { id: 8, name: "Netaji Indoor Stadium", lat: 22.5694, lng: 88.3411, capacity: 4000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity", "Blankets"], contactPerson: "KMC Disaster Cell", phone: "033-2286121", address: "BBD Bagh, Kolkata", city: "Kolkata" },
    { id: 9, name: "Salt Lake Stadium Relief Camp", lat: 22.5645, lng: 88.4093, capacity: 7000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Beds", "Generator", "Electricity"], contactPerson: "State Authority", phone: "033-2214352", address: "Bidhannagar, Kolkata", city: "Kolkata" },
    { id: 10, name: "GMC Balayogi Athletic Stadium", lat: 17.4411, lng: 78.3475, capacity: 3000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "GHMC Control Room", phone: "040-2320211", address: "Gachibowli, Hyderabad", city: "Hyderabad" },
    { id: 11, name: "SMS Stadium Relief Center", lat: 26.8904, lng: 75.8016, capacity: 2500, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "SDRF Rajasthan", phone: "0141-2222222", address: "Lal Kothi, Jaipur", city: "Jaipur" },
    { id: 12, name: "Narendra Modi Stadium Camp", lat: 23.0924, lng: 72.5976, capacity: 10000, currentOccupancy: 0, facilities: ["Medical Aid", "Emergency Care", "Food", "Water", "Beds", "Generator", "Electricity"], contactPerson: "GSDMA", phone: "079-2325190", address: "Motera, Ahmedabad", city: "Ahmedabad" },
    { id: 13, name: "Kalinga Stadium Relief Hub", lat: 20.2921, lng: 85.8239, capacity: 3000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "OSDMA", phone: "0674-2395398", address: "Bhubaneswar", city: "Bhubaneswar" },
    { id: 14, name: "Eka Arena Transport Node", lat: 23.0039, lng: 72.5991, capacity: 2000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "Relief Commissioner", phone: "079-2325191", address: "Kankaria, Ahmedabad", city: "Ahmedabad" },
    { id: 15, name: "Indira Gandhi Pratishthan", lat: 26.8648, lng: 81.0118, capacity: 4000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity", "Blankets"], contactPerson: "UP SDMA", phone: "0522-2306883", address: "Gomti Nagar, Lucknow", city: "Lucknow" },
    { id: 16, name: "Green Park Stadium", lat: 26.4851, lng: 80.3479, capacity: 2500, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "Kanpur Relief Office", phone: "0512-2531211", address: "Civil Lines, Kanpur", city: "Kanpur" },
    { id: 17, name: "Govindan Nair Stadium", lat: 9.9312, lng: 76.2673, capacity: 1500, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "KSDMA", phone: "0471-2364424", address: "Ernakulam, Kochi", city: "Kochi" },
    { id: 18, name: "Nehru Stadium", lat: 18.5034, lng: 73.8687, capacity: 2000, currentOccupancy: 0, facilities: ["Food", "Water", "Electricity"], contactPerson: "Pune Municipal", phone: "020-2550100", address: "Swargate, Pune", city: "Pune" },
    { id: 19, name: "TT Nagar Stadium", lat: 23.2386, lng: 77.3995, capacity: 3000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "MP SDMA", phone: "0755-2433144", address: "Bhopal", city: "Bhopal" },
    { id: 20, name: "Holkar Stadium Camp", lat: 22.7231, lng: 75.8787, capacity: 2500, currentOccupancy: 0, facilities: ["Food", "Water", "Electricity"], contactPerson: "Indore Relief", phone: "0731-2536854", address: "Janjeerwala Square, Indore", city: "Indore" },
    { id: 21, name: "Keenan Stadium", lat: 22.8021, lng: 86.1834, capacity: 1500, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Electricity"], contactPerson: "JSDMA", phone: "0651-2400218", address: "Bistupur, Jamshedpur", city: "Jamshedpur" },
    { id: 22, name: "Nehru Stadium Guwahati", lat: 26.1783, lng: 91.7589, capacity: 2000, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Emergency Care", "Electricity"], contactPerson: "ASDMA", phone: "0361-2237010", address: "Ulubari, Guwahati", city: "Guwahati" },
    { id: 23, name: "Sher-e-Kashmir Stadium", lat: 34.0763, lng: 74.8214, capacity: 1500, currentOccupancy: 0, facilities: ["Medical Aid", "Food", "Water", "Blankets", "Electricity"], contactPerson: "JK SDMA", phone: "0194-2452138", address: "Sonwar Bagh, Srinagar", city: "Srinagar" },
    { id: 24, name: "University Campus Camp", lat: 30.7610, lng: 76.7688, capacity: 2000, currentOccupancy: 0, facilities: ["Food", "Water", "Electricity"], contactPerson: "Chandigarh Control", phone: "0172-2704048", address: "Sector 14, Chandigarh", city: "Chandigarh" }
];

const defaultAlerts = [
    { type: 'info', title: 'Weather Update', description: 'Clear skies expected across most central regions for the next 24 hours. Temperature: 28°C', location: 'Central India' },
    { type: 'info', title: 'System Status', description: 'Major emergency shelters are fully operational and ready across all metropolitans', location: 'All India' },
    { type: 'warning', title: 'Traffic Advisory', description: 'Heavy congestion on NH-48 near Mumbai. Seek alternate routes', location: 'Mumbai - NH48' }
];

async function seed() {
    console.log('🌱 Seeding database...');
    await initDb();

    await execute('TRUNCATE TABLE shelters CASCADE');
    await execute('TRUNCATE TABLE alerts CASCADE');
    await execute('TRUNCATE TABLE incidents CASCADE');

    const insertShelterSql = `
        INSERT INTO shelters (id, name, lat, lng, capacity, currentOccupancy, facilities, contactPerson, phone, address, city)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            capacity = EXCLUDED.capacity,
            currentOccupancy = EXCLUDED.currentOccupancy,
            facilities = EXCLUDED.facilities,
            contactPerson = EXCLUDED.contactPerson,
            phone = EXCLUDED.phone,
            address = EXCLUDED.address,
            city = EXCLUDED.city
    `;

    for (const s of shelters) {
        await execute(
            insertShelterSql,
            [s.id, s.name, s.lat, s.lng, s.capacity, s.currentOccupancy,
            JSON.stringify(s.facilities), s.contactPerson, s.phone, s.address, s.city]
        );
    }
    console.log(`  ✅ Inserted ${shelters.length} shelters`);

    for (const a of defaultAlerts) {
        await insert(
            `INSERT INTO alerts (type, title, description, location) VALUES ($1, $2, $3, $4)`,
            [a.type, a.title, a.description, a.location]
        );
    }
    console.log(`  ✅ Inserted ${defaultAlerts.length} default alerts`);
    console.log('🎉 Database seeded successfully!');
}

seed().then(() => process.exit(0)).catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
