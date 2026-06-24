const fs = require('fs');
const html = fs.readFileSync('./index.html', 'utf8');

const checks = [];

// 1. Check for critical elements
checks.push({test: 'Loading screen', pass: html.includes('loading-screen')});
checks.push({test: 'Navigation', pass: html.includes('class="nav"')});
checks.push({test: 'Hero section', pass: html.includes('class="hero"')});
checks.push({test: 'Footer', pass: html.includes('<footer')});
checks.push({test: 'Toast notification', pass: html.includes('id="toast"')});
checks.push({test: 'Mobile nav', pass: html.includes('mobile-nav')});
checks.push({test: 'FAB menu', pass: html.includes('fab-menu')});
checks.push({test: 'Scroll progress', pass: html.includes('scroll-progress')});

// 2. Check sections exist
const sections = ['flights', 'transfer', 'hotel', 'routemap', 'map', 'itinerary', 'tools', 'food', 'tips', 'emergency'];
sections.forEach(s => {
    checks.push({test: 'Section #' + s, pass: html.includes('id="' + s + '"')});
});

// 3. Check new features
checks.push({test: 'Favorites feature', pass: html.includes('toggleFavorite')});
checks.push({test: 'Geolocation', pass: html.includes('showNearbyLandmarks')});
checks.push({test: 'Language toggle', pass: html.includes('toggleLanguage')});
checks.push({test: 'Print styles', pass: html.includes('@media print')});
checks.push({test: 'Offline detection', pass: html.includes('offline') && html.includes('navigator.onLine')});
checks.push({test: 'Map zoom', pass: html.includes('zoomMap')});
checks.push({test: 'PWA install prompt', pass: html.includes('beforeinstallprompt')});
checks.push({test: 'Today itinerary btn', pass: html.includes('goToToday')});
checks.push({test: 'Swap currency', pass: html.includes('swapCurrency')});

// 4. Check nav links have data-section
checks.push({test: 'Nav data-section attrs', pass: html.includes('data-section="flights"')});

// 5. Check ARIA improvements
checks.push({test: 'Hamburger aria-label', pass: html.includes('aria-label="開啟選單"')});
checks.push({test: 'Toast aria-live', pass: html.includes('aria-live="polite"')});
checks.push({test: 'Day header role=button', pass: html.includes('role="button" tabindex="0"')});
checks.push({test: 'sr-only class', pass: html.includes('class="sr-only"')});

// 6. Check emergency tel: links
checks.push({test: 'Emergency tel: links', pass: html.includes('href="tel:110"')});

// 7. Check files exist
checks.push({test: 'icon.svg', pass: fs.existsSync('./icon.svg')});
checks.push({test: 'manifest.json', pass: fs.existsSync('./manifest.json')});
checks.push({test: 'sw.js', pass: fs.existsSync('./sw.js')});
checks.push({test: 'offline.html', pass: fs.existsSync('./offline.html')});

// 8. Check for broken references
checks.push({test: 'CSS var(--gradient-secondary)', pass: html.includes('--gradient-secondary')});
checks.push({test: 'No old gradient-green', pass: !html.includes('--gradient-green')});
checks.push({test: 'No old gradient-sunset', pass: !html.includes('--gradient-sunset')});

// 9. Check checklist items count (should be 18)
const checklistItems = (html.match(/id="item\d+"/g) || []).length;
checks.push({test: 'Checklist 18 items', pass: checklistItems === 18, detail: 'Found ' + checklistItems});

// 10. Check hero subtitle updated
checks.push({test: 'Hero subtitle updated', pass: html.includes('與毓寧的第一次愛的旅行')});

// 11. Check tools-row for responsive
checks.push({test: 'Tools row responsive class', pass: html.includes('tools-row')});

// 12. Check translate dictionary has updated subtitle
checks.push({test: 'i18n subtitle updated', pass: html.includes('與毓寧的第一次愛的旅行') || html.includes('毓寧')});

// Output results
console.log('=== Tokyo Trip Website Check ===\n');
checks.forEach(c => {
    const icon = c.pass ? '✅' : '❌';
    const extra = c.detail ? ' (' + c.detail + ')' : '';
    console.log(icon + ' ' + c.test + extra);
});

const passed = checks.filter(c => c.pass).length;
const failed = checks.filter(c => !c.pass).length;
console.log('\n' + passed + '/' + checks.length + ' checks passed');
if (failed > 0) console.log(failed + ' checks FAILED');
