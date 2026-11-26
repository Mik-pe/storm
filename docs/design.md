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
  `Sampler` och `Vertex`, `PostProcess`.
  `trait Backend` beskriver pass, ritning, texturer och bildexport i 22 metoder
  (`begin_pass` och `begin` är standardkroppar). Anrop som kan misslyckas
  returnerar `Result`. Geometrihjälparna äger vertexformatet. Nio tester, inga med fönster.
- **0 råa enum-heltal** i pipeline-state (var 135 före steg 2, 3 före 3a).
  Vertexlayouten ägs av `records.vertex_input()` + `records.apply_vertex_input`
  och deklareras identiskt av `pipeline.ddr` och `shadow.ddr`. **0 råa
  `sType`-tal** (var 135 i nio moduler): `layout.ddr` genereras ur `vk.xml`
  och varje post har en `new()`-fabrik som skriver strukturtypen, så talet
  finns på en rad per post i en fil ingen skriver för hand (§6).
- **Enums är ett eget lager, och lagret är ett eget paket:** `storm-vk/enums.ddr`
  (genererad, §6) har 35 `pub enum`, 34 konverterare, `result_name` och tre
  konstanter — inget `unsafe`, ingen import, inget Storm. Storms skrivare av
  C-poster (`apply_blend`, `apply_vertex_input`, `apply_ui_vertices`) och de
  värden de skriver (`Blend`, `alpha_over`, `shadow_max`) står i
  `storm-vulkan/records.ddr`. Inga namngivna `u32`-konstanter lever kvar i
  `layout.ddr`; allt är enums, och registret äger talen
  (`tools/vk.ddr --check`).
- `state.ddr` `Renderer`: **61 fält** (121 före Renderer-uppdelningen; 72
  efter steg 3). Sex kluster ligger i en post hos sin ägare
  (`depth.Depth`, `ui.Atlas`, `ibl.Environment`, `shadow.Shadow`,
  `texture.Material`, `post.Stage`, `headless.Capture`); 54 fält ligger platt
  i fyra sorter (§3b), de flesta frame-state och
  swapchain-handtag. Varje modul tar `&mut Renderer`. Ägarskapet är redan
  modulvis (varje modul har sin `create`/`destroy`) — §3b.
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
  delade vertexströmmen. Den senaste kontrollen på Mikparchy (`da45ac1`, Dunder
  0.12.0, låst session) omfattade **260 egna `@test`** — 72 i roten
  och 188 i de 16 paketen, räknade med `^@test fn` (en `@test` inuti en
  sträng räknas inte) — alla gröna, varje
  svit lika många som den har `@test` (Skrifts två följer med som PASS-rader
  i de tre sviter som når `storm-text` — roten, `storm-text`, `storm-ui` — så
  `N passed` blir 262). 17 sviter
  kördes med `dunder test` i roten och i varje `packages/*`. Ramens exekutor (`app.gather`, `vertex_bytes`,
  `load_model`) är testbar utan fönster: vad ett pass får, när
  mesh-kopian tas (bara när geometrin revideras — och aldrig från en
  främmande värld med samma revisionsnummer) och att en delad mesh räknas
  per instans (`tests/app_frame.ddr`). Spelets transport (`app.Transport`)
  är det med: paus, steg, omstart, studio och färgkorrigering besvaras med
  den enda `play`-anropet ramen ska göra (`tests/transport.ddr`).
