# Storm — design från första principer

> Status: **levande dokument** — uppmätt 2026-11-25 mot trädet efter
> `storm-gfx`, Metal-backenden, Blomsterskogen, materialtexturerna (3b) och
> glTF-bilderna med samplare per textur (3c). Skrevs efter djupbufferten, av en
> blend-bugg: två pipelines blenda med `ONE_MINUS_DST_COLOR`/`SRC_ALPHA`
> (5/6) i stället för `SRC_ALPHA`/`ONE_MINUS_SRC_ALPHA` (6/7). Någon skrev
> heltalen för hand och läste tabellen baklänges. Det här dokumentet
> beskriver strukturen där det felet inte går att skriva — och där nästa
> fel av det slaget (Metal har andra tal: `SourceAlpha` är 4, inte 6) inte
> heller går.

## 0. Principer

1. **Fel som är omöjliga att skriva behöver inga tester.** Ett `u32`-fält
   bär ingen information om vad det får innehålla. En enum gör.
2. **Raw FFI är en implementation-detalj, inte ett API.** Bindings mot
   libvulkan och mot Objective-C-runtingen översätter mellan två världar.
   Allt som vet vad `5` betyder, eller vad `"setRgbBlendOperation:"` heter,
   bor i det lagret — och ingen annanstans.
3. **Ett paket, ett ansvar.** En backend är binds, tjänster och orkestrering.
   "Vad är VkBlendFactor" och "hur ser tool-chipen ut" hör inte hemma i
   samma kompileringsenhet.
4. **Ägarskap är explicit.** En god-struct med 130 fält betyder att varje
   funktion kan röra allt. Den som skapar en resurs äger den och släpper
   den — i omvänd ordning, och genom att värdet konsumeras (`close(move self)`).
5. **Errors är värden.** `r.stage = 17` + en uppslagstabell är ett outypat
   fel. `Result<T, E>` är typat, testbart och självbeskrivande.
6. **Pixelbevis krävs för grafik.** En capture är ett faktum. Ännu bättre
   är en self-test som läser pixlar och input och kan köras igen.
7. **Plattformsvalet görs i `src/main.ddr`.** Där väljs både det interaktiva fönstret och renderaren för bildexport. Spel, editor och agentprotokoll använder samma scen och renderingskontrakt på båda plattformarna.

## 1. Nuläge (mätt i koden, 2026-11-25)

- **storm-gfx**: en modul med `Frame`, `Input` med `Key` (19 tangenter
  som bitar i en `u32`), `Mouse` (med `scroll`), `Sky`, `Surface`, `Texture`,
  `Vertex` och `PostProcess`.
  `trait Backend` beskriver pass, ritning, texturer och bildexport i 22 metoder
  (`begin_pass` och `begin` är standardkroppar). Anrop som kan misslyckas
  returnerar `Result`. Geometrihjälparna äger vertexformatet. Åtta tester, inga med fönster.
- **0 råa enum-heltal** i pipeline-state (var 135 före steg 2, 3 före 3a).
  Vertexlayouten ägs av `layout.vertex_input()` + `enums.apply_vertex_input`
  och deklareras identiskt av `pipeline.ddr` och `shadow.ddr`. **0 råa
  `sType`-tal** (var 135 i nio moduler): `layout.ddr` genereras ur `vk.xml`
  och varje post har en `new()`-fabrik som skriver strukturtypen, så talet
  finns på en rad per post i en fil ingen skriver för hand (§6).
- **Enums är ett eget lager:** `enums.ddr` (genererad, §6) har 35 `pub enum` och 46
  `pub fn`: 43 konverterare/namngivna värden och tre `unsafe` skrivare av
  C-poster (`apply_blend`, `apply_vertex_input`, `apply_ui_vertices`). Inga
  namngivna `u32`-konstanter lever kvar i `layout.ddr`; allt är enums, och
  registret äger talen (`tools/vk.ddr --check`).
- `state.ddr` `Renderer`: **121 fält** (var ~60 när steget skrevs; IBL,
  djup, skuggor, post, UI och headless har alla lagt till sina). Varje
  modul tar `&mut Renderer`. Ägarskapet är redan modulvis (varje modul har
  sin `create`/`destroy`); fälten ligger platt. 69 av dem tillhör fem
  kluster med en ägare och två är färdiga poster (`depth.Depth`,
  `material: texture.Material`) — §3b.
