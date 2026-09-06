from pathlib import Path

index=Path('app/src/main/assets/index.html')
section=Path('app/src/main/assets/league_section.html').read_text(encoding='utf-8')
text=index.read_text(encoding='utf-8')

if 'data-tab="league"' not in text:
    text=text.replace(
        '<button data-tab="road"><span>🏆</span>Road</button>\n    <button data-tab="locker"><span>👕</span>Locker</button>',
        '<button data-tab="road"><span>🏆</span>Road</button>\n    <button data-tab="league"><span>📊</span>League</button>\n    <button data-tab="locker"><span>👕</span>Locker</button>'
    )
    text=text.replace('  <section id="locker" class="hidden">',section+'\n  <section id="locker" class="hidden">',1)
    text=text.replace('["home","training","match","road","locker"]','["home","training","match","road","league","locker"]')
    text=text.replace(
        'if(tab==="home")renderHome();if(tab==="training")renderTrainingIntro();if(tab==="match")renderMatchMenu();if(tab==="road")renderRoad();if(tab==="locker")renderLocker();',
        'if(tab==="home")renderHome();if(tab==="training")renderTrainingIntro();if(tab==="match")renderMatchMenu();if(tab==="road")renderRoad();if(tab==="league")renderSharedLeague();if(tab==="locker")renderLocker();'
    )
    text=text.replace(
        'const save=()=>localStorage.setItem(STORE,JSON.stringify(state));',
        'const save=()=>{localStorage.setItem(STORE,JSON.stringify(state));if(window.scheduleCloudSync)window.scheduleCloudSync();};'
    )

if 'league.css' not in text:
    text=text.replace('</head>','<link rel="stylesheet" href="league.css">\n<script src="cloud-config.js"></script>\n</head>',1)
if 'league.js' not in text:
    text=text.replace('</body>','<script src="league.js"></script>\n</body>',1)

index.write_text(text,encoding='utf-8')
print('Shared Squibb League module enabled')
