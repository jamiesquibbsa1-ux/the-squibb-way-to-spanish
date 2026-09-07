from pathlib import Path
import base64, gzip, json, re, shutil, subprocess

root=Path('.')
assets=root/'app/src/main/assets'
dist=root/'dist'
dist.mkdir(exist_ok=True)

# Rebuild the original full app from the repository chunks.
b64=''.join(p.read_text(encoding='utf-8').strip() for p in sorted(assets.glob('index.part*.b64')))
html=gzip.decompress(base64.b64decode(b64)).decode('utf-8')
(assets/'index.html').write_text(html,encoding='utf-8')

# Inject the shared Squibb League module used by Android.
subprocess.run(['python3','tools/enable_shared_league.py'],check=True)
html=(assets/'index.html').read_text(encoding='utf-8')

# PWA metadata and helper script.
if 'manifest.webmanifest' not in html:
    html=html.replace('</head>','''<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#c50020">
<meta name="application-name" content="The Squibb Way to Spanish">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Squibb Spanish">
<script defer src="pwa.js"></script>
</head>''',1)

(dist/'index.html').write_text(html,encoding='utf-8')
for f in ['league.js','league.css','cloud-config.js']:
    shutil.copy2(assets/f,dist/f)

# Use the exact crest embedded in the app as the installed app icon.
m=re.search(r'data:image/png;base64,([^"\']+)',html)
if not m:
    raise SystemExit('Could not find embedded Squibb crest')
(dist/'icon.png').write_bytes(base64.b64decode(m.group(1)))

manifest={
  'id':'./','name':'The Squibb Way to Spanish','short_name':'Squibb Spanish',
  'description':'Football-style Spanish learning with shared Squibb League progress.',
  'start_url':'./','scope':'./','display':'standalone','orientation':'portrait-primary',
  'background_color':'#08090b','theme_color':'#c50020','lang':'en-GB',
  'icons':[{'src':'icon.png','sizes':'any','type':'image/png','purpose':'any maskable'}]
}
(dist/'manifest.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')

(dist/'sw.js').write_text('''const C="squibb-spanish-web-v1";\nconst A=["./","./index.html","./league.js","./league.css","./cloud-config.js","./manifest.webmanifest","./icon.png","./pwa.js"];\nself.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting())));\nself.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));\nself.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(fetch(e.request).then(r=>{const x=r.clone();caches.open(C).then(c=>c.put(e.request,x));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("./index.html"))))});\n''',encoding='utf-8')

(dist/'pwa.js').write_text('''let deferredInstall=null;\nif("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}\nwindow.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;if(document.getElementById("squibbInstall"))return;const b=document.createElement("button");b.id="squibbInstall";b.textContent="📲 Install Squibb Spanish";b.style.cssText="position:fixed;right:14px;bottom:88px;z-index:9999;background:#c50020;color:#fff;border:2px solid #fff;border-radius:999px;padding:12px 16px;font-weight:900;box-shadow:0 8px 24px #0008";b.onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;b.remove()};document.body.appendChild(b);});\nwindow.addEventListener("appinstalled",()=>{const b=document.getElementById("squibbInstall");if(b)b.remove();});\n''',encoding='utf-8')

print('Built installable Squibb Spanish PWA in dist/')
