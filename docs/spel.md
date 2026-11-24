# Bygg och provspela en bana

Bygg med `dunder build -o build/storm` från reporoten. MCP-klienten startar binären med `--mcp` och håller anslutningen öppen under arbetet. [Projektkonfiguration](../.mcp.json)

Om klientens arbetskatalog ligger utanför Storm, ange den absoluta sökvägen till binären i klientens serverkonfiguration. Relativa scenfiler läses och skrivs i serverns arbetskatalog. Varje anslutning har en egen spelvärld i minnet. [MCP:s stdio-transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

För att följa agentens bygge i ett öppet fönster, spara en första bana och kör `./build/storm --scene bana.storm.json --watch`. Storm läser ändringar inom en halv sekund. Ett lyckat byte startar den redigerade nivån vid tick noll. Om en ofullständig fil dyker upp visar fönstret ett fel och låter den tidigare nivån fortsätta.

## Spela till mål med verktygen

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

Starta den sparade banan med `./build/storm --scene bana.storm.json`. En ny agent kan öppna den med `storm_load`. `storm_reset` återställer spelaren och alla kroppar till banans startläge och sätter tillbaka blommorna. `flowers` och `total_flowers` visar hur många som plockats och hur många som finns. `entities[].collected` visar vilken blomma räven har hittat. `storm_inspect` ger position, hastighet, markkontakt och antal kontaktpar. Med `{"view":"scene"}` får agenten den redigerbara banan.

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

Fysiken hanterar förflyttning hos sfärer och axelriktade lådor. Solvern använder upp till 16 delsteg för snabba kroppar. Rotationsdynamik, leder och kontinuerlig kollisionsdetektion ingår inte i version 1. En bana rymmer 128 objekt och ett verktygsanrop kan köra 600 tick. I fönstret kan upp till åtta tick hämtas in efter en fördröjd bildruta.
