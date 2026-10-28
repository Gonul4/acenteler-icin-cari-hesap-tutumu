# Demo ve veri ayrımı

Bu depo portföy amaçlı kaynak kodu ve hayalî örnekler içerir. Üretim sisteminin Git geçmişi bu depoya aktarılmamıştır. Gerçek müşteri kayıtları, veritabanı yedekleri, şirket hesapları ve canlı bağlantı bilgileri içermez.

- `npm run demo:setup` yalnızca bu klasöre yerel ayarlar ve rastgele bir JWT anahtarı yazar. Var olan `.env` dosyalarının üzerine yazmaz.
- `npm run demo:seed` yalnızca `development` ortamındaki `mongodb://127.0.0.1:27018/apexcari_demo` adresini kabul eder. Uzak veritabanını ve dolu veritabanını reddeder; kayıt silmez.
- `.env` dosyaları, yedekler, dışa aktarımlar ve anahtar dosyaları Git dışında tutulur.
- Belgelerdeki demo parolası yalnızca yerel örnek hesaplara aittir. Herkese açık bir sunucuda bu hesapları kullanmayın.
- Parolalar Argon2id ile saklanır. Oturum 24 saatlik HttpOnly JWT çerezidir. Üretim ortamında Secure çerez kullanılır. Kullanıcı ve parola değişiklikleri önceki oturumları geçersiz kılar.
- Uygulama ve yerel demo kurulumu geliştirme/inceleme içindir. Docker MongoDB portu yalnızca `127.0.0.1` üzerinden açılır.

Hata bildirirken gerçek parola, erişim anahtarı veya müşteri kaydı paylaşmayın.
