# Storm — design från första principer

> Status: **levande dokument** — uppmätt 2026-11-23 mot trädet efter
> `storm-gfx` och Metal-backenden. Skrevs efter djupbufferten, av en
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
7. **Multiplatform är planerat, inte hypotetiskt — och nu genomfört.** Metal
   på macOS lades till utan att röra ett enda paket ovanför backenden.
   Regeln som gjorde det verkligt: appen och pakagen talar med
   `storm-gfx`-kontraktet, aldrig med en backend. Uppmätt 2026-11-23:
   `src/app.ddr` (757 rader) namnger ingen backend och gör 0 anrop mot en
   sådan; `storm-input` importerar ingen backend; i hela trädet finns
   backendnamn utanför de två backendpaketen bara på två rader, i
   `src/main.ddr` (11 rader). Ett gränssnitt som inte går att beskriva utan
   att nämna Vulkan (eller Metal) är fel designat.

## 1. Nuläge (mätt i koden, 2026-11-23)

- **storm-gfx**: en modul, 211 rader: `Frame`, `Input` med `Key` (19 tangenter
  som bitar i en `u32`), `Mouse`, `Sky`, `Surface`, `trait Backend` med 18
  metoder (varje fallibel en `Result` som säger varför), och
  geometrihjälparna som äger vertexformatet. Sju tester, inga med fönster.
- **3 råa enum-heltal** i storm-vulkans pipeline-state (var 135 före steg 2):
  `shadow.ddr` 262–265 (`inputRate: 0`, `format: 106` ×2). De väntar på
  next-steps 3a. Fyra `sType: 18` skrivs också för hand (`ui.ddr` ×2,
  `post.ddr` ×2).
- **Enums är ett eget lager** i båda backends: storm-vulkans `enums.ddr` har
  33 enums och 228 anrop går genom dess konverterare; storm-metals har 26
  enums och 26 konverterare, med vart och ett värde låst mot en tabell som
  SDK:s egen kompilator skriver ut.
- **Vulkans `Renderer`: 132 fält** (`state.ddr`), 18 stage-markörer, och
  varje Vulkan-anrop binder dessutom sin `VkResult`-kod. **Metals
  `Renderer`: 33 fält** — resten ägs av `appkit.Window`,
  `ibl.Environment`, `ui.Atlas`, `device.Buffer` och `device.Pipeline`, var
  och en med sin skapare och sin förstörare.
- **Beroenden:** `storm-input -> storm-gfx` (ett `Input`-värde, ingen
  backend, inga capabilities), `storm-text -> dunder-skrift` via
  `../../../dunder-skrift` (syskonkatalog utan versionslås),
  `src/main.ddr -> storm-vulkan, storm-metal` (de enda).
- **Ett gränssnitt, två implementationer:** 86 tester på macOS (var 75 på
  Linux dagen innan), 60 kontroller i Metals self-test, en statisk
  x86_64-linux-binär länkad från Macen.

Lagren i storm-vulkan (4 973 rader + 2 900 genererad SPIR-V):

| Lager | Moduler | Rader |
|---|---|---|
| FFI-bindings | `api.ddr`, `layout.ddr`, `sdl.ddr` | 1 194 |
| Enums vid gränsen | `enums.ddr` | 342 |
| Backend-tjänster | `device.ddr`, `pipeline.ddr`, `shadow.ddr`, `depth.ddr`, `headless.ddr`, `ibl.ddr` | 2 004 |
| App-nära kod | `ui.ddr`, `post.ddr` | 640 |
| Orkestrering | `vulkan.ddr`, `state.ddr` | 793 |

Lagren i storm-metal (2 184 rader + 433 rader Metal-källa i en genererad
modul):

| Lager | Moduler | Rader |
|---|---|---|
| Runtingen | `objc.ddr` | 269 |
| Ramverkens värden | `enums.ddr`, `records.ddr` | 189 |
| Fönstret och input | `appkit.ddr` | 508 |
| Vad enheten gör, hur ett pass öppnas | `device.ddr`, `pass.ddr` | 346 |
| Backend-tjänster | `ibl.ddr`, `ui.ddr`, `capture.ddr` | 295 |
| Orkestrering | `metal.ddr` | 577 |

## 2. Struktur: vad som står, och vad som ska stå

```
storm-gfx        kontraktet: typer, trait Backend, vertexformat. Känner ingen backend.
    ▲        ▲
storm-vulkan  storm-metal    implementationer av kontraktet (Linux, macOS)
    ▲        ▲
    └── src/main.ddr        sammansättningens rot: två rader som väljer backend
            src/app.ddr     editorn, spelet, exekutorn — generisk över B: gfx.Backend
```

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
  `Renderer` med 33 fält, och en skapare och en förstörare per ägd resurs).
- `vulkan.ddr`:s 17 setup-steg → en `Setup`-kedja med `Result` (kvar; på
  kontraktets nivå är det klart: varje anrop är en `Result`).
- `ui.ddr` + `post.ddr` ur backend-lagret (kvar).
- **`storm-input` slutar bero på backenden: klart.** Handtaget `Window`
  flyttades inte till `storm-core`; i stället är input ett *värde*:
  backenden rapporterar `gfx.Input` per frame, kameran tar det, och
  kameran är testbar utan fönster (två nya tester).
