/* =========================================================
   HNScanner — نافذة موحّدة لقراءة الباركود من كاميرا الهاتف/اللاب توب
   تستخدم مكتبة html5-qrcode (يجب تحميلها في <head> قبل هذا الملف)
   
   🌍 دعم متعدد الأنظمة:
   - Android: Camera permission مع Persistent Storage
   - macOS: Camera permission + WebRTC constraints
   - Windows: Camera permission + High DPI scaling
   - iOS: محدودية بسبب Safari WebRTC
   
   الاستخدام: HNScanner.open(function(code){ ... }, {title:'...'})
========================================================= */

const HNScanner = (function(){
  let html5QrCode = null;
  let overlay = null;
  let torchOn = false;
  let torchSupported = false;
  let isScanning = false;
  let deviceOS = null;
  let isCameraPermissionDenied = false;

  const SCAN_FORMATS = (typeof Html5QrcodeSupportedFormats !== 'undefined') ? [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.QR_CODE
  ] : undefined;

  // 🔍 كشف النظام التشغيلي
  function detectOS(){
    const ua = navigator.userAgent.toLowerCase();
    
    if(/android/.test(ua)){
      return { name: 'android', version: ua.match(/android\s([\d.]+)/)?.[1] };
    }
    if(/iphone|ipad|ipod/.test(ua)){
      return { name: 'ios', version: ua.match(/os\s([\d.]+)/)?.[1] };
    }
    if(/mac/.test(ua) && !/iphone|ipad/.test(ua)){
      return { name: 'macos', version: ua.match(/mac os x\s([\d.]+)/)?.[1] };
    }
    if(/win/.test(ua)){
      return { name: 'windows', version: ua.match(/windows nt\s([\d.]+)/)?.[1] };
    }
    if(/linux/.test(ua)){
      return { name: 'linux', version: ua.match(/linux/)?.[1] };
    }
    
    return { name: 'unknown', version: 'unknown' };
  }

  // 🔐 طلب أذون الكاميرا (تختلف حسب النظام)
  async function requestCameraPermission(){
    try{
      // التحقق من دعم Permissions API
      if(!navigator.permissions){
        console.warn('Permissions API not supported, proceeding with getUserMedia');
        return true;
      }

      // محاولة فحص الأذونات الحالية
      const result = await navigator.permissions.query({ name: 'camera' });
      
      if(result.state === 'granted'){
        return true;
      }
      
      if(result.state === 'denied'){
        isCameraPermissionDenied = true;
        return false;
      }

      // إذا كانت state === 'prompt'، سيطلب المتصفح الأذن تلقائياً عند getUserMedia
      return true;
    }catch(e){
      console.warn('Permission query failed, attempting getUserMedia:', e);
      return true;
    }
  }

  // 📱 إعدادات الكاميرا حسب نظام التشغيل
  function getCameraConstraints(os){
    const baseConstraints = {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    };

    switch(os.name){
      case 'android':
        // Android: دقة عالية مع التركيز المستمر
        return {
          ...baseConstraints,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [
            { focusMode: 'continuous' },
            { focusDistance: 0 } // تركيز على المسافات القريبة (الباركود)
          ]
        };

      case 'ios':
        // iOS: قيود محدودة (Safari بيرفض معظم advanced)
        return {
          ...baseConstraints,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };

      case 'macos':
        // macOS: دقة عالية مع التركيز المستمر
        return {
          ...baseConstraints,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [
            { focusMode: 'continuous' },
            { zoom: 1.0 }
          ]
        };

      case 'windows':
        // Windows: دقة عالية مع معالجة High DPI
        return {
          ...baseConstraints,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [
            { focusMode: 'continuous' }
          ]
        };

      default:
        return baseConstraints;
    }
  }

  // 📊 إعدادات الفحص حسب النظام
  function getScanConfig(os){
    const baseFps = 25;
    
    switch(os.name){
      case 'android':
        // Android: معدل عالي للهواتف الحديثة
        return {
          fps: Math.min(baseFps, 30),
          qrbox: (vw, vh)=>{
            const w = Math.floor(Math.min(vw * 0.75, 300));
            const h = Math.floor(Math.min(vh * 0.4, 130));
            return { width: w, height: h };
          },
          videoConstraints: getCameraConstraints(os),
          disableFlip: false
        };

      case 'ios':
        // iOS: معدل أقل لتوفير البطارية
        return {
          fps: Math.min(baseFps, 20),
          qrbox: (vw, vh)=>{
            const w = Math.floor(Math.min(vw * 0.7, 250));
            const h = Math.floor(Math.min(vh * 0.35, 110));
            return { width: w, height: h };
          },
          videoConstraints: getCameraConstraints(os),
          disableFlip: false
        };

      case 'macos':
        // macOS: معدل عالي للمعالجات القوية
        return {
          fps: Math.min(baseFps, 30),
          qrbox: (vw, vh)=>{
            const w = Math.floor(Math.min(vw * 0.75, 350));
            const h = Math.floor(Math.min(vh * 0.45, 150));
            return { width: w, height: h };
          },
          videoConstraints: getCameraConstraints(os),
          disableFlip: false
        };

      case 'windows':
        // Windows: معدل عالي لكن مع معالجة DPI
        return {
          fps: Math.min(baseFps, 30),
          qrbox: (vw, vh)=>{
            const dpr = window.devicePixelRatio || 1;
            const w = Math.floor(Math.min(vw * 0.75, 300 / dpr));
            const h = Math.floor(Math.min(vh * 0.4, 120 / dpr));
            return { width: w, height: h };
          },
          videoConstraints: getCameraConstraints(os),
          disableFlip: false
        };

      default:
        return {
          fps: baseFps,
          qrbox: (vw, vh)=>({ 
            width: Math.floor(Math.min(vw * 0.75, 280)), 
            height: Math.floor(Math.min(vh * 0.4, 120)) 
          }),
          videoConstraints: getCameraConstraints(os),
          disableFlip: false
        };
    }
  }

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
      .hn-scan-region video{ border-radius:12px; width:100%; height:auto; display:block; }
      .hn-scan-hint{ font-size:11.5px; color:#8E8E93; margin-bottom:6px; line-height:1.7; }
      .hn-scan-tips{ font-size:10.5px; color:#FFD60A; background:rgba(255,214,10,0.08); border:1px solid rgba(255,214,10,0.2); border-radius:8px; padding:7px 10px; margin-bottom:12px; line-height:1.8; text-align:right; }
      .hn-scan-err{ color:#FF6961; font-size:12px; margin-bottom:12px; display:none; line-height:1.7; }
      .hn-scan-info{ color:#A1A1A6; font-size:10px; margin-bottom:8px; display:none; }
      .hn-scan-actions{ display:flex; gap:8px; margin-bottom:10px; }
      .hn-scan-actions button{ flex:1; padding:11px; border:none; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.2s; }
      .hn-scan-actions button:active{ transform:scale(0.98); }
      .hn-scan-close{ background:rgba(255,255,255,0.09); color:#F5F5F7; }
      .hn-scan-torch{ background:rgba(255,214,10,0.14); color:#FFD60A; display:none; }
      .hn-scan-torch.on{ background:linear-gradient(120deg,#FFD60A,#FF9F0A); color:#151007; }
      .hn-scan-manual{ display:flex; gap:6px; border-top:1px dashed rgba(255,255,255,0.12); padding-top:12px; }
      .hn-scan-manual input{ flex:1; padding:9px 10px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:#F5F5F7; font-size:12.5px; outline:none; }
      .hn-scan-manual input:focus{ border-color:rgba(255,214,10,0.5); background:rgba(255,255,255,0.09); }
      .hn-scan-manual button{ padding:9px 12px; border:none; border-radius:8px; background:linear-gradient(120deg,#FFD60A,#FF9F0A); color:#151007; font-weight:700; font-size:12px; cursor:pointer; }
      .hn-scan-loading{ font-size:11px; color:#FFD60A; text-align:center; margin-top:8px; display:none; }
      .hn-scan-permission-help{ font-size:10px; color:#8E8E93; background:rgba(255,255,255,0.05); padding:8px; border-radius:8px; margin-top:8px; display:none; line-height:1.6; }
    `;
    document.head.appendChild(style);
  }

  async function toggleTorch(){
    if(!html5QrCode || !torchSupported) return;
    torchOn = !torchOn;
    try{
      await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
      document.getElementById('hnScanTorchBtn').classList.toggle('on', torchOn);
    }catch(e){ 
      console.warn('Torch control failed'); 
    }
  }

  async function open(onDecode, opts){
    opts = opts || {};
    ensureStyles();
    close();
    torchOn = false;
    torchSupported = false;
    isScanning = true;
    isCameraPermissionDenied = false;
    deviceOS = detectOS();

    console.log(`🔍 Detected OS: ${deviceOS.name} (${deviceOS.version})`);

    overlay = document.createElement('div');
    overlay.className = 'hn-scan-overlay';
    overlay.innerHTML = `
      <div class="hn-scan-box">
        <h3>📷 ${opts.title || 'وجّه الكاميرا نحو الباركود'}</h3>
        <div class="hn-scan-region" id="hnScanRegion"></div>
        <div class="hn-scan-info" id="hnScanInfo">جهازك: ${deviceOS.name}</div>
        <div class="hn-scan-loading" id="hnScanLoading">⏳ جاري تشغيل الكاميرا...</div>
        <div class="hn-scan-hint">هيتم قراءة الباركود تلقائياً بمجرد ظهوره واضحاً أمام الكاميرا</div>
        <div class="hn-scan-tips">💡 نصايح: قرّب المسافة ٨-١٢ سم، ثبّت إيدك، خلي الباركود مفرود، واستخدم الإضاءة الطبيعية.</div>
        <div class="hn-scan-err" id="hnScanErr"></div>
        <div class="hn-scan-permission-help" id="hnScanPermHelp"></div>
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

    // 🔐 طلب الأذونات قبل محاولة الوصول للكاميرا
    try{
      document.getElementById('hnScanLoading').style.display = 'block';
      
      const permGranted = await requestCameraPermission();
      if(!permGranted && isCameraPermissionDenied){
        throw new Error('PERMISSION_DENIED');
      }

      html5QrCode = new Html5Qrcode('hnScanRegion', {
        formatsToSupport: SCAN_FORMATS,
        verbose: false
      });

      const scanConfig = getScanConfig(deviceOS);

      await html5QrCode.start(
        scanConfig.videoConstraints,
        scanConfig,
        (decodedText)=>{
          if(!isScanning) return;
          const cb = onDecode;
          close();
          if(cb) cb(decodedText);
        },
        ()=>{ /* تجاهل أخطاء الإطار الواحد */ }
      );

      document.getElementById('hnScanLoading').style.display = 'none';

      // فعّل الفلاش لو متوفر (معظم الهواتف الحديثة)
      try{
        const track = html5QrCode.getRunningTrack?.();
        if(track){
          const capabilities = track.getCapabilities?.();
          if(capabilities?.torch){
            torchSupported = true;
            document.getElementById('hnScanTorchBtn').style.display = 'block';
          }
        }
      }catch(e){ /* تجاهل */ }
    }catch(e){
      const err = document.getElementById('hnScanErr');
      const permHelp = document.getElementById('hnScanPermHelp');
      
      err.style.display = 'block';
      permHelp.style.display = 'block';

      if(e.message === 'PERMISSION_DENIED' || e.toString().includes('NotAllowedError')){
        err.textContent = '❌ تم رفض الأذن — لم تسمح للمتصفح بالوصول للكاميرا';
        
        // رسالة توضيحية حسب النظام
        switch(deviceOS.name){
          case 'android':
            permHelp.textContent = '📱 Android: افتح إعدادات > التطبيقات > المتصفح > الأذونات > قم بتفعيل الكاميرا';
            break;
          case 'ios':
            permHelp.textContent = '📱 iOS: افتح Settings > [المتصفح] > Camera وفعّل الإذن';
            break;
          case 'macos':
            permHelp.textContent = '🍎 macOS: System Preferences > Security & Privacy > Camera وأضف المتصفح';
            break;
          case 'windows':
            permHelp.textContent = '🪟 Windows: Settings > Privacy & Security > Camera وفعّل للتطبيق';
            break;
          default:
            permHelp.textContent = 'تأكد من تفعيل أذونات الكاميرا في إعدادات متصفحك';
        }
      }else if(e.toString().includes('NotFoundError')){
        err.textContent = '❌ لم يتم العثور على كاميرا متصلة';
        permHelp.textContent = 'تأكد من توصيل كاميرا USB أو استخدم الكاميرا المدمجة في جهازك';
      }else{
        err.textContent = `❌ خطأ: ${e.message || 'فشل تشغيل الكاميرا'}`;
        permHelp.textContent = 'جرّب استخدام الإدخال اليدوي أدناه أو أعد تحميل الصفحة';
      }
      
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

  return { 
    open, 
    close,
    getOS: ()=> deviceOS 
  };
})();
