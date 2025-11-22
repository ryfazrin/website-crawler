const WebsiteCrawler = require('../crawler');

class AdvancedWebsiteCrawler extends WebsiteCrawler {
  constructor(config) {
    super(config);
    this.sitemap = new Map();
  }

  async processPage(url) {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Memproses: ${url}`);
      
      const response = await axios.get(url, this.config.requestConfig);
      const $ = cheerio.load(response.data);
      
      // Analisis halaman
      const pageInfo = this.analyzePage($, url);
      
      // Download assets
      await this.extractAndDownloadAssets($, url);
      
      // Simpan halaman dengan metadata
      await this.savePageWithMetadata(url, response.data, pageInfo);
      
      // Ekstrak links
      this.extractLinks($, url);
      
      // Update sitemap
      this.sitemap.set(url, {
        ...pageInfo,
        processingTime: Date.now() - startTime,
        status: 'success'
      });
      
    } catch (error) {
      console.error(`❌ Gagal memproses ${url}:`, error.message);
      this.sitemap.set(url, {
        status: 'error',
        error: error.message,
        processingTime: Date.now() - startTime
      });
    }
  }

  analyzePage($, url) {
    const title = $('title').text() || 'No Title';
    const description = $('meta[name="description"]').attr('content') || '';
    const keywords = $('meta[name="keywords"]').attr('content') || '';
    const images = $('img').length;
    const links = $('a').length;
    
    return {
      title,
      description,
      keywords,
      imageCount: images,
      linkCount: links,
      lastCrawled: new Date().toISOString()
    };
  }

  async savePageWithMetadata(url, content, metadata) {
    const filename = this.getPageFilename(url);
    const filePath = path.join(this.config.outputDir, 'pages', filename);
    
    const pageData = {
      metadata,
      url,
      content,
      crawledAt: new Date().toISOString()
    };
    
    await fs.writeJson(filePath, pageData, { spaces: 2 });
    console.log(`💾 Page dengan metadata disimpan: ${filename}`);
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      baseUrl: this.config.baseUrl,
      pagesProcessed: this.pagesProcessed,
      assetsDownloaded: this.assetsDownloaded.size,
      sitemap: Object.fromEntries(this.sitemap),
      statistics: {
        totalProcessingTime: Array.from(this.sitemap.values())
          .reduce((sum, page) => sum + (page.processingTime || 0), 0),
        successCount: Array.from(this.sitemap.values())
          .filter(page => page.status === 'success').length,
        errorCount: Array.from(this.sitemap.values())
          .filter(page => page.status === 'error').length
      }
    };

    const reportPath = path.join(this.config.outputDir, 'advanced-crawl-report.json');
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    console.log('📊 Laporan advanced crawling disimpan:', reportPath);
  }
}

module.exports = AdvancedWebsiteCrawler;