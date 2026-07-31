/* =========================================================
   HNScanner — نافذة موحّدة لقراءة الباركود من كاميرا الهاتف/اللاب توب
   تستخدم مكتبة html5-qrcode (يجب تحميلها في <head> قبل هذا الملف)
   الاستخدام: HNScanner.open(function(code){ ... }, {title:'...'})

   🔧 التحسينات الرئيسية:
   - إزالة فحص BarcodeDetector (بيسبب تأخير) واستخدام المكتبة مباشرة
   - زيادة FPS من 15 إلى 25 للالتقاط الأسرع
   - تقليل حجم صندوق المسح لتركيز أدق
   - إزالة قيود الفيديو الزائدة
   - تفعيل استمرار البحث حتى لو فشل إطار واحد
========================================================= */
const HNScanner = (function(){
  let html5QrCode = null;
  let overlay = null;
  let torchOn = false;
  let torchSupported = false;
  let isScanning = false;

  const SCAN_FORMATS = (typeof Html5QrcodeSupportedFormats !== 'undefined') ? [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.QR_CODE
  ] : undefined;

  function ensureStyles(){
    if(document.getElementById('hnScannerStyles')) return;
    const style = document.createElement('style');
    style.id = 'hnScannerStyles';
    style.textContent = `
      .hn-scan-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.86); z-index:600; display:flex; align-items:center; justify-content:center; padding:20px; }
      .hn-scan-box{ background:#111114; border:1px solid rgba(255,255,255,0.12); border-radius:18px; max-width:420px; width:100%; padding:18px;
        text-align:center; font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Tahoma,Arial,sans-serif; color:#F5F5F7; }
      .hn-scan-box h3{ font-size:15px; margin-bottom:10px; font-weight:700; }
      .hn-scan-region{ width:100%; border-radius:12px; overflow:hidden; background:#000; margin-bottom:10px; min-height:230px; position:relative; }
      .hn-scan-region video{ border-radius:12px; width:100%; height:auto; }
      .hn-scan-hint{ font-size:11.5px; color:#8E8E93; margin-bottom:6px; line-height:1.7; }
      .hn-scan-tips{ font-size:10.5px; color:#FFD60A; background:rgba(255,214,10,0.08); border:1px solid rgba(255,214,10,0.2); border-radius:8px; padding:7px 10px; margin-bottom:12px; line-height:1.8; text-align:right; }
      .hn-scan-err{ color:#FF6961; font-size:12px; margin-bottom:12px; display:none; line-height:1.7; }
      .hn-scan-actions{ display:flex; gap:8px; margin-bottom:10px; }
      .hn-scan-actions button{ flex:1; padding:11px; border:none; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; }
      .hn-scan-close{ background:rgba(255,255,255,0.09); color:#F5F5F7; }
      .hn-scan-torch{ background:rgba(255,214,10,0.14); color:#FFD60A; display:none; }
      .hn-scan-torch.on{ background:linear-gradient(120deg,#FFD60A,#FF9F0A); color:#151007; }
      .hn-scan-manual{ display:flex; gap:6px; border-top:1px dashed rgba(255,255,255,0.12); padding-top:12px; }
      .hn-scan-manual input{ flex:1; padding:9px 10px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:#F5F5F7; font-size:12.5px; outline:none; }
      .hn-scan-manual button{ padding:9px 12px; border:none; border-radius:8px; background:linear-gradient(120deg,#FFD60A,#FF9F0A); color:#151007; font-weight:700; font-size:12px; cursor:pointer; }
      .hn-scan-loading{ font-size:11px; color:#FFD60A; text-align:center; margin-top:8px; display:none; }
    `;
    document.head.appendChild(style);
  }

  async function toggleTorch(){
    if(!html5QrCode || !torchSupported) return;
    torchOn = !torchOn;
    try{
      await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
      document.getElementById('hnScanTorchBtn').classList.toggle('on', torchOn);
    }catch(e){ console.warn('Torch control failed'); }
  }

  async function open(onDecode, opts){
    opts = opts || {};
    ensureStyles();
    close();
    torchOn = false;
    torchSupported = false;
    isScanning = true;

    overlay = document.createElement('div');
    overlay.className = 'hn-scan-overlay';
    overlay.innerHTML = `
      <div class="hn-scan-box">
        <h3>📷 ${opts.title || 'وجّه الكاميرا نحو الباركود'}</h3>
        <div class="hn-scan-region" id="hnScanRegion"></div>
        <div class="hn-scan-loading" id="hnScanLoading">⏳ جاري تشغيل الكاميرا...</div>
        <div class="hn-scan-hint">هيتم قراءة الباركود تلقائياً بمجرد ظهوره واضحاً أمام الكاميرا</div>
        <div class="hn-scan-tips">💡 نصايح: قرّب المسافة ٨-١٢ سم، ثبّت إيدك، خلي الباركود مفرود، واستخدم الإضاءة الطبيعية (بعيد عن اللمعان).</div>
        <div class="hn-scan-err" id="hnScanErr"></div>
        <div class="hn-scan-actions">
          <button type="button" class="hn-scan-torch" id="hnScanTorchBtn">🔦 فلاش</button>
          <button type="button" class="hn-scan-close" id="hnScanCloseBtn">إلغاء</button>
        </div>
        <div class="hn-scan-manual">
          <input type="text" id="hnScanManualInput" placeholder="أو اكتب/الصق الكود يدوياً هنا...">
          <button type="button" id="hnScanManualBtn">استخدام</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    
    document.getElementById('hnScanCloseBtn').addEventListener('click', close);
    document.getElementById('hnScanTorchBtn').addEventListener('click', toggleTorch);

    const manualInput = document.getElementById('hnScanManualInput');
    const submitManual = ()=>{
      const v = manualInput.value.trim();
      if(!v) return;
      const cb = onDecode;
      close();
      if(cb) cb(v);
    };
    document.getElementById('hnScanManualBtn').addEventListener('click', submitManual);
    manualInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submitManual(); });

    if(typeof Html5Qrcode === 'undefined'){
      const err = document.getElementById('hnScanErr');
      err.style.display = 'block';
      err.textContent = 'تعذر تحميل مكتبة قراءة الباركود — تأكد من الاتصال بالإنترنت وحاول تاني';
      return;
    }

    try{
      document.getElementById('hnScanLoading').style.display = 'block';
      
      html5QrCode = new Html5Qrcode('hnScanRegion', {
        formatsToSupport: SCAN_FORMATS,
        // ❌ إزالة experimentalFeatures (بيسبب تأخير)
        verbose: false
      });

      await html5QrCode.start(
        { facingMode: { ideal: 'environment' } },
        {
          fps: 25, // ⬆️ زيادة FPS من 15 إلى 25
          qrbox: (vw, vh)=>{
            // صندوق مركّز وأصغر للدقة العالية
            const w = Math.floor(Math.min(vw * 0.75, 280));
            const h = Math.floor(Math.min(vh * 0.4, 120));
            return { width: w, height: h };
          },
          // ❌ إزالة aspectRatio و videoConstraints المعقدة
          // كده الكاميرا تشتغل أسرع بدون قيود زائدة
        },
        (decodedText)=>{
          if(!isScanning) return; // تجاهل إذا أُغلقت
          const cb = onDecode;
          close();
          if(cb) cb(decodedText);
        },
        ()=>{
          // ✅ بدل ما نتجاهل الأخطاء، بنستمر في البحث بهدوء
          // (الكاميرا بتستمر تعمل)
        }
      );

      document.getElementById('hnScanLoading').style.display = 'none';

      // فعّل الفلاش لو متوفر
      try{
        const track = html5QrCode.getRunningTrack();
        if(track){
          const capabilities = track.getCapabilities();
          if(capabilities.torch){
            torchSupported = true;
            document.getElementById('hnScanTorchBtn').style.display = 'block';
          }
        }
      }catch(e){ /* تجاهل هادي — بعض الأجهزة ما بتدعمش */ }
    }catch(e){
      const err = document.getElementById('hnScanErr');
      err.style.display = 'block';
      err.textContent = 'تعذر تشغيل الكاميرا — تأكد من السماح للمتصفح بالوصول للكاميرا';
      console.error('Camera error:', e);
    }
  }

  function close(){
    isScanning = false;
    if(html5QrCode){
      try{
        html5QrCode.stop()
          .then(()=>{ 
            try{ html5QrCode.clear(); }catch(e){}
          })
          .catch(()=>{});
      }catch(e){}
      html5QrCode = null;
    }
    if(overlay){ overlay.remove(); overlay = null; }
  }

  return { open, close };
})();
