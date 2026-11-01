const fs = require('fs');
const path = require('path');

const excludeAlerts = [
  "تعذر فتح صفحة الطباعة."
];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fullPath.includes('node_modules')) continue;
    
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let originalContent = fs.readFileSync(fullPath, 'utf8');
      let content = originalContent;
      
      if (content.includes('alert(')) {
        
        // Ensure toast is imported
        if (!content.includes('import toast from \'react-hot-toast\'')) {
          content = "import toast from 'react-hot-toast';\n" + content;
        }

        // Replace alert() with toast
        content = content.replace(/alert\((.*)\)(;?)/g, (match, p1) => {
          if (excludeAlerts.some(ex => p1.includes(ex))) {
            return match; // skip excluded
          }
          if (p1.includes('بنجاح')) {
            return `toast.success(${p1});`;
          } else if (p1.includes('؟') && p1.includes('هل')) {
            return match; // skip alert if it looks like a question or prompt (mostly caution)
          } else {
            return `toast.error(${p1});`;
          }
        });

        if (content !== originalContent) {
          fs.writeFileSync(fullPath, content);
          console.log(`Updated ${fullPath}`);
        }
      }
    }
  }
}

processDirectory('./src');
