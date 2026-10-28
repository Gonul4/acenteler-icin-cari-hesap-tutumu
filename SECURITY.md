# Yerel portföy demosu

`demo/index.html` haricî sunucuya, API'ye veya veritabanına bağlanmaz. HTML içindeki güvenlik politikası ağ isteklerini kapatır. Başlangıç kayıtları tamamen hayalîdir.

Demo kullanıcı doğrulaması yapmaz. Gerçek parola, müşteri veya şirket bilgisi girmeyin. Eklenen kayıtlar yalnızca mevcut cihazın tarayıcısında saklanır; dosyaya gömülmez ve başka kişilerle senkronize olmaz. Tarayıcı saklamayı engelliyorsa veriler yalnızca bellekte tutulur; ekranda uyarı gösterilir.

Şirket sürümünün Git geçmişi bu depoya taşınmamıştır. Gerçek müşteri kayıtları, yedekler, şirket hesapları ve bağlantı bilgileri yoktur. `.env` dosyaları, yedekler ve anahtar dosyaları Git dışında tutulur.

Kaynak kodundaki sunuculu uygulamayı incelemek isterseniz, `scripts/demo-setup.js` ve `scripts/seed-demo.js` yalnızca ayrı yerel örnek ortam içindir. Seed yükleyici uzak hedefi ve dolu veritabanını reddeder. Bu scriptler hazır HTML demosunun parçası olarak çalışmaz.

Hata bildirirken gerçek parola veya müşteri kaydı paylaşmayın.
