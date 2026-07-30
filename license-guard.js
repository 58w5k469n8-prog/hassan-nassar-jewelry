// ==========================================
// 🛡️ Hassan Nassar Jewelry - License Guard
// ==========================================

// 1. تهيئة Firebase بالبيانات الخاصة بمشروعك
const firebaseConfig = {
  apiKey: "AIzaSyAQMlFvEzLXxUKYbScldvKTHKQEk4PpN4",
  authDomain: "hassan-nassar-license.firebaseapp.com",
  projectId: "hassan-nassar-license",
  storageBucket: "hassan-nassar-license.firebasestorage.app",
  messagingSenderId: "381313051649",
  appId: "1:381313051649:web:ef6e6667f691848c3c6400",
  measurementId: "G-E939CTWF3W"
};

// تشغيل Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// 2. معرف الترخيص الخطي الخفيف من قاعدة البيانات
const LICENSE_ID = "2NbYSgAPmg9HysgoDt1l";

// 3. دالة فحص الترخيص عند فتح البرنامج
async function checkLicenseGuard() {
  try {
    const doc = await db.collection("licenses").doc(LICENSE_ID).get();
    
    if (doc.exists) {
      const data = doc.data();
      if (data.active === true) {
        console.log("✅ الترخيص ساري ومفعل - مجوهرات حسن نصار");
        return; // الترخيص سليم، يكمل البرنامج عمله بشكل طبيعي
      }
    }
    
    // إذا كان الترخيص غير مفعل أو غير موجود
    blockUnauthorizedUser("الترخيص غير مفعل أو منتهي الصلاحية. يرجى التواصل مع المسؤول.");
    
  } catch (error) {
    console.error("خطأ في التحقق من الترخيص:", error);
    blockUnauthorizedUser("تعذر الاتصال بسيرفر التراخيص. يرجى التأكد من الاتصال بالإنترنت.");
  }
}

// 4. دالة حظر الشاشة وحجب النظام
function blockUnauthorizedUser(message) {
  document.body.innerHTML = `
    <div style="
      position: fixed; inset: 0; background: #08080A; color: #F5F5F7;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 20px;
    ">
      <div style="
        background: rgba(24, 24, 28, 0.8); border: 1px solid rgba(255, 105, 97, 0.3);
        padding: 40px; border-radius: 20px; max-width: 450px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.8);
      ">
        <div style="font-size: 50px; margin-bottom: 15px;">🔒</div>
        <h1 style="font-size: 20px; color: #FF6961; margin-bottom: 10px;">النظام غير مفعل</h1>
        <p style="color: #8E8E93; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">${message}</p>
        <div style="font-size: 12px; color: #FFD60A; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 15px;">
          مجوهرات حسن نصار — جميع الحقوق محفوظة
        </div>
      </div>
    </div>
  `;
}

// تشغيل الفحص فور تحميل الصفحة
document.addEventListener("DOMContentLoaded", checkLicenseGuard);