- **Setup-fel är ett returvärde, inte ett fält.** Varje setup-funktion
  returnerar `state.SetupStep` (`Ready` eller steget som föll); `device.fail(&mut r, code, step)`
  sätter `r.lastResult` och ger steget tillbaka, så en Vulkan-kod kan inte
  rapporteras utan sin plats. Hjälpare med `&Renderer` (immutable) returnerar
  koden `-> i32` och ägaren med `&mut` binder den: `code := helper(…); if code
  != 0 { return device.fail(&mut r, code, .Step) }`.
- **Beroenden:** `storm-input -> storm-gfx` (ett `Input`-värde, ingen
  backend, inga capabilities), `storm-text -> dunder-skrift` via en låst Git-revision med `filesystem` för att läsa typsnitt,
  `src/main.ddr -> storm-vulkan, storm-metal` (de enda).
- **Spelet är fyra paket under kontraktet, inget över det.** `storm-physics`
  (translaterande rigid bodies i meter och sekunder) beror bara på
  `storm-core`; `storm-play` (autorerade scener, `Session` med fast tick
  60 Hz, `Input`-värde) på `physics` och `core`; `storm-image` (PNG-utdata,
  PNG-avkodning över Dunder-repots `zlib`, och `preview<T>`-omslag) på stdlib
  och `zlib`; `storm-mcp` (JSON-RPC på stdio,
  validerat mot sin egen katalog) på `play` och `image` och tar
  renderaren som **funktionspekare** `fn(&play.Session, string) ->
  Result<(), string>` — sammansättningsroten (`src/main.ddr: preview`) är
  den enda som vet vilken backend som står bakom den. `src/woodland.ddr`
  bygger Blomsterskogen ur inbäddade Blender-glTF:er (`art_asset.ddr`),
  `src/play_view.ddr` avbildar simuleringens poser på scengrafer och
  rör aldrig fysikvärlden, `src/play_ui.ddr` ritar HUD och pausmeny,
  `src/scene_file.ddr` bevakar en banfil (sökvägen, inte en öppen
  deskriptor — agentens sparande byter ut filen atomärt).
- **Ett gränssnitt, två implementationer.** Blomsterskogen, materialstudien
  och editorn kör samma kod på Apple M5 och Intel Iris Plus. Metal och
  Vulkan väntar på föregående GPU-läsning innan CPU:n återanvänder den
  delade vertexströmmen. Den senaste kontrollen på Mikparchy (`dc1d7ca`,
  Dunder 0.12.0, låst session) omfattade **233 egna `@test`** — 60 i roten
  och 173 i de 15 paketen, räknade med `grep -c '@test'` — alla gröna, varje
  svit lika många som den har `@test` (Skrifts två följer med som PASS-rader
  i roten, `storm-text` och `storm-ui`, så `N passed` blir 239). 16 sviter
  kördes med `dunder test` i roten och i varje `packages/*`. Ramens exekutor (`app.gather`, `vertex_bytes`,
  `load_model`) är testbar utan fönster: vad ett pass får, när
  mesh-kopian tas (bara när geometrin revideras — och aldrig från en
  främmande värld med samma revisionsnummer) och att en delad mesh räknas
  per instans (`tests/app_frame.ddr`).
- **Byggtid på Mikparchy (AGENTS.md:s budget 20 s):** `tools/build-time.ddr`
  mätte **16 249 ms** på trädet med `depth.Depth` med Dunder 0.12.0, och
  **16 241 ms** på `1a7f0e2` (16 197–16 523 ms över
  tre mätningar samma kväll). Trädet på
  `a84ade9` gav 14 900–15 100 ms med samma kompilator (`--timings`: 1 238 funktioner,
  386 871 MIR-operationer; `--profile-compiler`: `mir_pipeline` 10,4 s av
  14,6 s), `54214f3` 6 850 ms med Dunder 0.11.0 och 9 100–10 300 ms med
  0.11.3, och `77d9b0c` 15 100–15 700 ms med 0.11.3 (1 176 funktioner,
  346 512 operationer) — skillnaden sedan igår är hälften kompilator, hälften
  spelet (fynd 70), och 0.12.0 tar +62 funktioner och +40 k operationer utan
  att väggklockan flyttar. En stubb-`main` med hela manifestet bygger på
  207 ms och `shader.ddr`s inbäddade SPIR-V-ord kostar 70 ms, så nästa
  budgetsänkning finns i koden `main` når, inte i de genererade arrayerna.

Lagren i storm-vulkan (6 310 rader + 4 223 genererad `shader.ddr`), räknade 2026-11-25:

