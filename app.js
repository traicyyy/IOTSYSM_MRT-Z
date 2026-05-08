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
        this.analyticsMinHistoryPoints = 6;
        this.analyticsForecastHours = 24;
        this.prevAnalyticsTemp = null;
        this.prevAnalyticsHum = null;

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

        this.analyticsUpdated = document.getElementById('analytics-updated');
        this.analyticsCategory = document.getElementById('analytics-category');
        this.analyticsEffects = document.getElementById('analytics-effects');
        this.analyticsSummary = document.getElementById('analytics-summary');
        this.forecastMeta = document.getElementById('forecast-meta');
        this.forecastList = document.getElementById('forecast-list');
        this.recommendList = document.getElementById('recommend-list');
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
            { match: ['afp', 'afpovai', 'afpovai'], nodeId: 'AFP-01' },
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

    // ── ANALYTICS ───────────────────────────────────────────────────────────
    getNumericNodeValues(key) {
        return this.nodes
            .filter(node => node[key] !== '--')
            .map(node => Number(node[key]))
            .filter(value => Number.isFinite(value));
    }

    calculateStats(values) {
        if (!values || values.length === 0) return null;
        const sum = values.reduce((acc, value) => acc + value, 0);
        const avg = sum / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        return { avg, min, max };
    }

    describeTrend(current, previous) {
        if (previous === null || previous === undefined) return { label: 'steady', arrow: '→' };
        if (current > previous) return { label: 'rising', arrow: '↑' };
        if (current < previous) return { label: 'falling', arrow: '↓' };
        return { label: 'steady', arrow: '→' };
    }

    getHeatIndexCategory(avgTempC) {
        if (avgTempC === null || avgTempC === undefined || !Number.isFinite(avgTempC)) {
            return {
                key: 'unknown',
                label: '--',
                range: '',
                effect: 'Waiting for temperature data.'
            };
        }

        if (avgTempC < 27) {
            return {
                key: 'normal',
                label: 'Normal',
                range: '< 27°C / < 80°F',
                effect: 'Minimal heat stress expected for most people.'
            };
        }

        if (avgTempC >= 27 && avgTempC < 32) {
            return {
                key: 'caution',
                label: 'Caution',
                range: '27–32°C / 80–90°F',
                effect: 'Fatigue possible with prolonged exposure and activity.'
            };
        }

        if (avgTempC >= 32 && avgTempC < 39) {
            return {
                key: 'extreme-caution',
                label: 'Extreme Caution',
                range: '32–39°C / 90–103°F',
                effect: 'Heat cramps and heat exhaustion possible.'
            };
        }

        if (avgTempC >= 39 && avgTempC < 52) {
            return {
                key: 'danger',
                label: 'Danger',
                range: '39–51°C / 103–124°F',
                effect: 'Heat cramps and heat exhaustion likely; heat stroke possible with prolonged activity.'
            };
        }

        return {
            key: 'extreme-danger',
            label: 'Extreme Danger',
            range: '≥ 52°C / ≥ 125°F',
            effect: 'Heat stroke highly likely with continued exposure.'
        };
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

            if (value === null || value === undefined) {
                if (type === 'temperature') {
                    value = row.temperature ?? row.temp ?? null;
                } else {
                    value = row.humidity ?? row.hum ?? null;
                }
            }

            const numeric = Number(value);
            if (Number.isFinite(numeric)) {
                values.push(numeric);
            }
        }

        return values.reverse();
    }

    buildForecast(values, hours, options = {}) {
        if (!values || values.length < this.analyticsMinHistoryPoints) return null;

        const { clampMin = null, clampMax = null } = options;
        const recent = values.slice(-Math.min(values.length, 3));
        const avgRecent = recent.reduce((acc, val) => acc + val, 0) / recent.length;
        const first = values[0];
        const last = values[values.length - 1];
        const slope = (last - first) / Math.max(values.length - 1, 1);

        const forecast = [];
        for (let hour = 1; hour <= hours; hour++) {
            let predicted = last + slope * hour;
            predicted = (predicted * 0.65) + (avgRecent * 0.35);

            if (clampMin !== null) predicted = Math.max(clampMin, predicted);
            if (clampMax !== null) predicted = Math.min(clampMax, predicted);

            forecast.push(Number(predicted.toFixed(1)));
        }

        return forecast;
    }

    buildRecommendations(categoryKey, forecastPeak, avgHum) {
        const recommendations = [];

        if (categoryKey === 'normal') {
            recommendations.push('Maintain routine field operations with normal hydration breaks.');
            recommendations.push('Keep monitoring sensors for sudden changes or localized hotspots.');
            recommendations.push('Inspect shade cover and irrigation readiness before midday peaks.');
        } else if (categoryKey === 'caution') {
            recommendations.push('Limit prolonged outdoor work; schedule brief shade breaks every hour.');
            recommendations.push('Hydrate regularly and monitor for early fatigue or dizziness.');
            recommendations.push('Shift irrigation or spraying to early morning or evening hours.');
        } else if (categoryKey === 'extreme-caution') {
            recommendations.push('Reduce strenuous activity and rotate crews more frequently.');
            recommendations.push('Monitor for heat cramps or exhaustion and respond quickly.');
            recommendations.push('Run ventilation, fans, or misting during the hottest hours.');
        } else if (categoryKey === 'danger') {
            recommendations.push('Avoid heavy labor during peak heat; reschedule if possible.');
            recommendations.push('Set up cooling stations and check on vulnerable individuals.');
            recommendations.push('Trigger alerts for field supervisors and confirm sensor uptime.');
        } else if (categoryKey === 'extreme-danger') {
            recommendations.push('Suspend non-essential outdoor work during peak hours.');
            recommendations.push('Activate heat emergency protocols and broadcast alerts.');
            recommendations.push('Provide immediate access to cooling shelters and water.');
        }

        if (Number.isFinite(forecastPeak) && forecastPeak >= 39) {
            recommendations.push('Prepare cooling measures ahead of the forecasted peak.');
        }

        if (Number.isFinite(forecastPeak) && forecastPeak >= 52) {
            recommendations.push('Escalate to emergency response and restrict exposure.');
        }

        if (Number.isFinite(avgHum) && avgHum >= 80) {
            recommendations.push('Increase ventilation to reduce humidity buildup in enclosed areas.');
        }

        return recommendations;
    }

    renderAnalytics() {
        if (!this.analyticsCategory || !this.analyticsEffects || !this.analyticsSummary) return;

        const tempValues = this.getNumericNodeValues('temp');
        const humValues = this.getNumericNodeValues('hum');
        const tempStats = this.calculateStats(tempValues);
        const humStats = this.calculateStats(humValues);

        if (this.analyticsUpdated) {
            this.analyticsUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
        }

        if (!tempStats) {
            this.analyticsCategory.textContent = '--';
            this.analyticsCategory.className = 'analytics-badge';
            this.analyticsEffects.textContent = 'Waiting for temperature data.';
            this.analyticsSummary.textContent = 'Insufficient data to generate descriptive analytics.';
            this.forecastMeta.textContent = 'Awaiting history...';
            this.forecastList.innerHTML = '<tr><td class="forecast-empty" colspan="3">Insufficient data for forecast.</td></tr>';
            this.recommendList.innerHTML = '<li class="muted">Waiting for readings...</li>';
            return;
        }

        const tempTrend = this.describeTrend(tempStats.avg, this.prevAnalyticsTemp);
        this.prevAnalyticsTemp = tempStats.avg;
        const humTrend = humStats ? this.describeTrend(humStats.avg, this.prevAnalyticsHum) : null;
        this.prevAnalyticsHum = humStats ? humStats.avg : this.prevAnalyticsHum;


        const category = this.getHeatIndexCategory(tempStats.avg);
        this.analyticsCategory.textContent = `${category.label} (${category.range})`;
        this.analyticsCategory.className = `analytics-badge ${category.key}`;
        this.analyticsEffects.textContent = category.effect;

        const summaryParts = [
            `Temp avg ${tempStats.avg.toFixed(1)}°C (${tempTrend.label}), min ${tempStats.min.toFixed(1)}°C, max ${tempStats.max.toFixed(1)}°C`
        ];
        if (humStats) {
            summaryParts.push(
                `Hum avg ${humStats.avg.toFixed(1)}% (${humTrend ? humTrend.label : 'steady'}), min ${humStats.min.toFixed(1)}%, max ${humStats.max.toFixed(1)}%`
            );
        }
        this.analyticsSummary.textContent = summaryParts.join(' | ');

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

        const peakTemp = tempForecast ? Math.max(...tempForecast) : null;
        const recs = this.buildRecommendations(category.key, peakTemp, humStats ? humStats.avg : null);
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
                this.renderAnalytics();
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

            const maxPoints = 15;
            if (chartData.labels.length > maxPoints) {
                chartData.labels = chartData.labels.slice(-maxPoints);
                chartData.tempData = chartData.tempData.slice(-maxPoints);
                chartData.humData = chartData.humData.slice(-maxPoints);
            }

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
                                maxTicksLimit: 15,
                                autoSkip: true,
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
