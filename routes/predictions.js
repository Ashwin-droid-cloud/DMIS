const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../db');

const WEATHER_API_KEY = 'bc400323888e49a0a74104208262002';
const WEATHER_API_BASE = 'https://api.weatherapi.com/v1';

// ── Locations to monitor ─────────────────────────────────
const LOCATIONS = [
    { name: 'Delhi', query: 'New Delhi', lat: 28.6139, lng: 77.2090 },
    { name: 'Mumbai', query: 'Mumbai', lat: 19.0760, lng: 72.8777 },
    { name: 'Bangalore', query: 'Bangalore', lat: 12.9716, lng: 77.5946 },
    { name: 'Chennai', query: 'Chennai', lat: 13.0827, lng: 80.2707 },
    { name: 'Kolkata', query: 'Kolkata', lat: 22.5726, lng: 88.3639 }
];

// ── Cache (avoid hammering the API) ──────────────────────
let weatherCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Fetch weather + forecast for all locations ───────────
async function fetchWeatherData() {
    const now = Date.now();
    if (weatherCache.data && (now - weatherCache.timestamp) < CACHE_TTL) {
        return weatherCache.data;
    }

    const results = {};
    for (const loc of LOCATIONS) {
        try {
            const url = `${WEATHER_API_BASE}/forecast.json?key=${WEATHER_API_KEY}&q=${loc.query}&days=3&aqi=yes`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`API ${res.status}`);
            results[loc.name] = await res.json();
        } catch (err) {
            console.error(`Weather fetch error for ${loc.name}:`, err.message);
            results[loc.name] = null;
        }
    }

    weatherCache = { data: results, timestamp: now };
    return results;
}

// ── Compute flood risk from real weather data ────────────
function computeFloodRisk(weather) {
    if (!weather) return { score: 10, factors: ['No weather data available'] };

    const current = weather.current;
    const forecast = weather.forecast.forecastday;
    let score = 0;
    const factors = [];

    // Current precipitation
    if (current.precip_mm > 50) { score += 35; factors.push(`Heavy rainfall: ${current.precip_mm}mm`); }
    else if (current.precip_mm > 20) { score += 22; factors.push(`Moderate rainfall: ${current.precip_mm}mm`); }
    else if (current.precip_mm > 5) { score += 10; factors.push(`Light rainfall: ${current.precip_mm}mm`); }
    else { factors.push('No significant rainfall currently'); }

    // Humidity
    if (current.humidity > 85) { score += 15; factors.push(`Very high humidity: ${current.humidity}%`); }
    else if (current.humidity > 70) { score += 8; factors.push(`High humidity: ${current.humidity}%`); }

    // Forecast rain probability (next 3 days)
    let maxRainChance = 0;
    let totalForecastPrecip = 0;
    forecast.forEach(day => {
        const rainChance = day.day.daily_chance_of_rain;
        if (rainChance > maxRainChance) maxRainChance = rainChance;
        totalForecastPrecip += day.day.totalprecip_mm;
    });

    if (maxRainChance > 70) { score += 20; factors.push(`${maxRainChance}% rain chance in forecast`); }
    else if (maxRainChance > 40) { score += 12; factors.push(`${maxRainChance}% rain chance in forecast`); }

    if (totalForecastPrecip > 100) { score += 18; factors.push(`${totalForecastPrecip.toFixed(0)}mm total forecast precipitation`); }
    else if (totalForecastPrecip > 40) { score += 10; factors.push(`${totalForecastPrecip.toFixed(0)}mm forecast precipitation`); }

    // Cloud cover
    if (current.cloud > 80) { score += 5; factors.push('Dense cloud cover'); }

    return { score: Math.min(100, Math.max(0, Math.round(score))), factors: factors.slice(0, 3) };
}

