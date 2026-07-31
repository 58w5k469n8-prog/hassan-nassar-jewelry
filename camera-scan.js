/* =========================================================
   HNScanner — نافذة موحّدة لقراءة الباركود من كاميرا الهاتف/اللاب توب
   تستخدم مكتبة html5-qrcode (يجب تحميلها في <head> قبل هذا الملف)
   الاستخدام: HNScanner.open(function(code){ ... }, {title:'...'})

   تحسينات السرعة والدقة:
   - استخدام كاشف الباركود المدمج في المتصفح (BarcodeDetector) لو متوفر
     بدل المكتبة البرمجية البطيئة — متاح على كروم للأندرويد ومعظم أجهزة
     الديسك توب الحديثة، وبيبقى أسرع بمراحل من القراءة البرمجية العادية.
   - تضييق أنواع الباركود المطلوب البحث عنها بدل ما يفحص كل الأنواع في
     كل إطار (ده كان بيبطّئ القراءة).
   - صندوق مسح عريض وقصير (مش مربع) لأن الباركود الخطي (CODE128) عريض.
   - معدل فحص أعلى (fps) + طلب دقة كاميرا أعلى.
   - زرار فلاش/تورش لو الجهاز بيدعمه (مفيد جداً في الإضاءة الضعيفة).
   - خانة إدخال يدوي للكود جوه نفس النافذة كبديل فوري لو القراءة اتعطلت.
========================================================= */
const HNScanner = (function(){
  let html5QrCode = null;
  let overlay = null;
  let torchOn = false;
  let torchSupported = false;

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
      .hn-scan-region video{ border-radius:12px; }
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
    `;
    document.head.appendChild(style);
  }

  async function toggleTorch(){
    if(!html5QrCode || !torchSupported) return;
    torchOn = !torchOn;
    try{
      await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
      document.getElementById('hnScanTorchBtn').classList.toggle('on', torchOn);
    }catch(e){ /* الجهاز رفض الفلاش رغم إنه بيدعمه أحياناً — تجاهل بهدوء */ }
  }

  async function open(onDecode, opts){
    opts = opts || {};
    ensureStyles();
    close(); // اقفل أي نافذة مسح سابقة لو فاضلة مفتوحة
    torchOn = false; torchSupported = false;

    overlay = document.createElement('div');
    overlay.className = 'hn-scan-overlay';
    overlay.innerHTML = `
      <div class="hn-scan-box">
        <h3>📷 ${opts.title || 'وجّه الكاميرا نحو الباركود'}</h3>
        <div class="hn-scan-region" id="hnScanRegion"></div>
        <div class="hn-scan-hint">هيتم قراءة الباركود تلقائياً بمجرد ظهوره واضحاً أمام الكاميرا</div>
        <div class="hn-scan-tips">💡 نصايح لقراءة أسرع: قرّب المسافة لحد ٨-١٢ سم، ثبّت إيدك، خلي الباركود مفرود وعليه إضاءة كويسة (بعيد عن اللمعان المباشر على الذهب)، واستخدم كاميرا الموبايل الخلفية.</div>
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
      const cb = onDecode; close(); if(cb) cb(v);
    };
    document.getElementById('hnScanManualBtn').addEventListener('click', submitManual);
    manualInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submitManual(); });

    if(typeof Html5Qrcode === 'undefined'){
      const err = document.getElementById('hnScanErr');
      err.style.display = 'block';
      err.textContent = 'تعذر تحميل مكتبة قراءة الباركود — تأكد من الاتصال بالإنترنت وحاول تاني (تقدر برضو تكتب الكود يدوياً تحت)';
      return;
    }

    try{
      html5QrCode = new Html5Qrcode('hnScanRegion', {
        formatsToSupport: SCAN_FORMATS,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false
      });
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight)=>{
            // صندوق عريض وقصير مناسب لشكل الباركود الخطي بدل المربع
            const w = Math.floor(Math.min(viewfinderWidth * 0.85, 320));
            const h = Math.floor(Math.min(viewfinderHeight * 0.45, 140));
            return { width: w, height: h };
          },
          aspectRatio: 1.5,
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' }]
          }
        },
        (decodedText)=>{
          const cb = onDecode;
          close();
          if(cb) cb(decodedText);
        },
        ()=>{ /* فشل قراءة إطار واحد — طبيعي أثناء البحث عن الباركود، بيتجاهل */ }
      );

      // فعّل زرار الفلاش لو الكاميرا بتدعمه
      try{
        const caps = html5QrCode.getRunningTrackCapabilities ? html5QrCode.getRunningTrackCapabilities() : {};
        if(caps && caps.torch){
          torchSupported = true;
          document.getElementById('hnScanTorchBtn').style.display = 'block';
        }
      }catch(e){ /* بعض المتصفحات (مثل Safari) ما بتدعمش التحكم في الفلاش */ }
    }catch(e){
      const err = document.getElementById('hnScanErr');
      err.style.display = 'block';
      err.textContent = 'تعذر تشغيل الكاميرا — تأكد من السماح للمتصفح بالوصول للكاميرا، أو استخدم الإدخال اليدوي تحت';
    }
  }

  function close(){
    if(html5QrCode){
      try{
        html5QrCode.stop().then(()=>{ try{ html5QrCode.clear(); }catch(e){} }).catch(()=>{});
      }catch(e){}
      html5QrCode = null;
    }
    if(overlay){ overlay.remove(); overlay = null; }
  }

  return { open, close };
})();
