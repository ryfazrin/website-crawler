const WebsiteCrawler = require('./crawler');
const config = require('./config');

async function main() {
  const crawler = new WebsiteCrawler(config);
  
  try {
    console.log('🚀 Memulai crawling website...');
    await crawler.start();
    console.log('✅ Crawling selesai!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();