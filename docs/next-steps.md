# Nästa steg

Milstolpe 2 är klar: scenträd, rendergraph, himmel och PBR-material, med
interaktion (WASD + mus) i ett riktigt Vulkan-fönster. Djupbufferten är också
klar (avsnitt 0c), miljöbelysningen med (avsnitt 0d), och editorn, grafen
som faktiskt styr, glTF-laddning och ECS-frågor (avsnitt 0e).

**Ordningen efter 0e, beslutad 2026-11-23 mot koden:** först **3a** (UV i
vertexströmmen, ett format överallt), sedan **3b–3c** (sampling, glTF-bilder)
— det är den kedja som gör störst synlig skillnad: Khronos hjälm och räv
renderas idag vitgrå för att `interleave` slänger de UV:er parsern läser.
Därefter **4** (glTF-noder, så scengrafen byggs från filen), och sedan
**storm-gfx-gränssnittet** (design.md §2, princip 7): multiplatform är
planerat (Metal på macOS), så nästa arkitektursteg är att `main.ddr`:s 36
direkta `vulkan.`-anrop och `storm-input`:s beroende av backenden flyttas
upp till ett gränssnitt som inte nämner Vulkan — storm-vulkan blir dess
första implementation, Metal den andra. Först därefter storm-vk (genererade
bindings): 77 `extern fn` och 19 `u32` i `state.ddr` är skuld, men ingen
funktion saknas för den. Instancing (5), fler ljus (7), input (8) och tid
(9) kommer efter det.

## 0. Klart: skuggor, transparens och dynamisk graf

Skuggpass med MAX-blending i en R32-bild, transparent pass med egen blend-pipeline
och en rendergraph som byggs om varje frame utifrån scenens innehåll. Kvar nedan.

## 0b. Klart: textrenderingen

