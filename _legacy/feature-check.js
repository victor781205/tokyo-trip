const fs = require('fs');
const html = fs.readFileSync('./index.html', 'utf8');

const features = [
    ['Loading screen', 'loading-screen'],
    ['Dark mode', 'toggleDarkMode'],
    ['Language toggle', 'toggleLanguage'],
    ['Mobile nav', 'mobile-nav'],
    ['FAB menu', 'fab-menu'],
    ['Scroll progress', 'scroll-progress'],
    ['Back to top', 'back-to-top'],
    ['Toast notification', 'toast'],
    ['Activity modal', 'activityModal'],
    ['Custom food form', 'customFoodForm'],
    ['Custom food list', 'customFoodList'],
    ['Itinerary container', 'itineraryContainer'],
    ['Currency converter', 'convertCurrency'],
    ['Weather widget', 'weather-widget'],
    ['Checklist', 'checklist'],
    ['Budget tracker', 'budget-tracker'],
    ['Emergency tel link', 'tel:110'],
    ['Map zoom', 'zoomMap'],
    ['Favorites', 'toggleFavorite'],
    ['Print styles', '@media print'],
    ['Offline detection', 'navigator.onLine'],
    ['Service Worker', 'sw.js'],
    ['PWA manifest', 'manifest.json'],
    ['Today itinerary', 'goToToday'],
    ['Reset itinerary', 'resetItinerary'],
    ['Activity modal open', 'openModal'],
    ['Save activity', 'saveActivity'],
    ['Custom food add', 'addCustomFood'],
    ['Custom food delete', 'deleteCustomFood'],
    ['Render itinerary', 'renderItinerary'],
];

console.log('=== Feature Check ===');
let pass = 0, fail = 0;
features.forEach(([name, keyword]) => {
    if (html.includes(keyword)) {
        console.log('  ' + name);
        pass++;
    } else {
        console.log('  X ' + name + ' - MISSING');
        fail++;
    }
});
console.log('\n' + pass + '/' + features.length + ' features found');
if (fail > 0) console.log(fail + ' MISSING');
else console.log('All features present!');
