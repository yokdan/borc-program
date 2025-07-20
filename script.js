// script.js (Firebase Auth Entegrasyonu ve Bildirim Fonksiyonları Eklenmiş Sürüm)

// =================================
// GLOBAL DEĞİŞKENLER
// =================================
let butceGrafigi;
let borclar = [];
let hedefler = [];
let gelirler = [];

const defaultKategoriler = ['Kredi Kartı', 'Tüketici Kredisi', 'Vergi Borcu', 'Şahıslar', 'Diğer'];
const ODEME_ARTIS_MIKTARI = 50;


// =================================
// YARDIMCI FONKSİYONLAR
// =================================
function formatCurrency(n) { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(isNaN(n) || n === null ? 0 : n); }
function formatDate(d) {
    if (!d) return 'Tarih Yok';
    const dateObj = d.toDate ? d.toDate() : new Date(d);
    return dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// VAPID anahtarını doğru formata çevirmek için yardımcı fonksiyon
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}


// =================================
// SAYFA YÖNETİMİ
// =================================
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadKategoriler();
    document.getElementById('AnaSayfa').style.display = 'block';
    document.querySelector('.tab-button').classList.add('active');
});

function openTab(event, tabName) {
    let i, t, l;
    t = document.getElementsByClassName("tab-content");
    for (i = 0; i < t.length; i++) { t[i].style.display = "none"; }
    l = document.getElementsByClassName("tab-button");
    for (i = 0; i < l.length; i++) { l[i].className = l[i].className.replace(" active", ""); }
    document.getElementById(tabName).style.display = "block";
    event.currentTarget.className += " active";
}

// =================================
// KULLANICI GİRİŞ/ÇIKIŞ FONKSİYONLARI
// =================================
function signInWithGoogle() {
    auth.signInWithPopup(googleProvider)
        .catch(error => {
            console.error("Google ile giriş hatası:", error);
            alert("Giriş sırasında bir hata oluştu: " + error.message);
        });
}

function signOutUser() {
    auth.signOut()
        .catch(error => {
            console.error("Çıkış yaparken hata oluştu:", error);
        });
}


// =================================
// VERİ YÜKLEME (FIRESTORE)
// =================================
function loadAllData() {
    if (!currentUser) {
        console.log("Kullanıcı oturumu bekleniyor veya kapalı. Veri yüklenmiyor.");
        return;
    }
    console.log(`'${currentUser.uid}' ID'li kullanıcı için veriler yükleniyor...`);

    db.collection('gelirler').where('userId', '==', currentUser.uid).onSnapshot(snapshot => {
        gelirler = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderGelirler(gelirler);
        recalculateTotalsAndRender();
    }, err => console.error("Gelir dinleyicisi hatası:", err));

    db.collection('borclar').where('userId', '==', currentUser.uid).onSnapshot(snapshot => {
        borclar = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        recalculateTotalsAndRender();
    }, err => console.error("Borç dinleyicisi hatası:", err));

    db.collection('hedefler').where('userId', '==', currentUser.uid).onSnapshot(snapshot => {
        hedefler = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        recalculateTotalsAndRender();
    }, err => console.error("Hedef dinleyicisi hatası:", err));
}

// =================================
// BİLDİRİM YÖNETİMİ FONKSİYONLARI
// =================================
async function subscribeToNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Üzgünüz, bu tarayıcı anlık bildirimleri desteklemiyor.');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Bildirim izni alındı.');
            await saveSubscription();
        } else {
            alert('Bildirim iznini reddettiniz. Hatırlatmaları alamazsınız.');
        }
    } catch (error) {
        console.error('Bildirim izni istenirken hata:', error);
    }
}