- **Byggtid på Mikparchy (AGENTS.md:s budget 20 s):** `tools/build-time.ddr`
  mätte **18 385 och 18 395 ms** på `e264590` + `--help`-tabellen, Dunder 0.12.0 (två
  mätningar samma kväll, efter femtexturkedjan), 18 996 ms på `9f879c9` — 16,4 s innan `decode_png` + zlib nås från `main`
  (fynd 82), och **16 249 ms** på trädet med `depth.Depth`, **16 241 ms** på
  `1a7f0e2` (16 197–16 523 ms över
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

Registret är ett eget paket, **`storm-vk`** (2 063 rader, allt genererat ur
`vk.xml` av `tools/vk.ddr`, noll import av `gfx`/`core`): `api.ddr` (347:
82 prototyper + `load()`), `layout.ddr` (1 285: 71 registriposter med
`new()` + fyra par-poster, se §6), `enums.ddr` (431: 35 enums, 34
konverterare, `result_name` och registrets konstanter). Det som är Storms
val står i storm-vulkan `records.ddr` (158): vertexformaterna, `Blend` och
`apply_*`-skrivarna, `DisplayEncoding`/`FrameViewport`, descriptor-orden och
vad ett swapchain-tal betyder Storm.

Lagren i storm-vulkan (4 456 rader + 4 243 genererade i `shader.ddr`), räknade 2026-11-26:

| Lager | Moduler | Rader |
|---|---|---|
| FFI-bindings | `sdl.ddr` (Storms enda handskrivna FFI; Vulkan ligger i `storm-vk`) | 222 |
| Storms värden ovanpå registret | `records.ddr` | 158 |
| Backend-tjänster | `device.ddr`, `pipeline.ddr`, `shadow.ddr`, `depth.ddr`, `texture.ddr`, `headless.ddr`, `ibl.ddr`, `ui.ddr`, `post.ddr` | 3 215 |
| Orkestrering | `vulkan.ddr`, `state.ddr` | 861 |

`ui.ddr` och `post.ddr` räknades förut som "app-nära kod". De är inte det:
var och en skapar Vulkan-resurser (`VkImage`, `VkPipeline`,
`VkDescriptorSetLayout`, ett render pass med framebuffer) och förstör dem,
och storm-metal har samma två moduler som backend-tjänster (`ui.ddr`,
`pass.ddr`). Det app-nära — vad som ritas — står i `storm-ui` ovanför
kontraktet, som anropar `ui_atlas`/`ui_draw`/`post_process` och inte vet att
modulerna finns.

Lagren i storm-metal (2 453 rader + inbäddad `shaders/storm.metal` via `@embed_file`; `shader.ddr` är `@embed_file`-raden), räknade 2026-11-26:

| Lager | Moduler | Rader |
|---|---|---|
| Runtingen | `objc.ddr` | 280 |
| Ramverkens värden | `enums.ddr`, `records.ddr` | 201 |
| Fönstret och input | `appkit.ddr` | 508 |
| Vad enheten gör, hur ett pass öppnas | `device.ddr`, `pass.ddr` | 362 |
| Backend-tjänster | `ibl.ddr`, `ui.ddr`, `capture.ddr`, `texture.ddr` | 416 |
| Orkestrering | `metal.ddr` | 685 |

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
storm-vk                Vulkan-registret som eget paket: prototyper, poster,
    ▲                   ENUMS — allt genererat ur vk.xml, inget Storm i sig.
storm-vulkan           Renderer uppdelad i ägda strukturer (steg 3 — klart,
                        §3b). ui/post ur backenden är avskrivet som mål (steg 5).
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
| Musknappar: SDL:s nummer (vänster 1, mitten 2, höger 3) / AppKits händelser | en tabell per backend (`sdl.ddr: sdl_button`, `appkit.ddr: button_of`), parar med namngiven `gfx.Button` — biten (1, 2, 4) ägs av kontraktet, inte av plattformen |

## 3. Enums i FFI-lagret

Dunder har enums med värden, `match`, `i32(x)` och validerande `X(number)`.
Men: **enums får inte vara fält i `@c_layout`** (E5003, verifierat).

Modellen är därför: enums utanför structarna, konverterade vid gränsen.

```dunder
// storm-vk/enums.ddr: genererad ur vk.xml av tools/vk.ddr — den enda
// platsen ett VkBlendFactor-heltal finns. Storm-vulkan har ingen enums.ddr.
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
**Genomfört** i storm-vulkan (steg 2, sedan flyttat till `storm-vk` 2026-11-25:
varje värde slås upp i registret efter den konstant verktygets urvalstabell
namnger, och `--check enums` fallerar när filen skiljer sig från `vk.xml`) och
i storm-metal från början; där
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

- `api.ddr`, `layout.ddr`, `enums.ddr` → `storm-vk` (**genomfört** 2026-11-25;
  Storms egen del av dem blev `storm-vulkan/records.ddr`).
- `device.ddr`, `pipeline.ddr` → `Result` och ägda strukturer (kvar i
  storm-vulkan; **genomfört i storm-metal**, som byggdes så från början:
  `Renderer` med 38 fält, och en skapare och en förstörare per ägd resurs).
- `vulkan.ddr`:s 17 setup-steg → en `Setup`-kedja med `Result` (kvar; på
  kontraktets nivå är det klart: varje anrop är en `Result`).
- `ui.ddr` + `post.ddr` ur backend-lagret: **avskrivet som mål.** De skapar
  och förstör Vulkan-resurser och är backend-tjänster (se lagertabellen i
  §1); storm-metal har samma två. Det som steg 5 ville — att appen inte ska
  veta vad en atlas är för implementering — gäller redan: `storm-ui` talar
  med `ui_atlas`/`ui_draw`/`post_process` på kontraktet.
- **`storm-input` slutar bero på backenden: klart.** Handtaget `Window`
  flyttades inte till `storm-core`; i stället är input ett *värde*:
  backenden rapporterar `gfx.Input` per frame, kameran tar det, och
  kameran är testbar utan fönster (två nya tester).

## 5. Migration, stegvis

Varje steg lämnar träd och tester grönt. Capture-filer före/efter måste
vara **pixelidentiska** (AE = 0) om inte steget medvetet ändrar bilden.

1. **Skapa `storm-vk` med enums + bindings.** *Status: klart 2026-11-25.
   `packages/storm-vk` har `api.ddr`, `layout.ddr` och `enums.ddr`, alla tre
   helgenererade ur `vk.xml` av `tools/vk.ddr` (`--check` jämför hela filen;
   det finns ingen markör och inget Storm i dem). Urvalet — vilka kommandon,
   poster och enums — är data i verktyget (`COMMANDS`, `STRUCTS`, `PAIRS`,
   `selected_enums()`). Storms val blev `storm-vulkan/records.ddr`.*
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
   test. 2026-11-25: `ui.Atlas`, `ibl.Environment` och `shadow.Shadow`
   följde, var och en med AE = 0 — `Renderer` har **72 fält** (121 före) —
   och 2026-11-26 `post.Stage` och `headless.Capture`: **61 fält**, sju
   poster och 54 platta (§3b). Tabellens kluster är slut.*
4. **`Result` istället för `stage`.** Felflöden testas i displayfria tester.
   *Status: klar 2026-11-23 — `VkResult` är en Dunder-enum med Khronos-värden
   (fynd 57: OUT_OF_DATE hade ett värde som inte finns), och steget är
   returvärdet `SetupStep` i stället för `r.stage = N`: `name()` är en
   exhaustiv match (E3006 när ett steg läggs till utan namn) och
   `describe` sätter ihop `"steg (VK_…)"`. Tester: `fail` ger steget tillbaka
   och sätter koden för varje steg; varje steg har ett namn.*
5. **Dra `ui.ddr`/`post.ddr` ur backenden.** *Avskrivet 2026-11-25: de är
   backend-tjänster (de äger Vulkan-resurser, och Metal har samma två);
   appen talar redan med dem genom kontraktet. Se §4.*
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

Designens princip 4 ("den som skapar en resurs äger den") är redan *sann*
i storm-vulkan — varje modul har sin `setup`/`create` och sin `destroy`,
och tabellen nedan mäter vilka fält de rör. Det som saknas är bara formen: de
fälten som ligger platt på `Renderer` ska ligga i en post hos den modul som
äger dem. Det är inte "1–2 dagars arbete" (§6 sa så); det är en mekanisk
flytt per kluster, och mönstret finns nu fem gånger i trädet:
`depth.Depth`, `ui.Atlas`, `ibl.Environment`, `shadow.Shadow` och
`material: texture.Material` på Vulkan-sidan, `environment: ibl.Environment`
och `atlas: ui.Atlas` på Metal-sidan — samma namn i båda backends.

Mätt 2026-11-25 med ett skript som räknar `r.<fält>` per modul. Kolumnen
"utanför" är de *namn* andra moduler läser — det är gränsen, inte antalet
moduler:

| Kluster | Fält | Ägare | Namn utanför | Post |
|---|---|---|---|---|
| depth | 3 | `depth.ddr` | `view` (`device.color_framebuffer`) | `depth.Depth` (24 byte) — **gjord** |
| ui | 10 | `ui.ddr` | inga | `ui.Atlas` (128 byte) — **gjord** |
| ibl | 25 | `ibl.ddr` | inga | `ibl.Environment` (960 byte) — **gjord** |
| shadow | 17 | `shadow.ddr` | `shadowSet` (ibl ×3, vulkan ×1), `shadowSetLayout` (pipeline ×2) | `shadow.Shadow` (120 byte) — **gjord**; de två namnen stannar på `Renderer` |
| post | 12 | `post.ddr` | `sceneFramebuffer` (vulkan ×1), `scenePass`/`compositePass` (pipeline, device, vulkan) | `post.Stage` (96 byte) — **gjord**; de tre namnen stannar |
| capture | 5 | `headless.ddr` | `captureFramebuffer` (vulkan ×2) | `headless.Capture` (56 byte) — **gjord**; `captureFramebuffer` stannar |

`Renderer` har **61 fält** efter de sex flyttarna (121 före): sju poster
(`material`, `depth`, `atlas`, `environment`, `shadow`, `post`, `capture`)
och 54 platta. De 54 är fyra sorter, mätta 2026-11-26 med samma skript som
tabellen (`r.<namn>` per modul utanför `state.ddr`); 25 + 10 + 6 + 13:

- **25 kärna** (`api` … `renderPass`: instans, yta, enhet, kö, pooler,
  synkronisering, swapchain och dess bilder): läses av tio moduler —
  `device` (23 av namnen), `vulkan` (15), `post` (7), `headless` (6), `ui`
  (6), `pipeline` (5), `texture` (4), `ibl` (3), `shadow` (3), `depth` (1).
- **10 pipeline-handtag** (`pipelineLayout`, `pipeline`, `skyPipeline`,
  `transparentPipeline`, deras layouter, shadermoduler och `framebuffers`):
  `pipeline.ddr` skapar dem, `device.ddr` förstör dem och `vulkan.ddr` binder
  dem i varje draw. De är *inte* ett ägarkluster — de är orchestringens
  handtag, samma sort som `shadowSet` — så de stannar.
- **6 gränsnamn** som klusterflyttarna medvetet lämnade: `sceneFramebuffer`,
  `scenePass`, `compositePass` (post), `captureFramebuffer` (capture),
  `shadowSet`, `shadowSetLayout` (shadow).
- **13 orchesteringens egna**: `window`, `vertex`, `meshSetLayouts` och
  frame-state (`current` räknas till kärnan; `frameIndex`, `imageIndex`,
  `pass`, `pendingPass`, `pendingClear`, `lastResult`, `captureOn`,
  `resizePending`, `trace`, `vertexCursor` hör hit). Nästan alla läses bara
  av `vulkan.ddr`; undantagen är `vertex` (device, shadow), `window` (device)
  och `pendingPass` (post).

Regler som gör att flytten inte blir något att "komma ihåg":

- **Posten deklareras av ägaren, inte i `state.ddr`.** `depth.ddr` äger
  `Depth`, `texture.ddr` äger `Material`; `state.ddr` importerar dem och
  håller `depth: depth.Depth`. Den cirkulära importen (`state ↔ depth`,
  `state ↔ texture`) kompilerar (0.12.0, 105 moduler grönt) — ägaren
  behöver `state.Renderer` för `create(&mut r)`, och `state` behöver posten.
- **Storleken pinnas där den står en gång:** `owned_records_keep_their_size`
  i `tests/suite.ddr` (`Depth` 24, `Atlas` 128, `Shadow` 120, `Environment`
  960, `Material` 152, `Stage` 96, `Capture` 56, `Renderer` 6 240 byte — alla mätta, ingen räknad: en
  storlek gissad i huvudet var fel två gånger av tre, och testet var rött
  tills den var mätt). Registret allokerar `size_of(state.Renderer) + 8192`,
  så nästa kluster som flyttar ändrar det talet — medvetet, i testet, inte
  genom att någon glömmer.
- **Läsningarna utanför är gränsen, inte skälet.** Ett kluster med noll
  namn utanför (ui, ibl) flyttas rakt av med en sök-och-ersätt i en fil; ett
  vars handtag binds av andra moduler (shadow: `shadowSet`,
  `shadowSetLayout`; post: `scenePass`, `compositePass`, `sceneFramebuffer`)
  behåller just de namnen på `Renderer` — det är vad de andra modulerna
  *behöver*, och resten av posten läses bara av ägaren. Dunder har inga
  privata fält i en `pub struct`; överenskommelsen hålls av mätningen
  (`r.<namn>` utanför ägaren = 0), inte av kompilatorn.
- **Varje kluster är en commit med AE = 0** mot capturen före. Ingen
  klusterflytt ändrar bilden; den ändrar bara var namnen bor.

Ordningen efter depth var **ui** (10 fält), **ibl** (25), **shadow** (17,
de två set-namnen stannade) — alla 2026-11-25 — och sedan **post** (12
fält, mätt; `scenePass`, `compositePass` och `sceneFramebuffer` stannar) och
**capture** (5; `captureFramebuffer` stannar, `captureOn` är frame-state och
stannar bland de platta fälten) — 2026-11-26. Sex kluster, sex commit:ar,
AE = 0 på var och en. Tabellens kluster är slut; det som återstår av
`Renderer` är kärnan och orchestringens handtag, som hör där.

**Ett tillstånd som lever i ett fält var nästa `r.stage`.** `Renderer.pass`
var `u32` med sex `PASS_*`-konstanter (`IDLE`, `WAITING`, `SHADOW`, `DIRECT`,
`FILTERED`, `COMPOSITE`), läst av sjutton jämförelser och elva tilldelningar
i fyra moduler (28 referenser, räknade med `grep -o`), och gav fyra
felmeddelanden deras text. Det var formen princip 5 förbjuder och steg 4
ersatte med `SetupStep`. Storm-metal hade redan `pub enum Pass { None, Shadow,
Main, FilteredScene, Composite }` och jämför med `.Shadow`. Sedan
2026-11-26 gör Vulkan-sidan detsamma: en enum får inte vara ett
`@c_layout`-fält (E5003, på nytt mätt på 0.12.0), så fältet är `u32` men
rörs **bara** genom två funktioner i `state.ddr` — `state.pass(&r)` läser
det genom den validerande omvandlingen (`Pass(i32(r.pass))` avbryter med
status 108 på ett tal ingen skrivit, medan en if-kedja bara aldrig matchar)
och `state.set_pass(&mut r, .X)` skriver det. De sex konstanterna är borta;
`r.pass` och `PASS_` finns på noll rader utanför `state.ddr` (mätt), och
`the_pass_state_is_an_enum_behind_its_word` pinner att en nollställd
renderare är `.Idle` (registret calloc:ar hela posten, så 0 måste vara
`Idle`) och att varje variant överlever tur och retur. En enum-variant som
inte finns blir omöjlig att skriva; det är hela skillnaden. En commit,
AE = 0 på fem captures (game, studio, Fox, direkt utan efterbehandling,
utan skuggor).

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
  `color: ClearColorValue`, 16 byte). De fyra posterna som är två registriposter
  i rad (`Dependencies`, `Attachments`, `References`, `ShaderStages`) genereras
  från verktygets `PAIRS`-tabell — en post av poster för kontiguitet (fynd 54)
  är ett mönster registret kan ge, inte något att skriva för hand. Ingen av de
  tre filerna har en markör: genererat = genererat, Storms eget står i
  `storm-vulkan/records.ddr`. `enums.ddr` görs på samma sätt:
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
