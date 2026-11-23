# Nästa steg

Milstolpe 2 är klar: scenträd, rendergraph, himmel och PBR-material, med
interaktion (WASD + mus) i ett riktigt Vulkan-fönster. Djupbufferten är också
klar (avsnitt 0c), miljöbelysningen med (avsnitt 0d), och editorn, grafen
som faktiskt styr, glTF-laddning och ECS-frågor (avsnitt 0e).

**Ordningen efter 0e, beslutad 2026-11-23 mot koden:** först **3a** (UV i
vertexströmmen, ett format överallt — *klart*), sedan **3b–3c** (sampling,
glTF-bilder) — det är den kedja som gör störst synlig skillnad: Khronos hjälm
och räv renderas fortfarande vitgrå, men deras UV:er ligger nu i strömmen
(`interleave` läser `TEXCOORD_0`, `(0,0)` när den saknas) och väntar på en
sampler. Därefter **4** (glTF-noder, så scengrafen byggs från filen), och sedan
**storm-gfx-gränssnittet** (design.md §2, princip 7): multiplatform är
planerat (Metal på macOS), så nästa arkitektursteg är att `main.ddr`:s 33
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

En vertexström delas av kuber, plan, glTF-modeller och skuggpasset. Sedan
3a äger **ett ställe** formatet: `layout.vertex_input()` (post med en binding
och tre attribut, `VERTEX_FLOATS = 8`, `VERTEX_BYTES = 32`) och
`enums.apply_vertex_input` skriver dess enum-fält; `pipeline.ddr` och
`shadow.ddr` deklarerar samma post, och `mesh_pass`/`shadow.mesh` validerar
`len % VERTEX_FLOATS`. Stride, offset och format finns inte på någon annan
plats i paketet.

### Beslut inför 3a–3c (researchad 2026-11-23)

- **Ett ställe äger vertexformatet.** Inte två pipeline-beskrivningar som
  hålls lika "för hand". Ett `vk.Attributes`-värde med tre attribut
  (location 0 pos, 1 normal, 2 uv; offset 0/12/24, stride 32) byggs av en
  funktion i `pipeline.ddr`, och `shadow.ddr` använder samma beskrivning
  (shadern läser bara location 0, men pipelinen måste fortfarande deklarera
  allt bufferten innehåller — annars läser skuggpasset 24-byte-stride ur
  en 32-byte-ström och hela skuggkartan blir fel *utan något felmeddelande*).
  Det är det enda sättet "ändra på alla platser eller ingen" upphör att vara
  en regel man kommer ihåg: det finns en plats. `stride` och `% 8`-valideringen
  i `mesh_pass`/`shadow.mesh` härleds ur samma konstant (`VERTEX_FLOATS`).
- **Ingen V-flip. Någonsin.** glTF 2.0 §3.8.3: UV (0,0) är bildens **övre
  vänstra** hörn. Vulkan, D3D och Metal har alla samma konvention — bara
  OpenGL (och WebGL via `UNPACK_FLIP_Y`) har nedre vänstra. Storm samplar i
  Vulkan: `texture(base_color, uv)` rakt av, bilden laddas som den ligger i
  PNG:n (rad 0 = överst). OpenGL-reflexen `v = 1 - v` är fel här; den ska
  inte ens finnas som kommentar i koden, bara här som förklaring.
- **UV saknas → `(0, 0)`, inte fel.** Khronos `Box.glb` har bara `POSITION`
  + `NORMAL` (verifierat mot filen), FoxFixed har `TEXCOORD_0`. Filament gör
  samma val (en dummy-buffert för UV0 när materialet inte kräver den).
- **`R8G8B8A8_SRGB` för `baseColorTexture`, `UNORM` för allt annat.** Spec
  §3.9.2: "The base color texture MUST contain 8-bit values encoded with the
  sRGB transfer function … decoded to real linear values before any
  computations; SHOULD be decoded before linear interpolation" — hårdvarans
  sRGB-avkodning vid sampling uppfyller exakt det, och Storms `mesh.frag`
  räknar redan linjärt och tonemappar med ACES. `metallicRoughnessTexture`
  (G = roughness, B = metallic), normal- och occlusion-kartor är **linjära**
  (UNORM). PNG:ns egen ICC/gamma ignoreras (spec: "MUST be ignored").
  `enums.Format` har båda (`R8G8B8A8_SRGB = 43`, `_UNORM = 37`).
- **PNG i ren Dunder — zlib finns redan.** `dunder-skrift` har en publik
  pur-Dunder `zlib_decompress(src, offset, length, expected_len)` (RFC 1950/
  1951, WOFF1:s tavlor). *Bevisat:* den dekomprimerar FoxFixed `IDAT`
  (26 707 byte) byte-identiskt mot Pythons zlib — 3 146 752 byte = 1024 ×
  1024 × 3 + 1024 filterbyte — på 0,27 s. `expected_len = 0` betyder okänd
  längd (används bara för `reserve`). Det som saknas är PNG-containern:
  chunk-walk (`IHDR`/`IDAT`/`IEND`, längd big-endian), ihopsättning av
  flera `IDAT`-chunkar (FoxFixed har en, spec tillåter flera), och de fem
  filtertyperna (None/Sub/Up/Average/Paeth, en filterbyte per rad). FoxFixed
  är enklast möjliga: 1024², bitdepth 8, **colortype 2 (RGB)**, interlace 0
  → avkodaren måste expandera RGB→RGBA; colortype 6 (RGBA) och 4 (grå+alfa)
  kommer näst, interlace (Adam7) och palett senare. `zlib_decompress` bor i
  `skrift.sfnt`; antingen importeras den därifrån (ett teckensnittspaket som
  avkodningspunkt för texturer är fel lager) eller lyfts till `std.bytes`/
  ett `std.inflate` i Dunder-repot — det senare är rätt hemvist, eftersom
  både WOFF, PNG och ZIP är konsumenter. *Beslut: lyft till Dunder-stdlib
  (eget fynd), använd `skrift.sfnt` till dess.*