// ── Compute fire risk from real weather data ─────────────
function computeFireRisk(weather) {
    if (!weather) return { score: 10, factors: ['No weather data available'] };

    const current = weather.current;
    let score = 0;
    const factors = [];

    // Temperature (high heat = fire risk)
    if (current.temp_c > 42) { score += 30; factors.push(`Extreme heat: ${current.temp_c}°C`); }
    else if (current.temp_c > 38) { score += 22; factors.push(`Very hot: ${current.temp_c}°C`); }
    else if (current.temp_c > 33) { score += 14; factors.push(`Hot conditions: ${current.temp_c}°C`); }
    else if (current.temp_c > 28) { score += 8; factors.push(`Warm: ${current.temp_c}°C`); }
    else { factors.push(`Temperature: ${current.temp_c}°C`); }

    // Low humidity = fire risk
    if (current.humidity < 20) { score += 25; factors.push(`Very dry: ${current.humidity}% humidity`); }
    else if (current.humidity < 35) { score += 18; factors.push(`Dry conditions: ${current.humidity}% humidity`); }
    else if (current.humidity < 50) { score += 8; factors.push(`Moderate humidity: ${current.humidity}%`); }

    // Wind speed (spreads fire)
    if (current.wind_kph > 40) { score += 20; factors.push(`Strong winds: ${current.wind_kph} km/h`); }
    else if (current.wind_kph > 25) { score += 12; factors.push(`Moderate winds: ${current.wind_kph} km/h`); }
    else if (current.wind_kph > 15) { score += 5; }

    // No rain = higher fire risk
    if (current.precip_mm === 0) { score += 8; factors.push('No precipitation'); }

    // UV index
    if (current.uv > 8) { score += 10; factors.push(`Very high UV: ${current.uv}`); }
    else if (current.uv > 5) { score += 5; }

    return { score: Math.min(100, Math.max(0, Math.round(score))), factors: factors.slice(0, 3) };
}

// ── Compute road accident risk ───────────────────────────
function computeAccidentRisk(weather) {
    if (!weather) return { score: 15, factors: ['No weather data available'] };

    const current = weather.current;
    let score = 5; // baseline
    const factors = [];

    // Visibility
    if (current.vis_km < 1) { score += 35; factors.push(`Very poor visibility: ${current.vis_km}km`); }
    else if (current.vis_km < 3) { score += 25; factors.push(`Low visibility: ${current.vis_km}km`); }
    else if (current.vis_km < 5) { score += 15; factors.push(`Reduced visibility: ${current.vis_km}km`); }
    else { factors.push(`Good visibility: ${current.vis_km}km`); }

    // Fog/mist conditions
    const code = current.condition?.code;
    if ([1135, 1147].includes(code)) { score += 20; factors.push('Fog conditions detected'); }
    else if ([1030].includes(code)) { score += 10; factors.push('Mist/haze present'); }

    // Rain (slippery roads)
    if (current.precip_mm > 10) { score += 18; factors.push(`Heavy rain — slippery roads`); }
    else if (current.precip_mm > 2) { score += 10; factors.push('Wet road conditions'); }

    // Wind gusts
    if (current.gust_kph > 50) { score += 12; factors.push(`Dangerous gusts: ${current.gust_kph} km/h`); }
    else if (current.gust_kph > 30) { score += 6; }

    // Time of day — night driving risk
    if (!current.is_day) { score += 8; factors.push('Nighttime driving conditions'); }

    return { score: Math.min(100, Math.max(0, Math.round(score))), factors: factors.slice(0, 3) };
}

