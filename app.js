// Smart Agriculture IoT Dashboard
// v7 — Supabase Real-Time WebSocket (wss://) + REST API History
// Uses sensor_logs table with feed_name schema

class AgricultureDashboard {
    constructor() {
        this.connected = false;
        this.startTime = null;
        this.messageCount = 0;
        this.statusCheckInterval = null;
        this.uptimeInterval = null;
        this.supabaseSubscription = null;
        this.sensorChart = null;
        this.chartData = { labels: [], tempData: [], humData: [] };
        this.historyRows = [];
        this.activeWindowMs = 5 * 60 * 1000;

        // Load configuration
        if (typeof config === 'undefined') {
            console.error('[Dashboard] Config not loaded!');
            alert('Configuration error: config.js not loaded.');
            return;
        }

        this.SUPABASE_URL = config.getSupabaseUrl();
        this.SUPABASE_ANON_KEY = config.getSupabaseAnonKey();
        this.SENSOR_NODES = config.SENSOR_NODES;

        if (this.SUPABASE_URL && this.SUPABASE_ANON_KEY) {
            try {
                this.supabase = supabase.createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY, {
                    realtime: { params: { eventsPerSecond: 10 } }
                });
                console.log('[Supabase] Client initialized');
            } catch (err) {
                console.error('[Supabase] Failed to initialize:', err.message);
                alert('Error: Supabase initialization failed.');
                return;
            }
        } else {
            console.error('[Supabase] Configuration missing');
            alert('Error: Supabase configuration missing.');
            return;
        }

        this.initElements();
        this.bindEvents();
        
        // Initialize sensor nodes (from config)
        this.nodes = this.SENSOR_NODES.map(n => ({
            ...n,
            temp: '--',
            hum: '--',
            timestamp: null,
            status: 'silent'
        }));

        this.loadSavedNodeData();
        this.initTheme();
        this.renderTable();
        
