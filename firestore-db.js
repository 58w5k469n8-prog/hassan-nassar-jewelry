/* =========================================================
   Hassan Nassar Jewelry — Shared Firestore Data Engine
   ---------------------------------------------------------
   Drop-in replacement for the old per-device local DB engine.
   Same API every page already uses:
     await DB.read(key, fallback)
     await DB.write(key, value)
     await DB.tryAutoConnect()
     DB.pickFolder()
   Data now lives in Firestore (shared live between every approved
   account), with:
     - Offline persistence: the app keeps working with no internet;
       writes queue locally and sync automatically once back online.
     - Optional local folder mirror: a backup copy of every write is
       also saved to a folder you choose on this device.
     - Automatic activity logging for every write (who / what / when).
========================================================= */
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAQMILfvEzLXxUKYbScldvKTHKQEk4PpN4",
    authDomain: "hassan-nassar-license.firebaseapp.com",
    projectId: "hassan-nassar-license",
    storageBucket: "hassan-nassar-license.firebasestorage.app",
    messagingSenderId: "381313051649",
    appId: "1:381313051649:web:ef6e6667f691848c3c6400",
    measurementId: "G-E939CTWF3W"
  };
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const fsdb = firebase.firestore();

  try {
    fsdb.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
      console.warn('Firestore offline persistence not enabled:', err.code);
    });
  } catch (e) {}

  const SHOP_NAME = 'مجوهرات حسن نصار';

  function idbOpen() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('hn_db_meta', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  function idbGet(k) {
    return idbOpen().then(db => new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readonly');
      const rq = tx.objectStore('kv').get(k);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    }));
  }
  function idbSet(k, v) {
    return idbOpen().then(db => new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    }));
  }

  function currentUser() {
    try {
      const raw = localStorage.getItem('hn_current_user');
      return raw ? JSON.parse(raw) : { name: 'غير معروف', phone: '' };
    } catch (e) { return { name: 'غير معروف', phone: '' }; }
  }

  /* ----- offline indicator banner (shown automatically on every page) ----- */
  function ensureOfflineBanner() {
    if (document.getElementById('hnOfflineBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'hnOfflineBanner';
    bar.style.cssText = 'display:none;position:sticky;top:0;z-index:99998;background:#3a1414;color:#FF9791;text-align:center;font-size:12.5px;padding:8px;border-bottom:1px solid rgba(255,105,97,0.4);font-family:inherit;';
    bar.textContent = '🔴 وضع عدم اتصال بالإنترنت — العمليات بتتخزن محلياً وهتتزامن تلقائياً أول ما النت يرجع';
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function updateOfflineBanner() {
    ensureOfflineBanner();
    const bar = document.getElementById('hnOfflineBanner');
    if (bar) bar.style.display = navigator.onLine ? 'none' : 'block';
  }
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  document.addEventListener('DOMContentLoaded', updateOfflineBanner);

  /* ----- activity log (used by the dashboard's live feed) ----- */
  async function logActivity(action, key) {
    try {
      const u = currentUser();
      await fsdb.collection('activity_log').add({
        action, key,
        user: u.name || 'غير معروف',
        phone: u.phone || '',
        page: location.pathname.split('/').pop(),
        at: Date.now()
      });
    } catch (e) { /* non-critical — never block the actual save on this */ }
  }

  const DB = {
    supported: 'showDirectoryPicker' in window,
    dirHandle: null, shopHandle: null,
    connected: true, // Firestore's own offline cache means the app is always "ready"

    async pickFolder() {
      if (!this.supported) {
        alert('المتصفح ده مش بيدعم اختيار مجلد نسخة احتياطية — البيانات هتفضل متزامنة أونلاين عادي بس من غير نسخة محلية إضافية.');
        return true;
      }
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        this.dirHandle = handle;
        this.shopHandle = await handle.getDirectoryHandle(SHOP_NAME, { create: true });
        await idbSet('rootDirHandle', handle);
        return true;
      } catch (e) { return false; }
    },

    async tryAutoConnect() {
      if (this.supported) {
        try {
          const h = await idbGet('rootDirHandle');
          if (h) {
            const perm = await h.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
              this.dirHandle = h;
              this.shopHandle = await h.getDirectoryHandle(SHOP_NAME, { create: true });
            }
          }
        } catch (e) { /* no local mirror folder chosen yet — Firestore still works fine */ }
      }
      return true;
    },

    async _mirrorWrite(key, value) {
      if (!this.shopHandle) return;
      try {
        const fh = await this.shopHandle.getFileHandle(key + '.json', { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(value));
        await w.close();
      } catch (e) { console.warn('local mirror write failed for', key, e); }
    },

    async read(key, fallback) {
      try {
        const doc = await fsdb.collection('shop_data').doc(key).get();
        if (doc.exists && doc.data() && 'value' in doc.data()) return doc.data().value;
        return fallback;
      } catch (e) {
        if (this.shopHandle) {
          try {
            const fh = await this.shopHandle.getFileHandle(key + '.json');
            const f = await fh.getFile();
            return JSON.parse(await f.text());
          } catch (e2) { return fallback; }
        }
        return fallback;
      }
    },

    async write(key, value) {
      await fsdb.collection('shop_data').doc(key).set({ value, updatedAt: Date.now() });
      this._mirrorWrite(key, value);
      logActivity('write', key);
      return true;
    },

    /* live listener — dashboard / activity feed use this for real-time updates without polling */
    onChange(key, callback) {
      return fsdb.collection('shop_data').doc(key).onSnapshot(doc => {
        if (doc.exists && doc.data() && 'value' in doc.data()) callback(doc.data().value);
      });
    }
  };

  window.DB = DB;
  window.HN_FSDB = fsdb;
})();