// ── Compute medical emergency risk ───────────────────────
function computeMedicalRisk(weather) {
    if (!weather) return { score: 10, factors: ['No weather data available'] };

    const current = weather.current;
    const aqi = current.air_quality;
    let score = 5;
    const factors = [];

    // Air quality (PM2.5)
    if (aqi) {
        const pm25 = aqi.pm2_5;
        const epaIndex = aqi['us-epa-index'];
        if (pm25 > 150) { score += 30; factors.push(`Hazardous air: PM2.5 = ${Math.round(pm25)} µg/m³`); }
        else if (pm25 > 100) { score += 22; factors.push(`Unhealthy air: PM2.5 = ${Math.round(pm25)} µg/m³`); }
        else if (pm25 > 55) { score += 14; factors.push(`Moderate AQI: PM2.5 = ${Math.round(pm25)} µg/m³`); }
        else if (pm25 > 35) { score += 8; factors.push(`Fair air quality: PM2.5 = ${Math.round(pm25)}`); }
        else { factors.push(`Good air quality: PM2.5 = ${Math.round(pm25)}`); }

        if (epaIndex >= 4) { score += 10; factors.push(`EPA Index: ${epaIndex}/6 (Unhealthy)`); }
    }

    // Heat stress
    if (current.feelslike_c > 45) { score += 25; factors.push(`Extreme heat index: ${current.feelslike_c}°C`); }
    else if (current.feelslike_c > 40) { score += 18; factors.push(`Dangerous heat: feels like ${current.feelslike_c}°C`); }
    else if (current.feelslike_c > 35) { score += 10; factors.push(`Heat stress risk: feels like ${current.feelslike_c}°C`); }

    // Cold stress
    if (current.feelslike_c < 2) { score += 20; factors.push(`Cold stress: feels like ${current.feelslike_c}°C`); }
    else if (current.feelslike_c < 8) { score += 10; factors.push(`Cold conditions: feels like ${current.feelslike_c}°C`); }

    return { score: Math.min(100, Math.max(0, Math.round(score))), factors: factors.slice(0, 3) };
}

// ── Compute earthquake risk (weather-independent) ────────
async function computeEarthquakeRisk() {
    // Earthquakes aren't weather-dependent, use seismic zone + base probability
    // Major parts of India sit in Seismic Zones IV and V (High Damage Risk Zones)
    const baseScore = 12;
    const factors = ['Seismic Zone IV region', 'No recent seismic alerts'];

    // Check for recent earthquake incidents in DB
    const recent = await queryOne(`
    SELECT COUNT(*) as count FROM incidents
    WHERE type = 'earthquake' AND createdAt >= CURRENT_TIMESTAMP - INTERVAL '7 days'
  `);

    let score = baseScore;
    const recentCount = recent ? parseInt(recent.count || 0) : 0;
    if (recentCount > 0) {
        score += recentCount * 15;
        factors[1] = `${recentCount} recent earthquake reports`;
        factors.push('Aftershock probability elevated');
    }

    return { score: Math.min(100, Math.max(0, score)), factors };
}

// ── Risk level classification ────────────────────────────
function getRiskLevel(score) {
    if (score >= 70) return 'Critical';
    if (score >= 50) return 'High';
    if (score >= 30) return 'Moderate';
    return 'Low';
}

// ── Build timeline from forecast data ────────────────────
function buildTimeline(weatherData, overallScore, topRiskCityName = 'Delhi') {
    const cityWeather = weatherData[topRiskCityName] || Object.values(weatherData)[0];
    if (!cityWeather) {
        // Fallback to projected timeline
        return [
            { period: 'Now', label: 'Current', score: overallScore },
            { period: '6h', label: 'Next 6h', score: Math.round(Math.min(100, overallScore + 3)) },
            { period: '12h', label: '6-12h', score: Math.round(Math.min(100, overallScore + 5)) },
            { period: '24h', label: '12-24h', score: Math.round(Math.min(100, overallScore + 8)) },
            { period: '48h', label: '24-48h', score: Math.round(Math.min(100, overallScore + 10)) },
            { period: '72h', label: '48-72h', score: Math.round(Math.min(100, overallScore + 12)) }
        ];
    }

    const forecast = cityWeather.forecast.forecastday;
    const timeline = [{ period: 'Now', label: 'Current', score: overallScore }];

    // Use real forecast hourly data to project risk
    const hours = forecast.flatMap(d => d.hour);
    const now = new Date();
    const futureHours = hours.filter(h => new Date(h.time) > now);

    const intervals = [6, 12, 24, 48, 72];
    const labels = ['Next 6h', '6-12h', '12-24h', '24-48h', '48-72h'];

    intervals.forEach((h, i) => {
        const targetHour = futureHours.find((fh, idx) => {
            const hourDiff = (new Date(fh.time) - now) / (1000 * 60 * 60);
            return hourDiff >= h - 3 && hourDiff <= h + 3;
        });

        if (targetHour) {
            // Calculate risk score for that hour based on conditions
            let riskScore = 0;

            // Rain risk component
            riskScore += (targetHour.chance_of_rain || 0) * 0.25;

            // Temperature extremes
            if (targetHour.temp_c > 40) riskScore += 15;
            else if (targetHour.temp_c > 35) riskScore += 8;
            if (targetHour.temp_c < 5) riskScore += 10;

            // Visibility
            if (targetHour.vis_km < 2) riskScore += 20;
            else if (targetHour.vis_km < 5) riskScore += 10;

            // Humidity extremes
            if (targetHour.humidity < 20) riskScore += 10;
            if (targetHour.humidity > 85) riskScore += 8;

            // Wind
            if (targetHour.wind_kph > 30) riskScore += 10;

            // AQI
            if (targetHour.air_quality?.pm2_5 > 100) riskScore += 12;
            else if (targetHour.air_quality?.pm2_5 > 55) riskScore += 6;

            riskScore = Math.round(Math.min(100, Math.max(5, riskScore)));
            timeline.push({ period: `${h}h`, label: labels[i], score: riskScore });
        } else {
            // Estimate from overall trend
            timeline.push({ period: `${h}h`, label: labels[i], score: Math.round(Math.min(100, overallScore + i * 3)) });
        }
    });

    return timeline;
}

