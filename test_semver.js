const fs = require('fs');
const semver = require('semver');
const lock = JSON.parse(fs.readFileSync('app/package-lock.json', 'utf8'));

function checkDeps(deps) {
  if (!deps) return;
  for (const [name, info] of Object.entries(deps)) {
    if (info.version && !info.version.startsWith('file:') && !info.version.startsWith('http')) {
      if (!semver.valid(info.version) && !semver.validRange(info.version)) {
        console.log(`Invalid version found: ${name} -> ${info.version}`);
      }
    }
    checkDeps(info.dependencies);
  }
}

checkDeps(lock.packages);
console.log('Done checking packages');
