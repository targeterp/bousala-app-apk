const fs = require('fs');

let f = fs.readFileSync('src/pages/Finance.tsx', 'utf8');

// Find the line with `txData?.forEach(t => {` and the line with `  };` right before `const handleEditTransaction`
const startIndex = f.indexOf('txData?.forEach(t => {');
const endIndex = f.indexOf('const handleEditTransaction = (tx: any) => {');

if (startIndex !== -1 && endIndex !== -1) {
  f = f.substring(0, startIndex) + f.substring(endIndex);
  fs.writeFileSync('src/pages/Finance.tsx', f);
  console.log('Fixed syntax error!');
} else {
  console.log('Could not find indices', { startIndex, endIndex });
}