| Lager | Moduler | Rader |
|---|---|---|
| FFI-bindings | `api.ddr`, `layout.ddr` (båda genererade), `sdl.ddr` | 1 912 |
| Enums vid gränsen | `enums.ddr` (genererad) | 515 |
| Backend-tjänster | `device.ddr`, `pipeline.ddr`, `shadow.ddr`, `depth.ddr`, `texture.ddr`, `headless.ddr`, `ibl.ddr` | 2 539 |
| App-nära kod | `ui.ddr`, `post.ddr` | 446 |
| Orkestrering | `vulkan.ddr`, `state.ddr` | 898 |

Lagren i storm-metal (2 382 rader + inbäddad `shaders/storm.metal` via `@embed_file`):

| Lager | Moduler | Rader |
|---|---|---|
| Runtingen | `objc.ddr` | 280 |
| Ramverkens värden | `enums.ddr`, `records.ddr` | 189 |
| Fönstret och input | `appkit.ddr` | 508 |
| Vad enheten gör, hur ett pass öppnas | `device.ddr`, `pass.ddr` | 361 |
| Backend-tjänster | `ibl.ddr`, `ui.ddr`, `capture.ddr`, `texture.ddr` | 370 |
| Orkestrering | `metal.ddr` | 674 |

## 2. Struktur: vad som står, och vad som ska stå

```
┌──────────────────────────────────────────────────────────────────────┐
│ src/main.ddr — sammansättningens rot: väljer backend, ger storm-mcp   │
│                 renderaren som funktion, startar app eller --mcp     │
├──────────────────────────────────────────────────────────────────────┤
│ src/app.ddr · editor.ddr · gallery.ddr · play_view.ddr · play_ui.ddr │  generiskt över B: gfx.Backend
│ woodland.ddr · scene_file.ddr · art_asset.ddr                        │  (ritar, bygger scenen, äger ingen backend)
├──────────────┬───────────────────────────────┬───────────────────────┤
│ storm-mcp    │ storm-ui · storm-text · gltf  │ storm-input           │  paket ovanför kontraktet
│ storm-image  │ storm-scene · storm-ecs       │                       │  (känner ingen backend)
│ storm-play   │ storm-render · storm-core      │                       │
│ storm-physics│                               │                       │
├──────────────┴───────────────────────────────┴───────────────────────┤
│ storm-gfx — kontraktet: Frame, Input, Sky, Vertex, trait Backend     │  nämner ingen backend
├────────────────────────────────────────┬─────────────────────────────┤
│ storm-vulkan (Linux, SDL)              │ storm-metal (macOS, AppKit) │  de två implementationerna
└────────────────────────────────────────┴─────────────────────────────┘
```

Två sorters kod står ovanför kontraktet, och skillnaden är värd att se.
`src/app.ddr` och de moduler den kör är generiska över `B: gfx.Backend`
och ritar. `storm-physics`, `storm-play`, `storm-mcp` och `storm-image`
känner varken backend eller fönster: en `play.Session` stegas med
`TICK_RATE` 60 Hz ur ett `play.Input`-värde och testas utan display;
`storm-mcp` tar renderaren som funktion `fn(&play.Session, string) ->
Result<(), string>`, och `storm-image.preview<T>` är det enda som behöver
veta att det finns något att rendera med. `src/play_view.ddr` är bron:
den avbildar en sessions poser på scengrafer och skriver aldrig tillbaka
till fysiken. Beroendena är de manifests förklarar: `storm-physics ->
core`, `storm-play -> physics, core`, `storm-mcp -> play, image`,
`storm-image -> stdlib`, `storm-input -> core, gfx`, och de två backends
`-> core, gfx`. Inget av dem importerar `storm-vulkan` eller
`storm-metal`; det gör bara `src/main.ddr` (fyra rader).

Det här står. Kvar till målbilden:

```
storm-vk        (kvar)  Vulkan-bindings som eget paket: funktioner, structar, ENUMS.
    ▲                   Idag bor de i storm-vulkan (api.ddr, layout.ddr, enums.ddr).
storm-vulkan           Renderer uppdelad i ägda strukturer (steg 3), ui/post ur
                        backenden (steg 5).
```

Regler:

- Appen (`src/app.ddr`) och pakagen talar bara med `storm-gfx`.
- Endast `src/main.ddr` importerar en backend. (I målbilden, med flera
  applicitioner, blir sammansättningens rot en egen liten modul per applikation.)
- `storm-ui`/`storm-text`/`storm-input` känner inte till `VkImage`,
  `VkPipeline`, `MTLDevice`, `CAMetalLayer` eller något annat som börjar
  med `Vk` eller `MTL`.
- Inga `u32`-fält i publika API:er där en enum finns.
- Ett gränssnitt som inte går att beskriva utan att nämna Vulkan eller
  Metal är fel designat.