- `dunder-skrift` låses: git-revision eller versions-pinned dependency (kvar).

## 5. Migration, stegvis

Varje steg lämnar träd och tester grönt. Capture-filer före/efter måste
vara **pixelidentiska** (AE = 0) om inte steget medvetet ändrar bilden.

1. **Skapa `storm-vk` med enums + bindings.** *Status: enums-modulen finns
    (`packages/storm-vulkan/src/enums.ddr`, 33 enums, 228 anrop);
    paketdelningen är kvar.*
2. **Ersätt de 133 heltalen** med enums. *Status: klart 2026-11-23. 135 →
    **3** råa enum-heltal i structfält (`shadow.ddr:262–265`), som
    next-steps 3a tar.*
3. **Dela upp `Renderer` i ägda strukturer.** *Status: första halvan klar
    2026-11-23 (fynd 52 löst, 53–55 dokumenterade); `Renderer`-structen på
    132 fält är kvar i storm-vulkan. Storm-metal har den uppdelningen
    redan.*
4. **`Result` istället för `stage`.** *Status: `VkResult` är en enum med
    Khronos-värden och 92 anrop binder sin kod; `r.stage = N` som
    stegmarkör är kvar internt i storm-vulkan. **Kontraktet är helt
    `Result`:** varje fallibel metod i `gfx.Backend` säger varför.*
5. **Dra `ui.ddr`/`post.ddr` ur backenden.** Kvar.
6. **Lås skrift-dependency.** Kvar.
7. **`storm-gfx` och Metal.** *Status: klart 2026-11-23 — kontraktet, en
    app generisk över backenden, och den andra implementationen, utan att
    ett paket ovanför backenden rördes utöver att byta namn från
    `vulkan.X` till `gfx.X`. Se §5c.*

## 5b. Editorn och scenen, som den står

Scenen bor i ECS:et (`storm-scene`: `LocalTransform` med olikformig skala,
`Name`, `Mesh { shape, vertices }`, `Material`); `drawables()` är det enda
renderaren konsumerar. Render-grafen (`storm-render`) äger passordningen och
-existensen; `src/app.ddr` är exekutorn som mappar `PassKind` → anrop på
`gfx.Backend` och öppnar huvudpasset lat. Editorn är immediate-mode ovanpå
`storm-ui`-widgets (`Pointer`, hot/active-id), skriver i ECS via fält-id:n
(`MaterialField`, `TransformField`) eftersom en `Option` inte kan bära `&mut`
(E3099). En laddad glTF-modell är en `Mesh`-komponent med egen vertexström.
Kvar här: texturer (avsnitt 3 i next-steps) och 3D-markering av vald nod.

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
- **Shaders som källkod, kompilerade av systemet.** 433 rader Metal som en
  råsträng i en genererad modul (`tools/shaders.ddr`, samma mönster som
  Vulkan-SPIR-V:n), kompilerade av `newLibraryWithSource:` när fönstret
  öppnas: 42 ms första gången, 0–1 ms efteråt (systemet cachar). Den
  offline (`xcrun metal`) är en nedladdning på flera gigabyte som inte
  följer med Xcode, och `@embed_file` går inte (ett beroende hittar inte sina
  egna filer — fynd 63).

Ägarskap följer Objective-C:s namn: `alloc`, `init`, `new`, `copy` ger ett
ägt objekt som släpps exakt en gång, i `close`, i omvänd skapandeordning;
allt annat är autoreleasat och lever till ramens pool töms. En command buffer
håller sina resurser vid liv tills den är klar, så inget frigörs under GPU:n.

Dunders aliasregel formade koden: `f(&mut r, r.field)` vägras ("mutable
arguments must not alias another borrow in the same call"), så de funktioner
som *kontrollerar* tar en delad lån (`require_main(&r)`) och varje draw
binder sitt eget med delade lån, i stället för en hjälpfunktion som tar hela
renderaren mutabelt vid sidan av en pekare in i den.

## 6. Öppna frågor

- **Genererade bindings?** Att hålla 300+ entry points för hand är det som
  orsakade blend-buggen. För Vulkan: ett litet Dunder-verktyg som läser
  Khronos `vk.xml` och skriver enums + structar. För Metal behövs det inte
  på samma sätt: det som hålls för hand är 107 selektorer och 40 typer av
  meddelanden, och det som håller dem ärliga är kontrollen mot SDK:s
  rubriker (§3) — vilken i sin tur vore naturlig som ett Dunder-verktyg i
  `tools/`, när den ska köras av fler än den som skrev den.
- **Safe-lager?** Räcker enums + `Result`, eller ska det finnas builders?
  Förslag: enums + `Result` först (klart på kontraktets nivå), builders när
  vi ser vad som är besvärligt att använda.
- **Tidsram.** Vulkan-paketdelningen (`storm-vk`) och Renderer-uppdelningen
  är 1–2 dagars arbete.
- **Subagent-orthogonalitet.** Arbetspaketen ska kunna köras parallellt i
  varsin worktree utan att krocka. Textur 3a rör vertexformatet, som nu
  ägs av `storm-gfx` men konsumeras av två backends och två shaderuppsätt-
  ningar: det steget bör köras seriellt och först på den ena backenden,
  sedan den andra.
