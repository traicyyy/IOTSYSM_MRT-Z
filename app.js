// Smart Agriculture IoT Dashboard
// v8 — Real Analytics: per-node stats, anomaly detection, correlation, data-driven recommendations

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
        this.analyticsMinHistoryPoints = 6;
        this.analyticsForecastHours = 24;
        this.prevAnalyticsTemp = null;
        this.prevAnalyticsHum = null;

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
        this.startSupabaseSubscription();
    }

    // ── DOM REFS ──────────────────────────────────────────────────────────────
    initElements() {
        this.dashPage         = document.getElementById('dashboard-page');
        this.disconnectBtn    = document.getElementById('disconnect-btn');
        this.refreshBtn       = document.getElementById('refresh-btn');
        this.themeToggle      = document.getElementById('theme-toggle');
        this.themeIcon        = document.getElementById('theme-icon');

        this.connLed          = document.getElementById('conn-led');
        this.connText         = document.getElementById('conn-text');

        this.tableBody        = document.getElementById('sensor-table-body');
        this.activeCount      = document.getElementById('active-count');

        this.kpiTempVal       = document.getElementById('kpi-temp-val');
        this.kpiTempMeta      = document.getElementById('kpi-temp-meta');
        this.kpiHumVal        = document.getElementById('kpi-hum-val');
        this.kpiHumMeta       = document.getElementById('kpi-hum-meta');

        this.logContent       = document.getElementById('mqtt-log-content');
        this.clearLogBtn      = document.getElementById('clear-log');

        this.historyContent   = document.getElementById('history-content');
        this.loadHistoryBtn   = document.getElementById('load-history-btn');
        this.chartCanvas      = document.getElementById('sensor-chart');

        this.activeFeeds      = document.getElementById('active-feeds');
        this.messagesPerHour  = document.getElementById('messages-per-hour');
        this.uptimeEl         = document.getElementById('uptime');

        // Analytics DOM refs
        this.analyticsUpdated  = document.getElementById('analytics-updated');
        this.analyticsCategory = document.getElementById('analytics-category');
        this.analyticsEffects  = document.getElementById('analytics-effects');
        this.analyticsSummary  = document.getElementById('analytics-summary');
        this.forecastMeta      = document.getElementById('forecast-meta');
        this.forecastList      = document.getElementById('forecast-list');
        this.recommendList     = document.getElementById('recommend-list');

        // New analytics card refs
        this.nodeStatsBody     = document.getElementById('node-stats-body');
        this.anomalyLog        = document.getElementById('anomaly-log');
        this.corrBody          = document.getElementById('corr-body');
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

    // ── SUPABASE REAL-TIME ────────────────────────────────────────────────────
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
                    try { this.loadHistory(); } catch (e) {
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
                    this.updateConnectionStatus();
                }
            });
    }

    reconnect() {
        this.addSystemLog('Attempting to reconnect...');
        if (this.supabaseSubscription) {
            try { this.supabase.removeChannel(this.supabaseSubscription); } catch (_) {}
        }
        clearInterval(this.statusCheckInterval);
        clearInterval(this.uptimeInterval);
        this.statusCheckInterval = null;
        this.uptimeInterval = null;
        this.connected = false;
        this.updateConnectionStatus();
        this.startSupabaseSubscription();
    }

    disconnect() {
        if (this.supabaseSubscription) {
            try { this.supabase.removeChannel(this.supabaseSubscription); } catch (_) {}
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
            { match: ['afp', 'afpovai'], nodeId: 'AFP-01' },
            { match: ['better-living', 'betterliving', 'blv'], nodeId: 'BLV-01' }
        ];

        const found = nodeMap.find(entry => entry.match.some(token => normalized.includes(token)));
        const nodeId = found ? found.nodeId : null;

        return { nodeId, type };
    }

    // ── HANDLE NEW READINGS ────────────────────────────────────────────────────
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

        // Append to historyRows so analytics sees it immediately
        this.historyRows.push(reading);

        this.updateNodeStatus(node);
        this.renderTable();
        this.addLogEntry(reading.feed_name, value);
        this.appendHistoryEntry(reading);
        this.appendChartPoint(type, createdAt, value);
        this.updateStats();
        this.saveNodeData();
    }

    appendHistoryEntry(log) {
        if (!this.historyContent) return;
        const empty = this.historyContent.querySelector('.log-empty');
        if (empty) empty.remove();

        const timestamp = new Date(log.created_at);
        const entry = document.createElement('div');
        entry.className = 'history-entry';
        entry.innerHTML = `
            <span class="history-ts">[${timestamp.toLocaleString()}]</span>
            <span class="history-feed">${log.feed_name || 'Sensor row'}</span>
            <span class="history-value">${log.value ?? '--'}</span>
        `;
        this.historyContent.prepend(entry);
    }

    appendChartPoint(type, timestamp, rawValue) {
        if (!this.chartCanvas) return;
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue)) return;

        if (!this.chartData || !Array.isArray(this.chartData.labels)) {
            this.chartData = { labels: [], tempData: [], humData: [] };
        }

        this.chartData.labels.push(timestamp.toLocaleTimeString());
        if (type === 'temperature') {
            this.chartData.tempData.push(numericValue);
            this.chartData.humData.push(null);
        } else if (type === 'humidity') {
            this.chartData.tempData.push(null);
            this.chartData.humData.push(numericValue);
        } else {
            this.chartData.tempData.push(null);
            this.chartData.humData.push(null);
        }

        const maxPoints = 15;
        if (this.chartData.labels.length > maxPoints) {
            this.chartData.labels = this.chartData.labels.slice(-maxPoints);
            this.chartData.tempData = this.chartData.tempData.slice(-maxPoints);
            this.chartData.humData = this.chartData.humData.slice(-maxPoints);
        }

        this.updateChart(this.chartData);
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

        rows.forEach(row => {
            if (!row || !row.feed_name) return;
            const timestamp = row.created_at ? new Date(row.created_at) : null;
            const { nodeId, type } = this.parseFeedName(row.feed_name);
            const node = this.nodes.find(n => n.id === nodeId);
            if (!node) return;

            const existing = latestByNode.get(nodeId) || {
                timestamp: null,
                temp: node.temp,
                hum: node.hum
            };

            const readingValue = row.value;
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

        this.messageCount = rows.length;
        this.renderTable();
        this.updateStats();
        this.saveNodeData();
    }

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
        const nodesWithTemp = this.nodes.filter(n => n.temp !== '--');
        let tempVals = nodesWithTemp.map(n => parseFloat(n.temp));
        if (tempVals.length > 0) {
            const avgTemp = tempVals.reduce((s, v) => s + v, 0) / tempVals.length;
            if (!this.prevAvgTemp) this.prevAvgTemp = avgTemp;
            const tempTrend = avgTemp > this.prevAvgTemp ? '↑' : avgTemp < this.prevAvgTemp ? '↓' : '→';
            this.prevAvgTemp = avgTemp;
            this.kpiTempVal.innerHTML = `${avgTemp.toFixed(1)}<span>°C</span> <span class="kpi-trend">${tempTrend}</span>`;
        } else {
            this.kpiTempVal.innerHTML = `--<span>°C</span>`;
        }

        const nodesWithHum = this.nodes.filter(n => n.hum !== '--');
        let humVals = nodesWithHum.map(n => parseFloat(n.hum));
        if (humVals.length > 0) {
            const avgHum = humVals.reduce((s, v) => s + v, 0) / humVals.length;
            if (!this.prevAvgHum) this.prevAvgHum = avgHum;
            const humTrend = avgHum > this.prevAvgHum ? '↑' : avgHum < this.prevAvgHum ? '↓' : '→';
            this.prevAvgHum = avgHum;
            this.kpiHumVal.innerHTML = `${avgHum.toFixed(1)}<span>%</span> <span class="kpi-trend">${humTrend}</span>`;
        } else {
            this.kpiHumVal.innerHTML = `--<span>%</span>`;
        }

        const active = this.nodes.filter(n => n.status === 'transmitting');
        const total = this.nodes.length;
        let metaText = active.length > 0
            ? `<span class="kpi-badge active-badge">${active.length} of ${total} nodes active</span>`
            : `<span class="kpi-badge silent-badge">No active nodes</span>`;
        this.kpiTempMeta.innerHTML = metaText;
        this.kpiHumMeta.innerHTML = metaText;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ANALYTICS ENGINE — all computed from this.historyRows
    // ══════════════════════════════════════════════════════════════════════════

    // Groups historyRows by node, returns:
    // { nodeId: { temps: [numbers], hums: [numbers], timestamps: [Date] } }
    groupRowsByNode() {
        const groups = {};

        this.historyRows.forEach(row => {
            if (!row || !row.feed_name) return;
            const { nodeId, type } = this.parseFeedName(row.feed_name);
            if (!nodeId) return;
            const val = Number(row.value);
            if (!Number.isFinite(val)) return;

            if (!groups[nodeId]) {
                groups[nodeId] = { temps: [], hums: [], timestamps: [] };
            }

            const ts = row.created_at ? new Date(row.created_at) : new Date();
            groups[nodeId].timestamps.push(ts);

            if (type === 'temperature') {
                groups[nodeId].temps.push(val);
            } else if (type === 'humidity') {
                groups[nodeId].hums.push(val);
            }
        });

        return groups;
    }

    // Computes avg, min, max, std for an array of numbers
    computeStats(values) {
        if (!values || values.length === 0) return null;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;
        const std = Math.sqrt(variance);
        return { avg, min, max, std, count: values.length };
    }

    // Anomaly detection: flags readings that are > 2 std from node avg.
    // Also detects silence gaps relative to expected 15-min publish cycle.
    detectAnomalies(groups) {
        const anomalies = [];

        Object.entries(groups).forEach(([nodeId, data]) => {
            const node = this.nodes.find(n => n.id === nodeId);
            const label = node ? node.location : nodeId;

            const tempStats = this.computeStats(data.temps);
            const humStats = this.computeStats(data.hums);

            // Spike detection — temp
            if (tempStats && tempStats.std > 0) {
                data.temps.forEach(val => {
                    const zScore = Math.abs(val - tempStats.avg) / tempStats.std;
                    if (zScore > 2) {
                        const deviation = (val - tempStats.avg).toFixed(1);
                        const sign = deviation > 0 ? '+' : '';
                        anomalies.push({
                            severity: zScore > 3 ? 'danger' : 'warn',
                            label: `${label} — temp spike`,
                            detail: `${val.toFixed(1)}°C recorded (${sign}${deviation}°C from ${tempStats.avg.toFixed(1)}°C avg)`
                        });
                    }
                });
            }

            // Spike detection — humidity
            if (humStats && humStats.std > 0) {
                data.hums.forEach(val => {
                    const zScore = Math.abs(val - humStats.avg) / humStats.std;
                    if (zScore > 2) {
                        const deviation = (val - humStats.avg).toFixed(1);
                        const sign = deviation > 0 ? '+' : '';
                        anomalies.push({
                            severity: zScore > 3 ? 'danger' : 'warn',
                            label: `${label} — humidity spike`,
                            detail: `${val.toFixed(1)}% recorded (${sign}${deviation}% from ${humStats.avg.toFixed(1)}% avg)`
                        });
                    }
                });
            }

            // Silence gap detection — check if node went quiet longer than 2x its expected cycle
            const ts = data.timestamps.slice().sort((a, b) => a - b);
            if (ts.length >= 2) {
                const expectedGapMs = 15 * 60 * 1000; // 15-min sleep cycle per Arduino
                for (let i = 1; i < ts.length; i++) {
                    const gapMs = ts[i] - ts[i - 1];
                    if (gapMs > expectedGapMs * 2) {
                        const gapMin = Math.round(gapMs / 60000);
                        anomalies.push({
                            severity: 'info',
                            label: `${label} — silence gap`,
                            detail: `No readings for ${gapMin} min (expected ~15 min cycle)`
                        });
                    }
                }
            }
        });

        // Deduplicate repeated spike flags (keep first occurrence per type)
        const seen = new Set();
        return anomalies.filter(a => {
            const key = a.label;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // Pearson correlation coefficient between two arrays of equal length
    pearsonCorrelation(xs, ys) {
        const n = Math.min(xs.length, ys.length);
        if (n < 3) return null;

        const ax = xs.slice(0, n);
        const ay = ys.slice(0, n);

        const meanX = ax.reduce((a, b) => a + b, 0) / n;
        const meanY = ay.reduce((a, b) => a + b, 0) / n;

        let num = 0, denX = 0, denY = 0;
        for (let i = 0; i < n; i++) {
            const dx = ax[i] - meanX;
            const dy = ay[i] - meanY;
            num += dx * dy;
            denX += dx * dx;
            denY += dy * dy;
        }

        const denom = Math.sqrt(denX * denY);
        if (denom === 0) return null;
        return num / denom;
    }

    // Describe correlation value in plain language
    describeCorrelation(r) {
        if (r === null) return { text: 'Insufficient data', cls: 'corr-neutral' };
        const abs = Math.abs(r);
        const dir = r >= 0 ? 'positive' : 'negative';
        let strength;
        if (abs >= 0.7) strength = 'strong';
        else if (abs >= 0.4) strength = 'moderate';
        else if (abs >= 0.2) strength = 'weak';
        else strength = 'negligible';

        const cls = r >= 0 ? 'corr-positive' : 'corr-negative';
        return { text: `${strength} ${dir}`, cls };
    }

    // Build data-driven recommendations from actual per-node stats + anomalies
    buildDataDrivenRecommendations(groups, anomalies, categoryKey) {
        const recs = [];

        // Base category recommendations
        if (categoryKey === 'normal') {
            recs.push('Conditions are within normal range. Maintain routine field operations.');
        } else if (categoryKey === 'caution') {
            recs.push('Limit prolonged outdoor work. Schedule shade breaks every hour.');
            recs.push('Shift irrigation and spraying to early morning or evening hours.');
        } else if (categoryKey === 'extreme-caution') {
            recs.push('Reduce strenuous activity and rotate crews more frequently.');
            recs.push('Run ventilation, fans, or misting during the hottest hours.');
        } else if (categoryKey === 'danger') {
            recs.push('Avoid heavy labor during peak heat. Set up cooling stations.');
        } else if (categoryKey === 'extreme-danger') {
            recs.push('Suspend non-essential outdoor work. Activate emergency protocols.');
        }

        // Per-node specific recommendations
        const nodeEntries = Object.entries(groups);

        // Find hottest node
        let hottestNode = null, hottestAvg = -Infinity;
        nodeEntries.forEach(([nodeId, data]) => {
            const stats = this.computeStats(data.temps);
            if (stats && stats.avg > hottestAvg) {
                hottestAvg = stats.avg;
                hottestNode = nodeId;
            }
        });
        if (hottestNode) {
            const node = this.nodes.find(n => n.id === hottestNode);
            const label = node ? node.location : hottestNode;
            if (hottestAvg >= 35) {
                recs.push(`${label} is the hottest node (avg ${hottestAvg.toFixed(1)}°C). Prioritize cooling or shading there.`);
            }
        }

        // Find driest node
        let driestNode = null, driestAvg = Infinity;
        nodeEntries.forEach(([nodeId, data]) => {
            const stats = this.computeStats(data.hums);
            if (stats && stats.avg < driestAvg) {
                driestAvg = stats.avg;
                driestNode = nodeId;
            }
        });
        if (driestNode && driestAvg < 50) {
            const node = this.nodes.find(n => n.id === driestNode);
            const label = node ? node.location : driestNode;
            recs.push(`${label} has low average humidity (${driestAvg.toFixed(1)}%). Schedule irrigation soon.`);
        }

        // Anomaly-driven recommendations
        const dangerAnomalies = anomalies.filter(a => a.severity === 'danger');
        const silenceAnomalies = anomalies.filter(a => a.severity === 'info');

        if (dangerAnomalies.length > 0) {
            recs.push(`${dangerAnomalies.length} severe spike(s) detected. Inspect affected nodes for sensor exposure or heat events.`);
        }
        if (silenceAnomalies.length > 0) {
            recs.push(`${silenceAnomalies.length} node silence gap(s) found. Confirm device uptime and Wi-Fi connectivity.`);
        }

        return recs.slice(0, 5); // cap at 5
    }

    // ── EXISTING HELPERS (kept for forecast / heat index) ─────────────────────
    describeTrend(current, previous) {
        if (previous === null || previous === undefined) return { label: 'steady', arrow: '→' };
        if (current > previous) return { label: 'rising', arrow: '↑' };
        if (current < previous) return { label: 'falling', arrow: '↓' };
        return { label: 'steady', arrow: '→' };
    }

    getHeatIndexCategory(avgTempC) {
        if (!Number.isFinite(avgTempC)) return { key: 'unknown', label: '--', range: '', effect: 'Waiting for temperature data.' };
        if (avgTempC < 27) return { key: 'normal', label: 'Normal', range: '< 27°C / < 80°F', effect: 'Minimal heat stress expected for most people.' };
        if (avgTempC < 32) return { key: 'caution', label: 'Caution', range: '27–32°C / 80–90°F', effect: 'Fatigue possible with prolonged exposure and activity.' };
        if (avgTempC < 39) return { key: 'extreme-caution', label: 'Extreme Caution', range: '32–39°C / 90–103°F', effect: 'Heat cramps and heat exhaustion possible.' };
        if (avgTempC < 52) return { key: 'danger', label: 'Danger', range: '39–51°C / 103–124°F', effect: 'Heat cramps and exhaustion likely; heat stroke possible.' };
        return { key: 'extreme-danger', label: 'Extreme Danger', range: '≥ 52°C / ≥ 125°F', effect: 'Heat stroke highly likely with continued exposure.' };
    }

    getHistoryValues(type, limit) {
        const values = [];
        for (let i = this.historyRows.length - 1; i >= 0 && values.length < limit; i--) {
            const row = this.historyRows[i];
            if (!row) continue;
            let value = null;
            if (row.feed_name) {
                const parsed = this.parseFeedName(row.feed_name);
                if (parsed.type === type && row.value !== undefined && row.value !== null) {
                    value = row.value;
                }
            }
            const numeric = Number(value);
            if (Number.isFinite(numeric)) values.push(numeric);
        }
        return values.reverse();
    }

    buildForecast(values, hours, options = {}) {
        if (!values || values.length < this.analyticsMinHistoryPoints) return null;
        const { clampMin = null, clampMax = null } = options;
        const recent = values.slice(-Math.min(values.length, 3));
        const avgRecent = recent.reduce((a, v) => a + v, 0) / recent.length;
        const slope = (values[values.length - 1] - values[0]) / Math.max(values.length - 1, 1);
        const last = values[values.length - 1];
        const forecast = [];
        for (let h = 1; h <= hours; h++) {
            let predicted = last + slope * h;
            predicted = predicted * 0.65 + avgRecent * 0.35;
            if (clampMin !== null) predicted = Math.max(clampMin, predicted);
            if (clampMax !== null) predicted = Math.min(clampMax, predicted);
            forecast.push(Number(predicted.toFixed(1)));
        }
        return forecast;
    }

    // ── MAIN ANALYTICS RENDER ─────────────────────────────────────────────────
    renderAnalytics() {
        if (!this.analyticsCategory) return;

        if (this.analyticsUpdated) {
            this.analyticsUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
        }

        // --- GROUP RAW DATA BY NODE ---
        const groups = this.groupRowsByNode();
        const hasData = Object.keys(groups).length > 0;

        // --- 1. INTERPRETATION (global avg from historyRows, not just current nodes) ---
        const allTemps = Object.values(groups).flatMap(g => g.temps);
        const allHums = Object.values(groups).flatMap(g => g.hums);
        const globalTempStats = this.computeStats(allTemps);
        const globalHumStats = this.computeStats(allHums);

        if (!globalTempStats) {
            this.analyticsCategory.textContent = '--';
            this.analyticsCategory.className = 'analytics-badge';
            this.analyticsEffects.textContent = 'Waiting for temperature data.';
            this.analyticsSummary.textContent = 'Load history or wait for readings.';
        } else {
            const tempTrend = this.describeTrend(globalTempStats.avg, this.prevAnalyticsTemp);
            this.prevAnalyticsTemp = globalTempStats.avg;
            const humTrend = globalHumStats ? this.describeTrend(globalHumStats.avg, this.prevAnalyticsHum) : null;
            this.prevAnalyticsHum = globalHumStats ? globalHumStats.avg : this.prevAnalyticsHum;

            const category = this.getHeatIndexCategory(globalTempStats.avg);
            this.analyticsCategory.textContent = `${category.label} (${category.range})`;
            this.analyticsCategory.className = `analytics-badge ${category.key}`;
            this.analyticsEffects.textContent = category.effect;

            const summaryParts = [
                `Temp avg ${globalTempStats.avg.toFixed(1)}°C (${tempTrend.label}), min ${globalTempStats.min.toFixed(1)}°C, max ${globalTempStats.max.toFixed(1)}°C`
            ];
            if (globalHumStats) {
                summaryParts.push(
                    `Hum avg ${globalHumStats.avg.toFixed(1)}% (${humTrend ? humTrend.label : 'steady'}), min ${globalHumStats.min.toFixed(1)}%, max ${globalHumStats.max.toFixed(1)}%`
                );
            }
            this.analyticsSummary.textContent = summaryParts.join(' | ');
        }

        // --- 2. FORECAST (unchanged from v7, still useful) ---
        const tempHistory = this.getHistoryValues('temperature', 48);
        const humHistory = this.getHistoryValues('humidity', 48);
        const tempForecast = this.buildForecast(tempHistory, this.analyticsForecastHours);
        const humForecast = this.buildForecast(humHistory, this.analyticsForecastHours, { clampMin: 0, clampMax: 100 });

        this.forecastList.innerHTML = '';
        if (!tempForecast || !humForecast) {
            this.forecastMeta.textContent = 'Awaiting enough history to forecast.';
            this.forecastList.innerHTML = '<tr><td class="forecast-empty" colspan="3">Insufficient data for forecast.</td></tr>';
        } else {
            const now = new Date();
            for (let i = 0; i < this.analyticsForecastHours; i++) {
                const hour = new Date(now.getTime() + (i + 1) * 3600000);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${hour.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>${tempForecast[i].toFixed(1)}°C</td>
                    <td>${humForecast[i].toFixed(1)}%</td>
                `;
                this.forecastList.appendChild(row);
            }
            const peakTemp = Math.max(...tempForecast);
            const peakHum = Math.max(...humForecast);
            this.forecastMeta.textContent = `Peak temp ${peakTemp.toFixed(1)}°C | Peak hum ${peakHum.toFixed(1)}%`;
        }

        // --- 3. PER-NODE STATS ---
        if (this.nodeStatsBody) {
            this.nodeStatsBody.innerHTML = '';
            if (!hasData) {
                this.nodeStatsBody.innerHTML = '<tr><td colspan="6" class="forecast-empty">Load history to see per-node stats.</td></tr>';
            } else {
                this.nodes.forEach(node => {
                    const data = groups[node.id];
                    const tempStats = data ? this.computeStats(data.temps) : null;
                    const humStats = data ? this.computeStats(data.hums) : null;

                    const tempTrend = tempStats
                        ? (tempStats.avg > tempStats.min + (tempStats.max - tempStats.min) * 0.66 ? '↑' : '→')
                        : '--';

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><span class="sensor-id">${node.id}</span></td>
                        <td>${node.location}</td>
                        <td>${tempStats ? tempStats.avg.toFixed(1) + '°C' : '--'}</td>
                        <td>${tempStats ? tempStats.min.toFixed(1) + ' / ' + tempStats.max.toFixed(1) + '°C' : '--'}</td>
                        <td>${humStats ? humStats.avg.toFixed(1) + '%' : '--'}</td>
                        <td>${tempStats ? '<span class="node-trend">' + tempTrend + '</span>' : '--'}</td>
                    `;
                    this.nodeStatsBody.appendChild(row);
                });
            }
        }

        // --- 4. ANOMALY DETECTION ---
        if (this.anomalyLog) {
            this.anomalyLog.innerHTML = '';
            if (!hasData) {
                this.anomalyLog.innerHTML = '<div class="anomaly-empty">Load history to detect anomalies.</div>';
            } else {
                const anomalies = this.detectAnomalies(groups);
                if (anomalies.length === 0) {
                    this.anomalyLog.innerHTML = '<div class="anomaly-empty anomaly-clear">✓ No anomalies detected in current dataset.</div>';
                } else {
                    anomalies.slice(0, 6).forEach(a => {
                        const item = document.createElement('div');
                        item.className = `anomaly-item anomaly-${a.severity}`;
                        item.innerHTML = `
                            <span class="anomaly-dot"></span>
                            <div class="anomaly-content">
                                <div class="anomaly-label">${a.label}</div>
                                <div class="anomaly-detail">${a.detail}</div>
                            </div>
                        `;
                        this.anomalyLog.appendChild(item);
                    });
                }
            }
        }

        // --- 5. CORRELATION ---
        if (this.corrBody) {
            this.corrBody.innerHTML = '';
            if (!hasData) {
                this.corrBody.innerHTML = '<div class="anomaly-empty">Load history to compute correlation.</div>';
            } else {
                this.nodes.forEach(node => {
                    const data = groups[node.id];
                    if (!data) return;

                    // Pair up temps and hums by matching index length
                    const n = Math.min(data.temps.length, data.hums.length);
                    if (n < 3) return;

                    const r = this.pearsonCorrelation(data.temps.slice(-n), data.hums.slice(-n));
                    const { text, cls } = this.describeCorrelation(r);
                    const rVal = r !== null ? r.toFixed(2) : 'N/A';
                    const pct = r !== null ? Math.abs(r) * 100 : 0;

                    const row = document.createElement('div');
                    row.className = 'corr-row';
                    row.innerHTML = `
                        <div class="corr-header">
                            <span class="corr-node">${node.location}</span>
                            <span class="corr-val ${cls}">${rVal}</span>
                        </div>
                        <div class="corr-track">
                            <div class="corr-fill ${cls}" style="width: ${pct.toFixed(1)}%"></div>
                        </div>
                        <div class="corr-desc">${text} — ${r !== null && r < 0 ? 'hotter → lower humidity' : 'temp and humidity move together'}</div>
                    `;
                    this.corrBody.appendChild(row);
                });

                if (this.corrBody.innerHTML === '') {
                    this.corrBody.innerHTML = '<div class="anomaly-empty">Need ≥ 3 paired readings per node.</div>';
                }
            }
        }

        // --- 6. RECOMMENDATIONS (data-driven) ---
        const categoryKey = globalTempStats
            ? this.getHeatIndexCategory(globalTempStats.avg).key
            : 'normal';
        const anomalies = hasData ? this.detectAnomalies(groups) : [];
        const recs = hasData
            ? this.buildDataDrivenRecommendations(groups, anomalies, categoryKey)
            : ['Load history or wait for readings to generate recommendations.'];

        this.recommendList.innerHTML = '';
        recs.forEach(rec => {
            const item = document.createElement('li');
            item.textContent = rec;
            this.recommendList.appendChild(item);
        });
    }

    // ── TABLE ─────────────────────────────────────────────────────────────────
    renderTable() {
        this.renderKpiCards();
        this.renderAnalytics();
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
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            this.uptimeEl.textContent =
                `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }, 1000);
    }

    // ── LOAD HISTORY ──────────────────────────────────────────────────────────
    async loadHistory() {
        this.loadHistoryBtn.disabled = true;
        this.loadHistoryBtn.textContent = 'Loading…';

        try {
            // FIX 1: Change .asc to .desc to pull the most recent 500 readings from the database
            const response = await fetch(
                `${this.SUPABASE_URL}/rest/v1/sensor_logs?order=created_at.desc&limit=500`,
                {
                    headers: {
                        'apikey': this.SUPABASE_ANON_KEY,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            let rawData = await response.json();
            
            // FIX 2: Supabase gave us newest-first. We must reverse it so our charts 
            // and analytics process it chronologically (oldest to newest)
            const data = rawData.reverse(); 
            
            this.historyRows = data;

            this.historyContent.innerHTML = '';

            if (data.length === 0) {
                this.historyContent.innerHTML = '<div class="log-empty">No historical data found.</div>';
                this.updateChart([]);
                this.renderAnalytics();
                return;
            }

            this.hydrateNodesFromHistory(data);

            const chartData = { labels: [], tempData: [], humData: [] };
            data.forEach(log => {
                const timestamp = new Date(log.created_at);
                chartData.labels.push(timestamp.toLocaleTimeString());

                if (log.feed_name && log.value !== undefined && log.value !== null) {
                    const { type } = this.parseFeedName(log.feed_name);
                    if (type === 'temperature') {
                        chartData.tempData.push(Number(log.value));
                        chartData.humData.push(null);
                    } else if (type === 'humidity') {
                        chartData.tempData.push(null);
                        chartData.humData.push(Number(log.value));
                    } else {
                        chartData.tempData.push(null);
                        chartData.humData.push(null);
                    }
                } else {
                    chartData.tempData.push(null);
                    chartData.humData.push(null);
                }
            });

            data.slice().reverse().forEach(log => {
                const entry = document.createElement('div');
                entry.className = 'history-entry';
                entry.innerHTML = `
                    <span class="history-ts">[${new Date(log.created_at).toLocaleString()}]</span>
                    <span class="history-feed">${log.feed_name || 'Sensor row'}</span>
                    <span class="history-value">${log.value ?? '--'}</span>
                `;
                this.historyContent.appendChild(entry);
            });

            const maxPoints = 15;
            if (chartData.labels.length > maxPoints) {
                chartData.labels = chartData.labels.slice(-maxPoints);
                chartData.tempData = chartData.tempData.slice(-maxPoints);
                chartData.humData = chartData.humData.slice(-maxPoints);
            }

            this.chartData = chartData;
            this.updateChart(chartData);
            this.renderAnalytics();

        } catch (err) {
            console.error('Error loading history:', err);
            this.historyContent.innerHTML = `<div class="log-empty">Error: ${err.message}</div>`;
        } finally {
            this.loadHistoryBtn.disabled = false;
            this.loadHistoryBtn.textContent = 'Load Chart';
        }
    }

    // ── CHART ─────────────────────────────────────────────────────────────────
    updateChart(chartData) {
        const ctx = this.chartCanvas.getContext('2d');
        if (this.sensorChart) this.sensorChart.destroy();

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
                    interaction: { mode: 'index', intersect: false },
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
                            type: 'linear', display: true, position: 'left',
                            title: { display: true, text: 'Temperature (°C)', color: '#ff6b6b', font: { size: 12, weight: 'bold' } },
                            grid: { color: 'rgba(0,0,0,0.05)' },
                            ticks: { color: window.getComputedStyle(document.body).color }
                        },
                        y1: {
                            type: 'linear', display: true, position: 'right',
                            title: { display: true, text: 'Humidity (%)', color: '#4ecdc4', font: { size: 12, weight: 'bold' } },
                            grid: { drawOnChartArea: false },
                            ticks: { color: window.getComputedStyle(document.body).color }
                        },
                        x: {
                            grid: { color: 'rgba(0,0,0,0.05)' },
                            ticks: {
                                color: window.getComputedStyle(document.body).color,
                                maxTicksLimit: 15, autoSkip: true, maxRotation: 45, minRotation: 0
                            }
                        }
                    }
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new AgricultureDashboard();
});