const fs = require('fs');
const css = fs.readFileSync('assets/styles.css', 'utf8');
console.log(css.includes('@media (max-width: 1140px)'));