// ── Generate smart recommendations ───────────────────────
function generateRecommendations(byType, weatherData, occupancyPressure, topRiskCityName = 'Delhi') {
    const recommendations = [];
    const cityWeather = weatherData[topRiskCityName] || Object.values(weatherData)[0];
    const current = cityWeather?.current;

    // Weather-based recommendations
    if (current) {
        if (current.precip_mm > 20) {
            recommendations.push({
                priority: 'high',
                text: `🌧️ Heavy rainfall detected (${current.precip_mm}mm) — activate flood preparedness for low-lying areas`
            });
        }

        if (current.vis_km < 3) {
            recommendations.push({
                priority: 'high',
                text: `🌫️ Poor visibility (${current.vis_km}km) — issue travel advisory and ensure road lighting`
            });
        }

        if (current.temp_c > 40) {
            recommendations.push({
                priority: 'high',
                text: `🔥 Extreme heat (${current.temp_c}°C) — open cooling centers and enforce fire prevention measures`
            });
        }

        const aqi = current.air_quality;
        if (aqi && aqi.pm2_5 > 100) {
            recommendations.push({
                priority: 'high',
                text: `😷 Unhealthy air quality (PM2.5: ${Math.round(aqi.pm2_5)}) — advise masks and reduce outdoor activities`
            });
        } else if (aqi && aqi.pm2_5 > 55) {
            recommendations.push({
                priority: 'medium',
                text: `🏭 Moderate air pollution (PM2.5: ${Math.round(aqi.pm2_5)}) — sensitive groups should limit exposure`
            });
        }

        if (current.humidity < 25 && current.temp_c > 30) {
            recommendations.push({
                priority: 'medium',
                text: `🔥 Dry and hot conditions (${current.humidity}% humidity, ${current.temp_c}°C) — high fire ignition risk`
            });
        }

        if (current.wind_kph > 35) {
            recommendations.push({
                priority: 'medium',
                text: `💨 Strong winds (${current.wind_kph} km/h) — secure loose structures and avoid heavy vehicle transport`
            });
        }
    }

    // Risk-level based recommendations
    byType.forEach(t => {
        if (t.score >= 60 && !recommendations.some(r => r.text.includes(t.type))) {
            recommendations.push({
                priority: 'high',
                text: `⚠️ ${t.type} risk is ${t.risk.toLowerCase()} (${t.score}%) — activate preparedness protocols`
            });
        }
    });

    if (occupancyPressure > 60) {
        recommendations.push({
            priority: 'high',
            text: `🏢 Shelter capacity at ${Math.round(occupancyPressure)}% — prepare overflow facilities immediately`
        });
    } else if (occupancyPressure > 40) {
        recommendations.push({
            priority: 'medium',
            text: `🏢 Shelter occupancy at ${Math.round(occupancyPressure)}% — monitor capacity trends`
        });
    }

    // Always add a low-priority monitoring recommendation
    recommendations.push({
        priority: 'low',
        text: '✅ Continue regular monitoring of all active shelter facilities and emergency assets'
    });

    return recommendations.slice(0, 8);
}

