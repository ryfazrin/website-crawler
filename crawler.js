const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const { URL } = require('url');
const validUrl = require('valid-url');

class WebsiteCrawler {
  constructor(config) {
    this.config = config;
    this.visitedUrls = new Set();
    this.assetsDownloaded = new Set();
    this.pagesProcessed = 0;
    this.queue = [];
  }

  async start() {
    console.log(`📁 Membuat direktori output: ${this.config.outputDir}`);
    await fs.ensureDir(this.config.outputDir);
    await fs.ensureDir(path.join(this.config.outputDir, 'assets'));
    await fs.ensureDir(path.join(this.config.outputDir, 'pages'));

    // Mulai dari URL utama
    this.queue.push(this.config.baseUrl);
    
    await this.processQueue();
    
    // Generate report
    await this.generateReport();
  }

  async processQueue() {
    const promises = [];
    
    for (let i = 0; i < this.config.maxConcurrent && this.queue.length > 0; i++) {
      if (this.pagesProcessed >= this.config.maxPages) break;
      
      const url = this.queue.shift();
      if (!this.visitedUrls.has(url)) {
        promises.push(this.processPage(url));
        this.visitedUrls.add(url);
        this.pagesProcessed++;
      }
    }

    await Promise.all(promises);
    
    // Lanjutkan dengan halaman berikutnya jika masih ada
    if (this.queue.length > 0 && this.pagesProcessed < this.config.maxPages) {
      await this.delay(this.config.delayBetweenRequests);
      await this.processQueue();
    }
  }

  async processPage(url) {
    try {
      console.log(`🔍 Memproses: ${url}`);
      
      const response = await axios.get(url, this.config.requestConfig);
      const $ = cheerio.load(response.data);
      
      // Ekstrak dan download asset
      await this.extractAndDownloadAssets($, url);
      
      // Simpan halaman HTML
      await this.savePage(url, response.data);
      
      // Ekstrak link untuk di-crawl selanjutnya
      this.extractLinks($, url);
      
    } catch (error) {
      console.error(`❌ Gagal memproses ${url}:`, error.message);
    }
  }

  async extractAndDownloadAssets($, baseUrl) {
    const assetSelectors = {
      'img': 'src',
      'link[rel="stylesheet"]': 'href',
      'script': 'src',
      'source': 'src',
      'video': 'src',
      'audio': 'src',
      'a[href*="."]': 'href' // Untuk file download
    };

    const downloadPromises = [];
    for (const [selector, attr] of Object.entries(assetSelectors)) {
      $(selector).each((i, element) => {
        const assetUrl = $(element).attr(attr);
        if (assetUrl) {
          // collect promise and continue; we'll await them all to ensure downloads complete
          downloadPromises.push(this.downloadAsset(assetUrl, baseUrl));
        }
      });
    }

    // Wait for all asset download attempts to complete (successful or not)
    await Promise.all(downloadPromises);
  }

  async downloadAsset(assetUrl, baseUrl) {
    try {
      const absoluteUrl = this.resolveUrl(assetUrl, baseUrl);
      if (!absoluteUrl) return;

      // Validasi URL dan filter jenis file
      if (!this.isValidAssetUrl(absoluteUrl)) return;

      // Normalize URL for deduplication (strip search and hash)
      let normalizedUrl;
      try {
        const parsed = new URL(absoluteUrl);
        normalizedUrl = `${parsed.origin}${parsed.pathname}`;
      } catch (e) {
        normalizedUrl = absoluteUrl;
      }

      // Cek apakah sudah didownload (normalized)
      if (this.assetsDownloaded.has(normalizedUrl)) return;
      
      const response = await axios({
        method: 'GET',
        url: absoluteUrl,
        responseType: 'stream',
        ...this.config.requestConfig
      });

  // Build a file path that mirrors the original URL path under outputDir/assets
  const filePath = this.getAssetFilePath(absoluteUrl);

  // Buat direktori jika belum ada
  await fs.ensureDir(path.dirname(filePath));
      
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Record normalized URL so the same asset with different query strings isn't fetched repeatedly
  this.assetsDownloaded.add(normalizedUrl);
  const filename = path.basename(filePath);
  console.log(`✅ Asset downloaded: ${filename}`);
      
    } catch (error) {
      console.error(`❌ Gagal download asset ${assetUrl}:`, error.message);
    }
  }

  resolveUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).href;
    } catch (error) {
      return null;
    }
  }

  isValidAssetUrl(url) {
    if (!url) return false;

    // Ensure it's a valid URI
    if (!validUrl.isUri(url)) return false;

    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return false;
    }

    // Filter berdasarkan domain (only same host)
    if (parsed.hostname !== new URL(this.config.baseUrl).hostname) return false;

    // Ambil ekstensi dari pathname (tanpa query/hash)
    const extension = path.extname(parsed.pathname).toLowerCase().slice(1);
    if (!extension) return false;

    return this.config.assetTypes.includes(extension);
  }

  getAssetFilename(url) {
    const parsedUrl = new URL(url);
    let filename = path.basename(parsedUrl.pathname);
    
    // Jika tidak ada ekstensi, tambahkan berdasarkan content type
    if (!path.extname(filename)) {
      filename += '.bin';
    }
    
    // Handle nama file duplikat
    // const timestamp = Date.now();
    // return `${path.parse(filename).name}_${timestamp}${path.extname(filename)}`;
    return `${path.parse(filename).name}${path.extname(filename)}`;
  }

  // Kembalikan full file path under outputDir/assets that mirrors the URL pathname.
  getAssetFilePath(url) {
    const parsed = new URL(url);

    // Sanitize each segment of pathname to remove unsafe chars
    const segments = parsed.pathname.split('/').filter(Boolean).map(seg => seg.replace(/[^a-zA-Z0-9._-]/g, '_'));

    // If the path ends with a slash (directory), create an index file name
    let lastSegment = segments.length ? segments[segments.length - 1] : '';
    if (!lastSegment || !path.extname(lastSegment)) {
      // Use a default filename if none exists
      const fallbackName = 'index.bin';
      segments.push(fallbackName);
      lastSegment = fallbackName;
    }

    // Prevent collisions: if filename already has a timestamp (from previous logic), leave it; else add timestamp suffix
    const name = path.parse(lastSegment).name;
    const ext = path.extname(lastSegment) || '';
    // const timestamp = Date.now();
    // const finalName = `${name}_${timestamp}${ext}`;
    const finalName = `${name}${ext}`;

    // Replace last segment with finalName
    segments[segments.length - 1] = finalName;

    // Include origin host to avoid collisions across hosts
    const hostDir = parsed.hostname.replace(/[^a-zA-Z0-9._-]/g, '_');

    return path.join(this.config.outputDir, 'assets', hostDir, ...segments);
  }

  extractLinks($, baseUrl) {
    $('a[href]').each((i, element) => {
      const href = $(element).attr('href');
      if (href) {
        const absoluteUrl = this.resolveUrl(href, baseUrl);
        
        if (this.isValidLink(absoluteUrl) && 
            !this.visitedUrls.has(absoluteUrl) && 
            this.queue.length < this.config.maxPages) {
          this.queue.push(absoluteUrl);
        }
      }
    });
  }

  isValidLink(url) {
    if (!url || !validUrl.isUri(url)) return false;
    
    // Hanya crawl domain yang sama
    const targetHost = new URL(url).hostname;
    const baseHost = new URL(this.config.baseUrl).hostname;
    
    return targetHost === baseHost;
  }

  async savePage(url, content) {
    try {
      const filename = this.getPageFilename(url);
      const filePath = path.join(this.config.outputDir, 'pages', filename);
      
      await fs.writeFile(filePath, content);
      console.log(`💾 Page saved: ${filename}`);
    } catch (error) {
      console.error(`❌ Gagal menyimpan halaman:`, error.message);
    }
  }

  getPageFilename(url) {
    const parsedUrl = new URL(url);
    let filename = parsedUrl.pathname === '/' ? 'index' : parsedUrl.pathname.slice(1);
    filename = filename.replace(/\//g, '_').replace(/[^a-zA-Z0-9_\-.]/g, '');
    
    if (!filename) filename = 'index';
    if (!filename.endsWith('.html')) filename += '.html';
    
    return filename;
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      baseUrl: this.config.baseUrl,
      pagesProcessed: this.pagesProcessed,
      assetsDownloaded: this.assetsDownloaded.size,
      visitedUrls: Array.from(this.visitedUrls),
      downloadedAssets: Array.from(this.assetsDownloaded)
    };

    const reportPath = path.join(this.config.outputDir, 'crawl-report.json');
    await fs.writeJson(reportPath, report, { spaces: 2 });
    
    console.log('📊 Laporan crawling disimpan:', reportPath);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WebsiteCrawler;