Vad som skiljer backends åt, och var det får synas:

| Skillnad | Var den lever |
|---|---|
| Klippyta: Vulkan y nedåt, Metal y uppåt | `storm-metal/records.ddr: viewport` (negativ höjd) — ingen annanstans, ingen shader |
| Skuggkarta: avstånd med MAX-blending / djupbild | respektive backend + dess skuggshader |
| Konstanter: push constants / `constant`-block per draw | respektive backend |
| Cull och frontface: pipeline-state / encoder-state | `storm-metal/device.ddr: Pipeline { state, cull }` + `pass.bind` |
| Hur en yta skapas: SDL / AppKit + `CAMetalLayer` | `storm-vulkan/sdl.ddr`, `storm-metal/appkit.ddr` |
| Tangentkoder: SDL-scancodes / macOS key codes | en tabell per backend, parar kod med namngiven `gfx.Key` |

## 3. Enums i FFI-lagret

Dunder har enums med värden, `match`, `i32(x)` och validerande `X(number)`.
Men: **enums får inte vara fält i `@c_layout`** (E5003, verifierat).

Modellen är därför: enums utanför structarna, konverterade vid gränsen.

```dunder
// storm-vulkan: den enda platsen ett VkBlendFactor-heltal finns.
pub enum BlendFactor {
    Zero = 0, One = 1, SrcColor = 2, OneMinusSrcColor = 3,
    DstColor = 4, OneMinusDstColor = 5, SrcAlpha = 6, OneMinusSrcAlpha = 7,
    DstAlpha = 8, OneMinusDstAlpha = 9,
}

pub fn blend_factor(f: BlendFactor) -> u32 { u32(i32(f)) }
```

```dunder
// storm-metal: samma tanke, andra tal. SourceAlpha är 4 här.
pub enum BlendFactor { Zero = 0, One = 1, SourceAlpha = 4, OneMinusSourceAlpha = 5 }

pub fn blend_factor(v: BlendFactor) -> u64 { u64(i32(v)) }
```

Endast konverterarna (`enums.blend_factor(.SrcAlpha)`) rör heltalen. Finns
det ingen konverterare kan fältet inte fyllas i — kompilatorn säger ifrån.
**Genomfört** i storm-vulkan (steg 2) och i storm-metal från början; där
skrivs vart och ett värde ut av en liten C-program som inkluderar SDK:s
rubriker, och `storm-metal/tests` låser dem mot den tabellen.

Två gränser till har samma regel, om än inte enums:

- **Records som skickas per värde.** `records.ddr` äger C-layouten av
  `CGSize`, `CGRect`, `MTLViewport`, `MTLRegion` m.fl., med storlekar låsta
  mot `sizeof` i samma C-program. På arm64 skickas flyttalsposter i
  register och större heltalsposter som en pekare till en kopia, så en
  metod som tar `MTLRegion` deklareras med `ptr` och får `addr(&mut region)`.
- **Selektorer.** Objective-C:s meddelanden stavas som literaler
  (`cstr("setRgbBlendOperation:")`). De kan inte vara enums (texten är
  namnet), så i stället för att stavas från minne kontrolleras varje
  selektor i storm-metal mot SDK:s rubriker: setter `setFooBar:` kräver en
  property `fooBar`, varje annat nyckelord en deklarerad metod — skiftläges-
  känsligt, vilket är hela poängen. Kontrollen hittade `setRGBBlendOperation:`s
  felaktiga versaler, en `depthAttachments` som är `depthAttachment`, och ett
  `waitUntilAllCommandsCompleted` som inte finns.

## 4. Vad som händer med dagens kod

- `api.ddr`, `layout.ddr` → `storm-vk` (kvar).
- `device.ddr`, `pipeline.ddr` → `Result` och ägda strukturer (kvar i
  storm-vulkan; **genomfört i storm-metal**, som byggdes så från början:
  `Renderer` med 38 fält, och en skapare och en förstörare per ägd resurs).
- `vulkan.ddr`:s 17 setup-steg → en `Setup`-kedja med `Result` (kvar; på
  kontraktets nivå är det klart: varje anrop är en `Result`).
- `ui.ddr` + `post.ddr` ur backend-lagret (kvar).
- **`storm-input` slutar bero på backenden: klart.** Handtaget `Window`
  flyttades inte till `storm-core`; i stället är input ett *värde*:
  backenden rapporterar `gfx.Input` per frame, kameran tar det, och
  kameran är testbar utan fönster (två nya tester).

