/* WinFulltime PWA - Install Prompt + Service Worker Registration + Push Notifications */
(function() {
 'use strict';

 const API_BASE = window.WFT_API || 'https://winfulltime-api.onrender.com';
 const PUSH_SUBSCRIBED_KEY = 'wf-push-subscribed';
 const PUSH_DISMISSED_KEY = 'wf-push-dismissed';
 const PUSH_DISMISSED_DURATION = 7 * 24 * 60 * 60 * 1000;

 // --- Service Worker Registration ---
 let swRegistration = null;
 if ('serviceWorker' in navigator) {
   window.addEventListener('load', () => {
     navigator.serviceWorker.register('/sw.js').then(reg => {
       swRegistration = reg;
     }).catch(() => {});
   });
 }

 // --- Push Notification Helpers ---
 async function getVapidKey() {
   try {
     const res = await fetch(API_BASE + '/api/push/vapid-public-key');
     if (!res.ok) return null;
     const data = await res.json();
     return data.publicKey;
   } catch { return null; }
 }

 function urlBase64ToUint8Array(base64String) {
   const padding = '='.repeat((4 - base64String.length % 4) % 4);
   const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
   const rawData = window.atob(base64);
   const outputArray = new Uint8Array(rawData.length);
   for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
   return outputArray;
 }

 async function subscribeToPush() {
   if (!swRegistration || !('pushManager' in swRegistration)) return false;
   if (!('Notification' in window)) return false;
   if (Notification.permission === 'denied') return false;

   if (Notification.permission === 'default') {
     const perm = await Notification.requestPermission();
     if (perm !== 'granted') return false;
   }

   const vapidKey = await getVapidKey();
   if (!vapidKey) return false;

   try {
     const sub = await swRegistration.pushManager.subscribe({
       userVisibleOnly: true,
       applicationServerKey: urlBase64ToUint8Array(vapidKey)
     });
     const json = sub.toJSON();
     await fetch(API_BASE + '/api/push/subscribe', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys })
     });
     localStorage.setItem(PUSH_SUBSCRIBED_KEY, 'true');
     localStorage.removeItem(PUSH_DISMISSED_KEY);
     return true;
   } catch {
     return false;
   }
 }

 async function unsubscribeFromPush() {
   if (!swRegistration || !('pushManager' in swRegistration)) return false;
   try {
     const sub = await swRegistration.pushManager.getSubscription();
     if (!sub) {
       localStorage.removeItem(PUSH_SUBSCRIBED_KEY);
       return true;
     }
     const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch(API_BASE + '/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint })
    });
    localStorage.removeItem(PUSH_SUBSCRIBED_KEY);
    return true;
  } catch {
    return false;
  }
 }

 async function isPushSubscribed() {
   if (!swRegistration || !('pushManager' in swRegistration)) return false;
   try {
     const sub = await swRegistration.pushManager.getSubscription();
     return !!sub;
   } catch { return false; }
 }

 function pushDismissed() {
   const val = localStorage.getItem(PUSH_DISMISSED_KEY);
   if (!val) return false;
   return (Date.now() - parseInt(val, 10)) < PUSH_DISMISSED_DURATION;
 }

 function markPushDismissed() {
   localStorage.setItem(PUSH_DISMISSED_KEY, String(Date.now()));
 }

 // Expose for app.html toggle
 window.WFTPush = {
   subscribe: subscribeToPush,
   unsubscribe: unsubscribeFromPush,
   isSubscribed: isPushSubscribed
 };

 // --- Push Notification Banner ---
 function createPushBanner() {
   if (pushDismissed()) return;
   if (localStorage.getItem(PUSH_SUBSCRIBED_KEY) === 'true') return;
   if (!('Notification' in window)) return;
   if (Notification.permission === 'denied') return;

   // Wait for SW registration to be ready
   const checkReg = setInterval(() => {
     if (swRegistration) {
       clearInterval(checkReg);
       isPushSubscribed().then(subscribed => {
         if (subscribed) {
           localStorage.setItem(PUSH_SUBSCRIBED_KEY, 'true');
           return;
         }
         showPushBanner();
       });
     }
   }, 500);
   setTimeout(() => clearInterval(checkReg), 10000);
 }

 function showPushBanner() {
   if (document.getElementById('wf-push-banner')) return;

   const banner = document.createElement('div');
   banner.id = 'wf-push-banner';
   banner.innerHTML = `
     <style>
       #wf-push-banner {
         position: fixed;
         bottom: 0;
         left: 0;
         right: 0;
         z-index: 9999999;
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
       #wf-push-banner .push-icon {
         width: 44px;
         height: 44px;
         border-radius: 12px;
         object-fit: cover;
         flex-shrink: 0;
       }
       #wf-push-banner .push-text {
         flex: 1;
         min-width: 0;
       }
       #wf-push-banner .push-title {
         font-size: 15px;
         font-weight: 700;
         color: #e8edf5;
         margin-bottom: 2px;
       }
       #wf-push-banner .push-desc {
         font-size: 13px;
         color: #ffffff;
         line-height: 1.4;
         opacity: 0.9;
       }
       #wf-push-banner .push-actions {
         display: flex;
         gap: 8px;
         flex-shrink: 0;
       }
       #wf-push-banner .push-enable-btn {
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
       #wf-push-banner .push-enable-btn:hover {
         transform: scale(1.03);
       }
       #wf-push-banner .push-dismiss {
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
       #wf-push-banner .push-dismiss:hover {
         color: #e8edf5;
         background: rgba(255,255,255,0.06);
       }
       @media (max-width: 480px) {
         #wf-push-banner { flex-wrap: wrap; }
         #wf-push-banner .push-actions { width: 100%; justify-content: flex-end; }
       }
     </style>
     <img src="/icons/icon-192.png" alt="" class="push-icon">
     <div class="push-text">
       <div class="push-title">Daily Prediction Alerts</div>
       <div class="push-desc">Get notified when today's predictions are ready.</div>
     </div>
     <div class="push-actions">
       <button class="push-enable-btn" id="wf-push-enable-btn">Enable</button>
       <button class="push-dismiss" id="wf-push-dismiss-btn">&times;</button>
     </div>
   `;
   document.body.appendChild(banner);

   document.getElementById('wf-push-enable-btn').addEventListener('click', async () => {
     const btn = document.getElementById('wf-push-enable-btn');
     btn.textContent = 'Enabling...';
     btn.disabled = true;
     const ok = await subscribeToPush();
     banner.remove();
     if (ok) showChatBubble();
   });

   document.getElementById('wf-push-dismiss-btn').addEventListener('click', () => {
     banner.remove();
     showChatBubble();
     markPushDismissed();
   });
 }

 // --- Install Prompt Banner ---
 let deferredPrompt = null;
 const DISMISSED_KEY = 'wf_pwa_dismissed';
  const DISMISSED_DURATION = 24 * 60 * 60 * 1000;
 const isBeforeInstallPromptSupported = 'onbeforeinstallprompt' in window;

 function wasDismissed() {
   const val = localStorage.getItem(DISMISSED_KEY);
   if (!val) return false;
   return (Date.now() - parseInt(val, 10)) < DISMISSED_DURATION;
 }

 function markDismissed() {
   localStorage.setItem(DISMISSED_KEY, String(Date.now()));
 }

 function isStandalone() {
   return window.matchMedia('(display-mode: standalone)').matches ||
          window.navigator.standalone === true;
 }

 function hideChatBubble() {
   const bubble = document.querySelector('.wf-chat-bubble');
   if (bubble) bubble.style.display = 'none';
 }
 function showChatBubble() {
   const bubble = document.querySelector('.wf-chat-bubble');
   if (bubble) bubble.style.display = '';
 }

 function showBannerOnFirefox() {
   const banner = document.getElementById('pwa-install-banner');
   if (!banner) return;
   banner.querySelector('.pwa-desc').textContent = 'Open browser menu and tap "Add to Home Screen".';
   const btn = document.getElementById('pwa-install-btn');
   btn.textContent = 'How to Install';
   btn.onclick = () => {
     banner.remove();
     showChatBubble();
     markDismissed();
     window.open('/app.html', '_blank');
   };
 }

 function createBanner() {
   if (isStandalone() || wasDismissed()) return;

   hideChatBubble();

   const banner = document.createElement('div');
   banner.id = 'pwa-install-banner';
   banner.innerHTML = `
     <style>
       #pwa-install-banner {
         position: fixed;
         bottom: 0;
         left: 0;
         right: 0;
         z-index: 9999999;
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
         color: #ffffff;
         line-height: 1.4;
         opacity: 0.9;
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
     if (deferredPrompt) {
       deferredPrompt.prompt();
       const { outcome } = await deferredPrompt.userChoice;
       deferredPrompt = null;
       banner.remove();
       showChatBubble();
     }
   });

   document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
     banner.remove();
     showChatBubble();
     markDismissed();
   });

   if (!isBeforeInstallPromptSupported) {
     showBannerOnFirefox();
   }
 }

 // Chrome/Edge/Samsung: wait for browser install prompt
 window.addEventListener('beforeinstallprompt', (e) => {
   e.preventDefault();
   deferredPrompt = e;
   setTimeout(createBanner, 1500);
 });

 // Firefox etc: show banner directly after page load
 if (!isBeforeInstallPromptSupported && 'serviceWorker' in navigator) {
   window.addEventListener('load', () => {
     setTimeout(createBanner, 2000);
   });
 }

 // After PWA install, show push notification banner
 window.addEventListener('appinstalled', () => {
   deferredPrompt = null;
   const banner = document.getElementById('pwa-install-banner');
   if (banner) banner.remove();
   showChatBubble();
   setTimeout(createPushBanner, 1500);
 });

 // If already standalone, show push banner after load
 window.addEventListener('load', () => {
   if (isStandalone()) {
     setTimeout(createPushBanner, 3000);
   }
 });

})();