- **Sampler från glTF:s `samplers[]`, inte hårdkodat.** FoxFixed:
  `magFilter 9729` (LINEAR), `wrapS/T 10497` (REPEAT), ingen `minFilter`
  (→ implementation-defined enligt spec; Fox.glb anger 9987 =
  LINEAR_MIPMAP_LINEAR, så mipmaps är att vänta). Storm har
  `enums.Filter` och `enums.SamplerAddressMode`; glTF-talen (9728/9729,
  33071/33648/10497) ska vara en enum i `storm-gltf`, inte ett `i32` som
  skickas mot Vulkan. Första steget (3b, checkermönster utan fil) använder
  `ClampToEdge` + `Linear` som `ibl.create_sampler` redan gör.
- **Mipmap från dag ett.** En 1024²-textur utan mipmaps skimrar på avstånd;
  `blit`-kedjan finns i `ibl.ddr` (`create_cube` med mipnivåer). Kedjan
  byggs med `vkCmdBlitImage` per nivå (inget `vkGenerateMipmaps` i Vulkan 1.0
  utan `VK_KHR_maintenance5`/1.3) — eller först med `mipLevels = 1` och
  `maxLod = 0` som bevis, mipmaps som 3b:2.

### 3a. Klart: ett vertexformat — position, normal, uv

Åtta floats per vertex, 32 byte; `vulkan.cube`/`plane` bygger sina ytor med
`vulkan.vertex`/`push_quad` och bär uv (0,0)..(1,1) per yta (v = 0 är
bildens överkant, glTF-konventionen — ingen flip i shadern), `gltf.interleave`
läser `TEXCOORD_0` och ger `(0,0)` när primitiven saknar den, `mesh.vert`
skickar `uv` vidare på location 9. Bevis: `interleave`-tester mot Khronos
`Box.glb` (36 index × 8 floats, alla uv = 0) och `FoxFixed.glb` (464
verticer, 1728 index, `TEXCOORD_0` men ingen `NORMAL`; uv (0.5287, 0.6786)
för index 0, utläst ur filen med Python innan testet skrevs);
`vertex_input_declares_the_whole_stream` pinner C-ordningen (storlek 48,
16 byte mellan attributen, råorden `[0,0,0,0][1,0,0,12][2,0,0,24]`).
Capture med uv som färg (`out = vec4(uv, 0, 1)`, sonder, inte committad):
kubyta (214,83) → (127,159) från övre-vänster till nedre-höger, himlen
(180,200,227) oförändrad; tillbaka till PBR: **AE = 0** mot baslinjen för
både standardscenen och `--glb FoxFixed.glb`. De tre sista råa enum-heltalen
i `shadow.ddr` är borta (design.md steg 2: 3 → 0).

### 3b. Sampling (nästa)

`vkCreateImage` + staging + `vkCmdCopyBufferToImage` + layoutövergångar
finns för miljökuben (`ibl.ddr`: `create_cube`, `stage_lut`, `barrier`,
`make_view`, `write_image`) — samma maskineri för en `R8G8B8A8_UNORM`-bild,
plus `vkCreateSampler`, descriptor (binding 5 på mesh-pipelinen; layouten i
`shadow.ddr` går från 5 till 6 bindingar) och `texture(base_color, uv)` i
`mesh.frag`. Bevis: en 2×2-checker genererad i Dunder på en plan-yta,
pixelprover i fyra rutor; `bufferRowLength = 0` betyder tight packning
(spec: "tightly packed according to imageExtent") — PNG-rader är tight.

### 3c. glTF-bilder och material

`images`/`textures`/`samplers`/`pbrMetallicRoughness` (`baseColorFactor`
× `baseColorTexture`, `metallicFactor`, `roughnessFactor`) ur GLB:n, med
PNG-avkodningen ovan. Bevis: FoxFixed renderas med sin päls (compare mot
Khronos referensbild i komposition), och `Box.glb` (ingen textur, bara
`baseColorFactor` röd) renderas fortfarande röd — faktorn utan textur är
den vanligaste glTF-materialtypen och får inte brytas.

## 0e. Klart: grafen som styr, editorn, spelloopen, glTF-laddning, ECS-frågor

Render-grafen äger nu ordningen (`PassKind`, `Compiled.steps`), skuggpasset är
ett pass bland de andra och huvudpasset öppnas lat; editorn listar ECS:et,
väljer, och skriver material/transform via sliders; åtta orber att plocka
med poäng i HUD:en; `--glb` laddar en modell (autoskalad) in i scenen, och
parsern läser riktiga filer (fynd 59); ECS:t har frågor (`join2`/`join3` med
dense-index, `drawables` och orbsystemen använder dem). Repots regler står i
`AGENTS.md` (bygget under 20 s, mätt med `tools/build-time.ddr`; bara main,
inga PR:s eller CI). Kvar: texturer (avsnitt 3), resten av glTF (nodes/
materials/scenes nedan), `storm-vk` som eget paket (design.md steg 1), sub-5-s-
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
- Fönsterläge (`--frames N` utan `--capture`) på en **låst** session avslutas
  med SIGSEGV efter device-valet i stället för ett fel (sett 2026-11-23 på
  oförändrad `7ae442a`; `--capture` fungerar låst). QA-punkt: hitta anropet
  (markörer enligt `dunder-development`), rapportera "session locked" och
  avsluta med status i stället för krasch.
- Valideringslager aktiveras inte automatiskt.
