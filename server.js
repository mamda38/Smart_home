const express = require('express');
const mysql = require('mysql2');
const mqtt = require('mqtt');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// MySQL configuration
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mamda',
    database: 'data_duc'
});

db.connect((err) => {
    if (err) {
        console.error('MySQL connection error:', err);
        process.exit(1);
    }
    console.log('Connected to MySQL');
});

// Function to log LED commands
function logLedCommand(ledName, command) {
    const query = `INSERT INTO led_command_log (led_name, command) VALUES (?, ?)`;
    db.query(query, [ledName, command], (err, results) => {
        if (err) {
            console.error(`Error logging command for ${ledName}:`, err);
        } else {
            console.log(`Logged: ${ledName} - ${command}`);
        }
    });
}

// Connect to MQTT Broker
const mqttClient = mqtt.connect('mqtt://192.168.1.6', {
    username: 'duc1',
    password: '1234'
});

mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
    mqttClient.subscribe('home/sensor/data');
    mqttClient.subscribe('home/led/#');
});

mqttClient.on('message', (topic, message) => {
    const msg = message.toString();
    
    if (topic === 'home/sensor/data') {
        try {
            const data = JSON.parse(msg);
            const query = `INSERT INTO sensor_readings (sensor_id, temperature, humidity, light_level) VALUES (?, ?, ?, ?)`;
            db.query(query, [data.sensor_id, data.temperature, data.humidity, data.light_level], (err, results) => {
                if (err) {
                    console.error('Error inserting sensor data:', err);
                } else {
                    console.log('Sensor data inserted into MySQL');
                }
            });
        } catch (error) {
            console.error('Error parsing sensor data:', error);
        }
    } else if (topic.startsWith('home/led')) {
        const ledName = topic.split('/')[2];
        if (ledName === 'all') {
            ['led1', 'led2', 'led3'].forEach(led => logLedCommand(led, msg));
        } else {
            logLedCommand(ledName, msg);
        }
    }
});

// SSE API for real-time sensor data updates
app.get('/api/sse', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const sendData = () => {
        db.query('SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT 1', (err, results) => {
            if (err) {
                console.error('Error fetching sensor data:', err);
                return;
            }
            if (results.length > 0) {
                res.write(`data: ${JSON.stringify(results[0])}\n\n`);
            }
        });
    };

    const intervalId = setInterval(sendData, 1000);

    req.on('close', () => {
        clearInterval(intervalId);
    });
});

// API to get sensor log with search, filter, and sort
app.get('/api/sensor_log', (req, res) => {
    const { time, sensorType, sort } = req.query;
    let query = 'SELECT * FROM sensor_readings';
    const queryParams = [];

    if (time) {
        query += ' WHERE timestamp LIKE ?';
        queryParams.push(`${time}%`);
    }

    if (sensorType) {
        query += time ? ' AND' : ' WHERE';
        query += ` ${sensorType} IS NOT NULL`;
    }

    if (sort && (sensorType === 'temperature' || sensorType === 'humidity' || sensorType === 'light_level')) {
        query += ` ORDER BY ${sensorType} ${sort.toUpperCase()}`;
    } else {
        query += ' ORDER BY timestamp DESC';
    }

    query += ' LIMIT 100';

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error('Error fetching sensor log:', err);
            res.status(500).json({ error: 'Server error' });
            return;
        }
        res.json(results);
    });
});

// API to get LED command log with search and sort
app.get('/api/action_log', (req, res) => {
    const { time, sort } = req.query;
    let query = 'SELECT * FROM led_command_log';
    const queryParams = [];

    if (time) {
        query += ' WHERE timestamp LIKE ?';
        queryParams.push(`${time}%`);
    }

    if (sort) {
        query += ` ORDER BY timestamp ${sort.toUpperCase()}`;
    } else {
        query += ' ORDER BY timestamp DESC';
    }

    query += ' LIMIT 100';

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error('Error fetching LED command log:', err);
            res.status(500).json({ error: 'Server error' });
            return;
        }
        res.json(results);
    });
});

// API to get current LED states
app.get('/api/led_command_log', (req, res) => {
    db.query('SELECT led_name, MAX(timestamp) as last_update, command as status FROM led_command_log GROUP BY led_name', (err, results) => {
        if (err) {
            console.error('Error fetching LED states:', err);
            res.status(500).json({ error: 'Server error' });
            return;
        }
        res.json(results);
    });
});

// API to set LED state
app.post('/api/set_led', (req, res) => {
    const { led, action } = req.body;
    if (!led || !action) {
        return res.status(400).json({ error: 'Missing led or action in request body' });
    }

    mqttClient.publish(`home/led/${led}`, action, (err) => {
        if (err) {
            console.error('Error publishing MQTT message:', err);
            return res.status(500).json({ error: 'Failed to set LED state' });
        }
        logLedCommand(led, action);
        res.json({ success: true, message: `LED ${led} set to ${action}` });
    });
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});