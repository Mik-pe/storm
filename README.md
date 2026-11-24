# Storm ⚡

En spelmotor skriven i [Dunder](https://github.com/Mik-pe/dunder). Storm finns
för att driva språket framåt: varje del av motorn är ett riktigt program som
kompileras av Dunders egen kompilator, och varje språkproblem vi stöter på
bokförs i [docs/dogfood.md](docs/dogfood.md).

Samma editor och samma spelloop körs på två grafikbackends: **Vulkan på
Linux** (i ett SDL-fönster) och **Metal på macOS** (i ett AppKit-fönster, som
Storm når genom Objective-C:s runtime, utan ett bibliotek att installera).
Applicationen talar bara med gränssnittet `storm-gfx`, som inte nämner någon
av dem; vilken backend en maskin får bestäms av två rader i `src/main.ddr`.

Scenen är en solig himmel, ett golv, tre metalliska kuber som kretsar kring en
föräldernod och två glaspaneler: metallic-roughness-PBR med en riktad sol,
skuggor och miljöbelysning (metaller speglar en miljökub byggd ur samma
himmel, prefiltrad per roughness, med en BRDF-LUT beräknad på CPU:n). Ovanpå
det sitter editorn och spelloopen: åtta emissiva orber att plocka, en panel
som listar ECS:et och skriver material och transform, och `--glb` som laddar
en riktig modell in i scenen.

## Förutsättningar

- `dunder` 0.11.0 eller senare (verifierat med 0.11.0).
- `dunder-skrift` som **syskonkatalog** bredvid `storm` (till exempel
  `~/dev/dunder-skrift`). `packages/storm-text` har ett `path`-beroende till
  den.
- **Linux:** `vulkan-icd-loader` + en ICD (`vulkan-intel`, `vulkan-radeon`, …)
  och `sdl2` för fönstret. `glslangValidator` behövs bara när GLSL-shaders
  ändras.
- **macOS:** inget att installera. Metal och AppKit finns i systemet, och
  Storm når dem genom `libobjc` och ramverken själva. Shaders kompileras av
  systemet när fönstret öppnas, så inte ens en shaderkompilerare behövs: den
  offline (`xcrun metal`) är en nedladdning på flera gigabyte som inte följer
  med Xcode, och Storm klarar sig utan den.
- En monospacefont. Storm letar själv: JetBrains Mono Nerd Font, DejaVu Sans
  Mono (Debians och Arch:s sökvägar), Menlo och SF Mono, i den ordningen;
  `--font sökväg` väljer en egen.

```sh
dunder run                      # fönstret: scen, editor, orber
dunder run -- --frames 120      # rita 120 bildrutor och avsluta
dunder run -- --capture a.ppm   # en bildruta utan tangentbord
dunder run --example scene      # ECS + glTF + textlayout, utan fönster
dunder test                     # rotpaketets tester
```

## Paket

Repot är ett monorepo med ett paket per ansvarsområde. Beroenden deklareras med
lokala `path`-beroenden i rotmanifestet, så varje paket kan byggas och testas
för sig.

| Paket | Ansvar | Beroenden |
| --- | --- | --- |
| [`packages/storm-core`](packages/storm-core) | `Vec2`/`Vec3`/`Vec4`, `Mat4` (kolumnmajor), `Color`, projektion, multiplikation, kubytbaser och BRDF-LUT för IBL. Ren Dunder utan OS-åtkomst. | — |
| [`packages/storm-ecs`](packages/storm-ecs) | Sparse-set ECS: `Pool<T>` med dense lagring, generationshandtag i `EntityAllocator`, swap-remove, och frågor (`join2`/`join3` med dense-index). | — |
| [`packages/storm-gfx`](packages/storm-gfx) | **Kontraktet mellan Storm och en backend:** `Frame`, `Input` med `Key`, `Sky`, `trait Backend`, och geometrihjälparna (`cube`, `plane`) som äger vertexformatet. Nämnar ingen backend. Ren Dunder. | — |
| [`packages/storm-vulkan`](packages/storm-vulkan) | Backend för Linux: Vulkan 1.0 + `VK_KHR_surface`/`VK_KHR_swapchain` via `std.dl`, SDL-fönster, swapchain, render pass, pipeline med push constants, skuggor, djupbuffert och IBL-kartor. | `core`, `gfx` |
| [`packages/storm-metal`](packages/storm-metal) | Backend för macOS: AppKit-fönster och `CAMetalLayer` genom Objective-C-runtingen, kommandobuffertar, renderpass, pipelines, skuggor, djupbuffert och IBL-kartor. | `core`, `gfx` |
| [`packages/storm-gltf`](packages/storm-gltf) | glTF 2.0: GLB-container, accessors (float/index, normaliserade heltal), mesh-utplattning, interleaving. Läser riktiga Khronos-filer. | — |
| [`packages/storm-scene`](packages/storm-scene) | Scengraf i ECS: `LocalTransform`, `Name`, `Shape`/`Mesh`, `Material`, förälderlänkar och djup-först-propagering till `WorldTransform`. `drawables()` är vad renderaren konsumerar. | `core`, `ecs` |
| [`packages/storm-render`](packages/storm-render) | Deklarativ rendergraph: `PassKind`, pass med resursläsningar/skrivningar, topologisk ordning och validering. Ren data, testbar utan GPU. | — |
| [`packages/storm-input`](packages/storm-input) | En fly-kamera (WASD, Space/Ctrl, Shift, höger musknapp) styrd av en `gfx.Input`. Importerar ingen backend, så kameran är testbar utan fönster. | `core`, `gfx` |
| [`packages/storm-text`](packages/storm-text) | Glyfatlas på `dunder-skrift`: rasterisering till 8-bitars coverage, shelf-packing, textlayout till quads, och `find_font` som hittar platformens font. | `dunder-skrift` |
| [`packages/storm-ui`](packages/storm-ui) | Immediate-mode UI: canvas som emitterar vertexar i punkter, samt widgets (`button`, `slider`, `row`) med `Pointer` och hot/active-id. Testbar utan fönster. | `text` |

`src/main.ddr` är sammansättningens rot: de två raderna som namnger en
backend. Allt annat i `src/` (editorn, spelet, exekutorn som mappar varje
`PassKind` till backendanrop) är skrivet mot `gfx.Backend` och är samma kod
på båda backends.

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
_ := window.mesh(&vertices, &mvp.m, &model.m, &base_color, &params, &camera, &sky, .Opaque)
_ := window.end()
```

Varje anrop som kan misslyckas säger varför i sitt `Result`. `mesh` tar åtta
`f32` per vertex för position, normal och UV, en `Sky` (solen, himlen och
ljusmatrisen, samlade i `gfx.sky_params`) och kamerans position.

- **På Vulkan** går konstanterna med push constants: 240 byte i meshpasset
  (två matriser, material, kamera och himmelsljus), och ljusmatrisen ligger i
  en uniform buffer. Storm kontrollerar enhetens `maxPushConstantsSize` när
  den väljer GPU.
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

Rendergrafen i `src/app.ddr` deklarerar passen varje frame utifrån vad scenen
faktiskt innehåller — en avstängd pass är inte i schemat alls, inte en no-op:

```dunder
mut schedule := render.Graph::new()
_ := schedule.add_pass(.Shadow, "shadow", ["shadow_map"], [])
_ := schedule.add_pass(.Sky, "sky", ["color", "depth"], [])
_ := schedule.add_pass(.Opaque, "opaque", ["color", "depth"], ["color", "depth", "shadow_map"])
_ := schedule.add_pass(.Transparent, "transparent", ["color"], ["color", "depth"])
plan := schedule.compile()
for step in 0..plan.steps.len { kind := plan.steps[step].kind }
```

En läsning löses mot den **senaste tidigare** skrivaren, så deklarationsordningen
är tie-breaker och cykler kan inte uppstå. Grafen äger ordning och existens; den
vet inte vad en backend är. Det är `app.ddr` som mappar varje `PassKind` till
anrop på `gfx.Backend` och öppnar huvudpasset lat vid första passet som inte har
ett eget (skuggpasset har sitt eget).

Huvudpasset har en djupbilaga (`D32_SFLOAT` på Vulkan, `Depth32Float` på Metal),
så opaque geometri behöver ingen sortering: mesh-pipelinen testar och skriver
djup, glaspipelinen testar men skriver inte. Bara glaset sorteras bakifrån-fram,
för blendingens skull.

### Styrning

- **WASD** – gå, **Space/Ctrl** – upp/ner, **Shift** – sprint,
  **höger musknapp + mus** – titta
- **Vänsterklick** i editorpanelen – välj en nod i trädet; slidrarna skriver
  material och transform rakt in i ECS:et, `+ cube`/`delete` lägger till och tar bort
- **Gå in i en orb** – plocka den (entiteten förstörs, HUD:en räknar)
- **T** – slå av/på glaspanelerna, **G** – skuggor, **E** – filmeffekterna.
  Chipsen längst ner ("T glass", "G shadows", "E effects") visar läget.
- **R** – återställ kameran och orbringen, **Esc** – avsluta
- `--frames N` – rendera N frames och avsluta (för smoke-test)
- `--capture fil.ppm` – rendera en bildruta till PPM via en mappad bild.
  Fungerar på en låst session; det är så QA görs utan tangentbord.
- `--eye x y z` – starta kameran på en given punkt, vänd mot scenens mitt
  (`--at x y z` ändrar målet; `--yaw a`/`--pitch b` ger en egen vinkel). Utan
  `--eye` står kameran på baslinjen som varje pixeljämförelse mäter mot.
- `--glb fil.glb` – ladda en modell in i scenen (autoskalad, stående på
  marken mitt framför kameran)
- `--no-glass`, `--no-shadows`, `--effects` – startläget för de tre toggles
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
baksidessortering gör rätt, och att bilden inte är upp-och-ner. 60 kontroller,
1,4 s, utgångsstatus 0 när alla håller:

```sh
cd packages/storm-metal && dunder run tools/selftest.ddr
```

### Kör på Linux

Fönstret kräver en **olåst** Wayland-session (`hyprctl monitors` visar
`solitaryBlockedBy`). Under en låst session kan Storm inte hämta nästa
swapchain-bild efter de första frame-rutorna — det är kompositorn, inte
renderaren (dogfood fynd 16 och 20). Då är `--capture fil.ppm --frames 1` vägen
till en bild; över SSH fungerar den om SDL når Wayland-sessionen.
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
positions.get(e).x            // 1.0
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
index). `TEXCOORD_0` följer med i vertexströmmen. Om UV saknas används (0, 0). Material, texturer, noder och animation är nästa
steg. I appen laddar `--glb fil.glb` en modell in i scenen som en `Mesh`-komponent.

## Text

```dunder
face := text.load_font(24.0)                 // platformens monospacefont
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
är 22 px och editorn använder skalorna 0.8–1.2. En backend behöver en
texturpipeline för att rita dem; Storms egna finns i `packages/storm-vulkan/src/ui.ddr`
och `packages/storm-metal/src/ui.ddr`.

## Bygga

```sh
dunder build                    # bygger src/main.ddr
dunder run --example scene      # ECS/glTF/text utan fönster
dunder test                     # rotpaketets tester; och i varje packages/*
dunder run tools/shaders.ddr    # GLSL → SPIR-V, Metal-källa → Dunder-modul
dunder run tools/build-time.ddr # bygger från noll; fallerar vid ≥ 20 s
```

`tools/shaders.ddr` är ett Dunder-program. För Vulkan kör det `glslangValidator`,
läser SPIR-V-filen och skriver `packages/storm-vulkan/src/shader.ddr`; för Metal
läser det `packages/storm-metal/shaders/storm.metal` och skriver källan som en
råsträng i `packages/storm-metal/src/shader.ddr`. Båda modulerna är incheckade,
så ett bygge behöver ingen shaderkompilerare. (Metal-källan kan inte bäddas in
med `@embed_file`: ett beroende hittar inte sina egna filer, dogfood fynd 65.)

## Regler

Kortformen; det fullständiga regelverket står i [AGENTS.md](AGENTS.md).

- **Bygget ska ta under 20 sekunder** på Mikparchy. `dunder run tools/build-time.ddr`
  mäter och fallerar annars, även när bygget självt fallerar. En byggnad över
  budget pushas inte.
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
