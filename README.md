# Komáři 🦟 – plácni je dřív, než štípnou!

Arkádová hra s plácačkou pro děti i dospělé. Součást rodiny aplikací na
[garon92.github.io](https://garon92.github.io/) (sdílený design systém *g92 kit*).

Živě: <https://garon92.github.io/komari/>

## Jak se hraje

- **Klikni / ťukni na komára** – plesk! Trefit můžeš i víc komárů jednou ranou (dvojplesk, trojplesk…).
- Komár, který dlouho nedostal ránu, **dostane hlad**: zvětšuje se, letí na tebe a kolem něj je
  **červený kruh s vykřičníkem**. Když ho nestihneš, štípne tě a vezme ti srdíčko.
  Štípal pak zčervená a pomalu odlétá – když ho dohoníš, srdíčko se vrátí.
- **Kombo**: rychlé zásahy za sebou bez minutí násobí body (×2 až ×5).
- Po komárech občas zůstane **bublina s vylepšením** – plácni na ni.

### Režimy

| režim | popis |
|---|---|
| **Vlny** | Vlna za vlnou s rostoucí obtížností. Každá 5. vlna je souboj s **královnou**. Scény se střídají: kuchyň → zahrada za soumraku → ložnice v noci → stan u rybníka. |
| **Minutovka** | 60 vteřin, co nejvíc bodů. Štípnutí bere 3 vteřiny. |
| **Pohoda** | Pro nejmenší: nikdo neštípe, žádný spěch. |

Obtížnost: **Snadná** (5 srdíček, větší plácačka, minutí nekazí kombo), **Normální**, **Těžká**.

### Komáři

Komár · Rychlík (rychlý) · Tygřík (cik-cak) · Nindža (zneviditelňuje se) · Tlouštík (3 rány) ·
Zlatý komár (vzácný, dává vylepšení) · Královna (boss, vypouští komáry).

### Vylepšení

Velká plácačka · Elektrická plácačka (blesk přeskakuje na další komáry) · Sprej (obláček) ·
UV lampa (láká a zapaluje komáry, svítí ve tmě) · Síť (chrání před štípnutím) · Mráz (zpomalí) ·
Srdíčko (+1 život) · Hodiny (+5 s v Minutovce).

### Ovládání

| | |
|---|---|
| myš / dotyk | plácnutí (na dotyku je zásahová plocha větší) |
| šipky / WASD | posun plácačky klávesnicí |
| Enter / X / K | plácnout |
| Esc / P / mezerník | pauza |
| R | hrát znovu |
| F | celá obrazovka |
| M | zvuk zap/vyp |

Hra se sama pozastaví, když přepneš záložku nebo okno.

### Úspěchy a plácačky

21 úspěchů (např. *Dvojplesk*, *Přemožitel královny*, *Bez štípance*, *Tisícovka*). Některé odemykají nové
tvary a barvy plácačky (Srdíčko, Hvězda, Zlatá…). Rekordy se ukládají zvlášť pro každý režim a obtížnost.
Za všechny zaplácnuté komáry roste **hodnost lovce** (Nováček → Plácal → Lovec komárů → Postrach komárů →
Mistr plácačky → Legenda → Komáří noční můra).
Ve výchozím stavu je hra pohádková: zaplácnutý komár udělá „pof!“ s hvězdičkami. Starší hráči si v nastavení (⚙)
mohou zapnout realistické krvavé fleky; v Pohodě (pro nejmenší) se krev neukazuje nikdy. Bzučení komárů jde vypnout.

## Vývoj

Vite 8 + TypeScript (strict) + vite-plugin-pwa, bez frameworku. Canvas 2D s ostrým vykreslením
(devicePixelRatio), všechny zvuky syntetizované přes WebAudio (bzučení sleduje nejbližší komáry).

```bash
npm install
npm run dev        # http://localhost:5176/komari/
npm run typecheck
npm test           # Vitest – vlny, skórování, zásahy, herní smyčka, uložení, úspěchy
npm run build      # → dist/
npm run preview
```

Struktura `src/`:

- `game/` – čistá herní logika (konfigurace, vlny, skórování, hit-testing, pohyb komárů, stav hry)
- `render/` – scény, komáři (sprity), fleky, plácačka, efekty, tma a světla
- `audio/` – syntetizované zvuky a bzučení
- `ui/` – HUD, obrazovky (přes kit overlay/dialog)
- `kit/` – vendorovaný g92 kit (**needitovat**, synchronizuje se `menu/kit/sync.sh`)

Ladicí háček: `?debug` v URL zpřístupní `window.__komari` (stav hry, `swat(x, y)`, `jump(vlna)`…).
Skripty `scripts/playtest.mjs`, `scripts/keyboard.mjs`, `scripts/shots.mjs`, `scripts/landscape.mjs` a `scripts/scenes.mjs` hru headless „hrají“ a fotí (playwright-core). Balanční simulace: `BALANCE=1 npx vitest run src/game/balance.test.ts`.

Nasazení: GitHub Actions (`.github/workflows/deploy.yml`) → GitHub Pages.
