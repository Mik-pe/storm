# Storm ⚡

En spelmotor skriven i [Dunder](https://github.com/Mik-pe/dunder). Storm finns
för att driva språket framåt: varje del av motorn är ett riktigt program som
kompileras av Dunders egen kompilator, och varje språkproblem vi stöter på
bokförs i [docs/dogfood.md](docs/dogfood.md).

Första milstolpen är ett riktigt Vulkan-fönster: `VK_KHR_swapchain` med
double-buffrade frames, inte readback och inte en SDL-blit. Ovanpå det sitter en
scengraf i ECS, en deklarativ rendergraph, en fullskärmshimmel och
metallic-roughness-PBR med en riktad sol och miljöbelysning: metaller speglar
en miljökub byggd ur samma himmel, prefiltrad per roughness, med en
CPU-genererad BRDF-LUT.

## Förutsättningar

- `dunder` byggd från [9f9b341](https://github.com/Mik-pe/dunder/commit/9f9b341) eller senare på `main`.
- `dunder-skrift` som **syskonkatalog**: `~/Work/dunder-skrift`. Samma
  konvention som `dunder-hundmat` använder. `packages/storm-text` har ett
  `path`-beroende till den.
- `vulkan-icd-loader` + en ICD (`vulkan-intel`, `vulkan-radeon`, …) och `sdl2`
  för fönstret. `glslang` behövs bara när shaders ändras.

```sh
dunder run                      # Vulkan-fönster med tre roterande kuber
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
| [`packages/storm-ecs`](packages/storm-ecs) | Sparse-set ECS: `Pool<T>` med dense lagring, generationshandtag i `EntityAllocator`, swap-remove. | — |
| [`packages/storm-vulkan`](packages/storm-vulkan) | Vulkan 1.0 + `VK_KHR_surface`/`VK_KHR_swapchain` via `std.dl`, SDL-fönster, swapchain, render pass, pipeline med push-constant-MVP, frame-sync, skuggor, djupbuffert och IBL-kartor (miljökub, irradians, BRDF-LUT). | `core` |
| [`packages/storm-gltf`](packages/storm-gltf) | glTF 2.0: GLB-container, accessors (float/index, normaliserade heltal), mesh-utplattning, interleaving. | — |
| [`packages/storm-scene`](packages/storm-scene) | Scengraf: `LocalTransform`, förälderlänkar i ECS och djup-först-propagering till `WorldTransform`. | `core`, `ecs` |
| [`packages/storm-render`](packages/storm-render) | Deklarativ rendergraph: pass med resursläsningar/skrivningar, topologisk ordning och validering. Ren data, testbar utan GPU. | — |
| [`packages/storm-input`](packages/storm-input) | SDL-scancodes, tangentbords- och musläge samt en fly-kamera (WASD/QE, piltangenter, höger musknapp). | `core`, `vulkan` |
| [`packages/storm-text`](packages/storm-text) | Glyfatlas på `dunder-skrift`: rasterisering till 8-bitars coverage, shelf-packing, textlayout till quads. | `dunder-skrift` |

`packages/storm-vulkan` är medvetet fritt från ECS- och speltillstånd: det tar
en `[]f32`-vertexström och en `[f32; 16]`-matris. Motorn kopplar ihop dem.
Renderpasset har en `D32_SFLOAT`-djupbilaga som återskapas med swapchainen.

## Vulkan-fönstret

Ett enkelt färgpass kan spelas in så här.

```dunder
begun := vulkan.begin(opened.window)
if begun.ok {
    _ := vulkan.begin_pass(opened.window)
    _ := vulkan.sky(opened.window, &inv_view_projection.m, &sun, &zenith, &horizon)
    _ := vulkan.mesh(opened.window, &vertices, &mvp, &model, &base_color, &params, &camera, &lighting)
    _ := vulkan.end(opened.window)
}
```

`mesh` tar sex `f32` per vertex för position och normal. Meshpasset använder
240 byte push constants för två matriser, material, kamera och himmelsljus.
Ljusmatrisen ligger i en uniform buffer. Storm kontrollerar enhetens
`maxPushConstantsSize` när den väljer GPU.

Miljöbelysningen byggs en gång efter `open()` med
`vulkan.build_environment(window, &sun, &zenith, &horizon)`: en
`R16G16B16A16_SFLOAT`-miljökub (64 × 64 per yta, sex mipnivåer, nivå 0 är
himlen från origo), en GGX-prefilter per mipnivå, en 16 × 16-irradianskub och
en 64 × 64 `R32G32_SFLOAT`-BRDF-LUT som beräknas på CPU:n i `storm-core`.
De tre kartorna binds på mesh-pipelinens descriptor set 0 (binding 2–4) och
`mesh.frag` räknar ambientet som split-sum: `irradians · kd · albedo / π` plus
`prefiltrad(reflection, roughness) · (F0 · skala + bias)`. Solens direkta term
och skuggorna är oförändrade.

`sky` ritar en fullskärmstriangel på långt plan och rekonstruerar en
världsrymdsstråle ur `inv_view_proj`, så himlen är en riktig dom, inte en
skärmgradient. Solen är en disk plus glöd kring `sun_direction.xyz`, skalad med
`sun_direction.w`.

Rendergrafen i `src/main.ddr` deklarerar passen och deras resurser:

```dunder
mut graph := render.Graph::new()
_ := graph.add_pass("sky", ["color"], [])
_ := graph.add_pass("ground", ["color", "depth"], ["color"])
_ := graph.add_pass("meshes", ["color", "depth"], ["color", "depth"])
order := graph.build()
```

En läsning löses mot den **senaste tidigare** skrivaren, så deklarationsordningen
är tie-breaker och cykler kan inte uppstå. `build()` returnerar namnordningen som
frame-loopen exekverar.

Huvudpasset har en djupbilaga (`D32_SFLOAT`), så opaque geometri behöver ingen
sortering: mesh-pipelinen testar och skriver djup, glaspipelinen testar men
skriver inte. Bara glaset sorteras bakifrån-fram, för blendingens skull.

### Styrning

- **WASD** – gå, **Space/Ctrl** – upp/ner, **Shift** – sprint
- **T** – slå av/på glaspane­rna (transparenspasset försvinner ur grafen)
- **G** – slå av/på skuggor (skuggpasset försvinner ur grafen)
- **E** – slå av/på filmeffekterna (överlägget)
- **Höger musknapp + mus** – titta
- **R** – återställ kameran, **Esc** – avsluta
- `--frames N` – rendera N frames och avsluta (för smoke-test)
- `--capture fil.ppm` – rendera en bildruta till PPM via en mappad bild.
  Även denna väg öppnar SDL och behöver tillgång till en grafisk session.
- `--trace` – skriv varje inlämningssteg

### Fönsterprov och headless-körning

Prova fönstret i en aktiv grafisk session. Under en tidigare körning på en
låst Wayland-session presenterade Storm fem bildrutor och väntade sedan på
nästa swapchain-bild. Över SSH kan du köra `dunder run --example scene`
för ECS och textlayout eller använda `--capture fil.ppm` för bildåterläsning.

Krav: `vulkan-icd-loader`, `vulkan-intel` (eller annan ICD), `sdl2`.
Shaderkompilering kräver `glslang`; de färdiga SPIR-V-orden är incheckade.

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
och ingen typradering. Se `docs/dogfood.md` om varför.

## glTF

```dunder
doc := gltf.load("model.glb")
if !doc.ok { print(doc.error); return 1 }
mesh := gltf.load_mesh(&doc)
stream := gltf.interleave(&mesh)   // [x,y,z,nx,ny,nz] per vertex
```

Laddaren läser `.glb` (JSON- och BIN-chunk) och `.gltf`. Accessorns
`componentType` hanteras för `5126` (float) samt de normaliserade
heltalstyperna. Saknade index genereras som `0..n`. Material, skins och
animation är nästa steg.

## Text

```dunder
face := text.load_face("/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Regular.ttf", 24.0)
mut atlas := text.Atlas::new(1024, 256)
_ := atlas.add_text(&face, "Storm")
quads := atlas.layout("Storm", 24.0, 32.0, 32.0)
```

Atlanten är R8 (en coverage-byte per pixel) och packas med hyllor. Varje
`Quad` har skärmposition, storlek och normaliserade atlas-koordinater.
Renderaren breddar coverage-byten till f32 och laddar upp dem som en
`R32_SFLOAT`-bild (format 100) som samplas med linjär filtrering. Rita texten
nära den storlek den rastrerades vid — `ui.RASTER_SIZE` är 22 px och editorn
använder skalorna 0.8–1.2 — så undviker du både suddiga och taggiga streck.
Renderaren behöver en texturpipeline (descriptor set, sampler, bild) för att
rita dem; Storms egen finns i `packages/storm-vulkan/src/ui.ddr`.

## Bygga

```sh
dunder build                    # bygger src/main.ddr
dunder run --example scene      # ECS/glTF/text utan fönster
dunder test                     # rotpaketets tester
dunder run tools/shaders.ddr    # kompilerar om shaders till src/shader.ddr
dunder run tools/build-time.ddr # bygger från noll; fallerar vid ≥ 20 s
```

## Regler

Kortformen; det fullständiga regelverket står i [AGENTS.md](AGENTS.md).

- **Bygget ska ta under 20 sekunder.** `dunder run tools/build-time.ddr`
  mäter och fallerar annars. En byggnad över budget pushas inte.
- **Bara `main`.** Inga pull requester, inga reviews, ingen CI. Arbete
  commit:as på `main` och pushas direkt när `check`, testerna och
  byggbudgeten är gröna.
- **Noll död kod.** En varning från kompilatorn är ett fel.
- **Dunder-brister bokförs** i [docs/dogfood.md](docs/dogfood.md), ett numrerat
  fynd per brist, medan de är färska.

`tools/shaders.ddr` är ett Dunder-program: det kör `glslangValidator`, läser
SPIR-V-filen och skriver `packages/storm-vulkan/src/shader.ddr`. Inga
byggskript i andra språk.
