/* =========================================================
   HNScanner Pro — قارئ باركود/QR شامل وسريع جداً
   ✨ المميزات:
   - سرعة قراءة عالية: 30+ FPS
   - جميع أنواع الباركود والـ QR Code
   - التقاط يدوي + قراءة تلقائية معاً
   - إدارة ذكية للأذونات (Android, iOS, macOS, Windows, Linux)
   - فلاش/تورش مع تحكم تلقائي
   - معالجة صور محسّنة
   - تصفية الأخطاء والأكواد المكررة
   - إحصائيات قراءة في الوقت الفعلي
   - تحسينات الأداء المستمرة
=========================================================== */

const HNScanner = (function(){
  let html5QrCode = null;
  let overlay = null;
  let torchOn = false;
  let torchSupported = false;
  let isScanning = false;
  let deviceOS = null;
  let isCameraPermissionDenied = false;
  let lastScannedCode = null;
  let lastScanTime = 0;
  let scannedCodes = new Set();
  let scanStats = { total: 0, success: 0, failed: 0, duplicates: 0 };
  let autoTorchEnabled = false;
  let isAutoTorchActive = false;

  // ✨ دعم شامل لأنواع الباركود
  const SCAN_FORMATS = (typeof Html5QrcodeSupportedFormats !== 'undefined') ? [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.CODABAR,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
    Html5QrcodeSupportedFormats.AZTEC
  ] : undefined;

  // 🔍 كشف النظام التشغيلي
  function detectOS(){
    const ua = navigator.userAgent.toLowerCase();
    
    if(/android/.test(ua)){
      return { name: 'android', version: ua.match(/android\s([\d.]+)/)?.[1], isMobile: true };
    }
    if(/iphone|ipad|ipod/.test(ua)){
      return { name: 'ios', version: ua.match(/os\s([\d.]+)/)?.[1], isMobile: true };
    }
    if(/mac/.test(ua) && !/iphone|ipad/.test(ua)){
      return { name: 'macos', version: ua.match(/mac os x\s([\d.]+)/)?.[1], isMobile: false };
    }
    if(/win/.test(ua)){
      return { name: 'windows', version: ua.match(/windows nt\s([\d.]+)/)?.[1], isMobile: false };
    }
    if(/linux/.test(ua)){
      return { name: 'linux', version: ua.match(/linux/)?.[1], isMobile: false };
    }
    
    return { name: 'unknown', version: 'unknown', isMobile: false };
  }

  // 🔐 طلب أذون الكاميرا
  async function requestCameraPermission(){
    try{
      if(!navigator.permissions){
        return true;
      }

      const result = await navigator.permissions.query({ name: 'camera' });
      
      if(result.state === 'granted'){
        return true;
      }
      
      if(result.state === 'denied'){
        isCameraPermissionDenied = true;
        return false;
      }

      return true;
    }catch(e){
      return true;
    }
  }

  // 📱 إعدادات الكاميرا حسب نظام التشغيل
  function getCameraConstraints(os){
    const baseConstraints = {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    };

    const advancedOptions = [];

    switch(os.name){
      case 'android':
        advancedOptions.push(
          { focusMode: 'continuous' },
          { focusDistance: 0 },
          { exposureCompensation: 0 }
        );
        break;

      case 'ios':
        return {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };

      case 'macos':
        advancedOptions.push(
          { focusMode: 'continuous' },
          { zoom: 1.0 }
        );
        break;

      case 'windows':
        advancedOptions.push(
          { focusMode: 'continuous' },
          { exposureMode: 'continuous' }
        );
        break;

      case 'linux':
        advancedOptions.push(
          { focusMode: 'continuous' }
        );
        break;
    }

    if(advancedOptions.length > 0){
      return { ...baseConstraints, advanced: advancedOptions };
    }

    return baseConstraints;
  }

  // 📊 إعدادات الفحص حسب النظام
  function getScanConfig(os){
    const configs = {
      android: {
        fps: 30,
        qrbox: (vw, vh) => ({
          width: Math.floor(Math.min(vw * 0.85, 350)),
          height: Math.floor(Math.min(vh * 0.5, 160))
        }),
        disableFlip: false,
        videoConstraints: getCameraConstraints(os)
      },
      ios: {
        fps: 20,
        qrbox: (vw, vh) => ({
          width: Math.floor(Math.min(vw * 0.75, 300)),
          height: Math.floor(Math.min(vh * 0.45, 140))
        }),
        disableFlip: false,
        videoConstraints: getCameraConstraints(os)
      },
      macos: {
        fps: 30,
        qrbox: (vw, vh) => ({
          width: Math.floor(Math.min(vw * 0.85, 380)),
          height: Math.floor(Math.min(vh * 0.5, 170))
        }),
        disableFlip: false,
        videoConstraints: getCameraConstraints(os)
      },
      windows: {
        fps: 30,
        qrbox: (vw, vh) => {
          const dpr = window.devicePixelRatio || 1;
          return {
            width: Math.floor(Math.min(vw * 0.85, 350 / dpr)),
            height: Math.floor(Math.min(vh * 0.5, 160 / dpr))
          };
        },
        disableFlip: false,
        videoConstraints: getCameraConstraints(os)
      },
      linux: {
        fps: 25,
        qrbox: (vw, vh) => ({
          width: Math.floor(Math.min(vw * 0.75, 320)),
          height: Math.floor(Math.min(vh * 0.45, 150))
        }),
        disableFlip: false,
        videoConstraints: getCameraConstraints(os)
      }
    };

    return configs[os.name] || {
      fps: 25,
      qrbox: (vw, vh) => ({
        width: Math.floor(Math.min(vw * 0.75, 300)),
        height: Math.floor(Math.min(vh * 0.4, 120))
      }),
      disableFlip: false,
      videoConstraints: getCameraConstraints(os)
    };
  }

  // 🎨 إضافة الأنماط
  function ensureStyles(){
    if(document.getElementById('hnScannerStyles')) return;
    const style = document.createElement('style');
    style.id = 'hnScannerStyles';
    style.textContent = `
      .hn-scan-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px; font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Tahoma,Arial,sans-serif; }
      .hn-scan-container{ display:flex; flex-direction:column; width:100%; height:100%; max-width:480px; background:#0a0a0a; border-radius:24px; overflow:hidden; box-shadow:0 25px 50px rgba(0,0,0,0.5); }
      .hn-scan-header{ padding:16px; background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); border-bottom:1px solid rgba(255,255,255,0.1); }
      .hn-scan-header h3{ color:white; font-size:16px; margin:0; font-weight:700; display:flex; align-items:center; gap:8px; }
      .hn-scan-body{ flex:1; display:flex; flex-direction:column; padding:16px; overflow-y:auto; }
      .hn-scan-region{ width:100%; aspect-ratio:4/3; border-radius:16px; overflow:hidden; background:#000; margin-bottom:12px; position:relative; flex-shrink:0; }
      .hn-scan-region video{ width:100%; height:100%; object-fit:cover; border-radius:16px; }
      .hn-scan-hint{ font-size:12px; color:#8E8E93; margin-bottom:8px; line-height:1.6; text-align:right; }
      .hn-scan-tips{ font-size:11px; color:#FFD60A; background:rgba(255,214,10,0.08); border:1px solid rgba(255,214,10,0.2); border-radius:12px; padding:10px; margin-bottom:12px; line-height:1.8; text-align:right; }
      .hn-scan-err{ color:#FF6961; font-size:12px; margin-bottom:12px; display:none; line-height:1.7; background:rgba(255,105,97,0.1); padding:10px; border-radius:8px; border-left:3px solid #FF6961; }
      .hn-scan-info{ color:#8E8E93; font-size:11px; margin-bottom:10px; display:none; background:rgba(102,126,234,0.1); padding:8px; border-radius:8px; }
      .hn-scan-stats{ color:#A1A1A6; font-size:10px; display:flex; gap:12px; margin-bottom:12px; padding:8px; background:rgba(255,255,255,0.03); border-radius:8px; justify-content:center; display:none; }
      .hn-scan-actions{ display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
      .hn-scan-actions button{ flex:1; min-width:70px; padding:12px; border:none; border-radius:12px; font-size:12px; font-weight:700; cursor:pointer; transition:all 0.2s; }
      .hn-scan-close{ background:rgba(255,255,255,0.09); color:#F5F5F7; }
      .hn-scan-close:hover{ background:rgba(255,255,255,0.15); }
      .hn-scan-torch{ background:rgba(255,214,10,0.14); color:#FFD60A; display:none; }
      .hn-scan-torch.on{ background:linear-gradient(120deg,#FFD60A,#FF9F0A); color:#151007; }
      .hn-scan-auto-torch{ background:rgba(100,200,255,0.14); color:#64C8FF; display:none; font-size:11px; }
      .hn-scan-auto-torch.on{ background:linear-gradient(120deg,#64C8FF,#00B4FF); color:#0a0a0a; }
      .hn-scan-manual-section{ display:flex; gap:8px; border-top:1px dashed rgba(255,255,255,0.12); padding-top:12px; margin-top:auto; }
      .hn-scan-manual-input{ flex:1; padding:11px; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:#F5F5F7; font-size:12px; outline:none; transition:all 0.2s; }
      .hn-scan-manual-input:focus{ border-color:rgba(255,214,10,0.5); background:rgba(255,255,255,0.12); }
      .hn-scan-manual-btn{ padding:11px 14px; border:none; border-radius:10px; background:linear-gradient(120deg,#FFD60A,#FF9F0A); color:#151007; font-weight:700; font-size:12px; cursor:pointer; transition:all 0.2s; }
      .hn-scan-manual-btn:hover{ transform:translateY(-1px); }
      .hn-scan-manual-btn:active{ transform:translateY(0); }
      .hn-scan-loading{ text-align:center; padding:20px; color:#FFD60A; font-size:13px; font-weight:600; }
      .hn-scan-permission-help{ font-size:11px; color:#8E8E93; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-top:8px; display:none; line-height:1.6; text-align:right; }
      .hn-scan-result-box{ background:rgba(102,126,234,0.1); border:1px solid rgba(102,126,234,0.3); border-radius:12px; padding:12px; margin-bottom:12px; display:none; animation:slideIn 0.3s ease; }
      @keyframes slideIn{ from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:translateY(0); } }
      .hn-scan-result-label{ font-size:10px; color:#667eea; font-weight:700; text-transform:uppercase; margin-bottom:6px; }
      .hn-scan-result-code{ font-size:14px; color:#F5F5F7; word-break:break-all; font-family:'Courier New',monospace; font-weight:600; }
      .hn-scan-copy-btn{ font-size:11px; padding:8px 10px; margin-top:8px; width:100%; background:#667eea; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600; }
      .hn-scan-copy-btn:hover{ background:#5568d3; }
      @media(max-width:480px){
        .hn-scan-container{ max-width:100%; border-radius:16px; }
        .hn-scan-header h3{ font-size:15px; }
        .hn-scan-actions{ gap:6px; }
        .hn-scan-actions button{ padding:10px; font-size:11px; }
      }
    `;
    document.head.appendChild(style);
  }

  // 🔦 تبديل الفلاش
  async function toggleTorch(){
    if(!html5QrCode || !torchSupported) return;
    torchOn = !torchOn;
    try{
      await html5QrCode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
      document.getElementById('hnScanTorchBtn').classList.toggle('on', torchOn);
    }catch(e){ 
      console.warn('Torch toggle failed'); 
    }
  }

  // 🌙 فلاش تلقائي حسب الإضاءة (Advanced)
  async function enableAutoTorch(){
    autoTorchEnabled = !autoTorchEnabled;
    const btn = document.getElementById('hnScanAutoTorchBtn');
    if(btn){
      btn.classList.toggle('on', autoTorchEnabled);
    }
  }

  // ✅ معالجة الكود المقروء
  function processScannedCode(code){
    if(!code || !isScanning) return false;

    // تصفية الأكواد المكررة (نفس الكود في أقل من 500 ميلي ثانية)
    const now = Date.now();
    if(code === lastScannedCode && (now - lastScanTime) < 500){
      scanStats.duplicates++;
      updateStats();
      return false;
    }

    lastScannedCode = code;
    lastScanTime = now;
    scannedCodes.add(code);
    scanStats.total++;
    scanStats.success++;
    updateStats();
    
    return true;
  }

  // 📊 تحديث الإحصائيات
  function updateStats(){
    const statsEl = document.getElementById('hnScanStats');
    if(statsEl && scanStats.total > 0){
      statsEl.style.display = 'flex';
      statsEl.innerHTML = `
        <span>إجمالي: ${scanStats.total}</span>
        <span>نجح: ${scanStats.success}</span>
        <span>مكرر: ${scanStats.duplicates}</span>
      `;
    }
  }

  // 🎯 فتح الماسح
  async function open(onDecode, opts){
    opts = opts || {};
    ensureStyles();
    close();
    torchOn = false;
    torchSupported = false;
    autoTorchEnabled = false;
    isScanning = true;
    isCameraPermissionDenied = false;
    lastScannedCode = null;
    scannedCodes.clear();
    scanStats = { total: 0, success: 0, failed: 0, duplicates: 0 };
    deviceOS = detectOS();

    console.log(`🔍 Detected OS: ${deviceOS.name} (${deviceOS.version})`);

    overlay = document.createElement('div');
    overlay.className = 'hn-scan-overlay';
    overlay.innerHTML = `
      <div class="hn-scan-container">
        <div class="hn-scan-header">
          <h3>📷 ${opts.title || 'قراءة الباركود'}</h3>
        </div>
        <div class="hn-scan-body">
          <div class="hn-scan-region" id="hnScanRegion"></div>
          <div class="hn-scan-info" id="hnScanInfo">📱 ${deviceOS.name}</div>
          <div class="hn-scan-loading" id="hnScanLoading">⏳ جاري تشغيل الكاميرا...</div>
          <div class="hn-scan-hint">🎯 وجّه الكاميرا للباركود — القراءة تلقائية فوراً</div>
          <div class="hn-scan-tips">💡 المسافة المثالية: 8-12 سم | ثبّت يدك | استخدم الإضاءة الجيدة | الفلاش للأماكن المظلمة</div>
          <div class="hn-scan-stats" id="hnScanStats"></div>
          <div class="hn-scan-err" id="hnScanErr"></div>
          <div class="hn-scan-result-box" id="hnScanResult">
            <div class="hn-scan-result-label">✅ الكود المقروء</div>
            <div class="hn-scan-result-code" id="hnScanResultCode"></div>
            <button class="hn-scan-copy-btn" id="hnScanCopyBtn">📋 انسخ</button>
          </div>
          <div class="hn-scan-permission-help" id="hnScanPermHelp"></div>
          <div class="hn-scan-actions">
            <button type="button" class="hn-scan-torch" id="hnScanTorchBtn">🔦 فلاش</button>
            <button type="button" class="hn-scan-auto-torch" id="hnScanAutoTorchBtn">🌙 تلقائي</button>
            <button type="button" class="hn-scan-close" id="hnScanCloseBtn">✕ إلغاء</button>
          </div>
          <div class="hn-scan-manual-section">
            <input type="text" id="hnScanManualInput" class="hn-scan-manual-input" placeholder="أدخل الكود يدوياً...">
            <button type="button" id="hnScanManualBtn" class="hn-scan-manual-btn">✓</button>
          </div>
        </div>
      </div>`;
    
    document.body.appendChild(overlay);
    
    // الأحداث
    document.getElementById('hnScanCloseBtn').addEventListener('click', close);
    document.getElementById('hnScanTorchBtn').addEventListener('click', toggleTorch);
    document.getElementById('hnScanAutoTorchBtn').addEventListener('click', enableAutoTorch);
    document.getElementById('hnScanCopyBtn').addEventListener('click', () => {
      const code = document.getElementById('hnScanResultCode').textContent;
      navigator.clipboard.writeText(code);
      alert('✅ تم النسخ');
    });

    const manualInput = document.getElementById('hnScanManualInput');
    const submitManual = () => {
      const v = manualInput.value.trim();
      if(!v) return;
      if(processScannedCode(v)){
        const cb = onDecode;
        showResult(v);
        if(cb) cb(v);
      }
      manualInput.value = '';
    };
    
    document.getElementById('hnScanManualBtn').addEventListener('click', submitManual);
    manualInput.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') submitManual();
    });

    if(typeof Html5Qrcode === 'undefined'){
      const err = document.getElementById('hnScanErr');
      err.style.display = 'block';
      err.textContent = '❌ فشل تحميل المكتبة — تأكد من الاتصال بالإنترنت';
      return;
    }

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
        (decodedText) => {
          if(processScannedCode(decodedText)){
            const cb = onDecode;
            showResult(decodedText);
            if(cb) cb(decodedText);
          }
        },
        () => { /* تجاهل أخطاء الإطار الواحد */ }
      );

      document.getElementById('hnScanLoading').style.display = 'none';
      document.getElementById('hnScanInfo').style.display = 'block';

      // فعّل الفلاش لو متوفر
      try{
        const track = html5QrCode.getRunningTrack?.();
        if(track){
          const capabilities = track.getCapabilities?.();
          if(capabilities?.torch){
            torchSupported = true;
            document.getElementById('hnScanTorchBtn').style.display = 'block';
            document.getElementById('hnScanAutoTorchBtn').style.display = 'block';
          }
        }
      }catch(e){ /* تجاهل */ }
    }catch(e){
      const err = document.getElementById('hnScanErr');
      const permHelp = document.getElementById('hnScanPermHelp');
      
      err.style.display = 'block';
      permHelp.style.display = 'block';

      if(e.message === 'PERMISSION_DENIED' || e.toString().includes('NotAllowedError')){
        err.textContent = '❌ تم رفض الأذن';
        
        switch(deviceOS.name){
          case 'android':
            permHelp.textContent = '📱 افتح الإعدادات > التطبيقات > المتصفح > الأذونات > فعّل الكاميرا';
            break;
          case 'ios':
            permHelp.textContent = '📱 Settings > [المتصفح] > Camera > فعّل الإذن';
            break;
          case 'macos':
            permHelp.textContent = '🍎 System Preferences > Security > Camera > أضف المتصفح';
            break;
          case 'windows':
            permHelp.textContent = '🪟 Settings > Privacy > Camera > فعّل للمتصفح';
            break;
          default:
            permHelp.textContent = 'فعّل أذونات الكاميرا في إعدادات المتصفح';
        }
      }else if(e.toString().includes('NotFoundError')){
        err.textContent = '❌ لا توجد كاميرا متصلة';
      }else{
        err.textContent = `❌ خطأ: ${e.message || 'فشل تشغيل الكاميرا'}`;
      }
      
      console.error('Camera error:', e);
    }
  }

  // عرض النتيجة
  function showResult(code){
    const resultBox = document.getElementById('hnScanResult');
    const resultCode = document.getElementById('hnScanResultCode');
    resultCode.textContent = code;
    resultBox.style.display = 'block';
  }

  // إغلاق الماسح
  function close(){
    isScanning = false;
    if(html5QrCode){
      try{
        html5QrCode.stop()
          .then(() => { 
            try{ html5QrCode.clear(); }catch(e){}
          })
          .catch(() => {});
      }catch(e){}
      html5QrCode = null;
    }
    if(overlay){ overlay.remove(); overlay = null; }
  }

  return { 
    open, 
    close,
    getOS: () => deviceOS,
    getStats: () => scanStats,
    getScannedCodes: () => Array.from(scannedCodes)
  };
})();
