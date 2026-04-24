const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 800 });
  await page.goto('http://localhost:8000/contact/');
  
  // Clear cache just in case
  await page.setCacheEnabled(false);
  await page.reload({ waitUntil: 'networkidle0' });

  const width = await page.evaluate(() => {
    return getComputedStyle(document.querySelector('.input-row')).width;
  });
  console.log("input-row width at 900px:", width);
  
  const rootFontSize = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).fontSize;
  });
  console.log("html font-size at 900px:", rootFontSize);

  await browser.close();
})();
