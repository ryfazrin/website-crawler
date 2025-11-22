module.exports = {
  // URL target yang akan di-crawl
  // baseUrl: 'https://ryfazrin.wordpress.com/',
  
  // Direktori penyimpanan hasil download
  outputDir: './downloads',
  
  // Jenis asset yang akan didownload
  assetTypes: [
    'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', // Images
    'css', 'js', // Styles & Scripts
    'pdf', 'doc', 'docx', // Documents
    'mp4', 'webm', 'mp3', 'wav', // Media
    'woff2', 'woff', 'ttf', 'eot', // Fonts
  ],
  
  // Konfigurasi request
  requestConfig: {
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  },
  
  // Batasan crawling
  maxPages: 100,
  maxConcurrent: 5,
  delayBetweenRequests: 1000
};