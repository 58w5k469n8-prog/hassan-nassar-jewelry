// ==========================================
// 🛡️ Hassan Nassar Jewelry - License Guard & Device Tracker
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyAQMlFvEzLXxUKYbScldvKTHKQEk4PpN4",
  authDomain: "hassan-nassar-license.firebaseapp.com",
  projectId: "hassan-nassar-license",
  storageBucket: "hassan-nassar-license.firebasestorage.app",
  messagingSenderId: "381313051649",
  appId: "1:381313051649:web:ef6e6667f691848c3c6400",
  measurementId: "G-E939CTWF3W"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const LICENSE_ID = "2NbYSgAPmg9HysgoDt1l";

function getDeviceId() {
  let devId = localStorage.getItem("hn_device_id");
  if (!devId) {
    devId = "DEV-" + Math.random().toString(36).substring(2, 9).toUpperCase();
    localStorage.setItem("hn_device_id", devId);
  }
  return devId;
}

async function checkLicenseGuard() {
  try {
    const doc = await db.collection("licenses").doc(LICENSE_ID).get();
    
    if (doc.exists) {
      const data = doc.data();
      
      // 1. التحقق من التفعيل العام للنظام
      if (data.active !== true) {
        blockUnauthorizedUser("الترخيص غير مفعل أو منتهي الصلاحية. يرجى التواصل مع المسؤول.");
        return;
      }

      // 2. التحقق من حالة الجهاز المحدد
      const deviceId = getDeviceId();
      const deviceDoc = await db.collection("licenses").doc(LICENSE_ID).collection("devices").doc(deviceId).get();
      
      if (deviceDoc.exists && deviceDoc.data().blocked === true) {
        blockUnauthorizedUser("تم حظر هذا الجهاز من الدخول للنظام. يرجى التواصل مع الادارة.");
        return;
      }

      // تسجيل وتحديث بيانات تواجد الجهاز
      trackDeviceSession();
      return;
    }
    
    blockUnauthorizedUser("بيانات الترخيص غير صحيحة.");
  } catch (error) {
    console.error("خطأ في التحقق من الترخيص:", error);
    blockUnauthorizedUser("تعذر الاتصال بسيرفر التراخيص. يرجى التأكد من الاتصال بالإنترنت.");
  }
}

async function trackDeviceSession() {
  try {
    const deviceId = getDeviceId();
    const deviceRef = db.collection("licenses").doc(LICENSE_ID).collection("devices").doc(deviceId);

    await deviceRef.set({
      deviceId: deviceId,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      blocked: false // ينشأ الجهاز بشكل افتراضي غير محظور
    }, { merge: true });
  } catch (e) {
    console.warn("تعذر تسجيل بيانات الجهاز:", e);
  }
}

function blockUnauthorizedUser(message) {
  document.body.innerHTML = `
    <div style="position: fixed; inset: 0; background: #08080A; color: #F5F5F7; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 999999; font-family: -apple-system, sans-serif; text-align: center; padding: 20px;">
      <div style="background: rgba(24, 24, 28, 0.8); border: 1px solid rgba(255, 105, 97, 0.3); padding: 40px; border-radius: 20px; max-width: 450px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
        <div style="font-size: 50px; margin-bottom: 15px;">🔒</div>
        <h1 style="font-size: 20px; color: #FF6961; margin-bottom: 10px;">تم تقييد الوصول</h1>
        <p style="color: #8E8E93; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">${message}</p>
        <div style="font-size: 12px; color: #FFD60A; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 15px;">
          مجوهرات حسن نصار — جميع الحقوق محفوظة
        </div>
      </div>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", checkLicenseGuard);