## 5. Migration, stegvis

Varje steg lämnar träd och tester grönt. Capture-filer före/efter måste
vara **pixelidentiska** (AE = 0) om inte steget medvetet ändrar bilden.

1. **Skapa `storm-vk` med enums + bindings.** *Status: enums-modulen finns
   och genereras ur `vk.xml` (`packages/storm-vulkan/src/enums.ddr`, 35 enums,
   urvalet i `tools/vk.ddr`); paketdelningen är kvar.*
2. **Ersätt de 135 heltalen** med enums via `blend_factor()`-stilens
   konverterare, modul för modul. Pixelidentisk capture som bevis.
   *Status: klart 2026-11-23. 135 → **0** råa enum-heltal i structfält: de
   sista tre var vertexlayouten i `shadow.ddr` (`inputRate: 0`,
   `format: 106` ×2); next-steps 3a tog dem genom att låta
   `layout.vertex_input()` äga beskrivningen och `enums.apply_vertex_input`
   skriva enum-fälten, så det inte finns en andra plats att hålla lika.
   AE = 0 mot baslinjen, inklusive två spec-korrigeringar av layouter
   (fynd 44). `post → ui`-beroendet borta.*
3. **Dela upp `Renderer`** i ägda strukturer. Pixelidentisk.
   *Status: första halvan klar 2026-11-23 — renderpass-, pipeline- och
   skuggpassens handpackade ord är riktiga C-poster i delade wrappers
   (`vk.Dependencies`, `vk.ShaderStages`, `vk.References`, `vk.VertexInput`,
   `vk.UiVertices`, `vk.AttachmentDescription`), fynd 52 löst, fynd 53–55 dokumenterade.*
   *Andra halvan påbörjad 2026-11-24 (§3b): `depth.Depth` är det första
   klustret som flyttade in i en post hos sin ägare (`r.depth.image`
   i stället för tre lösa fält på `Renderer`), med storleken pinnad i ett
   test. `Renderer` har **121 fält**; 69 av dem hör till fem kluster som
   redan har en ägare och bara ligger platt (§3b).*
4. **`Result` istället för `stage`.** Felflöden testas i displayfria tester.
   *Status: klar 2026-11-23 — `VkResult` är en Dunder-enum med Khronos-värden
   (fynd 57: OUT_OF_DATE hade ett värde som inte finns), och steget är
   returvärdet `SetupStep` i stället för `r.stage = N`: `name()` är en
   exhaustiv match (E3006 när ett steg läggs till utan namn) och
   `describe` sätter ihop `"steg (VK_…)"`. Tester: `fail` ger steget tillbaka
   och sätter koden för varje steg; varje steg har ett namn.*
5. **Dra `ui.ddr`/`post.ddr` ur backenden.** Kvar.
6. **Lås skrift-dependency.** *Status: klart — `storm-text` hämtar skrift
   från Git med full commitidentifierare (`rev = c973a09…`) och incheckad
   låsfil, som AGENTS.md kräver för externa paket; `path` används bara för
   Storms egna.*
7. **`storm-gfx` och Metal.** *Status: klart 2026-11-23 — kontraktet, en
    app generisk över backenden, och den andra implementationen, utan att
    ett paket ovanför backenden rördes utöver att byta namn från
    `vulkan.X` till `gfx.X`. Se §5c.*

## 5b. Editorn och scenen, som den står

Materialstudien byggs i `src/gallery.ddr`. `src/editor.ddr` äger paneler, objektval och pekarinteraktion. Både fönsterkoordinater och klickytor mäts i punkter. Ett smalt fönster använder samma paneler en i taget. `src/game.ddr` hanterar insamlingen och `src/args.ddr` startkameran.

ECS-grafen äger geometri, material och transformer. Hierarkin och geometrin har var sin revision. Editorn uppdaterar trädraderna när namn eller träd ändras. Renderaren hämtar en ägd kopia av meshströmmarna när geometrin ändras. Under en bildruta innehåller varje ritpost en transform, ett material och ett index i den kopian. Skuggpasset och huvudpasset läser samma vertexdata. Bara genomskinliga objekt sorteras.

`src/app.ddr` översätter rendergrafens pass till `gfx.Backend`. Båda backends inväntar GPU:ns senaste läsning innan CPU:n återanvänder den delade vertexbufferten. Fel från ett ritpass eller en bildexport avslutar körningen med felstatus.