// ── Main prediction computation ──────────────────────────
async function computePredictions() {
    const weatherData = await fetchWeatherData();

    // Shelter stats
    const shelterStats = await queryOne(`
    SELECT SUM(currentOccupancy) as "totalOcc", SUM(capacity) as "totalCap" FROM shelters
  `);
    let occVal = shelterStats ? parseInt(shelterStats.totalOcc || 0) : 0;
    let capVal = shelterStats ? parseInt(shelterStats.totalCap || 0) : 0;
    const occupancyPressure = capVal > 0 ? (occVal / capVal) * 100 : 0;

    // Active alert boost
    const alertStats = await queryOne('SELECT COUNT(*) as count FROM alerts WHERE isActive = 1');
    const alertBoost = Math.min((alertStats ? parseInt(alertStats.count || 0) : 0) * 2, 10);

    // Get recent incident counts for boosting
    const recentIncidents = await queryAll(`
    SELECT type, COUNT(*) as count FROM incidents
    WHERE createdAt >= CURRENT_TIMESTAMP - INTERVAL '30 days' GROUP BY type
  `);
    const incidentCounts = {};
    recentIncidents.forEach(r => { incidentCounts[r.type] = parseInt(r.count || 0); });

    const DISASTER_LABELS = {
        flood: 'Flood', fire: 'Fire', earthquake: 'Earthquake',
        accident: 'Road Accident', medical: 'Medical Emergency'
    };

    // Evaluate risk across all queried Indian cities to find max/overall
    const cityRisks = [];

    for (const loc of LOCATIONS) {
        const wData = weatherData[loc.name];

        const flood = computeFloodRisk(wData);
        const fire = computeFireRisk(wData);
        const accident = computeAccidentRisk(wData);
        const medical = computeMedicalRisk(wData);
        const earthquake = await computeEarthquakeRisk(); // Not currently weather-dependent

        const typeScores = { flood, fire, accident, medical, earthquake };

        // Find top risk for this city
        let maxScore = 0;
        let topRiskTypeKey = 'unknown';

        for (const [key, tResult] of Object.entries(typeScores)) {
            const incidents = incidentCounts[key] || 0;
            const incidentBoost = Math.min(incidents * 6, 20);
            const finalScore = Math.min(100, Math.max(0, tResult.score + incidentBoost + alertBoost));

            if (finalScore > maxScore) {
                maxScore = finalScore;
                topRiskTypeKey = key;
            }
        }

        const areaScore = Math.round((flood.score + fire.score + accident.score + medical.score + earthquake.score) / 5 + alertBoost);

        // Count specific recent incidents in this city
        const cityQ = await queryOne(`SELECT COUNT(*) as count FROM incidents WHERE location LIKE $1 AND createdAt >= CURRENT_TIMESTAMP - INTERVAL '30 days'`, [`%${loc.name}%`]);
        const cityIncidents = cityQ ? parseInt(cityQ.count || 0) : 0;

        cityRisks.push({
            name: loc.name,
            typeScores,
            areaScore,
            maxScore,
            topRiskTypeKey,
            recentIncidents: cityIncidents
        });
    }

    // Combine all cities to get an overall country view
    // Start with the city that has the worst constraints for each type
    const combinedTypeResults = {
        flood: { score: 0, factors: [] },
        fire: { score: 0, factors: [] },
        accident: { score: 0, factors: [] },
        medical: { score: 0, factors: [] },
        earthquake: await computeEarthquakeRisk() // Same everywhere right now
    };

    // Merge city data into highest overall risk factors per type
    ['flood', 'fire', 'accident', 'medical'].forEach(type => {
        let maxScore = -1;
        let bestFactors = [];

        cityRisks.forEach(cr => {
            if (cr.typeScores[type].score > maxScore) {
                maxScore = cr.typeScores[type].score;
                bestFactors = cr.typeScores[type].factors;

                if (cr.typeScores[type].factors.length > 0 && !bestFactors[0].includes(`(in ${cr.name})`)) {
                    bestFactors = bestFactors.map((f, i) => i === 0 ? `${f} (in ${cr.name})` : f);
                }
            }
        });

        combinedTypeResults[type] = { score: maxScore, factors: bestFactors };
    });

    const byType = Object.keys(combinedTypeResults).map(type => {
        const result = combinedTypeResults[type];
        const incidents = incidentCounts[type] || 0;
        const incidentBoost = Math.min(incidents * 6, 20);
        const finalScore = Math.min(100, Math.max(0, result.score + incidentBoost + alertBoost));

        return {
            type: DISASTER_LABELS[type],
            typeKey: type,
            risk: getRiskLevel(finalScore),
            score: finalScore,
            factors: result.factors,
            recentIncidents: incidents
        };
    });

    byType.sort((a, b) => b.score - a.score);

    // Overall risk (weighted average — flood and fire count more)
    const weights = { flood: 1.3, fire: 1.3, accident: 1.0, medical: 1.0, earthquake: 0.8 };
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const overallScore = Math.round(
        byType.reduce((sum, t) => sum + t.score * (weights[t.typeKey] || 1), 0) / totalWeight
    );
    const overallRisk = getRiskLevel(overallScore);

    // ── Per-area breakdown ──
    const byArea = await Promise.all(cityRisks.map(async cr => {
        const sc = await queryOne(`SELECT COUNT(*) as c FROM shelters WHERE city = $1`, [cr.name]);
        return {
            area: cr.name,
            riskScore: Math.min(100, cr.areaScore),
            riskLevel: getRiskLevel(cr.areaScore),
            topRisk: DISASTER_LABELS[cr.topRiskTypeKey],
            shelterCount: sc ? parseInt(sc.c || 0) : 0,
            recentIncidents: cr.recentIncidents
        };
    }));
    byArea.sort((a, b) => b.riskScore - a.riskScore);

    // Pick the most critical city to display timeline/recommendations for
    const topRiskCityName = byArea.length > 0 ? byArea[0].area : 'Delhi';

    // ── Timeline from real forecast ──
    const timeline = buildTimeline(weatherData, overallScore, topRiskCityName);

    // ── Weather summary for display ──
    const topCityWeather = weatherData[topRiskCityName] || Object.values(weatherData)[0];
    const currentWeather = topCityWeather ? {
        temp: topCityWeather.current.temp_c,
        feelsLike: topCityWeather.current.feelslike_c,
        humidity: topCityWeather.current.humidity,
        wind: topCityWeather.current.wind_kph,
        precip: topCityWeather.current.precip_mm,
        visibility: topCityWeather.current.vis_km,
        condition: topCityWeather.current.condition?.text,
        conditionIcon: topCityWeather.current.condition?.icon,
        uv: topCityWeather.current.uv,
        aqi: topCityWeather.current.air_quality ? {
            pm25: Math.round(topCityWeather.current.air_quality.pm2_5),
            pm10: Math.round(topCityWeather.current.air_quality.pm10),
            epaIndex: topCityWeather.current.air_quality['us-epa-index']
        } : null
    } : null;

    // ── Recommendations ──
    const recommendations = generateRecommendations(byType, weatherData, occupancyPressure, topRiskCityName);

    return {
        overallRisk,
        overallScore,
        lastUpdated: new Date().toISOString(),
        dataSource: 'WeatherAPI.com (Live)',
        currentWeather,
        byType,
        byArea,
        timeline,
        recommendations
    };
}

// GET /api/predictions
router.get('/predictions', async (req, res) => {
    try {
        const predictions = await computePredictions();
        res.json(predictions);
    } catch (err) {
        console.error('Prediction error:', err);
        res.status(500).json({ error: 'Failed to generate predictions' });
    }
});

module.exports = router;
module.exports.fetchWeatherData = fetchWeatherData;