        // Start Supabase real-time subscription (WebSocket on port 443)
        this.startSupabaseSubscription();
    }

    // ── DOM REFS ──────────────────────────────────────────────────────────────
    initElements() {
        this.dashPage        = document.getElementById('dashboard-page');
        this.disconnectBtn   = document.getElementById('disconnect-btn');
        this.refreshBtn      = document.getElementById('refresh-btn');
        this.themeToggle     = document.getElementById('theme-toggle');
        this.themeIcon       = document.getElementById('theme-icon');

        this.connLed         = document.getElementById('conn-led');
        this.connText        = document.getElementById('conn-text');

        this.tableBody       = document.getElementById('sensor-table-body');
        this.activeCount     = document.getElementById('active-count');

        this.kpiTempVal      = document.getElementById('kpi-temp-val');
        this.kpiTempMeta     = document.getElementById('kpi-temp-meta');
        this.kpiHumVal       = document.getElementById('kpi-hum-val');
        this.kpiHumMeta      = document.getElementById('kpi-hum-meta');

        this.logContent      = document.getElementById('mqtt-log-content');
        this.clearLogBtn     = document.getElementById('clear-log');

        this.historyContent  = document.getElementById('history-content');
        this.loadHistoryBtn  = document.getElementById('load-history-btn');
        this.chartCanvas     = document.getElementById('sensor-chart');

        this.activeFeeds     = document.getElementById('active-feeds');
        this.messagesPerHour = document.getElementById('messages-per-hour');
        this.uptimeEl        = document.getElementById('uptime');
    }

    // ── EVENTS ────────────────────────────────────────────────────────────────
    bindEvents() {
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.refreshBtn.addEventListener('click', () => this.reconnect());
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.clearLogBtn.addEventListener('click', () => this.clearLog());
        this.loadHistoryBtn.addEventListener('click', () => this.loadHistory());
    }

    // ── NODE DATA PERSISTENCE ─────────────────────────────────────────────────
    loadSavedNodeData() {
        const savedData = localStorage.getItem('node_data');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                this.nodes.forEach(node => {
                    const savedNode = data.find(n => n.id === node.id);
                    if (savedNode) {
                        node.temp = savedNode.temp;
                        node.hum = savedNode.hum;
                        node.timestamp = savedNode.timestamp ? new Date(savedNode.timestamp) : null;
                        this.updateNodeStatus(node);
                    }
                });
            } catch (e) {
                console.error('Failed to load saved node data:', e);
            }
        }
    }

    saveNodeData() {
        const data = this.nodes.map(node => ({
            id: node.id,
            temp: node.temp,
            hum: node.hum,
            timestamp: node.timestamp ? node.timestamp.toISOString() : null
        }));
        localStorage.setItem('node_data', JSON.stringify(data));
    }

    resetNodeData() {
        this.nodes.forEach(n => {
            n.temp = '--';
            n.hum = '--';
            n.timestamp = null;
            n.status = 'silent';
        });
        this.saveNodeData();
    }

    // ── THEME ─────────────────────────────────────────────────────────────────
    initTheme() {
        const saved = localStorage.getItem('theme') || 'dark';
        document.body.setAttribute('data-theme', saved);
        this.updateThemeIcon(saved);
    }

    toggleTheme() {
        const curr = document.body.getAttribute('data-theme');
        const next = curr === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        this.updateThemeIcon(next);
    }

    updateThemeIcon(theme) {
        if (theme === 'dark') {
            this.themeIcon.innerHTML = `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`;
        } else {
            this.themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
        }
    }

    // ── SUPABASE REAL-TIME SUBSCRIPTION (WebSocket wss:// on Port 443) ────────
    startSupabaseSubscription() {
        console.log('[Supabase] Establishing secure WebSocket (wss://) on Port 443...');
        this.addSystemLog('Connecting to Supabase real-time...');
        
        this.supabaseSubscription = this.supabase
            .channel('sensor_logs_changes')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'sensor_logs'
            }, (payload) => {
                this.handleSupabaseInsert(payload.new);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    this.connected = true;
                    this.startTime = new Date();
                    this.messageCount = 0;
                    this.startStatusCheck();
                    this.startUptimeClock();
                    this.updateStats();
                    console.log('[Supabase] ✓ Connected via wss:// on Port 443');
                    this.addSystemLog('✓ Connected via secure WebSocket (wss://) on Port 443');
                    // Auto-fetch recent history once we're subscribed so the UI shows existing data
                    try {
                        this.loadHistory();
                    } catch (e) {
                        console.warn('[Dashboard] Failed to auto-load history on subscribe:', e);
                    }
                    this.updateConnectionStatus();
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('[Supabase] Subscription error');
                    this.addSystemLog('✗ WebSocket subscription error');
                    this.connected = false;
                    this.updateConnectionStatus();
                } else if (status === 'TIMED_OUT') {
                    console.error('[Supabase] WebSocket connection timed out');
                    this.addSystemLog('✗ WebSocket connection timed out');
                    this.connected = false;
                    this.updateConnectionStatus();
                } else if (status === 'CLOSED') {
                    this.connected = false;
                    console.log('[Supabase] WebSocket connection closed');
                    this.updateConnectionStatus();
                }
            });
    }

    // ── RECONNECT ─────────────────────────────────────────────────────────────
    reconnect() {
        this.addSystemLog('Attempting to reconnect...');
        
        if (this.supabaseSubscription) {
            try {
                this.supabase.removeChannel(this.supabaseSubscription);
            } catch (_) {}
        }
        
        clearInterval(this.statusCheckInterval);
        clearInterval(this.uptimeInterval);
        this.statusCheckInterval = null;
        this.uptimeInterval = null;
        this.connected = false;
        
        this.updateConnectionStatus();
        this.startSupabaseSubscription();
    }

    // ── DISCONNECT ────────────────────────────────────────────────────────────
    disconnect() {
        if (this.supabaseSubscription) {
            try {
                this.supabase.removeChannel(this.supabaseSubscription);
            } catch (_) {}
            this.supabaseSubscription = null;
        }
        
        this.connected = false;
        this.addSystemLog('Disconnected from Supabase');
        clearInterval(this.statusCheckInterval);
        clearInterval(this.uptimeInterval);
        this.statusCheckInterval = null;
        this.uptimeInterval = null;

        this.updateConnectionStatus();
        this.resetNodeData();
        this.renderTable();
    }

    // ── PARSE FEED NAME ────────────────────────────────────────────────────────
    // Feed name format can be:
    // - "VLM-01-temperature"
    // - "ndato/feeds/san-lorenzo-temp"
    parseFeedName(feedName) {
        const normalized = String(feedName || '').toLowerCase();
        const type = normalized.endsWith('temp') || normalized.endsWith('temperature')
            ? 'temperature'
            : normalized.endsWith('hum') || normalized.endsWith('humidity')
                ? 'humidity'
                : normalized.split('-').pop();

        const nodeMap = [
            { match: ['san-lorenzo', 'sanlorenzo', 'slz'], nodeId: 'SLZ-01' },
            { match: ['villamor', 'vlm'], nodeId: 'VLM-01' },
            { match: ['afp', 'afp-ovai', 'afpovai'], nodeId: 'AFP-01' },
            { match: ['better-living', 'betterliving', 'blv'], nodeId: 'BLV-01' }
        ];

        const found = nodeMap.find(entry => entry.match.some(token => normalized.includes(token)));
        const nodeId = found ? found.nodeId : null;

        return { nodeId, type };
    }

    // ── HANDLE NEW READINGS FROM SENSOR_LOGS ──────────────────────────────────
    handleSupabaseInsert(reading) {
        this.messageCount++;

        const { nodeId, type } = this.parseFeedName(reading.feed_name);
        const value = reading.value;
        const createdAt = new Date(reading.created_at);

        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;

        if (type === 'temperature') {
            node.temp = value.toFixed(1);
        } else if (type === 'humidity') {
            node.hum = value.toFixed(1);
        }
        node.timestamp = createdAt;

        this.updateNodeStatus(node);
        this.renderTable();
        this.addLogEntry(reading.feed_name, value);
        this.updateStats();
        this.saveNodeData();
    }

    // ── NODE STATUS ───────────────────────────────────────────────────────────
    updateNodeStatus(node) {
        const age = node.timestamp ? Date.now() - node.timestamp.getTime() : Infinity;
        node.status = age < this.activeWindowMs ? 'transmitting' : 'silent';
    }

    startStatusCheck() {
        this.statusCheckInterval = setInterval(() => {
            this.nodes.forEach(n => this.updateNodeStatus(n));
            this.renderTable();
            this.updateStats();
        }, 10000);
    }

    // ── HISTORY HYDRATION ─────────────────────────────────────────────────────
    hydrateNodesFromHistory(rows) {
        const latestByNode = new Map();
        let latestAggregate = null;

        rows.forEach(row => {
            const timestamp = row.created_at ? new Date(row.created_at) : null;
            const tempValue = row.temperature ?? row.temp ?? null;
            const humValue = row.humidity ?? row.hum ?? null;

            if (tempValue !== null || humValue !== null) {
                latestAggregate = {
                    timestamp,
                    temp: tempValue !== null ? Number(tempValue).toFixed(1) : null,
                    hum: humValue !== null ? Number(humValue).toFixed(1) : null
                };
            }

            if (!row || !row.feed_name) return;

            const { nodeId, type } = this.parseFeedName(row.feed_name);
            const node = this.nodes.find(n => n.id === nodeId);
            if (!node) return;

            const existing = latestByNode.get(nodeId) || {
                timestamp: null,
                temp: node.temp,
                hum: node.hum
            };

            const readingValue = row.value ?? tempValue ?? humValue;

            if (type === 'temperature' && readingValue !== undefined && readingValue !== null) {
                existing.temp = Number(readingValue).toFixed(1);
            } else if (type === 'humidity' && readingValue !== undefined && readingValue !== null) {
                existing.hum = Number(readingValue).toFixed(1);
            }

            if (timestamp && (!existing.timestamp || timestamp > existing.timestamp)) {
                existing.timestamp = timestamp;
            }

            latestByNode.set(nodeId, existing);
        });

        latestByNode.forEach((state, nodeId) => {
            const node = this.nodes.find(n => n.id === nodeId);
            if (!node) return;

            node.temp = state.temp;
            node.hum = state.hum;
            node.timestamp = state.timestamp;
            this.updateNodeStatus(node);
        });

        if (latestByNode.size === 0 && latestAggregate) {
            this.nodes.forEach(node => {
                if (latestAggregate.temp !== null) node.temp = latestAggregate.temp;
                if (latestAggregate.hum !== null) node.hum = latestAggregate.hum;
                node.timestamp = latestAggregate.timestamp || node.timestamp;
                this.updateNodeStatus(node);
            });
        }

        this.messageCount = rows.length;
        this.renderTable();
        this.updateStats();
        this.saveNodeData();
    }

    // ── CONNECTION STATUS ─────────────────────────────────────────────────────
    updateConnectionStatus() {
        if (this.connected) {
            this.connLed.classList.add('on');
            this.connText.textContent = 'Connected';
        } else {
            this.connLed.classList.remove('on');
            this.connText.textContent = 'Disconnected';
        }
    }

    // ── KPI CARDS ─────────────────────────────────────────────────────────────
    renderKpiCards() {
        // Temperature KPI
        const nodesWithTemp = this.nodes.filter(n => n.temp !== '--');
        let tempVals = nodesWithTemp.map(n => parseFloat(n.temp));
        let tempDisplay = '--';
        if (tempVals.length > 0) {
            const avgTemp = tempVals.reduce((s, v) => s + v, 0) / tempVals.length;
            const tempMin = Math.min(...tempVals).toFixed(1);
            const tempMax = Math.max(...tempVals).toFixed(1);
            if (!this.prevAvgTemp) this.prevAvgTemp = avgTemp;
            const tempTrend = avgTemp > this.prevAvgTemp ? '↑' : avgTemp < this.prevAvgTemp ? '↓' : '→';
            this.prevAvgTemp = avgTemp;
            tempDisplay = `${avgTemp.toFixed(1)}<span>°C</span> <span class="kpi-trend">${tempTrend}</span>`;
        } else {
            tempDisplay = `--<span>°C</span>`;
        }
        this.kpiTempVal.innerHTML = tempDisplay;

        // Humidity KPI
        const nodesWithHum = this.nodes.filter(n => n.hum !== '--');
        let humVals = nodesWithHum.map(n => parseFloat(n.hum));
        let humDisplay = '--';
        if (humVals.length > 0) {
            const avgHum = humVals.reduce((s, v) => s + v, 0) / humVals.length;
            if (!this.prevAvgHum) this.prevAvgHum = avgHum;
            const humTrend = avgHum > this.prevAvgHum ? '↑' : avgHum < this.prevAvgHum ? '↓' : '→';
            this.prevAvgHum = avgHum;
            humDisplay = `${avgHum.toFixed(1)}<span>%</span> <span class="kpi-trend">${humTrend}</span>`;
        } else {
            humDisplay = `--<span>%</span>`;
        }
        this.kpiHumVal.innerHTML = humDisplay;

        // Meta
        const activeNodes = this.nodes.filter(n => n.status === 'transmitting');
        const total = this.nodes.length;
        const active = activeNodes.length;
        let metaText = '';
        if (active > 0) {
            const lastUpdate = Math.max(...this.nodes.map(n => n.timestamp ? n.timestamp.getTime() : 0));
            if (lastUpdate > 0) {
                const date = new Date(lastUpdate);
                metaText = `<span class="kpi-badge active-badge">${active} of ${total} nodes active</span> <span class="kpi-update">Last: ${date.toLocaleTimeString()}</span>`;
            } else {
                metaText = `<span class="kpi-badge active-badge">${active} of ${total} nodes active</span>`;
            }
        } else {
            metaText = `<span class="kpi-badge silent-badge">No active nodes</span>`;
        }
        this.kpiTempMeta.innerHTML = metaText;
        this.kpiHumMeta.innerHTML = metaText;
    }

    // ── TABLE ─────────────────────────────────────────────────────────────────
    renderTable() {
        this.renderKpiCards();
        this.tableBody.innerHTML = '';

        this.nodes.forEach(node => {
            const row = document.createElement('tr');
            const timeStr  = node.timestamp ? node.timestamp.toLocaleTimeString() : '--';
            const tempDisp = node.temp === '--' ? '--' : `${node.temp}°C`;
            const humDisp  = node.hum  === '--' ? '--' : `${node.hum}%`;

            row.innerHTML = `
                <td><span class="sensor-id">${node.id}</span></td>
                <td>${node.location}</td>
                <td><span class="temp-val">${tempDisp}</span></td>
                <td><span class="hum-val">${humDisp}</span></td>
                <td>
                    <span class="status-badge ${node.status}">
                        <span class="status-dot"></span>
                        ${node.status === 'transmitting' ? 'Transmitting' : 'Silent'}
                    </span>
                </td>
                <td><span class="time-val">${timeStr}</span></td>
            `;
            this.tableBody.appendChild(row);
        });

        const activeNum = this.nodes.filter(n => n.status === 'transmitting').length;
        this.activeCount.textContent = `${activeNum} Active`;
    }

    // ── LOG ───────────────────────────────────────────────────────────────────
    addLogEntry(feedName, value) {
        const empty = this.logContent.querySelector('.log-empty');
        if (empty) empty.remove();

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const { type } = this.parseFeedName(feedName);
        const unit = type === 'temperature' ? '°C' : '%';

        entry.innerHTML = `
            <span class="log-ts">[${new Date().toLocaleTimeString()}]</span>
            <span class="log-feed">${feedName}</span>
            <span class="log-val">${value.toFixed(1)}${unit}</span>
        `;

        this.logContent.appendChild(entry);
        this.logContent.scrollTop = this.logContent.scrollHeight;

        while (this.logContent.children.length > 100) {
            this.logContent.removeChild(this.logContent.firstChild);
        }
    }

    addSystemLog(msg) {
        const empty = this.logContent.querySelector('.log-empty');
        if (empty) empty.remove();

        const entry = document.createElement('div');
        entry.className = 'log-entry system';
        entry.innerHTML = `
            <span class="log-ts">[${new Date().toLocaleTimeString()}]</span>
            <span class="log-sys">${msg}</span>
        `;

        this.logContent.appendChild(entry);
        this.logContent.scrollTop = this.logContent.scrollHeight;
    }

    clearLog() {
        this.logContent.innerHTML = '<div class="log-empty">Log cleared.</div>';
    }

    // ── STATS ─────────────────────────────────────────────────────────────────
    updateStats() {
        if (!this.startTime) return;

        const activeNum = this.nodes.filter(n => n.status === 'transmitting').length;
        this.activeFeeds.textContent = activeNum;

        const cutoff = Date.now() - 3600000;
        const rowsInLastHour = this.historyRows.filter(row => {
            const timestamp = row && row.created_at ? new Date(row.created_at).getTime() : 0;
            return timestamp >= cutoff;
        }).length;

        const mph = rowsInLastHour > 0
            ? rowsInLastHour
            : (() => {
                const elapsedHours = (Date.now() - this.startTime.getTime()) / 3600000;
                return elapsedHours > 0 ? Math.round(this.messageCount / elapsedHours) : 0;
            })();
        this.messagesPerHour.textContent = mph;
    }

    startUptimeClock() {
        this.uptimeInterval = setInterval(() => {
            if (!this.startTime) return;
            const ms = Date.now() - this.startTime.getTime();
            const h  = Math.floor(ms / 3600000);
            const m  = Math.floor((ms % 3600000) / 60000);
            const s  = Math.floor((ms % 60000) / 1000);
            this.uptimeEl.textContent =
                `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }, 1000);
    }

    // ── LOAD HISTORY VIA REST API ─────────────────────────────────────────────
    async loadHistory() {
        this.loadHistoryBtn.disabled = true;
        this.loadHistoryBtn.textContent = 'Loading…';

        try {
            // Use Supabase REST API to fetch historical logs
            const response = await fetch(
                `${this.SUPABASE_URL}/rest/v1/sensor_logs?order=created_at.asc&limit=100`,
                {
                    headers: {
                        'apikey': this.SUPABASE_ANON_KEY,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.historyRows = data;

            this.historyContent.innerHTML = '';

            if (data.length === 0) {
                this.historyContent.innerHTML = '<div class="log-empty">No historical data found.</div>';
                this.updateChart([]);
                return;
            }

            this.hydrateNodesFromHistory(data);

            // Build chart data
            const chartData = { labels: [], tempData: [], humData: [] };
            data.forEach(log => {
                const timestamp = new Date(log.created_at);
                const timeStr = timestamp.toLocaleTimeString();
                chartData.labels.push(timeStr);

                const tempValue = log.temperature ?? log.temp ?? null;
                const humValue = log.humidity ?? log.hum ?? null;

                if (log.feed_name && log.value !== undefined && log.value !== null) {
                    const { type } = this.parseFeedName(log.feed_name);
                    if (type === 'temperature') {
                        chartData.tempData.push(Number(log.value));
                        chartData.humData.push(null);
                    } else if (type === 'humidity') {
                        chartData.tempData.push(null);
                        chartData.humData.push(Number(log.value));
                    } else {
                        chartData.tempData.push(tempValue !== null ? Number(tempValue) : null);
                        chartData.humData.push(humValue !== null ? Number(humValue) : null);
                    }
                } else {
                    chartData.tempData.push(tempValue !== null ? Number(tempValue) : null);
                    chartData.humData.push(humValue !== null ? Number(humValue) : null);
                }

                // Also display in history list
                const entry = document.createElement('div');
                entry.className = 'history-entry';
                const dateStr = timestamp.toLocaleString();
                entry.innerHTML = `
                    <span class="history-ts">[${dateStr}]</span>
                    <span class="history-feed">${log.feed_name || 'Sensor row'}</span>
                    <span class="history-value">${log.value ?? `${tempValue ?? '--'} / ${humValue ?? '--'}`}</span>
                `;
                this.historyContent.appendChild(entry);
            });

            // Fill missing data points for alignment
            const maxLength = chartData.labels.length;
            while (chartData.tempData.length < maxLength) chartData.tempData.push(null);
            while (chartData.humData.length < maxLength) chartData.humData.push(null);

            this.updateChart(chartData);

        } catch (err) {
            console.error('Error loading history:', err);
            this.historyContent.innerHTML = `<div class="log-empty">Error: ${err.message}</div>`;
        } finally {
            this.loadHistoryBtn.disabled = false;
            this.loadHistoryBtn.textContent = 'Load Chart';
        }
    }

    // ── CHART INITIALIZATION & UPDATE ──────────────────────────────────────────
    updateChart(chartData) {
        const ctx = this.chartCanvas.getContext('2d');

        if (this.sensorChart) {
            this.sensorChart.destroy();
        }

        if (chartData.labels && chartData.labels.length > 0) {
            this.sensorChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartData.labels,
                    datasets: [
                        {
                            label: 'Temperature (°C)',
                            data: chartData.tempData,
                            borderColor: '#ff6b6b',
                            backgroundColor: 'rgba(255, 107, 107, 0.1)',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: true,
                            pointRadius: 3,
                            pointBackgroundColor: '#ff6b6b',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            spanGaps: true
                        },
                        {
                            label: 'Humidity (%)',
                            data: chartData.humData,
                            borderColor: '#4ecdc4',
                            backgroundColor: 'rgba(78, 205, 196, 0.1)',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: true,
                            pointRadius: 3,
                            pointBackgroundColor: '#4ecdc4',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            yAxisID: 'y1',
                            spanGaps: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: window.getComputedStyle(document.body).color,
                                usePointStyle: true,
                                padding: 15,
                                font: { size: 12, weight: '500' }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                            padding: 10,
                            titleFont: { size: 13, weight: 'bold' },
                            bodyFont: { size: 12 },
                            borderColor: '#ddd',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Temperature (°C)',
                                color: '#ff6b6b',
                                font: { size: 12, weight: 'bold' }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            },
                            ticks: {
                                color: window.getComputedStyle(document.body).color
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Humidity (%)',
                                color: '#4ecdc4',
                                font: { size: 12, weight: 'bold' }
                            },
                            grid: {
                                drawOnChartArea: false
                            },
                            ticks: {
                                color: window.getComputedStyle(document.body).color
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            },
                            ticks: {
                                color: window.getComputedStyle(document.body).color,
                                maxRotation: 45,
                                minRotation: 0
                            }
                        }
                    }
                }
            });
            console.log('[Chart] Updated with', chartData.labels.length, 'data points');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Expose instance to window for debugging/inspection in DevTools
    window.dashboard = new AgricultureDashboard();
});
