/* WinFulltime PWA - Install Prompt + Service Worker Registration */
(function() {
 'use strict';

 // --- Service Worker Registration ---
 if ('serviceWorker' in navigator) {
   window.addEventListener('load', () => {
     navigator.serviceWorker.register('/sw.js').catch(() => {});
   });
 }

 // --- Install Prompt Banner ---
 let deferredPrompt = null;
 const DISMISSED_KEY = 'wf_pwa_dismissed';
 const DISMISSED_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

 // Don't show if already dismissed recently
 function wasDismissed() {
   const val = localStorage.getItem(DISMISSED_KEY);
   if (!val) return false;
   return (Date.now() - parseInt(val, 10)) < DISMISSED_DURATION;
 }

 function markDismissed() {
   localStorage.setItem(DISMISSED_KEY, String(Date.now()));
 }

 // Don't show if already running as installed PWA
 function isStandalone() {
   return window.matchMedia('(display-mode: standalone)').matches ||
          window.navigator.standalone === true;
 }

 // Create and inject the install banner
 function createBanner() {
   if (isStandalone() || wasDismissed()) return;

   const banner = document.createElement('div');
   banner.id = 'pwa-install-banner';
   banner.innerHTML = `
     <style>
       #pwa-install-banner {
         position: fixed;
         bottom: 0;
         left: 0;
         right: 0;
         z-index: 9999;
         padding: 16px 20px;
         padding-bottom: calc(16px + env(safe-area-inset-bottom, 0));
         background: linear-gradient(135deg, #141820 0%, #1a1f30 100%);
         border-top: 1px solid rgba(255,36,72,0.2);
         display: flex;
         align-items: center;
         gap: 14px;
         box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
         animation: pwaSlideUp 0.4s cubic-bezier(0.4,0,0.2,1);
         font-family: 'Inter', system-ui, -apple-system, sans-serif;
       }
       @keyframes pwaSlideUp {
         from { transform: translateY(100%); opacity: 0; }
         to { transform: translateY(0); opacity: 1; }
       }
       #pwa-install-banner .pwa-icon {
         width: 44px;
         height: 44px;
         border-radius: 12px;
         object-fit: cover;
         flex-shrink: 0;
       }
       #pwa-install-banner .pwa-text {
         flex: 1;
         min-width: 0;
       }
       #pwa-install-banner .pwa-title {
         font-size: 15px;
         font-weight: 700;
         color: #e8edf5;
         margin-bottom: 2px;
       }
       #pwa-install-banner .pwa-desc {
         font-size: 13px;
         color: #64748b;
         line-height: 1.4;
       }
       #pwa-install-banner .pwa-actions {
         display: flex;
         gap: 8px;
         flex-shrink: 0;
       }
       #pwa-install-banner .pwa-install-btn {
         padding: 10px 20px;
         background: linear-gradient(135deg, #ff2448, #d41a38);
         color: white;
         border: none;
         border-radius: 10px;
         font-size: 14px;
         font-weight: 700;
         cursor: pointer;
         white-space: nowrap;
         transition: transform 0.15s;
       }
       #pwa-install-banner .pwa-install-btn:hover {
         transform: scale(1.03);
       }
       #pwa-install-banner .pwa-dismiss {
         background: none;
         border: none;
         color: #64748b;
         font-size: 20px;
         cursor: pointer;
         padding: 8px;
         line-height: 1;
         border-radius: 8px;
         transition: all 0.15s;
       }
       #pwa-install-banner .pwa-dismiss:hover {
         color: #e8edf5;
         background: rgba(255,255,255,0.06);
       }
       @media (max-width: 480px) {
         #pwa-install-banner { flex-wrap: wrap; }
         #pwa-install-banner .pwa-actions { width: 100%; justify-content: flex-end; }
       }
     </style>
     <img src="/icons/icon-192.png" alt="" class="pwa-icon">
     <div class="pwa-text">
       <div class="pwa-title">Install WinFulltime</div>
       <div class="pwa-desc">Add to your home screen for instant access to predictions.</div>
     </div>
     <div class="pwa-actions">
       <button class="pwa-install-btn" id="pwa-install-btn">Install</button>
       <button class="pwa-dismiss" id="pwa-dismiss-btn">&times;</button>
     </div>
   `;
   document.body.appendChild(banner);

   document.getElementById('pwa-install-btn').addEventListener('click', async () => {
     if (!deferredPrompt) return;
     deferredPrompt.prompt();
     const { outcome } = await deferredPrompt.userChoice;
     deferredPrompt = null;
     banner.remove();
     if (outcome === 'accepted') {
       // Installed successfully
     }
   });

   document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
     banner.remove();
     markDismissed();
   });
 }

 // Listen for the browser prompt
 window.addEventListener('beforeinstallprompt', (e) => {
   e.preventDefault();
   deferredPrompt = e;
   setTimeout(createBanner, 1500);
 });

 // Handle successful install
 window.addEventListener('appinstalled', () => {
   deferredPrompt = null;
   const banner = document.getElementById('pwa-install-banner');
   if (banner) banner.remove();
 });

})();
