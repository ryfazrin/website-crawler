const AdvancedWebsiteCrawler = require('./advanced-crawler');
const config = require('../config');

async function main() {
  const crawler = new AdvancedWebsiteCrawler(config);
  
  try {
    console.log('🚀 Memulai advanced crawling website...');
    await crawler.start();
    console.log('✅ Advanced crawling selesai!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();