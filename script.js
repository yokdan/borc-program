// script.js (Firebase ile Çalışan ve Hataları Düzeltilmiş Son Sürüm)

// =================================
// GLOBAL DEĞİŞKENLER
// =================================
let butceGrafigi;
let borclar = []; // Veriler artık Firestore'dan bu diziye yüklenecek
let hedefler = [];// Veriler artık Firestore'dan bu diziye yüklenecek
let gelirler = [];// Veriler artık Firestore'dan bu diziye yüklenecek

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

// =================================
// SAYFA YÖNETİMİ
// =================================
document.addEventListener('DOMContentLoaded', () => {
    // Firebase başlatıldığında ve kullanıcı geldiğinde loadAllData otomatik olarak tetiklenecek.
    loadSettings();
    loadKategoriler();
});
function openTab(event, tabName) { let i, t, l; t = document.getElementsByClassName("tab-content"); for (i = 0; i < t.length; i++) { t[i].style.display = "none"; } l = document.getElementsByClassName("tab-button"); for (i = 0; i < l.length; i++) { l[i].className = l[i].className.replace(" active", ""); } document.getElementById(tabName).style.display = "block"; event.currentTarget.className += " active"; }

// =================================
// VERİ YÜKLEME (FIRESTORE)
// =================================
function loadAllData() {
    if (!currentUser) {
        console.log("Kullanıcı oturumu bekleniyor...");
        return;
    }

    // Gerçek zamanlı dinleyiciler: Veritabanında bir şey değiştiğinde ekran anında güncellenir.
    db.collection('gelirler').where('userId', '==', currentUser.uid).onSnapshot(snapshot => {
        gelirler = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderGelirler(gelirler);
        recalculateTotalsAndRender();
    });

    db.collection('borclar').where('userId', '==', currentUser.uid).onSnapshot(snapshot => {
        borclar = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        recalculateTotalsAndRender();
    });

    db.collection('hedefler').where('userId', '==', currentUser.uid).onSnapshot(snapshot => {
        hedefler = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        recalculateTotalsAndRender();
    });
}

// =================================
// YENİDEN HESAPLAMA VE GÖRSELLEŞTİRME
// =================================
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
    // HATA DÜZELTME: 'ayarlar' değişkeni burada da tanımlanmalıydı.
    const ayarlar = JSON.parse(localStorage.getItem('butceAyarlari')) || { birikim: 20, borc: 20 };

    const toplamBorcOdeme = borclarData.reduce((sum, b) => sum + (b.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0), 0);
    const kullanilabilirBorcFonu = borcFonu - toplamBorcOdeme;
    document.getElementById('kullanilabilirFonGostergesi').innerHTML = `Kullanılabilir Fon: <strong>${formatCurrency(kullanilabilirBorcFonu)}</strong>`;

    const toplamHedefTutari = hedeflerData.reduce((sum, h) => sum + h.hedefTutar, 0);
    const toplamBirikim = hedeflerData.reduce((sum, h) => sum + (h.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0), 0);
    const kullanilabilirBirikimFonu = birikimFonu - toplamBirikim;
    document.getElementById('toplamHedefGostergesi').innerHTML = `Toplam Hedef: <strong>${formatCurrency(toplamHedefTutari)}</strong>`;
    document.getElementById('kullanilabilirBirikimFonuGostergesi').innerHTML = `Kullanılabilir Fon: <strong>${formatCurrency(kullanilabilirBirikimFonu)}</strong>`;

    const kalanHarcama = toplamGelir - toplamBorcOdeme - toplamBirikim;
    document.getElementById('toplamGelirOzet').innerHTML = `Aylık Toplam Gelir: <strong>${formatCurrency(toplamGelir)}</strong>`;
    document.getElementById('borcSonuc').innerHTML = `Ayrılan Borç Fonu (%${(ayarlar.borc || 20)}): <strong>${formatCurrency(borcFonu)}</strong>`;
    document.getElementById('birikimSonuc').innerHTML = `Ayrılan Birikim Fonu (%${(ayarlar.birikim || 20)}): <strong>${formatCurrency(birikimFonu)}</strong>`;
    document.getElementById('harcamaSonuc').innerHTML = `Kalan Harcama Bütçesi: <strong>${formatCurrency(kalanHarcama)}</strong>`;
    cizGrafigi(toplamBirikim, toplamBorcOdeme, kalanHarcama > 0 ? kalanHarcama : 0);
}

