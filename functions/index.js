// functions/index.js (2. Nesil - v2 Sözdizimi ile)

// 2. Nesil fonksiyonlar için gerekli importlar
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

// Firebase Admin SDK'sını başlat
admin.initializeApp();
const db = admin.firestore();

// === ANAHTARLAR ===
const VAPID_PUBLIC_KEY = "BNOPkV07ymwVZ9X4nzIIj9ak2L2G_55tuandprswRQQ4PbvcWX3Q23Bpq_Heq01ZpMCCRE5aksVhtD5OXABembo";
const VAPID_PRIVATE_KEY = "Du7hL84Sr7x203wGALN5agI8Kbzb8kP7JVxOWSXEyl4";

webpush.setVapidDetails(
  "mailto:ornek@mail.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// === 2. NESİL ZAMANLANMIŞ FONKSİYON TANIMLAMASI ===
exports.borclariKontrolEtVeBildir = onSchedule({
    schedule: "every day 09:00",
    timeZone: "Europe/Istanbul",
    region: "europe-west1", // Bölgeyi burada belirtmek daha sağlıklıdır
}, async (event) => {
    logger.info("Günlük borç son tarih kontrolü başladı!");

    const borclarSnapshot = await db.collection("borclar")
        .where("kalanTutar", ">", 0).get();

    const promises = [];

    borclarSnapshot.forEach((doc) => {
      const borc = doc.data();
      if (!borc.sonTarih || typeof borc.sonTarih.toDate !== 'function') {
        logger.warn(`Geçersiz tarih formatı olan borç atlandı: ${doc.id}`);
        return;
      }
      const dueDate = borc.sonTarih.toDate();
      const today = new Date();
      dueDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      const timeDiff = dueDate.getTime() - today.getTime();
      const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      let notificationPayload = null;

      if (dayDiff === 3) {
        notificationPayload = {
          title: "⚠️ Borç Hatırlatma",
          body: `${borc.kategori} borcunuzun son ödemesine 3 gün kaldı!`,
          url: "/borc-program/",
        };
      } else if (dayDiff === 0) {
         notificationPayload = {
          title: "🔴 ACİL BORÇ UYARISI!",
          body: `${borc.kategori} borcunuzun BUGÜN son ödeme günü!`,
          url: "/borc-program/",
        };
      }

      if (notificationPayload) {
        logger.info(`Kullanıcı ${borc.userId} için bildirim hazırlanıyor. Borç: ${borc.kategori}`);
        const promise = sendNotificationToUser(borc.userId, notificationPayload);
        promises.push(promise);
      }
    });
    
    await Promise.all(promises);
    logger.info("Borç kontrolü tamamlandı.");
});

async function sendNotificationToUser(userId, payload) {
    const userSubscriptionsDoc = await db.collection("subscriptions").doc(userId).get();
    if (!userSubscriptionsDoc.exists) {
      logger.log(`Kullanıcı ${userId} için abonelik bulunamadı.`);
      return;
    }

    const subData = userSubscriptionsDoc.data();
    if (!subData.subscriptions || subData.subscriptions.length === 0) {
      logger.log(`Kullanıcı ${userId} için abonelik listesi boş.`);
      return;
    }
    
    const notificationPromises = subData.subscriptions.map((sub) => {
        return webpush.sendNotification(sub, JSON.stringify(payload))
            .catch((err) => {
                if (err.statusCode === 410) {
                    logger.warn("Geçersiz abonelik bulundu, siliniyor:", sub.endpoint);
                    const updatedSubs = subData.subscriptions.filter(s => s.endpoint !== sub.endpoint);
                    return db.collection("subscriptions").doc(userId).update({ subscriptions: updatedSubs });
                } else {
                    logger.error("Bildirim gönderilemedi, Hata:", err.message);
                }
            });
    });
    return Promise.all(notificationPromises);
}