`begin_scene(filtered)` väljer färgmål för himmel, ogenomskinlig geometri och transparens. När FXAA eller färgtoning och glöd är aktiva skriver scenen till `scene_color`, en åttabitars färgtextur i bildens upplösning. `post_process` läser scenfärgen och skriver till slutbilden i ett fullskärmspass. HUD och editor ritas sedan ovanpå slutbilden i skärmens pixeltäthet. När båda filtren är avstängda skriver scenen direkt till slutbilden. Fönstret, filcapture och MCP-förhandsvisningen kör samma rendergraf.

`storm-play` äger spelets startscen och det föränderliga tillståndet under en provspelning. Varje tick tar samma indata från fönstret eller MCP. Fysikpaketet löser kontakterna. Spelmodulen håller reda på blommorna, bonusfjärilarna, målsensorerna och rävens gångfas. Molnplattformarnas ovansida bär spelaren vid landning. Fysiken rapporterar vilken plattform foten träffade och spelmodulen ger Vallmo en uppåthastighet om plattformen är ett studsmoln. Samma landnings- och plocktick styr de visuella effekterna i fönster och agentbilder. `src/play_view.ddr` översätter kropparnas positioner till scennoder. I Blomsterskogen använder rävmodellens leder, insektsvingarna och kronbladen simuleringens klocka. Flera exemplar av samma form delar vertexdata och kan ha olika material. Fönstret interpolerar mellan två tick. Vid paus, ensteg och bildexport används den exakta positionen för aktuell tick.

`scene.animation` samplar glesa nyckelspår för position, rotation och skala. Splinespåren behåller hastigheten genom mellanposer och runt loopsömmen. Ett klipp kan också stanna i ändposen. Vallmos kropp och molnens fjädring delar klippmotorn.

Fysiken registrerar spelarens färdväg, riktning och kontakt med underlaget vid fast tick. Presentationen samplar samma historik på bildrutans tidpunkt. Varje tass får en stödpunkt i världen och benen hittar dit med tvåleds-IK. Stödets höjd hämtas ur gläntans trianglar eller det deformerade molnets yta. Ledernas placering och tassarnas sula och tå följer med från Blender i GLB-filens scendata. [Klippsampling och IK](../packages/storm-scene/src/animation.ddr) · [Rävens poser](../src/fox_animation.ddr) · [Steghistorik](../packages/storm-play/src/stride.ddr)

Gesten vid en blomma använder samma vilotid i den interaktiva spelbilden och i en agentstyrd repris. Spelarens rörelse tonar ut gesten. Huvudets riktning och höjd följer blommans placering och storlek. Efter att benen har tagit vikten justeras nosen mot pollenet med modellens verkliga nosspets som referens. [Rävens uttryck](../src/fox_expression.ddr)

`storm-mcp` håller en session per klientprocess och tar emot en renderingsfunktion från `src/main.ddr`. Agentens bildexport kör den vanliga rendergrafen mot en fristående textur. Simuleringen kan köras utan GPU. `--watch` låter ett öppet spel ta emot en sparad bana från en agent. Fönstret byter spelvärld när hela filen har validerats.

Förändringar i scenträdet bygger om traverseringsordningen. Mellan ändringar uppdateras världsmatriserna i den sparade ordningen med föräldern före barnet. Rendergrafens kompilerade passordning återanvänds tills behovet av skuggpass, transparenspass eller efterbehandling ändras.

Mätfallen finns i `tools/bench-frame.ddr`. Kör `dunder run tools/bench-frame.ddr` för 300 uppdateringar av 1 024 noder och lägg till `-- --editor` för 4 000 omritningar. Vid isolering av respektive ändring på Apple M5 sjönk medianen för processens CPU-tid från 3,184 till 0,166 sekunder för scenträdet och från 0,624 till 0,553 sekunder för editorn över sju varv. Tre par körningar av 600 visade bildrutor gav 5,95 sekunder före och 6,07 efter.

Texten rastreras med displayens täthet: atlasen vet sin egen
`raster_size` och `ui.Canvas` frågar den, så det inte finns någon täthet att
skicka med och ingen storlek att hålla i samklang. En Retina-display packar
glyferna på 44 px och texten är dubbelt så skarp, lika stor på skärmen.

## 5c. Metal-backenden, som den står

Metal nås genom Objective-C:s runtingen med `std.dl` och `objc_msgSend`
omkastad till metodens egen typ — det enda rätta sättet att anropa den (dess
variadiska deklaration är en lögn som Apples arm64-ABI inte hedrar: variadiska
ord går på stacken, meddelandets går i register). Inget SDL, ingen
bindningsgenerator, inget bibliotek att hitta. Fyra beslut är värda sina namn:

