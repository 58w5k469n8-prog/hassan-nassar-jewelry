/* =========================================================
   HNScanner — نافذة موحّدة لقراءة الباركود من كاميرا الهاتف/اللاب توب
   تستخدم مكتبة html5-qrcode (يجب تحميلها في <head> قبل هذا الملف)
   الاستخدام: HNScanner.open(function(code){ ... }, {title:'...'})
========================================================= */
const HNScanner = (function(){
  let html5QrCode = null;
  let overlay = null;

  function ensureStyles(){
    if(document.getElementById('hnScannerStyles')) return;
    const style = document.createElement('style');
    style.id = 'hnScannerStyles';
    style.textContent = `
      .hn-scan-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.86); z-index:600; display:flex; align-items:center; justify-content:center; padding:20px; }
      .hn-scan-box{ background:#111114; border:1px solid rgba(255,255,255,0.12); border-radius:18px; max-width:420px; width:100%; padding:18px;
        text-align:center; font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Tahoma,Arial,sans-serif; color:#F5F5F7; }
      .hn-scan-box h3{ font-size:15px; margin-bottom:10px; font-weight:700; }
      .hn-scan-region{ width:100%; border-radius:12px; overflow:hidden; background:#000; margin-bottom:12px; min-height:230px; }
      .hn-scan-region video{ border-radius:12px; }
      .hn-scan-hint{ font-size:11.5px; color:#8E8E93; margin-bottom:12px; line-height:1.7; }
      .hn-scan-err{ color:#FF6961; font-size:12px; margin-bottom:12px; display:none; line-height:1.7; }
      .hn-scan-actions{ display:flex; gap:8px; }
      .hn-scan-actions button{ flex:1; padding:11px; border:none; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; }
      .hn-scan-close{ background:rgba(255,255,255,0.09); color:#F5F5F7; }
    `;
    document.head.appendChild(style);
  }

  async function open(onDecode, opts){
    opts = opts || {};
    ensureStyles();
    close(); // اقفل أي نافذة مسح سابقة لو فاضلة مفتوحة

    overlay = document.createElement('div');
    overlay.className = 'hn-scan-overlay';
    overlay.innerHTML = `
      <div class="hn-scan-box">
        <h3>📷 ${opts.title || 'وجّه الكاميرا نحو الباركود'}</h3>
        <div class="hn-scan-region" id="hnScanRegion"></div>
        <div class="hn-scan-hint">هيتم قراءة الباركود تلقائياً بمجرد ظهوره واضحاً أمام الكاميرا</div>
        <div class="hn-scan-err" id="hnScanErr"></div>
        <div class="hn-scan-actions">
          <button type="button" class="hn-scan-close" id="hnScanCloseBtn">إلغاء</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('hnScanCloseBtn').addEventListener('click', close);

    if(typeof Html5Qrcode === 'undefined'){
      const err = document.getElementById('hnScanErr');
      err.style.display = 'block';
      err.textContent = 'تعذر تحميل مكتبة قراءة الباركود — تأكد من الاتصال بالإنترنت وحاول تاني';
      return;
    }

    try{
      html5QrCode = new Html5Qrcode('hnScanRegion');
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 160 } },
        (decodedText)=>{
          const cb = onDecode;
          close();
          if(cb) cb(decodedText);
        },
        ()=>{ /* فشل قراءة إطار واحد — طبيعي أثناء البحث عن الباركود، بيتجاهل */ }
      );
    }catch(e){
      const err = document.getElementById('hnScanErr');
      err.style.display = 'block';
      err.textContent = 'تعذر تشغيل الكاميرا — تأكد من السماح للمتصفح بالوصول للكاميرا من إعدادات الجهاز';
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