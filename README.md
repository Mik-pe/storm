# Storm ⚡

En spelmotor skriven i [Dunder](https://github.com/Mik-pe/dunder). Storm finns
för att driva språket framåt: varje del av motorn är ett riktigt program som
kompileras av Dunders egen kompilator, och varje språkproblem vi stöter på
bokförs i [docs/dogfood.md](docs/dogfood.md).

Första milstolpen är ett riktigt Vulkan-fönster: `VK_KHR_swapchain` med
double-buffrade frames, inte readback och inte en SDL-blit.

```sh
dunder run                      # Vulkan-fönster med tre roterande kuber
dunder run --example scene      # ECS + glTF + textlayout, utan fönster
dunder test                     # hela sviten
```

## Paket

Repot är ett monorepo med ett paket per ansvarsområde. Beroenden deklareras med
lokala `path`-beroenden i rotmanifestet, så varje paket kan byggas och testas
för sig.

| Paket | Ansvar | Beroenden |
| --- | --- | --- |
| [`packages/storm-core`](packages/storm-core) | `Vec2`/`Vec3`/`Vec4`, `Mat4` (kolumnmajor), `Color`, projektion och multiplikation. Ren Dunder utan OS-åtkomst. | — |
| [`packages/storm-ecs`](packages/storm-ecs) | Sparse-set ECS: `Pool<T>` med dense lagring, generationshandtag i `EntityAllocator`, swap-remove. | — |
| [`packages/storm-vulkan`](packages/storm-vulkan) | Vulkan 1.0 + `VK_KHR_surface`/`VK_KHR_swapchain` via `std.dl`, SDL-fönster, swapchain, render pass, pipeline med push-constant-MVP, frame-sync. | — |
| [`packages/storm-gltf`](packages/storm-gltf) | glTF 2.0: GLB-container, accessors (float/index, normaliserade heltal), mesh-utplattning, interleaving. | — |
| [`packages/storm-text`](packages/storm-text) | Glyfatlas på `dunder-skrift`: rasterisering till 8-bitars coverage, shelf-packing, textlayout till quads. | `dunder-skrift` |

`packages/storm-vulkan` är medvetet fritt från ECS- och speltillstånd: det tar
en `[]f32`-vertexström och en `[f32; 16]`-matris. Motorn kopplar ihop dem.

## Vulkan-fönstret

```dunder
opened := vulkan.open("Storm", 1100, 740)
if !opened.ok { print(opened.error); return 1 }
mut vertices: []f32 = []
vulkan.triangle(&mut vertices, -0.5, -0.5, 0.0,  0.5, -0.5, 0.0,  0.0, 0.5, 0.0,
    1.0, 0.4, 0.2, 1.0)
mut running := true
while running {
    frame := vulkan.poll(opened.window)
    if frame.closed || frame.key == 27 { running = false; continue }
    drawn := vulkan.draw_identity(opened.window, &vertices)
    if !drawn.ok { print(drawn.error); running = false }
}
vulkan.close(opened.window)
```

Vertexformatet är interleaved `[x, y, z, r, g, b, a]` (`f32`, 28 byte).
`draw` tar en kolumnmajor `mat4` som push constant. Swapchain-formatet väljs
från `vkGetPhysicalDeviceSurfaceFormatsKHR` (B8G8R8A8 föredras), present-läget
är FIFO, och en resize återskapar swapchain, image views, framebuffers och
render pass.

Sätt `vulkan.set_trace(window, true)` för att skriva varje steg i en
inlämning till stdout — det var så deadlocken på frame 5 lokaliserades.

### Körning kräver en aktiv grafisk session

Vulkan-fönstret kräver att compositorn faktiskt presenterar. Ett **låst**
Wayland-session (`session lock`) slutar lämna tillbaka swapchain-bilder, och då
blockerar `vkAcquireNextImageKHR` när bildpoolen är slut — efter
`minImageCount + 1` bildrutor. Det är förväntat, inte en motorbugg. Verifiera
därför fönstret i en olåst session, eller använd `--example scene` för den
huvudsakliga logiken.

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
Renderaren behöver en texturpipeline (descriptor set, sampler, R8-bild) för att
rita dem — se [docs/next-steps.md](docs/next-steps.md).

## Bygga

```sh
dunder build                    # bygger src/main.ddr
dunder run --example scene      # ECS/glTF/text utan fönster
dunder test                     # hela sviten
dunder run tools/shaders.ddr    # kompilerar om shaders till src/shader.ddr
```

`tools/shaders.ddr` är ett Dunder-program: det kör `glslangValidator`, läser
SPIR-V-filen och skriver `packages/storm-vulkan/src/shader.ddr`. Inga
byggskript i andra språk.