async function saveSubscription() {
    if (!currentUser) return;
    
    // DİKKAT: BU ANAHTARI KENDİ FIREBASE PROJENİZDEN ALIP BURAYA YAPIŞTIRMALISINIZ!
    const VAPID_PUBLIC_KEY = 'BNOPkV07ymwVZ9X4nzIIj9ak2L2G_55tuandprswRQQ4PbvcWX3Q23Bpq_Heq01ZpMCCRE5aksVhtD5OXABembo';

    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.includes('SENIN_')) {
        alert('HATA: VAPID Public Key script.js dosyasında ayarlanmamış!');
        console.error('VAPID Public Key script.js dosyasında ayarlanmamış!');
        return;
    }

    try {
        const swRegistration = await navigator.serviceWorker.ready;
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        console.log('Cihaz aboneliği oluşturuldu:', subscription);
        const subscriptionsRef = db.collection('subscriptions').doc(currentUser.uid);
        
        const doc = await subscriptionsRef.get();
        const existingSubscriptions = doc.exists ? doc.data().subscriptions : [];
        const isAlreadySubscribed = existingSubscriptions.some(sub => sub.endpoint === subscription.toJSON().endpoint);
        
        if (!isAlreadySubscribed) {
            await subscriptionsRef.set({ 
                subscriptions: firebase.firestore.FieldValue.arrayUnion(subscription.toJSON()) 
            }, { merge: true });
            console.log('Abonelik başarıyla Firestore\'a kaydedildi.');
            alert('Bildirimler başarıyla aktive edildi!');
        } else {
            console.log('Bu cihaz zaten abonelik listesinde.');
            alert('Bildirimler bu cihaz için zaten aktif!');
        }

    } catch (error) {
        console.error('Abonelik oluşturulurken veya kaydedilirken hata oluştu:', error);
        alert('Bildirimler aktive edilirken bir sorun oluştu.');
    }
}

// ======================================================================
// === Buradan sonraki fonksiyonlar uygulamanızın orijinal mantığıdır ===
// ======================================================================

function recalculateTotalsAndRender() {
    const ayarlar = JSON.parse(localStorage.getItem('butceAyarlari')) || { birikim: 20, borc: 20 };
    const toplamGelir = gelirler.reduce((sum, g) => sum + g.tutar, 0);
    const aylikToplamBorcFonu = toplamGelir * (ayarlar.borc / 100);
    const aylikToplamBirikimFonu = toplamGelir * (ayarlar.birikim / 100);
    const guncelBorclar = calculateSuggestedDebtPayments([...borclar], aylikToplamBorcFonu);
    const guncelHedefler = calculateSuggestedSavings([...hedefler], aylikToplamBirikimFonu);
    updateAnaSayfaOzet(toplamGelir, aylikToplamBirikimFonu, aylikToplamBorcFonu, guncelBorclar, guncelHedefler);
    renderBorclar(guncelBorclar);
    renderHedefler(guncelHedefler);
}

function updateAnaSayfaOzet(toplamGelir, birikimFonu, borcFonu, borclarData, hedeflerData) {
    const ayarlar = JSON.parse(localStorage.getItem('butceAyarlari')) || { birikim: 20, borc: 20 };
    const toplamBorcOdeme = borclarData.reduce((sum, b) => sum + (b.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0), 0);
    const kullanilabilirBorcFonu = borcFonu - toplamBorcOdeme;
    document.getElementById('kullanilabilirFonGostergesi').innerHTML = `Kullanılabilir Fon: <strong>${formatCurrency(kullanilabilirBorcFonu)}</strong>`;
    const toplamHedefTutari = hedeflerData.reduce((sum, h) => sum + h.hedefTutar, 0);
    const toplamBirikim = hedeflerData.reduce((sum, h) => sum + (h.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0), 0);
    const kullanilabilirBirikimFonu = birikimFonu - toplamBirikim;
    document.getElementById('toplamHedefGostergesi').innerHTML = `Toplam Hedef: <strong>${formatCurrency(toplamHedefTutari)}</strong>`;
    document.getElementById('kullanilabilirBirikimFonuGostergesi').innerHTML = `Kullanılabilir Fon: <strong>${formatCurrency(kullanilabilirBirikimFonu)}</strong>`;
    const kalanHarcama = toplamGelir - borcFonu - birikimFonu;
    document.getElementById('toplamGelirOzet').innerHTML = `Aylık Toplam Gelir: <strong>${formatCurrency(toplamGelir)}</strong>`;
    document.getElementById('borcSonuc').innerHTML = `Ayrılan Borç Fonu (%${(ayarlar.borc || 20)}): <strong>${formatCurrency(borcFonu)}</strong>`;
    document.getElementById('birikimSonuc').innerHTML = `Ayrılan Birikim Fonu (%${(ayarlar.birikim || 20)}): <strong>${formatCurrency(birikimFonu)}</strong>`;
    document.getElementById('harcamaSonuc').innerHTML = `Kalan Harcama Bütçesi: <strong>${formatCurrency(kalanHarcama)}</strong>`;
    cizGrafigi(toplamBirikim, toplamBorcOdeme, toplamGelir - toplamBirikim - toplamBorcOdeme);
}

