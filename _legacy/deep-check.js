const fs = require('fs');
const html = fs.readFileSync('./index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const js = scriptMatch[1];

const issues = [];

// Check getElementById calls
const getByIdRegex = /getElementById\(['"]([^'"]+)['"]\)/g;
let match;
while ((match = getByIdRegex.exec(js)) !== null) {
    const id = match[1];
    if (!html.includes('id="' + id + '"')) {
        issues.push('Missing element: #' + id);
    }
}

// Check for null-unsafe patterns
const unsafePatterns = [
    { regex: /document\.getElementById\(['"](\w+)['"]\)\./g, desc: 'getElementById without null check' },
];

unsafePatterns.forEach(p => {
    let m;
    while ((m = p.regex.exec(js)) !== null) {
        // Check if it's wrapped in a condition
        const before = js.substring(Math.max(0, m.index - 50), m.index);
        if (!before.includes('if') && !before.includes('?') && !before.includes('&&')) {
            // Not in a condition - potential issue
        }
    }
});

// Count functions
const functions = js.match(/function\s+\w+/g) || [];
console.log('Total functions: ' + functions.length);

// Count try-catch
const tryCatch = js.match(/try\s*\{/g) || [];
console.log('Try-catch blocks: ' + tryCatch.length);

// Count localStorage calls
const lsCalls = js.match(/localStorage\.\w+/g) || [];
console.log('localStorage calls: ' + lsCalls.length);

// Check for console.error (known issues)
const errors = js.match(/console\.error/g) || [];
console.log('Console.error calls: ' + errors.length);

// Check for console.log (debug)
const logs = js.match(/console\.log/g) || [];
console.log('Console.log calls (debug): ' + logs.length);

// Check potential issues
const nullRefs = js.match(/\.classList\./g) || [];
console.log('classList references: ' + nullRefs.length);

if (issues.length > 0) {
    console.log('\n⚠️ Issues:');
    issues.forEach(i => console.log('  - ' + i));
} else {
    console.log('\n✅ No missing elements found');
}

// Check CSS for potential issues
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (cssMatch) {
    const css = cssMatch[1];
    const mediaQueries = css.match(/@media/g) || [];
    console.log('\nMedia queries: ' + mediaQueries.length);
    
    const animations = css.match(/@keyframes/g) || [];
    console.log('Keyframe animations: ' + animations.length);
    
    const gradients = css.match(/linear-gradient/g) || [];
    console.log('Gradients: ' + gradients.length);
}
