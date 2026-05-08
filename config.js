// Supabase Configuration
// ═════════════════════════════════════════════════════════════════════════════
// Load from environment or hardcode below

const config = {
    getSupabaseUrl() {
        // `process` is only available in Node/Vite build environments — guard it for browsers
        const envUrl = (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL)
            ? process.env.VITE_SUPABASE_URL
            : null;
        return envUrl || localStorage.getItem('supabase_url') || 'https://mheccuaathqhcfodbkif.supabase.co';
    },

    getSupabaseAnonKey() {
        const envKey = (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_ANON_KEY)
            ? process.env.VITE_SUPABASE_ANON_KEY
            : null;
        return envKey || localStorage.getItem('supabase_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZWNjdWFhdGhxaGNmb2Ria2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NjM3NzAsImV4cCI6MjA5MzQzOTc3MH0.wr7oyYT-7QIey23AzWnfgL_cypQQVEtj2SCkSQQHIOw';
    },

    // Sensor node definitions
    SENSOR_NODES: [
        { id: 'VLM-01', location: 'Villamor' },
        { id: 'AFP-01', location: 'AFPOVAI' },
        { id: 'SLZ-01', location: 'San Lorenzo' },
        { id: 'BLV-01', location: 'Better Living' }
    ],

    // Feed name format: {node_id}-{type}
    // Examples: VLM-01-temperature, VLM-01-humidity
    getFeedName(nodeId, type) {
        return `${nodeId}-${type}`;
    },

    parsefeedName(feedName) {
        const parts = feedName.split('-');
        return {
            nodeId: parts[0] + '-' + parts[1], // e.g., VLM-01
            type: parts.slice(2).join('-')      // e.g., temperature or humidity
        };
    }
};
