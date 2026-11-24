# Bygg och provspela en bana

Bygg med `dunder build -o build/storm` från reporoten. MCP-klienten startar binären med `--mcp` och håller anslutningen öppen under arbetet. [Projektkonfiguration](../.mcp.json)

Om klientens arbetskatalog ligger utanför Storm, ange den absoluta sökvägen till binären i klientens serverkonfiguration. Relativa scenfiler läses och skrivs i serverns arbetskatalog. Varje anslutning har en egen spelvärld i minnet. [MCP:s stdio-transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

För att följa agentens bygge i ett öppet fönster, spara en första bana och kör `./build/storm --scene bana.storm.json --watch`. Storm läser ändringar inom en halv sekund. Ett lyckat byte startar den redigerade nivån vid tick noll. Om en ofullständig fil dyker upp visar fönstret ett fel och låter den tidigare nivån fortsätta.

## Plocka buketten

I Blomsterskogen vinner Vallmo när den femte blomman är plockad. Tre bonusfjärilar väntar ovanför marken och kan samlas både före och efter vinsten. I spelfönstret styr du med **WASD** eller **piltangenterna**. Tryck **mellanslag** för att hoppa och håll riktningen tills du är över nästa moln. Molnen bär Vallmo vid landning ovanifrån. Det rosa Studsmolnet ger automatiskt en högre studs.

## Spela till mål med verktygen

Tabellen följer spelets test för buketten. Efter varje rad med rörelse skickar du också `storm_step` med `{"ticks":3}`, så att Vallmo står stilla i tre tick. Med de fem pauserna är slutläget tick 249. [Speltesterna](../packages/storm-play/tests/suite.ddr)

| Verktyg | Argument | Efter anropet |
| --- | --- | --- |
| `storm_new` | `{"template":"demo"}` | Vallmo står i gläntan med 0 av 5 blommor |
| `storm_step` | `{"x":-1,"ticks":27}` | 1 blomma |
| `storm_step` | `{"x":1,"z":-0.25,"ticks":54}` | 2 blommor |
| `storm_step` | `{"x":-1,"z":-0.385,"ticks":68}` | 3 blommor |
| `storm_step` | `{"x":1,"z":-0.22,"ticks":40}` | 4 blommor |
| `storm_step` | `{"x":1,"z":0.14,"ticks":45}` | 5 blommor, `won` är `true` |
| `storm_preview` | `{}` | En PNG av buketten och räven i den aktuella bildrutan |
| `storm_save` | `{"path":"bana.storm.json"}` | Banans startläge sparas på disk |

![Vallmo bär den färdiga buketten i agentens spelbild](buketten.png)

Starta den sparade banan med `./build/storm --scene bana.storm.json`. En ny agent kan öppna den med `storm_load`. `storm_reset` återställer spelaren och alla kroppar till banans startläge och sätter tillbaka blommorna och fjärilarna. `flowers` och `total_flowers` visar bukettens framsteg. `butterflies` och `total_butterflies` visar bonusen. På varje blomma och bonusfjäril visar `entities[].collected` om Vallmo har plockat den. `storm_inspect` ger position, hastighet, markkontakt och antal kontaktpar. Med `{"view":"scene"}` får agenten den redigerbara banan.

## Hoppa till Kronbalkongen

Börja från `storm_new` med `{"template":"demo"}` eller kör `storm_reset` i demot. Låt två tick gå med `storm_step` och `{"ticks":2}` för att följa ruttens tidtabell. Varje rad nedan är två anrop till `storm_step`. Först hålls riktningen i angivet antal tick, med `jump:true` vid avstampet. Sedan släpps styrningen med `{"ticks":N}`, där N är antalet stilla tick. [Se molnhoppet](molnhopp.mp4)

| Sikta mot | Första anropet | Stilla tick |
| --- | --- | ---: |
| Daggmolnet | `{"x":-1,"z":0.04,"jump":true,"ticks":17}` | 51 |
| Körsbärsmolnet | `{"x":-1,"z":-0.63,"jump":true,"ticks":21}` | 54 |
| Västra vilan och Guldvinge | `{"x":-0.6,"z":-1,"jump":true,"ticks":20}` | 55 |
| Sidenmolnet och Sidenvinge | `{"x":1,"z":-0.4,"jump":true,"ticks":23}` | 57 |
| Rosa Studsmolnet | `{"x":1,"jump":true,"ticks":21}` | 47 |
| Kronbalkongen och Kronvinge | `{"x":1,"z":0.11,"ticks":24}` | 90 |

Vid tick 368 landar Vallmo på Studsmolnet. På sista raden styr du i den automatiska studsen. Vid tick 482 står Vallmo på Kronbalkongen med tre fjärilar. Läs `storm_inspect` för att se `last_cloud`, `cloud_tick` och `butterflies`, eller anropa `storm_preview` för en bild från samma tick. Testet kör samma rutt med enskilda fysiktick och med olika långa bildrutor och jämför hela sluttillståndet. [Körbar rutt och kontroller](../packages/storm-play/tests/suite.ddr)

## Skapa en egen bana

Använd `storm_set_scene` med hela nivån i argumentet `scene`, eller bygg vidare ett objekt i taget med `storm_upsert` och `storm_remove`. Ett objektnamn är dess identitet. En lyckad ändring startar en ny provspelning vid tick 0. En ogiltig ändring bevarar både bana och pågående provspelning.

```json
{
  "version": 1,
  "name": "Spring till fyren",
  "gravity": [0, -9.81, 0],
  "entities": [
    {"name":"Golv","shape":"box","position":[0,-0.25,0],"size":[8,0.5,4]},
    {"name":"Spelare","shape":"sphere","role":"player","mass":1,"position":[-2,0.5,0],"color":[0.04,0.5,0.42]},
    {"name":"Fyr","shape":"sphere","role":"goal","position":[2,0.5,0],"color":[1,0.62,0.12]}
  ]
}
```

Position och storlek anges i meter. Storleken är hela lådans mått eller sfärens diameter på alla tre axlar. Positiv massa ger en dynamisk kropp. Massan noll ger en statisk kropp. En spelare har positiv massa och ett mål är en statisk sensor. Materialparametrarna `friction` och `restitution` ligger mellan 0 och 1. Spelriktningen följer världsaxlarna X och Z, med Y uppåt.

`"theme":"blossom"` ger spelaren rävmodellen och gör objekt med `"role":"flower"` till plockbara blommor. `"bounds":[minX,minZ,maxX,maxZ]` avgränsar spelarens rörelse. Blommor har massa noll. Med rollen `collider` går det att ge till exempel en trädstam en osynlig, fast kollisionskropp. En bana med enbart blommor vinns när alla är plockade. Finns även ett mål ska spelaren nå det efter blomplockningen.

En molnplattform har `"shape":"box"`, massa noll och rollen `cloud` eller `boost_cloud`. Den senare ger spelaren en automatisk studs vid landning. En bonusfjäril har rollen `super_butterfly` och är en statisk sensor. I en bana som enbart har bonusfjärilar som samlarobjekt och saknar mål vinner spelaren genom att samla alla fjärilar.

Fysiken hanterar förflyttning hos sfärer och axelriktade lådor. Solvern använder upp till 16 delsteg för snabba kroppar. Rotationsdynamik, leder och kontinuerlig kollisionsdetektion ingår inte i version 1. En bana rymmer 128 objekt och ett verktygsanrop kan köra 600 tick. I fönstret kan upp till åtta tick hämtas in efter en fördröjd bildruta.
