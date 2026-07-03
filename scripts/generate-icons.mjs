import { writeFileSync } from "fs";
import { join } from "path";

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#e74c3c" rx="100"/>
  <text x="256" y="320" font-size="280" text-anchor="middle" fill="white">🗼</text>
</svg>`;

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#e74c3c"/>
  <rect x="64" y="64" width="384" height="384" rx="60" fill="#e74c3c"/>
  <text x="256" y="320" font-size="240" text-anchor="middle" fill="white">🗼</text>
</svg>`;

const appleTouchIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#e74c3c" rx="100"/>
  <text x="256" y="320" font-size="280" text-anchor="middle" fill="white">🗼</text>
</svg>`;

const publicDir = join(process.cwd(), "public");

// Write SVG files that can be used as placeholders
// For actual PNG generation, use: npx sharp-cli -i icon.svg -o icon-192.png resize 192 192
writeFileSync(join(publicDir, "icon-192.svg"), svgIcon);
writeFileSync(join(publicDir, "icon-512.svg"), svgIcon);
writeFileSync(join(publicDir, "icon-maskable-512.svg"), maskableSvg);
writeFileSync(join(publicDir, "apple-touch-icon.svg"), appleTouchIcon);

console.log("SVG icon placeholders created. For PNG generation, run:");
console.log("  npx sharp-cli -i public/icon.svg -o public/icon-192.png resize 192 192");
console.log("  npx sharp-cli -i public/icon.svg -o public/icon-512.png resize 512 512");
console.log("  npx sharp-cli -i public/icon-maskable-512.svg -o public/icon-maskable-512.png resize 512 512");
console.log("  npx sharp-cli -i public/apple-touch-icon.svg -o public/apple-touch-icon.png resize 180 180");
