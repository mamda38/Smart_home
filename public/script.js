
        const sensorData = {
            labels: [],
            datasets: [
                { label: 'Temperature', data: [], borderColor: '#ff4444' },
                { label: 'Humidity', data: [], borderColor: '#4444ff' },
                { label: 'Light', data: [], borderColor: '#ff8c00' }
            ]
        };

        const ctx = document.getElementById('sensorChart').getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: sensorData,
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true },
                    x: { beginAtZero: true }
                }
            }
        });

        function updateChart(data) {
            const now = new Date().toLocaleTimeString();
            sensorData.labels.push(now);
            sensorData.datasets[0].data.push(data.temperature);
            sensorData.datasets[1].data.push(data.humidity);
            sensorData.datasets[2].data.push(data.light_level);

            if (sensorData.labels.length > 10) {
                sensorData.labels.shift();
                sensorData.datasets.forEach(dataset => dataset.data.shift());
            }

            chart.update();
        }

        function updateSensorValues(data) {
            document.getElementById('temperature-value').textContent = data.temperature + '°C';
            document.getElementById('humidity-value').textContent = data.humidity + '%';
            document.getElementById('light-value').textContent = data.light_level + ' Lux';
        }

        const eventSource = new EventSource('http://localhost:3000/api/sse');
        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            updateSensorValues(data);
            updateChart(data);
        };

        async function fetchLogData(apiEndpoint, searchTime = '', sensorType = '', sortOrder = '') {
            const url = new URL(`http://localhost:3000/api/${apiEndpoint}`);
            if (searchTime) url.searchParams.append('time', searchTime);
            if (sensorType) url.searchParams.append('sensorType', sensorType);
            if (sortOrder) url.searchParams.append('sort', sortOrder);

            const response = await fetch(url);
            return response.json();
        }

        function formatDateTime(dateString) {
            const date = new Date(dateString);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
        }

        function populateTable(data, tableId, fields) {
            const tableBody = document.getElementById(tableId).querySelector('tbody');
            tableBody.innerHTML = '';

            data.forEach(log => {
                const row = document.createElement('tr');
                fields.forEach(field => {
                    const cell = document.createElement('td');
                    cell.textContent = field === 'timestamp' ? formatDateTime(log[field]) : log[field];
                    row.appendChild(cell);
                });
                tableBody.appendChild(row);
            });
        }

        async function fetchSensorLog(searchTime = '', sensorType = '', sortOrder = '') {
            const data = await fetchLogData('sensor_log', searchTime, sensorType, sortOrder);
            const fields = ['timestamp'];

            if (!sensorType || sensorType === 'temperature') fields.push('temperature');
            if (!sensorType || sensorType === 'humidity') fields.push('humidity');
            if (!sensorType || sensorType === 'light_level') fields.push('light_level');

            document.getElementById('temperatureHeader').style.display = sensorType === 'humidity' || sensorType === 'light_level' ? 'none' : '';
            document.getElementById('humidityHeader').style.display = sensorType === 'temperature' || sensorType === 'light_level' ? 'none' : '';
            document.getElementById('lightHeader').style.display = sensorType === 'temperature' || sensorType === 'humidity' ? 'none' : '';

            populateTable(data, 'sensorLogTable', fields);
        }

        async function fetchActionLog(searchTime = '', sortOrder = '') {
            const data = await fetchLogData('action_log', searchTime, '', sortOrder);
            populateTable(data, 'actionLogTable', ['timestamp', 'led_name', 'command']);
        }

        function handleSensorSearch() {
            const searchTime = document.getElementById('sensorSearchTime').value;
            const sensorType = document.getElementById('sensorType').value;
            const sortOrder = document.getElementById('sortOrder').value;
            fetchSensorLog(searchTime, sensorType, sortOrder);
        }

        function handleSensorTypeFilter() {
            handleSensorSearch();
        }

        function handleSortOrder() {
            handleSensorSearch();
        }

        function handleActionSearch() {
            const searchTime = document.getElementById('actionSearchTime').value;
            //const sortOrder = document.getElementById('actionSortOrder').value;
            //fetchActionLog(searchTime, sortOrder);
            fetchActionLog(searchTime);
        }

        function updateLEDStates() {
            fetch('http://localhost:3000/api/led_command_log')
                .then(response => response.json())
                .then(data => {
                    data.forEach(led => {
                        const button = document.querySelector(`button[data-led="${led.led_name}"]`);
                        if (button) {
                            button.classList.toggle('on', led.status === 'on');
                            button.classList.toggle('off', led.status === 'off');
                            button.querySelector('span').textContent = led.status.toUpperCase();
                        }
                    });
                });
        }

        document.querySelectorAll('.led-button').forEach(button => {
            button.addEventListener('click', () => {
                const led = button.dataset.led;
                const action = button.classList.contains('on') ? 'off' : 'on';

                fetch('http://localhost:3000/api/set_led', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ led: led, action: action }),
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        button.classList.toggle('on');
                        button.classList.toggle('off');
                        button.querySelector('span').textContent = action.toUpperCase();
                        fetchActionLog();
                    }
                });
            });
        });

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                document.querySelectorAll('.content-section').forEach(sec => {
                    sec.style.display = 'none';
                });
                document.getElementById(section).style.display = 'block';
                if (section === 'sensor-log') fetchSensorLog();
                if (section === 'action-log') fetchActionLog();
            });
        });

        updateLEDStates();
        fetchActionLog();

        setInterval(() => {
            updateLEDStates();
            if (document.getElementById('action-log').style.display !== 'none') {
                fetchActionLog();
            }
        }, 5000);