Textatlasen samplar: UI-vertexen matar `vec4(x, y, u, v)` på location 0 och
`vec4(r, g, b, a)` på location 16, descriptor-layouten deklarerar binding 0 som
`COMBINED_IMAGE_SAMPLER`, och UI-shadern räknar NDC med Vulkans y-ned-konvention.
Felen och deras orsaker står i [dogfood.md](dogfood.md#uppföljning-editor-ui-overlay-effekter-och-textatlasen)
(fynd 34–36).

Texten är också *läsbar*: UI- och overlay-pipelinerna blandar nu med riktig
alpha-over (`SRC_ALPHA` / `ONE_MINUS_SRC_ALPHA`, fynd 40), och atlasen rastreras
vid `ui.RASTER_SIZE = 22` px och samplas med `VK_FILTER_LINEAR` i stället för
att rastreras vid 30 px och nedskalas till 17–20 px med närmaste granne (fynd
41). `main.ddr` ritar med namngivna skalor (`TITLE_SCALE` 1.2, `STATUS_SCALE`
0.9, `HEADER_SCALE`/`BODY_SCALE` 0.8), alla nära rastreringsstorleken; höger-
justerad text (`text_width` med samma skala) och chipset (`text_width + 26`,
etikett på `+13`) behöver ingen justering. Se
[dogfood.md](dogfood.md#uppföljning-textåtergivningen).

## 0c. Klart: djupbufferten

Renderpasset har två bilagor: färg och en `D32_SFLOAT`-djupbild (OPTIMAL,
`DEPTH_STENCIL_ATTACHMENT`), som rensas till 1.0 varje frame och återskapas med
swapchainen. Mesh-pipelinen kör `depthTestEnable`/`depthWriteEnable` med `LESS`;
glaspipelinen testar men skriver inte, så glas döljer inte geometrin bakom sig.
Himmeln rör inte djupet. Painter's algoritmen är borta ur `main.ddr`: opaque
ritas i deklarationsordning, bara glaset sorteras bakifrån-fram för blendingens
skull. Beviset står i [dogfood.md](dogfood.md#uppföljning-djupbufferten).

## 0d. Klart: miljöbelysning (IBL)

Metallerna speglar nu himlen i stället för att se ut som pastellplast. Tre
kartor byggs en gång vid start av `ibl.ddr`, alla från samma himmelmodell som
`sky.frag` ritar (samma sol, zenit och horisont som `main.ddr` skickar in):

- **Miljökub**, 64 × 64 per yta, `R16G16B16A16_SFLOAT`, sex mipnivåer. Nivå 0
  är himlen renderad från origo med en fullskärmstriangel per yta (`env.vert`
  återskapar riktningen ur ytans bas, `env.frag` ritar kurvan). Under horisonten
  finns en markton som är ljusast vid horisonten; det är den som ger metallen
  en ton skillnad mellan ovansida (himla) och sidor (mark).
- **Prefiltrad spegel**, nivå *i* är en GGX-importancesamplad konvolution av
  nivå *i − 1* med roughness *i* / 5 (`prefilter.frag`). `mesh.frag` samplar
  med `textureLod(env, r, roughness * 5)`, så guld (0.10) får en skarpare
  spegling än stål (0.28).
- **Diffus irradians**, 16 × 16 per yta, cosinusviktad konvolution av nivå 0
  (`irradiance.frag`). Diffus ambient är `irradians * kd * albedo / π`.
- **BRDF-LUT**, 64 × 64 `R32G32_SFLOAT` med (skala, bias) per (N·V, roughness),
  beräknad på CPU:n i `storm-core.brdf_lut` (UE4:s `IntegrateBRDF`, 512 sampel
  per texel) och uppladdad via en staging-buffer. Spegelambient blir
  `prefiltrad * (F0 * skala + bias)`.

Kartorna binds på mesh-pipelinens descriptor set 0 som binding 2, 3 och 4;
`shadow.ddr` äger setet och deklarerar bindingarna. Push constants är
oförändrade (240 byte). Solens direkta term och skugguppslaget är orörda.
Matematiken (kubytornas baser, projektionen och BRDF-integralen) ligger i
`storm-core` och har sju tester utan display. Felen på vägen står i
[dogfood.md](dogfood.md#uppföljning-ibl) (fynd 46–50).

## 3. Texturer (UV i strömmen, sampling, glTF-bilder)

En vertexström delas av kuber, plan, glTF-modeller och skuggpasset, så
formatet ändras på alla platser i ett steg eller ingen. Idag: 24 byte,
`position vec3` + `normal vec3` (`pipeline.ddr:136`, `shadow.ddr:262`),
`vulkan.cube`/`plane` ger 6 floats, `gltf.interleave` ger 6 fast `Mesh.uvs`
läses från `TEXCOORD_0`.

### 3a. Ett vertexformat: position, normal, uv (nästa)

Åtta floats per vertex, 32 byte, uv `(0,0)` när modellen saknar
`TEXCOORD_0`. Berörda: de två pipeline-beskrivningarna, `vulkan.cube`/
`plane`, `gltf.interleave`, `mesh.vert` (`layout(location = 2) in vec2 uv`,
vidare till `mesh.frag`), `shadow.vert` (läser bara location 0, oförändrad
i beteende). Bevis: `interleave`-test mot Khronos `Box.glb` (6 → 8 floats,
uv = 0) och en texturerad fixtur (`FoxFixed.glb`, 44 KB, CC-BY 4.0 med
attribution i filen: 464 verticer, 1728 index, TEXCOORD_0 + en PNG),
capture med uv som färg (`out = vec4(uv, 0, 1)`) och pixelprover i hörnen;
sedan tillbaka till PBR och AE = 0 mot baslinjen (uv påverkar inte färgen
än). Budget: en timme.

### 3b. Sampling

`vkCreateImage` + staging + `vkCmdCopyBufferToImage` + layoutövergångar
finns för miljökuben (`ibl.ddr`) — samma maskineri för en `R8G8B8A8_UNORM`-
bild, plus `vkCreateSampler`, descriptor (binding 5 på mesh-pipelinen) och
`texture(base_color, uv)` i `mesh.frag`. Bevis: en 2×2-checker genererad i
Dunder på en plan-yta, pixelprover i fyra rutor.

### 3c. glTF-bilder och material

`images`/`textures` ur GLB:n (BIN-chunken håller PNG:erna — avkodning av
PNG krävs; `dunder-skrift` har zlib för sfnt, kolla om den räcker), samt
`pbrMetallicRoughness` (`baseColorFactor`, `baseColorTexture`,
`metallicFactor`, `roughnessFactor`). Bevis: FoxFixed renderas med sin
päls, capture jämförd mot Khronos referensbild i komposition.

## 0e. Klart: grafen som styr, editorn, spelloopen, glTF-laddning, ECS-frågor

Render-grafen äger nu ordningen (`PassKind`, `Compiled.steps`), skuggpasset är
ett pass bland de andra och huvudpasset öppnas lat; editorn listar ECS:et,
väljer, och skriver material/transform via sliders; åtta orber att plocka
med poäng i HUD:en; `--glb` laddar en modell (autoskalad) in i scenen, och
parsern läser riktiga filer (fynd 59); ECS:t har frågor (`join2`/`join3` med
dense-index, `drawables` och orbsystemen använder dem). Repots regler står i
`AGENTS.md` (bygget under 20 s, mätt med `tools/build-time.ddr`; bara main,
inga PR:s eller CI). Kvar: texturer (avsnitt 3), resten av glTF (nodes/
materials/scenes nedan), typade Vulkan-handles (design.md steg 1), sub-5-s-
bygge (fynd 56: det är Dunders kompilator).

## 4. glTF-scener

Laddaren läser geometri (och indexbufferten) och en modell kan laddas in som
scennod med `--glb`. Nästa steg är `nodes` (TRS/matris), `scenes`, och att
bygga scengrafen direkt från filen i stället för att koda den i `main.ddr`;
`materials` och `textures`/`images` hör till texturstegen (3b–3c).

## 5. Instancing

Demot gör en draw call per kub. Med `vkCmdDrawIndexed` och en instansbuffert
(modellmatris + material per instans) blir hela scenen en draw call. Det är
också första gången ECS behöver en "renderbar"-vy: en systemfunktion som
packar om poolerna till GPU-data.

## 7. Fler ljus

Push constants räcker för en sol. Nästa steg är en uniform buffer per frame
(per-frame descriptor set) med en ljusarray, kameraposition och tid.

## 8. Input

`storm-input` har scancodes och en fly-kamera. Kvar: `keys_pressed` som
engångshändelser i ECS, mushjul, textinmatning (`SDL_TextInputEvent`) och
gamepad via `SDL_GameController`.

## 9. Tid och fast steg

`Frame.time` är väggklocka. En `Time`-resurs med `dt`, `elapsed` och en
ackumulator för fasta fysiksteg (t.ex. 120 Hz) hör till kärnan.

## Klart: headless capture

`--capture fil.ppm` skriver en bildruta från en mappad Vulkan-bild.
Över SSH behöver SDL fortfarande tillgång till den grafiska sessionen.
Capture-vägen läser den mappade bilden. [Grafikobservationerna](dogfood.md#grafikobservationer-på-mikparchy)

## Kända begränsningar i dag

- Djupbuffert finns men inget reverserar det: glaset skriver inte djup, så två
  glaspaneler som överlappar varandra blandas i sorteringsordning, inte per pixel.
- En swapchain i taget per process (`Registry.active`).
- Max 8 swapchain-bilder och 8 image views (`state.Renderer`).
- Vertexbufferten är 4 MiB och mappad permanent; en mesh-ström per draw.
- Meshpasset kräver 240 byte push constants. Enhetsvalet kontrollerar `maxPushConstantsSize`.
- Miljökartorna byggs en gång vid start och följer inte solen om den flyttas,
  och de innehåller bara himlen och en markton, inte scenens geometri: kuberna
  speglar varandra inte.
- Miljökuben är 64 × 64 med sex mipnivåer; den skarpaste nivån blurar solskivan
  till några grader, så solens skarpa höjdpunkt kommer från den analytiska
  soltermen och inte från miljökuben.
- Platta kubytor ger en plan spegling per yta (samma reflektionsriktning över
  hela ytan); en horisontlinje *inom* en yta syns först på krökta ytor.
- Marktonen under horisonten är en fast gradient (ljusast vid horisonten), inte
  en rendering av golvet, så golvet syns inte i kuberna.
- Ingen `vkDestroySurfaceKHR`-anrop: `vkDestroyInstance` städar ytan.
- Valideringslager aktiveras inte automatiskt.