function cizGrafigi(birikim, borc, harcama) { if(document.getElementById('butceGrafigi')) { const ctx = document.getElementById('butceGrafigi').getContext('2d'); if (butceGrafigi) { butceGrafigi.destroy(); } butceGrafigi = new Chart(ctx, { type: 'pie', data: { labels: ['Yapılan Birikim', 'Yapılan Borç Ödemeleri', 'Kalan Bütçe'], datasets: [{ data: [birikim, borc, harcama], backgroundColor: ['#28a745', '#dc3545', '#007bff'], borderColor: ['#fff'], borderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { position: 'top' } } } }); } }

// =================================
// GELİR YÖNETİMİ (FIRESTORE)
// =================================
function gelirEkleDuzenle() {
    const aciklama = document.getElementById('gelirAciklama').value.trim();
    const tutar = parseFloat(document.getElementById('gelirTutar').value);
    if (!aciklama || isNaN(tutar) || tutar <= 0) return alert("Geçerli bir açıklama ve tutar girin.");

    db.collection('gelirler').add({ userId: currentUser.uid, aciklama, tutar, tarih: new Date() })
      .then(() => {
          document.getElementById('gelirAciklama').value = '';
          document.getElementById('gelirTutar').value = '';
      }).catch(err => console.error("Gelir ekleme hatası: ", err));
}
function gelirSil(id) {
    if (!confirm("Bu geliri silmek istediğinizden emin misiniz?")) return;
    db.collection('gelirler').doc(id).delete();
}
function renderGelirler(gelirlerData) {
    const tabloBody = document.querySelector("#gelirlerTablosu tbody");
    tabloBody.innerHTML = '';
    gelirlerData.sort((a,b) => b.tarih.toDate() - a.tarih.toDate()).forEach(g => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${g.aciklama}</td><td>${formatCurrency(g.tutar)}</td><td><button class="delete-btn" onclick="gelirSil('${g.id}')">Sil</button></td>`;
        tabloBody.appendChild(tr);
    });
}

// =================================
// BORÇ YÖNETİMİ (FIRESTORE)
// =================================
function borcEkleDuzenle() {
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
        const borc = doc.data();
        const gercekOdeme = Math.min(odemeMiktari, borc.kalanTutar);
        const yeniKalan = borc.kalanTutar - gercekOdeme;
        const yeniOdenenTaksit = borc.odenenTaksit + (gercekOdeme / borc.aylikTaksitTutari);
        const yeniOdemeler = [...borc.buAyYapilanOdemeler, { id: Date.now(), tutar: gercekOdeme, tarih: new Date(), type: 'manual' }];
        t.update(borcRef, { kalanTutar: yeniKalan, odenenTaksit: yeniOdenenTaksit, buAyYapilanOdemeler: yeniOdemeler });
    }));
}
function borcSil(id) {
    if (!confirm("Bu borcu kalıcı olarak silmek istediğinizden emin misiniz?")) return;
    db.collection('borclar').doc(id).delete();
}
function odemeSil(borcId, odemeId) {
    const borcRef = db.collection('borclar').doc(borcId);
    db.runTransaction(t => t.get(borcRef).then(doc => {
        const borc = doc.data();
        const odeme = borc.buAyYapilanOdemeler.find(p => p.id === odemeId);
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
    const odenmisBorclar = borclarData.filter(b => b.kalanTutar < 0.01);

    aktifBorclar.sort((a, b) => getDebtUrgencyStatus(a).score - getDebtUrgencyStatus(b).score || a.sonTarih.toDate() - b.sonTarih.toDate())
        .forEach(b => borclarListesi.innerHTML += createBorcKartiHTML(b));
    
    if (odenmisBorclar.length > 0) {
        borclarListesi.innerHTML += `<hr class="ince-cizgi" style="grid-column: 1 / -1;"><h3 style="grid-column: 1 / -1; text-align: center;">Ödenmiş Borçlar</h3>`;
        odenmisBorclar.forEach(b => borclarListesi.innerHTML += createBorcKartiHTML(b));
    }
}
function createBorcKartiHTML(b) {
    const buAyOdenenToplam = (b.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0);
    let urgency = getDebtUrgencyStatus(b); let durumClass = urgency.class; let durumText = urgency.text;
    if (urgency.score > 2 && b.kalanTutar > 0.01) { if (buAyOdenenToplam >= b.aylikTaksitTutari - 0.01) { durumClass = "status-ay-odendi"; durumText = `✓ Bu Ay Ödendi`; } else if (buAyOdenenToplam > 0) { durumClass = "status-eksik-odendi"; durumText = `Eksik: ${formatCurrency(b.aylikTaksitTutari - buAyOdenenToplam)}`; } else { durumClass = "status-beklemede"; durumText = "Beklemede"; } }
    const yapilanOdemelerHTML = (b.buAyYapilanOdemeler || []).sort((a,b) => b.tarih.toDate() - a.tarih.toDate()).map(p => `<li>${formatCurrency(p.tutar)} <span class="odeme-tarihi">(${formatDate(p.tarih)})</span><button class="delete-btn" onclick="odemeSil('${b.id}', ${p.id})">x</button></li>`).join('');
    const onerilenTutarStr = b.onerilenOdeme > 0 ? b.onerilenOdeme.toFixed(2) : '';
    return `<div class="borc-kart"><div class="borc-kart-header"><h3>${b.kategori}</h3><span class="status ${durumClass}">${durumText}</span></div><div class="borc-kart-govde"><div><span>Kalan Tutar:</span> <strong>${formatCurrency(b.kalanTutar)}</strong></div><div><span>Aylık Taksit:</span> ${formatCurrency(b.aylikTaksitTutari)}</div><div><span>Taksit Durumu:</span> ${Math.round(b.odenenTaksit * 10) / 10} / ${b.taksitSayisi}</div><div><span>Son Ödeme:</span> ${formatDate(b.sonTarih)}</div></div>${b.kalanTutar < 0.01 ? `<div class="gecmis-olsun">🎉 Geçmiş Olsun! 🎉</div>` : `<div class="odeme-ekle-alani"><div class="odeme-stepper"><button class="stepper-btn" onclick="ayarlaOdeme('${b.id}', -${ODEME_ARTIS_MIKTARI})">-</button><input type="number" id="odeme-input-${b.id}" value="${onerilenTutarStr}" placeholder="0.00"><button class="stepper-btn" onclick="ayarlaOdeme('${b.id}', ${ODEME_ARTIS_MIKTARI})">+</button></div><button class="onayla-btn" onclick="odemeEkle('${b.id}')">Ekle</button></div><div class="yapilan-odemeler"><ul class="yapilan-odemeler-liste">${yapilanOdemelerHTML}</ul></div><div class="borc-kart-aksiyonlar"><button class="delete-btn" onclick="borcSil('${b.id}')">Sil</button></div>`}</div>`;
}

// =================================
// HEDEF YÖNETİMİ (FIRESTORE)
// =================================
function hedefEkle() {
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
        const hedef = doc.data();
        const eklenecekTutar = Math.min(tutar, hedef.hedefTutar - hedef.biriken);
        const yeniBiriken = hedef.biriken + eklenecekTutar;
        const yeniOdemeler = [...hedef.buAyYapilanOdemeler, { id: Date.now(), tutar: eklenecekTutar, tarih: new Date(), type: 'manual' }];
        t.update(hedefRef, { biriken: yeniBiriken, buAyYapilanOdemeler: yeniOdemeler });
    }));
}
function hedefSil(id) {
    if (!confirm("Bu hedefi silmek istediğinizden emin misiniz?")) return;
    db.collection('hedefler').doc(id).delete();
}
function birikimOdemeSil(hedefId, odemeId) {
    const hedefRef = db.collection('hedefler').doc(hedefId);
    db.runTransaction(t => t.get(hedefRef).then(doc => {
        const hedef = doc.data();
        const odeme = hedef.buAyYapilanOdemeler.find(p => p.id === odemeId);
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
        .forEach(h => liste.innerHTML += createHedefKartiHTML(h));
}
function createHedefKartiHTML(hedef) {
    const yuzde = hedef.hedefTutar > 0 ? (hedef.biriken / hedef.hedefTutar) * 100 : 0;
    const yapilanOdemelerHTML = (hedef.buAyYapilanOdemeler || []).sort((a,b) => b.tarih.toDate() - a.tarih.toDate()).map(p => `<li>${formatCurrency(p.tutar)} <span class="odeme-tarihi">(${formatDate(p.tarih)})</span><button class="delete-btn" onclick="birikimOdemeSil('${hedef.id}', ${p.id})">x</button></li>`).join('');
    const onerilenBirikimStr = hedef.onerilenBirikim > 0 ? hedef.onerilenBirikim.toFixed(2) : '';
    return `<div class="hedef-kart"><h3>${hedef.ad}</h3><p><strong>${formatCurrency(hedef.biriken)}</strong> / ${formatCurrency(hedef.hedefTutar)}</p><div class="progress-bar"><div class="progress-bar-inner" style="width: ${Math.min(yuzde, 100)}%;">${yuzde.toFixed(1)}%</div></div>${hedef.biriken >= hedef.hedefTutar ? `<div class="gecmis-olsun">🎉 Hedefe Ulaşıldı! 🎉</div>` : `<div class="odeme-ekle-alani"><div class="odeme-stepper"><button class="stepper-btn" onclick="ayarlaBirikim('${hedef.id}', -${ODEME_ARTIS_MIKTARI})">-</button><input type="number" id="birikim-input-${hedef.id}" value="${onerilenBirikimStr}" placeholder="0.00"><button class="stepper-btn" onclick="ayarlaBirikim('${hedef.id}', ${ODEME_ARTIS_MIKTARI})">+</button></div><button class="onayla-btn" onclick="birikimEkle('${hedef.id}')">Ekle</button></div><div class="yapilan-odemeler" style="margin-top:10px;"><ul class="yapilan-odemeler-liste">${yapilanOdemelerHTML}</ul></div><div class="hedef-butonlar"><button class="delete-btn" onclick="hedefSil('${hedef.id}')">Sil</button></div>`}</div>`;
}

// =================================
// HESAPLAMA VE YARDIMCI FONKSİYONLAR
// =================================
function calculateSuggestedDebtPayments(borclarData, aylikBorcFonu) {
    const toplamManuelOdeme = borclarData.reduce((sum, b) => { b.onerilenOdeme = 0; return sum + (b.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0); }, 0);
    let kalanDagitilacakFon = aylikBorcFonu - toplamManuelOdeme;
    if (kalanDagitilacakFon <= 0) return borclarData;
    const aktifBorclar = borclarData.filter(b => b.kalanTutar > 0.01).sort((a, b) => a.kalanTutar - b.kalanTutar);
    for (const borc of aktifBorclar) { if (kalanDagitilacakFon <= 0) break; const buAyOdenen = (borc.buAyYapilanOdemeler || []).reduce((sum, p) => sum + p.tutar, 0); const taksitOdemeHedefi = borc.aylikTaksitTutari - buAyOdenen; const odenecekTutar = Math.min(borc.kalanTutar, kalanDagitilacakFon, taksitOdemeHedefi > 0 ? taksitOdemeHedefi : 0); if (odenecekTutar > 0) { borc.onerilenOdeme += odenecekTutar; kalanDagitilacakFon -= odenecekTutar; } }
    if (kalanDagitilacakFon > 0) { for (const borc of aktifBorclar) { if (kalanDagitilacakFon <= 0) break; const odenecekEkTutar = Math.min(borc.kalanTutar - (borc.onerilenOdeme || 0), kalanDagitilacakFon); if (odenecekEkTutar > 0) { borc.onerilenOdeme += odenecekEkTutar; kalanDagitilacakFon -= odenecekEkTutar; } } }
    return borclarData;
}
function calculateSuggestedSavings(hedeflerData, aylikBirikimFonu) {
    const toplamManuelOdeme = hedeflerData.reduce((sum, h) => { h.onerilenBirikim = 0; return sum + (h.buAyYapilanOdemeler || []).reduce((s, p) => s + p.tutar, 0); }, 0);
    let kalanDagitilacakFon = aylikBirikimFonu - toplamManuelOdeme;
    if (kalanDagitilacakFon <= 0) return hedeflerData;
    const aktifHedefler = hedeflerData.filter(h => h.biriken < h.hedefTutar);
    const toplamKalanHedef = aktifHedefler.reduce((sum, h) => sum + (h.hedefTutar - h.biriken), 0);
    if (toplamKalanHedef > 0) { for (const hedef of aktifHedefler) { const hedefeKalan = hedef.hedefTutar - hedef.biriken; const oran = hedefeKalan / toplamKalanHedef; const odenecekTutar = Math.min(hedefeKalan, kalanDagitilacakFon * oran); if (odenecekTutar > 0) { hedef.onerilenBirikim += odenecekTutar; } } }
    return hedeflerData;
}
function getDebtUrgencyStatus(borc) { if (borc.kalanTutar < 0.01) return { score: 4, text: "Ödendi", class: "status-odendi" }; if (!borc.sonTarih) return { score: 3, text: "", class: "" }; const today = new Date(); today.setHours(0, 0, 0, 0); const dueDate = borc.sonTarih.toDate ? borc.sonTarih.toDate() : new Date(borc.sonTarih); dueDate.setHours(0, 0, 0, 0); const timeDiff = dueDate.getTime() - today.getTime(); const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)); if (dayDiff < 0) return { score: 1, text: `🔴 ÖDEME ${-dayDiff} GÜN GEÇTİ!`, class: "status-acil" }; if (dayDiff === 0) return { score: 1, text: "🔴 BUGÜN SON GÜN!", class: "status-acil" }; if (dayDiff <= 3) return { score: 2, text: `⚠️ SON ${dayDiff} GÜN!`, class: "status-uyari" }; return { score: 3, text: "", class: "" }; }
function ayarlaOdeme(borcId, miktar) { const input = document.getElementById(`odeme-input-${borcId}`); let mevcut = parseFloat(input.value) || 0; let yeni = mevcut + miktar; if (yeni < 0) yeni = 0; input.value = yeni.toFixed(2); }
function ayarlaBirikim(hedefId, miktar) { const input = document.getElementById(`birikim-input-${hedefId}`); let mevcut = parseFloat(input.value) || 0; let yeni = mevcut + miktar; if (yeni < 0) yeni = 0; input.value = yeni.toFixed(2); }
function loadSettings() { const a = JSON.parse(localStorage.getItem('butceAyarlari')) || { birikim: 20, borc: 20 }; document.getElementById('birikimOrani').value = a.birikim; document.getElementById('borcOrani').value = a.borc; updateLabel('birikimOrani', 'birikimOraniLabel'); updateLabel('borcOrani', 'borcOraniLabel'); }
function updateLabel(id, label) { document.getElementById(label).textContent = document.getElementById(id).value; }
function loadKategoriler() { const datalist = document.getElementById('kategoriListesi'); datalist.innerHTML = ''; defaultKategoriler.forEach(k => { const option = document.createElement('option'); option.value = k; datalist.appendChild(option); }); }
// script.js'in en sonuna eklenecek

function signInWithGoogle() {
    auth.signInWithPopup(googleProvider)
        .then(result => {
            console.log(result.user.displayName, "başarıyla giriş yaptı.");
        })
        .catch(error => {
            console.error("Google ile giriş hatası:", error);
        });
}

function signOutUser() {
    auth.signOut()
        .then(() => {
            console.log("Kullanıcı çıkış yaptı.");
            // Sayfayı temizlemek için sayfayı yenilemek en basit yöntem
            window.location.reload();
        })
        .catch(error => {
            console.error("Çıkış yaparken hata oluştu:", error);
        });
}