- **Klippytan speglas i viewporten, inte i shaders.** Storms klippyta har y
  nedåt, Metals uppåt. En viewport med origo längst ner och negativ höjd
  avbildar klipp-y = −1 på översta raden. Skillnaden bor i en funktion
  (`records.viewport`); alla pass använder den, och Metal-shaders är
  Vulkan-GLSL:n portad rad för rad. Självtestet bevisar det två gånger: en
  UI-fyrkant ligger där dess punkter säger, och med identisk
  view-projection (där strålen är klippositionen) är horisonten överst.
- **Skuggkartan är en djupbild.** Vulkan-backenden skriver avståndet till
  ljuset i en färgbild med MAX-blending, av historiska skäl. Metal skriver
  en riktig djupbilaga utan fragmentfunktion. En djupkarta är det omvända:
  minst vinner, så en yta är skuggad när dess *större* djup jämförs med det
  minsta, och biasen dras av i stället för att läggas på. Första capturen
  hade hela golvet i sin egen skugga tills det sågs i pixlarna: 55 % av
  bildrutan skiljde sig mot `--no-shadows`, mot 4 % efteråt.
- **En pipeline bär sin cull-mod.** Metal håller cullning och frontface som
  encoder-state, Vulkan i pipelinen. `device.Pipeline { state, cull }` och
  ett enda `pass.bind` som sätter båda gör att de inte kan skilja sig: en
  pipeline som läser mesh-layouten gallrar baksidor, en som ritar en
  fullskärmstriangel eller UI-fyrkanter gallrar ingenting.
- **Shaders som källkod.** Metal-paketet bäddar in `shaders/storm.metal`.
  `newLibraryWithSource:` kompilerar källan när fönstret öppnas. Första
  kompileringen tog 42 ms och följande 0–1 ms med systemets cache.

Ägarskap följer Objective-C:s namn: `alloc`, `init`, `new`, `copy` ger ett
ägt objekt som släpps exakt en gång, i `close`, i omvänd skapandeordning;
allt annat är autoreleasat och lever till ramens pool töms. En command buffer
håller sina resurser vid liv tills den är klar, så inget frigörs under GPU:n.

