# Acenteler İçin Cari Hesap Tutumu

Acentelerin müşteri kartlarını, bilet borçlarını, tahsilatlarını ve ödeme tarihlerini takip eden uygulamanın **tek dosyalık, çevrimdışı portföy demosu**.

**Kurulum, sunucu, veritabanı hesabı veya internet bağlantısı gerekmez.** Yalnızca hayalî örnek veriler içerir. Gerçek şirket kayıtları ve bağlantı bilgileri dahil değildir.

## Hemen deneyin

1. Bu projeyi **Code → Download ZIP** ile indirin ve ZIP'i açın.
2. `demo` klasöründeki **`index.html`** dosyasına çift tıklayın.
3. Chrome, Edge, Firefox veya Safari ile açın. Giriş yapmanız gerekmez.

[Demo dosyasını GitHub'da görüntüle](demo/index.html)

Dosyayı Mac veya Windows bilgisayarda açabilirsiniz. Tüm JavaScript, stiller ve simge HTML dosyasının içindedir; haricî dosya indirmez ve API'ye bağlanmaz. Ağ bağlantıları ayrıca dosyanın içerik güvenlik politikasıyla kapatılmıştır.

## Demoda neler yapılabilir?

- Müşteri kartı açma ve düzenleme.
- Bilet borcu ekleme, düzenleme, iptal ve ödeme tarihi belirleme.
- Bağımsız nakit, havale ve kart tahsilatı.
- Yüzde veya sabit tutarlı POS komisyonu ve net alacak hesabı.
- Borç/alacak düzeltmesi ve müşteriye iade kaydı.
- Gerekçeli hareket düzenleme ve değişiklik geçmişi.
- Bugün ödenecek ve gecikmiş biletler; kısmi ödemede kalan tutar.
- Cari ekstre, arama, tarih filtresi, CSV ve yazdırma.
- **Örnekleri sıfırla** ile hayalî başlangıç verilerine dönme.

Örnek kartta 10.000 TL bilet borcu ve %2 komisyonlu 3.000 TL kart tahsilatı vardır: net alacak 2.940 TL, kalan borç 7.060 TL. Ödeme tarihleri demo ilk açıldığı güne göre hazırlanır.

## Veriler nerede tutulur?

Değişiklikler, dosyayı açtığınız cihazdaki tarayıcının `localStorage` alanında tutulur. **HTML dosyasının içine yazılmaz.** Dosyayı başka birine gönderdiğinizde sizin yaptığınız değişiklikler gitmez; o kişi hayalî başlangıç örnekleriyle başlar.

Tarayıcı verilerini temizlemek, gizli pencereyi kapatmak veya dosyayı farklı konuma taşımak saklanan demoya erişimi etkileyebilir. Bazı dosya görüntüleyicileri kalıcı depolamayı engeller; bu durumda uygulama yalnızca sayfa açıkken değişiklikleri tutar ve bunu ekranda belirtir.

Bu sürüm tanıtım içindir. Gerçek müşteri verisi veya parola girmeyin. Ortak çalışan veritabanı, kullanıcı doğrulaması ve cihazlar arası senkronizasyon bu yerel demoda yoktur.

## Ekran görüntüleri

Hayalî müşteriler ve ödeme hatırlatmaları:

![Ana sayfa](docs/images/payment-reminders.png)

POS komisyonu ve cari ekstre:

![Cari ekstre](docs/images/customer-statement.png)

Bilet ödeme tarihi:

![Ödeme tarihi](docs/images/ticket-due-date.png)

## Kaynak kodu

Arayüz React ile hazırlanmıştır. Yerel demo adaptörü, cari hesap ve tarih kurallarını tarayıcı içinde çalıştırır. Bu depoda uygulamanın API ve veri modeli kaynakları da inceleme amacıyla bulunur; tek dosyalık demoyu açarken bunlar çalıştırılmaz.

```text
demo/index.html                  Kurulumsuz, çevrimdışı demo
frontend/src/localDemo.js         Yerel kayıt ve işlem adaptörü
frontend/src/demoRules.js         Tutar, bakiye, tarih ve hatırlatma kuralları
frontend/src/CustomerWorkspace.js Müşteri, bilet ve cari ekranları
scripts/build-standalone.js       Tek HTML dosyası oluşturma
routes/, models/, lib/           Sunuculu uygulamanın kaynakları
tests/, frontend/src/*.test.js    Hesaplama, API ve arayüz testleri
```

Geliştirici olarak demoyu yeniden üretmek için Node.js 22 veya üzeri ve npm gerekir; **hazır HTML'i açmak için gerekmez**:

```bash
npm ci
npm ci --prefix frontend
npm run demo:build
```

Çıktı: `demo/index.html`.

Testler:

```bash
npm test
CI=true npm test --prefix frontend -- --watchAll=false
```

API testleri haricî veritabanına bağlanmaz. Yerel demo testleri örnek bakiye hesabını, kayıtların korunmasını, mükerrer işlem önlemeyi ve düzeltme geçmişini kontrol eder. GitHub Actions testleri çalıştırır ve demo dosyasını yeniden derler.

## Kapsam

Proje cari takip ve portföy gösterimi içindir; resmî muhasebe, e-fatura, banka/POS işlemi veya gerçek para transferi gerçekleştirmez. Gerçek üretim sistemiyle bağlantısı yoktur. Arayüz araç zinciri React Scripts 5 kullanır; modernizasyonu ayrı bir geliştirme alanıdır.
