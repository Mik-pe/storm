# Storm ⚡

En spelmotor skriven i [Dunder](https://github.com/Mik-pe/dunder). Storm finns
för att driva språket framåt: varje del av motorn är ett riktigt program som
kompileras av Dunders egen kompilator, och varje språkproblem vi stöter på
bokförs i [docs/dogfood.md](docs/dogfood.md).

Samma editor och samma spelloop körs på två grafikbackends: **Vulkan på
Linux** (i ett SDL-fönster) och **Metal på macOS** (i ett AppKit-fönster, som
Storm når genom Objective-C:s runtime, utan ett bibliotek att installera).
Applikationen talar bara med gränssnittet `storm-gfx`, som inte nämner någon
av dem; `src/main.ddr` väljer backend för både fönstret och agentens bildexport.

Storm startar i **Studio**, där du kan arbeta med scenträdet, ljuset och materialen. **First light** är en liten fysikbana för provspelning. Räven Vallmo och hennes glänta utvecklas som ett eget spel i [Blomsterskogen](https://github.com/Mik-pe/blomsterskogen).

![Materialstudien på macOS](docs/materialstudie-macos.jpg)

## Förutsättningar

- `dunder` 0.13.1 eller senare; senast verifierad med 0.13.1. `layout.ddr` använder
  ett fält som är en fast array av en annan `@c_layout`-post (`VkImageBlit` med
  `[Offset3D; 2]`), en konstruktion som är mätt på 0.12.0 men inte på 0.11.3.
- Git i `PATH` och nätåtkomst vid första bygget. Dunder hämtar de låsta revisionerna av `dunder-skrift` och dess zlib-beroende automatiskt.
- **Linux:** `vulkan-icd-loader` + en ICD (`vulkan-intel`, `vulkan-radeon`, …)
  och `sdl2` för fönstret. `glslangValidator` behövs bara när GLSL-shaders
  ändras.
- **macOS:** inget att installera. Metal och AppKit finns i systemet, och
  Storm når dem genom `libobjc` och ramverken själva. Shaders kompileras av
  systemet när fönstret öppnas, så inte ens en shaderkompilerare behövs: den
  offline (`xcrun metal`) är en nedladdning på flera gigabyte som inte följer
  med Xcode, och Storm klarar sig utan den.
- Editorn använder Arial på macOS och söker efter DejaVu Sans och Liberation Sans på Linux. `--font sökväg` väljer ett eget typsnitt.

```sh
dunder run                      # öppna Storm Studio
dunder run -- --play            # provspela First light
dunder run -- --frames 120      # rita 120 bildrutor och avsluta
dunder run -- --capture a.ppm   # en bildruta utan tangentbord
dunder run --example scene      # ECS + glTF + textlayout, utan fönster
dunder test                     # rotpaketets tester
```

## Redigera Studio med en agent

Starta en lokal Studio-session och anslut MCP-servern `storm-editor` från
[repots MCP-konfiguration](.mcp.json). Agenten kan läsa det öppna scenträdet,
söka och välja objekt, skapa grupper och primitiver, ändra transform,
synlighet och material samt hämta en PNG av samma vy.

```sh
dunder build -o build/storm
./build/storm --editor-session .storm-editor
```

CLI:t använder samma kommandon och skriver JSON. Kör det från reporoten i
en andra terminal.

```sh
./build/storm --editor-command '{"name":"tools/list"}'
./build/storm --editor-session .storm-editor --editor-command '{"name":"editor_inspect"}'
./build/storm --editor-session .storm-editor --editor-command '{"name":"editor_search","arguments":{"query":"brass"}}'
```

Sökfältet i Studio matchar namn även inuti stängda grenar. Tab flyttar fokus
och Esc lämnar sökfältet. Använd `--editor-headless --editor-session FIL` för
automation utanför ett fönster. Studio-ändringar gäller under sessionen.

## Provspela med en agent

I First light styr du spelaren med WASD eller piltangenterna och hoppar med mellanslag. Q pausar och R börjar om.

```sh
dunder build -o build/storm
./build/storm --play
./build/storm --scene bana.storm.json --watch
```

MCP-servern `storm` startar `./build/storm --mcp` från reporoten. En agent kan bygga en bana, provspela bestämda indata och få både positioner och en PNG från GPU:n. Med `--watch` syns nästa sparade banändring i samma fönster. En sparad bana kan öppnas igen med `--scene`. [MCP-konfiguration](.mcp.json)

## Paket

Storms egna paket följer med i samma Git-klon och kan byggas och testas var för sig. Externa paket deklareras med en full Git-revision och ingår i `dunder.lock`.

| Paket | Ansvar | Beroenden |
| --- | --- | --- |
| [`packages/storm-core`](packages/storm-core) | `Vec2`/`Vec3`/`Vec4`, `Mat4` (kolumnmajor), `Color`, projektion, multiplikation, kubytbaser och BRDF-LUT för IBL. Ren Dunder utan OS-åtkomst. | — |
| [`packages/storm-ecs`](packages/storm-ecs) | Sparse-set ECS: `Pool<T>` med dense lagring, generationshandtag i `EntityAllocator`, swap-remove, och frågor (`join2`/`join3` med dense-index). | — |
| [`packages/storm-gfx`](packages/storm-gfx) | **Kontraktet mellan Storm och en backend:** `Frame`, `Input` med `Key`, `Sky`, `Texture`, `Textures` (materialets fem platser), `Encoding` och `Sampler` (värden, aldrig pekare), `trait Backend` med `upload_texture(…, encoding, &sampler)`/`mesh(…, &textures, surface)`, och geometrihjälparna (`cube`, `plane`, `sphere`) som äger vertexformatet. Nämnar ingen backend. Ren Dunder. | — |
| [`packages/storm-vk`](packages/storm-vk) | Vulkan-registret som Dunder: `api.ddr` (82 prototyper + `load()`), `layout.ddr` (77 C-poster ur registret + fyra par-poster) och `enums.ddr` (36 enums) — allt genererat ur Khronos `vk.xml` av `tools/vk.ddr`, inget Storm i sig. | — |
| [`packages/storm-vulkan`](packages/storm-vulkan) | Backend för Linux: Vulkan 1.0 + `VK_KHR_surface`/`VK_KHR_swapchain` via `std.dl`, SDL-fönster, swapchain, render pass, pipeline med push constants, skuggor, djupbuffert och IBL-kartor. | `core`, `gfx`, `vk` |
| [`packages/storm-metal`](packages/storm-metal) | Backend för macOS: AppKit-fönster och `CAMetalLayer` genom Objective-C-runtingen, kommandobuffertar, renderpass, pipelines, skuggor, djupbuffert och IBL-kartor. | `core`, `gfx` |
| [`packages/storm-gltf`](packages/storm-gltf) | glTF 2.0: GLB-container, accessors (float/index, normaliserade heltal), mesh-utplattning, interleaving. Scenval, nodtransformer, PBR-material med `baseColorTexture` (bilder som bytes + samplern som `gfx.Sampler`). | `core`, `gfx` |
| [`packages/storm-scene`](packages/storm-scene) | Scengraf i ECS: `LocalTransform`, `Name`, `Shape`/`Mesh`, `Material`, förälderlänkar och propagering till `WorldTransform`. Modulen `animation` samplar och blandar nyckelposer för position, rotation och skala. | `core`, `ecs`, `gfx` |
| [`packages/storm-render`](packages/storm-render) | Rendergraf och scenrenderare. Sorterar ritlistor, kör bildpass och lämnar plats för spelets HUD. | `core`, `gfx`, `scene` |
| [`packages/storm-assets`](packages/storm-assets) | Placerar glTF-modeller i scenen och laddar deras materialtexturer genom grafikgränssnittet. | `core`, `ecs`, `gfx`, `gltf`, `image`, `scene` |
| [`packages/storm-physics`](packages/storm-physics) | Gravitation, impulser, friktion och kollisioner mellan sfärer och axelriktade lådor. | `core` |
| [`packages/storm-runtime`](packages/storm-runtime) | Spelfönster, provspelningens klocka, scenbevakning och projektgränssnittet `Project`. | Grafikgränssnitt, renderare, scen, indata och UI |
| [`packages/storm-editor`](packages/storm-editor) | Sökbart scenträd, objektval, inspektör och typade redigeringskommandon. | Scen, ECS och UI |
| [`packages/storm-studio`](packages/storm-studio) | Materialstudie, arbetsyta och lokal redigeringssession för MCP och CLI. | Runtime, editor, tillgångar och MCP |
| [`packages/storm-play`](packages/storm-play) | Scenformat, fast simuleringstakt, spelarkontroll och målsensorer. | `core`, `physics` |
| [`packages/storm-mcp`](packages/storm-mcp) | JSON-RPC över stdio, validering av verktygsargument och First light-verktyg. | `play`, `image` |
| [`packages/storm-image`](packages/storm-image) | Renderarens bild som PNG, och PNG samt JPEG (baseline och progressivt; 4:4:4, 4:2:2, 4:2:0, grå, restart-markörer) som RGBA8, valt på filens signatur — 12-bitars JPEG, bitdjup 16 i PNG och Adam7 vägras. Ren Dunder, zlib från Dunder-repot. | `zlib` (git) |
| [`packages/storm-input`](packages/storm-input) | En fly-kamera (WASD, Space/Ctrl, Shift, höger musknapp) styrd av en `gfx.Input`. Importerar ingen backend, så kameran är testbar utan fönster. | `core`, `gfx` |
| [`packages/storm-text`](packages/storm-text) | Glyfatlas på `dunder-skrift`: rasterisering till 8-bitars coverage, shelf-packing, textlayout till quads, och `find_font` som hittar platformens font. | `dunder-skrift` |
| [`packages/storm-ui`](packages/storm-ui) | Immediate-mode UI med kantutjämnad vektorgeometri, typade vyer, textfält, knappar, reglage och tangentfokus. Testbar utan fönster. | `text` |

`src/main.ddr` väljer backend. Samma `storm-render` ritar Studio, provspelningen och förhandsbilderna från MCP. Spel kan använda `storm-runtime` för fönsterloopen eller anropa `render.frame.Renderer` med egen loop. Studio och editorn är valfria för spelreleasen. Se [paketgränserna](docs/design.md#21-spelprojekt-och-studio).

## Fönstret

En bildruta spelas in med kontraktets anrop, som är samma på båda backends:

```dunder
mut window := match metal.open("Storm", 1280, 800) {   // eller vulkan.open
    .Ok(opened) => opened,
    .Err(message) => { _ := sys.eprint("storm: " + message); return 1 },
}
match window.begin() {
    .Ok => {},
    .Err(message) => { _ := sys.eprint("storm: " + message) },
}
_ := window.begin_pass()
_ := window.sky(&inv_view_projection.m, &sun, &zenith, &horizon)
_ := window.mesh(&vertices, &mvp.m, &model.m, &base_color, &params, &camera, &sky, &textures, &emissive_factor, 1.0, .Opaque)
_ := window.end()
```

Varje anrop som kan misslyckas säger varför i sitt `Result`. `mesh` tar tolv
`f32` per vertex för position, normal, UV och tangentramen (`gfx.VERTEX_FLOATS`),
en `Sky` (solen, himlen och ljusmatrisen, samlade i `gfx.sky_params`), kamerans
position och eventuell siktlinje till motivet i `gfx.MeshView`,
materialets fem texturer som **ett** värde `gfx.Textures` (`base`,
`metallic_roughness`, `normal`, `occlusion`, `emissive`; `gfx.no_textures()`
är fem gånger `no_texture()` och låter faktorerna stå), glTF:s
`emissive_factor` (`[f32; 4]`: rgb skalar emissivkartans texel, w är dess
styrka), occlusion-styrkan som ett tal (`occlusionTexture.strength`,
default 1,0) och ytan: `.Opaque` eller `.Blended`.
`upload_texture(pixels, width, height, encoding, &sampler)` ger en `gfx.Texture`
från RGBA8-pixlar: `encoding` säger om texeln är sRGB (en basfärg) eller
linjär (en Metallic/Roughness-, normal- eller occlusion-karta), och mipkedjan
byggs av backenden.

- **På Vulkan** går konstanterna med push constants: 224 byte i meshpasset
  för två matriser, basfärg, materialparametrar, kamera och siktlinje.
  Storleken härleds ur `state.MESH_FLOATS`. Ljusmatrisen ligger i en uniform buffer. Storm kontrollerar enhetens
  `maxPushConstantsSize` när den väljer GPU.
- **På Metal** är samma byte ett struct i adressrymden `constant`, som bundits
  per draw med `setVertexBytes:`/`setFragmentBytes:` (högst 4 KB), så att
  fragmentsteget läser direkt ur det i stället för genom en varying.

Storms klippyta har y **nedåt** och z i `[0, 1]`, som Vulkan. Metal har y
uppåt. Skillnaden lever på ett enda ställe, `storm-metal`'s viewport: origon
längst ner och negativ höjd, så klipp-y = −1 blir översta raden. Varje pass
använder den, och shaders är Vulkan-GLSL:n portad rad för rad.

Skuggor har ett eget pass före huvudpasset: `shadow_begin` → `shadow_mesh` per
objekt → `shadow_end`. Vulkan skriver avståndet till ljuset i en färgbild med
MAX-blending (av historiska skäl, dogfood fynd 23 och 37); Metal skriver en
riktig djupbild utan fragmentfunktion. En djupkarta är det omvända (minst vinner),
så jämförelsen och bias är inverterade där.

Miljöbelysningen byggs en gång efter `open()` med
`window.build_environment(&sky)`: en `R16G16B16A16_SFLOAT`-miljökub (Vulkan;
`RGBA16Float` på Metal), 64 × 64 per yta med sex mipnivåer, nivå 0 är himlen
från origo; en GGX-prefilter per mipnivå; en 16 × 16-irradianskub; och en
64 × 64 BRDF-LUT (`R32G32_SFLOAT`/`RG32Float`) som beräknas på CPU:n i
`storm-core`. `mesh`-shadern räknar ambientet som split-sum: `irradians · kd ·
albedo / π` plus `prefiltrad(reflection, roughness) · (F0 · skala + bias)`.
Solens direkta term och skuggorna är oförändrade. Se
[next-steps 0d](docs/next-steps.md).

`sky` ritar en fullskärmstriangel på långt plan och rekonstruerar en
världsrymdsstråle ur `inv_view_proj`, så himlen är en riktig dom, inte en
skärmgradient.

När kantutjämning eller färgeffekter används ritas scenen först till en färgtextur. Ett fullskärmspass läser texturen och jämnar ut diagonala kanter med FXAA, färgtonar bilden och ger ljusa partier en mjuk glöd enligt de valda inställningarna. Därefter ritas HUD och text i skärmens egen upplösning. Med båda inställningarna avstängda ritas scenen direkt till slutbilden. [Jämför kantutjämningen](docs/kantutjamning.png)

FXAA är på från start. **E** växlar färgtoning och glöd, `--effects` aktiverar dem vid start och `--no-aa` stänger av kantutjämningen.

```dunder
mut schedule := render.Graph::new()
_ := schedule.add_pass(.Shadow, "shadow", ["shadow_map"], [])
_ := schedule.add_pass(.Sky, "sky", ["scene_color", "depth"], [])
_ := schedule.add_pass(.Opaque, "opaque", ["scene_color", "depth"], ["scene_color", "depth", "shadow_map"])
_ := schedule.add_pass(.Transparent, "transparent", ["scene_color"], ["scene_color", "depth"])
_ := schedule.add_pass(.PostProcess, "post", ["display"], ["scene_color"])
_ := schedule.add_pass(.Ui, "ui", ["display"], ["display"])
plan := schedule.compile()
for step in 0..plan.steps.len { kind := plan.steps[step].kind; _ := kind }
```

En läsning löses mot den **senaste tidigare** skrivaren, så deklarationsordningen
är tie-breaker och cykler kan inte uppstå. Grafen äger ordning och existens; den
vet inte vad en backend är. Det är `storm-render` som mappar varje `PassKind` till
anrop på `gfx.Backend` och öppnar huvudpasset lat vid första passet som inte har
ett eget (skuggpasset har sitt eget).

Huvudpasset har en djupbilaga (`D32_SFLOAT` på Vulkan, `Depth32Float` på Metal),
så opaque geometri behöver ingen sortering: mesh-pipelinen testar och skriver
djup, glaspipelinen testar men skriver inte. Bara glaset sorteras bakifrån-fram,
för blendingens skull.

[Visuell ImageGen-referens för editorlayouten](docs/design/storm-editor-reference.png)

### Styrning i materialstudien

- **WASD** – gå, **Space/Ctrl** – upp/ner, **Shift** – sprint,
  **höger musknapp + mus** – titta
- **Vänsterklick** i editorpanelen – välj en nod i trädet; slidrarna skriver
  material och transform i scengrafen. **Add cube** och **Delete** ändrar scenen.
- **Tabb** och **Skift + Tabb** flyttar fokus. **Retur** aktiverar fokuserade knappar, och **vänster/höger** ändrar ett fokuserat reglage.
- **Gå in i en orb** – plocka den. De ligger under **Collectibles** i scenträdet.
- **T** – slå av/på glaspanelerna, **G** – skuggor, **E** – färgtoning och glöd.
  Samma reglage finns i inspektorn. **F** växlar fokusläge. I smala fönster öppnas **Scene** och **Inspector** var för sig.
- **R** – återställ kameran och orbringen, **Esc** – avsluta
- `--frames N` – rendera N frames och avsluta (för smoke-test)
- `--help` (eller `-h`) – skriv varje flagga med en rad och avsluta. Listan är
  hela programmet: ett test (`tests/flags.ddr`) håller varje `--x` i `src/`
  mot en rad i `args.flags()`, så en flagga utan hjälp-rad är rött.
- `--scene fil` – ladda en bana i stället för demobanan; `--watch` läser om
  den när filen sparas; `--font sökväg` väljer UI-typsnittet
- `--capture fil.ppm` – rendera en bildruta till PPM, 1280 × 800 pixlar, utan att öppna ett fönster.
  Fungerar på en låst session; det är så QA görs utan tangentbord.
- `--eye x y z` – starta kameran på en given punkt, vänd mot scenens mitt
  (`--at x y z` ändrar målet; `--yaw a`/`--pitch b` ger en egen vinkel). Utan
  `--eye` står kameran på baslinjen som varje pixeljämförelse mäter mot.
- `--glb fil.glb` – ladda en modell in i studion: den står på pallen mitt på
  turntablen (och roterar med den), studiens egna tre pjäser viker, och
  skalan är den största som håller modellen hel i bildens 3D-vy --
  beräknad ur modellens hörn genom kamerans projektion (`app.fit_scale`),
  så en räv 155 enheter lång och 25 bred fyller vyn som en kub gör
- `--texture fil.ppm` – studions golv bär en Storm-capture (P6, läst med
  `image.read_rgba`); inget annat i scenen har textur. Utan flaggan är golvet
  `gfx.no_textures()`. I spelet (`--play`, en bana) vägras flaggan med en
  text: det finns inget golv att bära den.
- `--no-glass` och `--no-shadows` stänger av glaset respektive skuggorna vid start. Inspektorn har också reglagen **Anti-aliasing** och **Color and glow**.
- `--trace` – skriv varje inläsningssteg

### Kör på macOS

Inget behöver låsas upp eller förberedas: `dunder run` öppnar ett fönster,
och `--capture` fungerar från ett skript eller en agent. Tangentbordet går
till nyckelfönstret, och det blir fönstret när systemet låter applikationen
aktivera sig själv: lanserad av LaunchServices (Finder, Docken, `open`) är det
det direkt, mätt till 0 ms; en process startad i bakgrunden, från en agents
skal, får inte aktivera sig och får tangenterna efter ett klick på fönstret.

Som en vanlig Mac-applikation byggs Storm som en signerad bundle:

```sh
dunder build --app -o build/Storm.app
open build/Storm.app
```

På Retina rastreras texten med displayens täthet (två pixlar per punkt), så
den är skarp och lika stor som på en 1×-skärm.

`packages/storm-metal/tools/selftest.ddr` provar det en capture inte visar:
att tangentbord, mus, storleksändring och stängning fungerar, att djuptest och
baksidessortering gör rätt, och att bilden inte är upp-och-ner. Programmet ger utgångsstatus 0 när alla kontroller går igenom:

```sh
cd packages/storm-metal && dunder run tools/selftest.ddr
```

### Kör på Linux

Fönstret kan öppnas på en **låst** Wayland-session (`hyprctl monitors` visar
`solitaryBlockedBy`): `--frames N` presenterar och avslutar med status 0 —
mätt 10/10 på `a919b02` och 10/10 på `9f879c9`, och med fem varianter (`--studio`, `--play`, `--glb`,
`--effects`, `--no-post --no-aa`) à 20 frames. Det fanns en tid (fynd 16 och 20,
och en SIGSEGV på `ac268f0`) då låset stoppade presentationen; det gäller inte
trädet längre. Däremot syns bilden inte: skärmdump och `grim` blockeras av
låsytan, så `--capture fil.ppm --frames 1` är vägen till en **bild** oavsett
låsning. Den vägen använder Vulkan direkt och fungerar även över SSH utan grafisk session.
`dunder run --example scene` kör ECS och textlayout helt utan fönster.

Från en Mac kan Vulkan-sidan ändå hållas grön i typ: `dunder check --target
x86_64-linux` (och `--target arm64-linux`) typkontrollerar hela trädet med
Vulkan-backenden vald, och Dunder länkar till och med en statisk Linux-binär.
En bildruta kan bara ses på en Linux-maskin med Vulkan.

## ECS

```dunder
mut allocator := ecs.EntityAllocator::new()
mut positions := ecs.Pool<Position>::new()
e := allocator.create()
_ := positions.insert(e, Position { x: 1.0, y: 2.0 })
print(positions.get(e).x)      // 1.0
positions.get_mut(e).x = 3.0
_ := positions.remove(e)      // .Some(Position) — swap-remove behåller packning
```

Handtaget är `(index, generation)`. `destroy` bumpar generationen, så ett
gammalt handtag matchar aldrig en återvunnen plats. `Pool<T>` kräver
`T: Storable`, vilket structar och enum utan resursfält uppfyller.

System är vanliga funktioner som tar poolerna de behöver — ingen reflektion
och ingen typradering. En fråga över flera pooler är data, inte en closure
(Dunder har inga capturing closures): `join2`/`join3` returnerar `[]Match` med
varje pools dense-index, och systemloopen läser genom `at(index)`/`at_mut(index)`
utan sparse-uppslag:

```dunder
// Read inside the query; write through the graph afterwards. `names()` returns
// a &Pool<T>, so bind it to a local (dogfood fynd 60); `set_*` needs &mut Graph.
mut doomed: []ecs.Entity = []
names := graph.names()
locals := graph.locals()
for row in ecs.join2(names, locals) {
    if is_orb(names.at(row.a).value) { doomed.push(row.entity) }
}
for entity in doomed { _ := graph.destroy(entity) }
```

En fråga är en ögonblicksbild: en komponent som tas bort flyttar sista raden
(swap-remove), så system som tar bort samlar entiteter i loopen och tar bort
efter den. Se `docs/dogfood.md` "Om ECS-frågorna".

## glTF

```dunder
doc := gltf.load("model.glb")
if !doc.ok { print(doc.error); return 1 }
mesh := gltf.load_mesh(&doc)
stream := gltf.interleave(&mesh)   // [x,y,z,nx,ny,nz,u,v] per vertex
```

Laddaren läser `.glb` (JSON- och BIN-chunk) och `.gltf`. Accessorns
`componentType` hanteras för `5126` (float) samt de normaliserade
heltalstyperna. Saknade index genereras som `0..n`; finns index expanderar
`interleave` genom dem (Khronos `Box.glb` är fixtur och läses: 24 verticer, 36
index). `TEXCOORD_0` följer med i vertexströmmen. Om UV saknas används (0, 0). I studion läser `--glb fil.glb` den valda glTF-scenen med nodtransformer, alla triangelprimitiver och deras PBR-färger, metallvärden och grovhet. Varje del kan väljas i scenträdet.

## Text

```dunder
face := text.load_font(24.0)                 // plattformens UI-typsnitt
mut atlas := text.Atlas::new(1024, 1024)
_ := atlas.add_text(&face, "Storm")
quads := atlas.layout("Storm", atlas.raster_size(), 32.0, 32.0)
```

Atlanten är R8 (en coverage-byte per pixel) och packas med hyllor. Varje
`Quad` har skärmposition, storlek och normaliserade atlas-koordinater.
Atlasen vet själv i vilken pixelstorlek dess glyfer rastrerades
(`raster_size`), och `ui.Canvas` frågar den: texten ritas `RASTER_SIZE` punkter
oavsett, så en Retina-display packar atlasen på dubbla storleken och får
dubbel skärpa. Rita texten nära den storlek den rastrerades vid — `ui.RASTER_SIZE`
är 22 px och editorn ritar 11–22 punkter, alltså skalorna 0.5–1.0. En backend behöver en
texturpipeline för att rita dem; Storms egna finns i `packages/storm-vulkan/src/ui.ddr`
och `packages/storm-metal/src/ui.ddr`.

## Bygga

```sh
dunder build                    # bygger src/main.ddr
dunder run --example scene      # ECS/glTF/text utan fönster
dunder test                     # rotpaketets tester; och i varje packages/*
dunder run tools/shaders.ddr -- --check   # GLSL → SPIR-V: utgång 1 om shader.ddr skiljer sig från källorna
dunder run tools/shaders.ddr               # … eller skriv om den efter en shaderändring
dunder run tools/vk.ddr -- /tmp/vk.xml --check   # registret → storm-vk: utgång 1 om en av de tre filerna skiljer sig
dunder run tools/build-time.ddr # bygger från noll; fallerar vid ≥ 20 s
dunder run tools/check.ddr      # varje programrot (tools/, examples/, packages/*/tools/) och varje svit (rotens + packages/*/tests) typkontrolleras; varje rot namnges på stderr före kompilatorns rad, domen säger vilken kompilator; utgång 1 när en inte gör det
```

Vulkans SPIR-V ligger i `packages/storm-vulkan/src/shader.ddr`, en avledd
fil: `tools/shaders.ddr` kompilerar `packages/storm-vulkan/shaders/*` med
`glslangValidator`. `--check` har samma kontrakt som `tools/vk.ddr --check`
— efter en ändring i GLSL-koden kör du det, och det fallerar tills modulen
är omgenererad. `tools/vk.ddr` skriver `packages/storm-vk/` (Vulkan-posterna,
prototyperna och enums ur Khronos `vk.xml`, som hämtas med
`curl -o /tmp/vk.xml https://raw.githubusercontent.com/KhronosGroup/Vulkan-Docs/main/xml/vk.xml`);
inget i storm-vulkan skrivs av det. Metal bäddar in `packages/storm-metal/shaders/storm.metal` direkt vid bygget.

## Regler

Kortformen; det fullständiga regelverket står i [AGENTS.md](AGENTS.md).

- **Bygget ska ta under 20 sekunder** på Mikparchy. `dunder run tools/build-time.ddr`
  mäter och fallerar annars, även när bygget självt fallerar. En byggnad över
  budget pushas inte.
- **Varje programrot och varje svit ska typkontrolleras.** `dunder run
  tools/check.ddr` går igenom `tools/`, `examples/` och `packages/*/tools/`
  — rötter som `dunder check` utan argument aldrig når — och varje svit:
  rotens och `packages/*/tests/`, för `dunder check` i ett paket når bara
  dess `src/`, och en test-backend som implementerar ett kontrakt är kod
  som ska följa med det. Grinden fallerar med namnet på den som inte
  kompilerar. Listan är härledd ur trädet, så ett nytt verktyg eller paket
  står under porten utan att registreras.
- **Bara `main`.** Inga pull requester, inga reviews, ingen CI. Arbete
  commit:as på `main` och pushas direkt när `check`, testerna och
  byggbudgeten är gröna.
- **Från första principer — tänk stort, inte bandaid.** Skilj fakta från
  val och designa grunden så att problemet upphör att finnas, i stället
  för att lappa ovanpå en grund som inte bär. Om en fix kräver att man
  "kommer ihåg" något är grunden fel.
- **Framtidssäker arkitekturen.** Appen och pakagen talar bara med
  gränssnittet `storm-gfx`, aldrig med en backend: `storm-vulkan` och
  `storm-metal` är dess två implementationer, och inget annat paket nämner
  Vulkan eller Metal. Se [docs/design.md](docs/design.md) §2.
- **Noll död kod.** En varning från kompilatorn är ett fel.
- **Dunder-brister bokförs** i [docs/dogfood.md](docs/dogfood.md), ett numrerat
  fynd per brist, medan de är färska.
- **Pixelbevis krävs för grafik.** En capture är ett faktum; en self-test
  som läser pixlar och input är det som kan köras igen.
