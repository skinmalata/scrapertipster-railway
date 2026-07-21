// Simulate the DOM elements with default values
document = {
    getElementById: function(id) {
        var elements = {
            ticketTarget: { value: '20' },
            ticketMinOdds: { value: '1.20' },
            ticketMaxOdds: { value: '3.00' },
            ticketTodayOnly: { checked: true },
            ticketResults: {
                innerHTML: '',
                _html: '',
                set innerHTML(v) { this._html = v; console.log('results.innerHTML set to', v.substring(0, 50) + '...') },
                get innerHTML() { return this._html }
            }
        };
        return elements[id] || null;
    }
};

// Override fetch to return mock data
fetch = function(url) {
    console.log('fetch called:', url);
    return Promise.resolve({
        ok: true,
        json: function() { return Promise.resolve({ date: '2026-07-20', matches: [], over15Matches: [], over25Matches: [], bttsMatches: [], bttsNoMatches: [] }); }
    });
};

// Track calls
function track() { console.log('generateTickets called'); }

// Load the actual code
require('./test_tb.js');
console.log('Script loaded successfully');
console.log('generateTickets type:', typeof generateTickets);

// Test with default values
console.log('\n=== Testing with default values ===');
generateTickets().then(() => console.log('Done (default)'));