Dunders aliasregel formade koden: `f(&mut r, r.field)` vägras ("mutable
arguments must not alias another borrow in the same call"), så de funktioner
som *kontrollerar* tar ett delat lån (`require_main(&r)`) och varje draw
binder sitt eget med delade lån, i stället för en hjälpfunktion som tar hela
renderaren mutabelt vid sidan av en pekare in i den.

## 3b. Renderer-uppdelningen, kluster för kluster

Designens princip 4 ("den som skapar en resurs äger den") är redan *sann* i
storm-vulkan — varje modul har sin `setup`/`create` och sin `destroy`, och
tabellen nedan mäter vilka fält de rör. Det som saknas är bara formen: fälten
ligger platt på `Renderer` med 121 namn i stället för i en post hos den
modul som äger dem. Det är inte "1–2 dagars arbete" (§6 sa så); det är en
mekanisk flytt per kluster, och mönstret finns redan två gånger i trädet:
`material: texture.Material` på Vulkan-sidan och `environment: ibl.Environment`
/ `atlas: ui.Atlas` på Metal-sidan.

Mätt 2026-11-24 med ett skript som räknar `r.<fält>` per modul (kolumnen
"utanför" är läsningar/skrivningar i andra moduler än ägaren):

| Kluster | Fält | Ägare | Utanför | nästa post |
|---|---|---|---|---|
| depth | 3 → **1 post** | `depth.ddr` | 1 (`device.color_framebuffer` läser `view`) | `depth.Depth` — **gjord** |
| ui | 11 | `ui.ddr` | 0 | `ui.Atlas` — samma namn som Metals |
| post | 12 | `post.ddr` | 6 (`pipeline`, `device`, `vulkan`: `scenePass`, `compositePass`, `sceneFramebuffer`) | `post.Stage` |
| shadow | 17 | `shadow.ddr` | 6 (`ibl`, `vulkan` binder `shadowSet`; `pipeline` läser `shadowSetLayout`) | `shadow.Shadow` |
| ibl | 24 | `ibl.ddr` | 0 | `ibl.Environment` — samma namn som Metals |
| capture | 5 | `headless.ddr` | 2 (`vulkan` binder `captureFramebuffer`) | `headless.Capture` |

Regler som gör att flytten inte blir något att "komma ihåg":

- **Posten deklareras av ägaren, inte i `state.ddr`.** `depth.ddr` äger
  `Depth`, `texture.ddr` äger `Material`; `state.ddr` importerar dem och
  håller `depth: depth.Depth`. Den cirkulära importen (`state ↔ depth`,
  `state ↔ texture`) kompilerar (0.12.0, 105 moduler grönt) — ägaren
  behöver `state.Renderer` för `create(&mut r)`, och `state` behöver posten.
- **Storleken pinnas där den står en gång:** `owned_records_keep_their_size`
  i `tests/suite.ddr` (`Depth` 24, `Material` 40, `Renderer` 6136 byte).
  Registret allokerar `size_of(state.Renderer) + 8192`, så nästa kluster som
  flyttar ändrar det talet — medvetet, i testet, inte genom att någon glömmer.
- **Läsningarna utanför är gränsen, inte skälet.** Ett kluster med noll
  utanför (ui, ibl) flyttas rakt av; ett vars handtag binds av andra moduler
  (post: `scenePass`, `compositePass`; shadow: `shadowSet`) behåller de två
  eller tre namnen som lämnas ut — det är vad de andra modulerna *behöver*,
  och resten av posten blir privat.
- **Varje kluster är en commit med AE = 0** mot capturen före. Ingen
  klusterflytt ändrar bilden; den ändrar bara var namnen bor.

Ordningen efter depth: **ui** (11 fält, 0 utanför, redan Metalls namn),
**ibl** (25, 0 utanför), **post** (12), **shadow** (17), **capture** (5;
`captureOn` är frame-state och stannar bland de 50 platta fälten).

## 6. Öppna frågor

- **Genererade bindings — ja, för prototyperna.** Att hålla entry points för
  hand är det som orsakade blend-buggen, och det var sant för `api.ddr` också:
  av 80 prototyper var 79 rätt stavade och en ljög
  (`vkGetPhysicalDeviceQueueFamilyProperties` deklarerad `-> i32`, registriet
  säger `void`; fynd 73 visar varför det inte syntes). Nu läser `tools/vk.ddr`
  Khronos `vk.xml` och skriver hela filen — `Api`-posten och `load()` — med
  `--check` som `dunder fmt --check`: utgång 1 om filen inte är vad registriet
  ger. Kommandolistan är Storms (vilka kommandon som laddas), typerna är
  registriets. De tio WSI-kommandona hamnar i `load()`:s `windowed`-gren
  därför att `VK_KHR_swapchain` beror på `VK_KHR_surface` i registriet, inte
  på en handskriven lista. `layout.ddr` är den andra utdatafilen: 71 poster
  ur registret, varje med `impl X { pub unsafe fn new() -> X }` som
  nollställer och skriver `sType` (strukturtypen är en `values=` på
  registriets `sType`-medlem, och en `<enum extends="VkStructureType"
  offset="N"/>` i en extension räknas fram: 1 000 000 000 + (nummer − 1) ×
  1 000 + N). Före det stod 135 strukturtal för hand vid anropsplatserna —
  migreringen verifierade varje tal mot registret innan det togs bort, och
  alla stämde. En union blir sitt största medlemsslag (`VkClearValue` →
  `color: ClearColorValue`, 16 byte), och Storms egna poster står under en
  markör som generatorn kopierar oförändrat. `enums.ddr` görs på samma sätt:
  registret äger talen, Storm äger urvalet (en tabell i verktyget: Dunder-namn,
  registrets block, varje variant med registrets konstant och Storms kommentar),
  kombinerade flaggor är summan av namngivna bitar, och ett namn registret inte
  känner är exit 2 med namnet. För Metal behövs det inte på samma sätt: det
  som hålls för hand är 109 selektorer och 53 deklarerade meddelandetyper
  (34 unika signaturer), och det
  som håller dem ärliga är kontrollen mot SDK:s rubriker (§3) — vilken i sin
  tur vore naturlig som ett Dunder-verktyg i `tools/`, när den ska köras av
  fler än den som skrev den.
- **Safe-lager?** Räcker enums + `Result`, eller ska det finnas builders?
  Förslag: enums + `Result` först (klart på kontraktets nivå), builders när
  vi ser vad som är besvärligt att använda.
- **Tidsram.** Vulkan-paketdelningen (`storm-vk`) är ett eget steg;
  Renderer-uppdelningen är fem klusterflyttar à en commit (§3b).
- **Subagent-orthogonalitet.** Arbetspaketen ska kunna köras parallellt i
  varsin worktree utan att krocka. Textur 3a rör vertexformatet, som nu
  ägs av `storm-gfx` men konsumeras av två backends och två shaderuppsätt-
  ningar: det steget bör köras seriellt och först på den ena backenden,
  sedan den andra.