function cizGrafigi(birikim, borc, harcama) { if(document.getElementById('butceGrafigi')) { const ctx = document.getElementById('butceGrafigi').getContext('2d'); if (butceGrafigi) { butceGrafigi.destroy(); } butceGrafigi = new Chart(ctx, { type: 'pie', data: { labels: ['Yapılan Birikim', 'Yapılan Borç Ödemeleri', 'Kalan Bütçe'], datasets: [{ data: [birikim, borc, Math.max(0, harcama)], backgroundColor: ['#28a745', '#dc3545', '#007bff'], borderColor: ['#fff'], borderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { position: 'top' } } } }); } }

function gelirEkleDuzenle() {
    if (!currentUser) return alert("Lütfen önce giriş yapın.");
    const aciklama = document.getElementById('gelirAciklama').value.trim();
    const tutar = parseFloat(document.getElementById('gelirTutar').value);
    if (!aciklama || isNaN(tutar) || tutar <= 0) return alert("Geçerli bir açıklama ve tutar girin.");
    db.collection('gelirler').add({ userId: currentUser.uid, aciklama, tutar, tarih: new Date() })
      .then(() => {
          document.getElementById('gelirAciklama').value = '';
          document.getElementById('gelirTutar').value = '';
      }).catch(err => console.error("Gelir ekleme hatası: ", err));
}

function gelirSil(id) { if (!confirm("Bu geliri silmek istediğinizden emin misiniz?")) return; db.collection('gelirler').doc(id).delete(); }

function renderGelirler(gelirlerData) {
    const tabloBody = document.querySelector("#gelirlerTablosu tbody");
    tabloBody.innerHTML = '';
    gelirlerData.sort((a,b) => b.tarih.toDate() - a.tarih.toDate()).forEach(g => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${g.aciklama}</td><td>${formatCurrency(g.tutar)}</td><td><button class="delete-btn" onclick="gelirSil('${g.id}')">Sil</button></td>`;
        tabloBody.appendChild(tr);
    });
}

function borcEkleDuzenle() {
    if (!currentUser) return alert("Lütfen önce giriş yapın.");
    const kategori = document.getElementById('borcKategoriInput').value.trim();
    const toplamTutar = parseFloat(document.getElementById('borcTutar').value);
    const taksitSayisi = parseInt(document.getElementById('taksitSayisi').value);
    const sonTarih = document.getElementById('borcSonTarih').value;
    if (!kategori || isNaN(toplamTutar) || toplamTutar <= 0 || isNaN(taksitSayisi) || taksitSayisi < 1) return alert("Lütfen tüm alanları doğru doldurun.");
    const yeniBorc = { userId: currentUser.uid, kategori, toplamTutar, kalanTutar: toplamTutar, taksitSayisi, aylikTaksitTutari: toplamTutar / taksitSayisi, odenenTaksit: 0, sonTarih: new Date(sonTarih), buAyYapilanOdemeler: [] };
    db.collection('borclar').add(yeniBorc).then(() => {
        document.getElementById('borcKategoriInput').value = ''; document.getElementById('borcTutar').value = ''; document.getElementById('taksitSayisi').value = '1'; document.getElementById('borcSonTarih').value = '';
    }).catch(error => console.error("Borç eklenirken hata: ", error));
}

function odemeEkle(borcId) {
    const input = document.getElementById(`odeme-input-${borcId}`);
    let odemeMiktari = parseFloat(input.value);
    if (isNaN(odemeMiktari) || odemeMiktari <= 0) return alert("Lütfen geçerli bir ödeme tutarı girin.");
    const borcRef = db.collection('borclar').doc(borcId);
    db.runTransaction(t => t.get(borcRef).then(doc => {
        if (!doc.exists) throw "Borç bulunamadı!";
        const borc = doc.data();
        const gercekOdeme = Math.min(odemeMiktari, borc.kalanTutar);
        const yeniKalan = borc.kalanTutar - gercekOdeme;
        const yeniOdenenTaksit = borc.odenenTaksit + (gercekOdeme / borc.aylikTaksitTutari);
        const yeniOdemeler = [...(borc.buAyYapilanOdemeler || []), { id: Date.now(), tutar: gercekOdeme, tarih: new Date(), type: 'manual' }];
        t.update(borcRef, { kalanTutar: yeniKalan, odenenTaksit: yeniOdenenTaksit, buAyYapilanOdemeler: yeniOdemeler });
    }));
}

function borcSil(id) { if (!confirm("Bu borcu kalıcı olarak silmek istediğinizden emin misiniz?")) return; db.collection('borclar').doc(id).delete(); }

function odemeSil(borcId, odemeId) {
    const borcRef = db.collection('borclar').doc(borcId);
    db.runTransaction(t => t.get(borcRef).then(doc => {
        if (!doc.exists) throw "Borç bulunamadı!";
        const borc = doc.data();
        const odeme = (borc.buAyYapilanOdemeler || []).find(p => p.id === odemeId);
        if (!odeme) return;
        const yeniKalan = borc.kalanTutar + odeme.tutar;
        const yeniOdenenTaksit = borc.odenenTaksit - (odeme.tutar / borc.aylikTaksitTutari);
        const yeniOdemeler = borc.buAyYapilanOdemeler.filter(p => p.id !== odemeId);
        t.update(borcRef, { kalanTutar: yeniKalan, odenenTaksit: yeniOdenenTaksit, buAyYapilanOdemeler: yeniOdemeler });
    }));
}

function renderBorclar(borclarData) {
    const borclarListesi = document.getElementById('borclarListesi');
    const toplamKalanBorc = borclarData.reduce((sum, b) => sum + b.kalanTutar, 0);
    document.getElementById('toplamBorcGostergesi').innerHTML = `Toplam Borç: <strong>${formatCurrency(toplamKalanBorc)}</strong>`;
    borclarListesi.innerHTML = '';
    const aktifBorclar = borclarData.filter(b => b.kalanTutar > 0.01);
    const odenmisBorclar = borclarData.filter(b => b.kalanTutar <= 0.01);
    aktifBorclar.sort((a, b) => getDebtUrgencyStatus(a).score - getDebtUrgencyStatus(b).score || a.sonTarih.toDate() - b.sonTarih.toDate())
        .forEach(b => borclarListesi.insertAdjacentHTML('beforeend', createBorcKartiHTML(b)));
    if (odenmisBorclar.length > 0) {
        borclarListesi.insertAdjacentHTML('beforeend', `<hr class="ince-cizgi" style="grid-column: 1 / -1;"><h3 style="grid-column: 1 / -1; text-align: center;">Ödenmiş Borçlar</h3>`);
        odenmisBorclar.forEach(b => borclarListesi.insertAdjacentHTML('beforeend', createBorcKartiHTML(b)));
    }
}

function createBorcKartiHTML(b) {
    const buAyOdenenToplam = (b.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0);
    let urgency = getDebtUrgencyStatus(b); let durumClass = urgency.class; let durumText = urgency.text;
    if (b.kalanTutar > 0.01) { 
        if (buAyOdenenToplam >= b.aylikTaksitTutari - 0.01) { durumClass = "status-ay-odendi"; durumText = `✓ Bu Ay Ödendi`; } 
        else if (buAyOdenenToplam > 0) { durumClass = "status-eksik-odendi"; durumText = `Eksik: ${formatCurrency(b.aylikTaksitTutari - buAyOdenenToplam)}`; } 
        else if (!urgency.text) { durumClass = "status-beklemede"; durumText = "Beklemede"; }
    }
    const yapilanOdemelerHTML = (b.buAyYapilanOdemeler || []).sort((a,b) => b.tarih.toDate() - a.tarih.toDate()).map(p => `<li>${formatCurrency(p.tutar)} <span class="odeme-tarihi">(${formatDate(p.tarih)})</span><button class="delete-btn" onclick="odemeSil('${b.id}', ${p.id})">x</button></li>`).join('');
    const onerilenTutarStr = b.onerilenOdeme > 0 ? b.onerilenOdeme.toFixed(2) : '';
    return `<div class="borc-kart"><div class="borc-kart-header"><h3>${b.kategori}</h3><span class="status ${durumClass}">${durumText}</span></div><div class="borc-kart-govde"><div><span>Kalan Tutar:</span> <strong>${formatCurrency(b.kalanTutar)}</strong></div><div><span>Aylık Taksit:</span> ${formatCurrency(b.aylikTaksitTutari)}</div><div><span>Taksit Durumu:</span> ${Math.round(b.odenenTaksit * 10) / 10} / ${b.taksitSayisi}</div><div><span>Son Ödeme:</span> ${formatDate(b.sonTarih)}</div></div>${b.kalanTutar < 0.01 ? `<div class="gecmis-olsun">🎉 Geçmiş Olsun! 🎉</div>` : `<div class="odeme-ekle-alani"><div class="odeme-stepper"><button class="stepper-btn" onclick="ayarlaOdeme('${b.id}', -${ODEME_ARTIS_MIKTARI})">-</button><input type="number" id="odeme-input-${b.id}" value="${onerilenTutarStr}" placeholder="0.00"><button class="stepper-btn" onclick="ayarlaOdeme('${b.id}', ${ODEME_ARTIS_MIKTARI})">+</button></div><button class="onayla-btn" onclick="odemeEkle('${b.id}')">Ekle</button></div><div class="yapilan-odemeler"><ul class="yapilan-odemeler-liste">${yapilanOdemelerHTML}</ul></div><div class="borc-kart-aksiyonlar"><button class="delete-btn" onclick="borcSil('${b.id}')">Sil</button></div>`}</div>`;
}

function hedefEkle() {
    if (!currentUser) return alert("Lütfen önce giriş yapın.");
    const ad = document.getElementById('hedefAdi').value.trim();
    const hedefTutar = parseFloat(document.getElementById('hedefTutar').value);
    if (!ad || isNaN(hedefTutar) || hedefTutar <= 0) return alert("Geçerli hedef adı ve tutarı girin.");
    db.collection('hedefler').add({ userId: currentUser.uid, ad, hedefTutar, biriken: 0, buAyYapilanOdemeler: [] })
      .then(() => {
          document.getElementById('hedefAdi').value = ''; document.getElementById('hedefTutar').value = '';
      }).catch(err => console.error("Hedef ekleme hatası: ", err));
}

function birikimEkle(hedefId) {
    const input = document.getElementById(`birikim-input-${hedefId}`);
    const tutar = parseFloat(input.value);
    if (isNaN(tutar) || tutar <= 0) return alert("Geçerli bir sayı girin.");
    const hedefRef = db.collection('hedefler').doc(hedefId);
    db.runTransaction(t => t.get(hedefRef).then(doc => {
        if (!doc.exists) throw "Hedef bulunamadı!";
        const hedef = doc.data();
        const eklenecekTutar = Math.min(tutar, hedef.hedefTutar - hedef.biriken);
        const yeniBiriken = hedef.biriken + eklenecekTutar;
        const yeniOdemeler = [...(hedef.buAyYapilanOdemeler || []), { id: Date.now(), tutar: eklenecekTutar, tarih: new Date(), type: 'manual' }];
        t.update(hedefRef, { biriken: yeniBiriken, buAyYapilanOdemeler: yeniOdemeler });
    }));
}

function hedefSil(id) { if (!confirm("Bu hedefi silmek istediğinizden emin misiniz?")) return; db.collection('hedefler').doc(id).delete(); }

function birikimOdemeSil(hedefId, odemeId) {
    const hedefRef = db.collection('hedefler').doc(hedefId);
    db.runTransaction(t => t.get(hedefRef).then(doc => {
        if (!doc.exists) throw "Hedef bulunamadı!";
        const hedef = doc.data();
        const odeme = (hedef.buAyYapilanOdemeler || []).find(p => p.id === odemeId);
        if (!odeme) return;
        const yeniBiriken = hedef.biriken - odeme.tutar;
        const yeniOdemeler = hedef.buAyYapilanOdemeler.filter(p => p.id !== odemeId);
        t.update(hedefRef, { biriken: yeniBiriken, buAyYapilanOdemeler: yeniOdemeler });
    }));
}

function renderHedefler(hedeflerData) {
    const liste = document.getElementById('hedeflerListesi');
    liste.innerHTML = '';
    hedeflerData.sort((a, b) => (a.hedefTutar - a.biriken) - (b.hedefTutar - b.biriken))
        .forEach(h => liste.insertAdjacentHTML('beforeend', createHedefKartiHTML(h)));
}

function createHedefKartiHTML(hedef) {
    const yuzde = hedef.hedefTutar > 0 ? (hedef.biriken / hedef.hedefTutar) * 100 : 0;
    const yapilanOdemelerHTML = (hedef.buAyYapilanOdemeler || []).sort((a,b) => b.tarih.toDate() - a.tarih.toDate()).map(p => `<li>${formatCurrency(p.tutar)} <span class="odeme-tarihi">(${formatDate(p.tarih)})</span><button class="delete-btn" onclick="birikimOdemeSil('${hedef.id}', ${p.id})">x</button></li>`).join('');
    const onerilenBirikimStr = hedef.onerilenBirikim > 0 ? hedef.onerilenBirikim.toFixed(2) : '';
    return `<div class="hedef-kart"><h3>${hedef.ad}</h3><p><strong>${formatCurrency(hedef.biriken)}</strong> / ${formatCurrency(hedef.hedefTutar)}</p><div class="progress-bar"><div class="progress-bar-inner" style="width: ${Math.min(yuzde, 100)}%;">${yuzde.toFixed(1)}%</div></div>${hedef.biriken >= hedef.hedefTutar ? `<div class="gecmis-olsun">🎉 Hedefe Ulaşıldı! 🎉</div>` : `<div class="odeme-ekle-alani"><div class="odeme-stepper"><button class="stepper-btn" onclick="ayarlaBirikim('${hedef.id}', -${ODEME_ARTIS_MIKTARI})">-</button><input type="number" id="birikim-input-${hedef.id}" value="${onerilenBirikimStr}" placeholder="0.00"><button class="stepper-btn" onclick="ayarlaBirikim('${hedef.id}', ${ODEME_ARTIS_MIKTARI})">+</button></div><button class="onayla-btn" onclick="birikimEkle('${hedef.id}')">Ekle</button></div><div class="yapilan-odemeler" style="margin-top:10px;"><ul class="yapilan-odemeler-liste">${yapilanOdemelerHTML}</ul></div><div class="hedef-butonlar"><button class="delete-btn" onclick="hedefSil('${hedef.id}')">Sil</button></div>`}</div>`;
}

function calculateSuggestedDebtPayments(borclarData, aylikBorcFonu) {
    borclarData.forEach(b => b.onerilenOdeme = 0);
    const toplamManuelOdeme = borclarData.reduce((sum, b) => sum + (b.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0), 0);
    let kalanDagitilacakFon = aylikBorcFonu - toplamManuelOdeme;
    if (kalanDagitilacakFon <= 0) return borclarData;
    const aktifBorclar = borclarData.filter(b => b.kalanTutar > 0.01).sort((a, b) => a.kalanTutar - b.kalanTutar);
    for (const borc of aktifBorclar) { if (kalanDagitilacakFon <= 0) break; const buAyOdenen = (borc.buAyYapilanOdemeler || []).reduce((sum, p) => sum + p.tutar, 0); const taksitOdemeHedefi = borc.aylikTaksitTutari - buAyOdenen; if (taksitOdemeHedefi > 0) { const odenecekTutar = Math.min(borc.kalanTutar, kalanDagitilacakFon, taksitOdemeHedefi); if (odenecekTutar > 0) { borc.onerilenOdeme += odenecekTutar; kalanDagitilacakFon -= odenecekTutar; } } }
    if (kalanDagitilacakFon > 0) { for (const borc of aktifBorclar) { if (kalanDagitilacakFon <= 0) break; const odenecekEkTutar = Math.min(borc.kalanTutar - (borc.onerilenOdeme || 0) - (borc.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0), kalanDagitilacakFon); if (odenecekEkTutar > 0) { borc.onerilenOdeme += odenecekEkTutar; kalanDagitilacakFon -= odenecekEkTutar; } } }
    return borclarData;
}

function calculateSuggestedSavings(hedeflerData, aylikBirikimFonu) {
    hedeflerData.forEach(h => h.onerilenBirikim = 0);
    const toplamManuelOdeme = hedeflerData.reduce((sum, h) => sum + (h.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0), 0);
    let kalanDagitilacakFon = aylikBirikimFonu - toplamManuelOdeme;
    if (kalanDagitilacakFon <= 0) return hedeflerData;
    const aktifHedefler = hedeflerData.filter(h => h.biriken < h.hedefTutar);
    const toplamKalanHedef = aktifHedefler.reduce((sum, h) => sum + (h.hedefTutar - h.biriken), 0);
    if (toplamKalanHedef > 0) { for (const hedef of aktifHedefler) { const hedefeKalan = hedef.hedefTutar - hedef.biriken; const oran = hedefeKalan / toplamKalanHedef; const odenecekTutar = Math.min(hedefeKalan, kalanDagitilacakFon * oran); if (odenecekTutar > 0) { hedef.onerilenBirikim += odenecekTutar; } } }
    return hedeflerData;
}

function getDebtUrgencyStatus(borc) { if (borc.kalanTutar < 0.01) return { score: 5, text: "Ödendi", class: "status-odendi" }; if (!borc.sonTarih || !borc.sonTarih.toDate) return { score: 4, text: "", class: "" }; const today = new Date(); today.setHours(0, 0, 0, 0); const dueDate = borc.sonTarih.toDate(); dueDate.setHours(0, 0, 0, 0); const timeDiff = dueDate.getTime() - today.getTime(); const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)); if (dayDiff < 0) return { score: 1, text: `🔴 ÖDEME ${-dayDiff} GÜN GEÇTİ!`, class: "status-acil" }; if (dayDiff === 0) return { score: 1, text: "🔴 BUGÜN SON GÜN!", class: "status-acil" }; if (dayDiff <= 3) return { score: 2, text: `⚠️ SON ${dayDiff} GÜN!`, class: "status-uyari" }; return { score: 3, text: "", class: "" }; }

function ayarlaOdeme(borcId, miktar) { const input = document.getElementById(`odeme-input-${borcId}`); let mevcut = parseFloat(input.value) || 0; let yeni = mevcut + miktar; if (yeni < 0) yeni = 0; input.value = yeni.toFixed(2); }

function ayarlaBirikim(hedefId, miktar) { const input = document.getElementById(`birikim-input-${hedefId}`); let mevcut = parseFloat(input.value) || 0; let yeni = mevcut + miktar; if (yeni < 0) yeni = 0; input.value = yeni.toFixed(2); }

function loadSettings() { const a = JSON.parse(localStorage.getItem('butceAyarlari')) || { birikim: 20, borc: 20 }; document.getElementById('birikimOrani').value = a.birikim; document.getElementById('borcOrani').value = a.borc; updateLabel('birikimOrani', 'birikimOraniLabel'); updateLabel('borcOrani', 'borcOraniLabel'); }

function updateLabel(id, label) { document.getElementById(label).textContent = document.getElementById(id).value; }

function ayarlariKaydet() { const ayarlar = { birikim: document.getElementById('birikimOrani').value, borc: document.getElementById('borcOrani').value }; localStorage.setItem('butceAyarlari', JSON.stringify(ayarlar)); alert("Ayarlar Kaydedildi!"); recalculateTotalsAndRender(); }

function loadKategoriler() { const datalist = document.getElementById('kategoriListesi'); datalist.innerHTML = ''; defaultKategoriler.forEach(k => { const option = document.createElement('option'); option.value = k; datalist.appendChild(option); }); }