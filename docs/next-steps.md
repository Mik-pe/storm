# Nästa steg

Milstolpe 2 är klar: scenträd, rendergraph, himmel och PBR-material, med
interaktion (WASD + mus) i ett riktigt fönster. Djupbufferten är också klar
(avsnitt 0c), miljöbelysningen med (avsnitt 0d), editorn, grafen som faktiskt
styr, glTF-laddning och ECS-frågor (avsnitt 0e), och **gränssnittet och den
andra backenden** (avsnitt 0f): samma editor och spelloop på Vulkan (Linux)
och Metal (macOS), genom `storm-gfx`.

Sedan kom **Blomsterskogen** (`77d9b0c`): ett spelbart basspel med fyra egna
paket under kontraktet — `storm-physics`, `storm-play` (fast tick, 60 Hz),
`storm-image` och `storm-mcp` (agentens verktyg på stdio) — som känner
ingen backend. Hur det står i arkitekturen beskriver design.md §1–2;
hur man bygger och provspelar en bana står i [spel.md](spel.md).

Blomsterskogen har nu två provspelade rutter. Fem blommor fullbordar buketten. En frivillig molnbana leder via Studsmolnet till tre bonusfjärilar. Tester spelar båda rutterna med samma indata som en agent kan skicka. [Rutter och slutlägen](spel.md) · [Molnhoppet](molnhopp.mp4)

**Efter 0f och 3a** kommer textursampling för meshmaterial och glTF-bilder (3b–3c); 3b:s beslut är researchade och mätta (se "Beslut inför 3b" under avsnitt 3b: sRGB-blit i linjärt rum enligt spec, `BLIT_SRC` frågas vid uppstart, materialtextur som set 1 byggd på `device.sampled_texture`, anisotropi 8 mot `maxSamplerAnisotropy` 16, glTF-filter utan spec-default väljs linjära, PNG via `packages/zlib`). Studion läser redan scenens noder och materialfaktorer (avsnitt 4). Sedan det som
`storm-gfx` tog ifrån Vulkan-paketet i namn men inte i kropp: **storm-vk**
(genererade bindings). Första delen är landad: `tools/vk.ddr` skriver
`api.ddr` ur `vk.xml` (80 prototyper + `load()`), och `--check` är som
`fmt --check` (utgång 1 om filen skiljer sig från registriet). Anropet är
`dunder run tools/vk.ddr -- /tmp/vk.xml --check` — `--` krävs, annars äter
`dunder run` flaggan själv (`unknown option: --check`). Kvar: `layout.ddr`
(698 rader `@c_layout`, de fel som är tyst minneskorruption) och `enums.ddr`
(34 enums som i dag pinnas av tester mot Khronos-tabellerna) med samma
taggläsare, och paketet som eget namn. Sedan **Renderer-uppdelningen**
(design.md §5). Instancing (5), fler ljus (7) och input (8) kommer efter det.

## Byggtid på Mikparchy

Senaste mätningen: `5a0a9ec` (den genererade `api.ddr` och researchen för 3b) på **16 036 ms** med Dunder 0.12.0 på Mikparchy. Budgeten är 20 s.

Med molnbanan, animationssystemet och den riggade räven byggde `a9c8087` på **15,245 s** med Dunder 0.11.3 på Mikparchy. Mätningen gjordes i en ren klon med beroendena hämtade och föregående binär borttagen. Trädet på `a84ade9` med Dunder 0.12.0: **14 926–15 076 ms** (`--timings`: 1 238 emitterade funktioner, 386 871 MIR-operationer; `--profile-compiler`: `mir_pipeline` 10,4 s av 14,6 s).

`tools/build-time.ddr` mätte tidigare **15 079–15 700 ms** på
`77d9b0c`. Dagen innan var trädet 6 850 ms. Halva ökningen är kompilatorn
(samma commit `54214f3`, Dunder 0.11.0 → 0.11.3: 6,9 → 9,1–10,3 s, fynd
70); den andra halvan är spelets +496 emitterade funktioner (680 → 1 176)
och +115 000 MIR-operationer. Det finns inget enkelt offer: en stubb-`main`
med hela manifestet bygger på 207 ms, `shader.ddr`s inbäddade SPIR-V-ord
(16 982 ord i 28 shaderfunktioner) kostar 70 ms, och `--timings` visar
`mir_pipeline` = 10,0 s av 14,1 s utspridda på allt.

Beslut tills vidare:

- **Ingen ny kod läggs i `main`:s nåfång utan att byggtiden mäts.** Ett
  paket som bara står i manifestet och inte anropas kostar inget: en
  stubb-`main` med alla femton paket bygger på 207 ms. Kostnaden kommer
  när `app.ddr` kallar det. Nästa funktion som drar in ett helt subsystem
  i bildrutan mäts med `tools/build-time.ddr` före och efter.
- **Växer trädet förbi 18 s är nästa steg i Dunder-repot, inte här.**
  `--timings` räknar funktioner och operationer för hela bygget, inte per
  modul eller funktion (fynd 70–71); utan den siffran är varje sänkning en
  bisektion. Rekommendationen står i dogfood.md.
- **`--incremental` är inte vägen runt.** Budgeten gäller från-scratch, och
  den är definierad som kompilatorns väggklocka på Mikparchy.

Varje steg som rör vad en backend ritar vidrör nu **två backends och två
shaderuppsättningar**: `packages/storm-vulkan/shaders/*.glsl` och
`packages/storm-metal/shaders/storm.metal`, och bakom dem
`tools/shaders.ddr`, som måste köras om när den ena ändras. Beviset är en
capture på den backend maskinen har, och `dunder check --target x86_64-linux`
från en Mac håller den andra typgrön.

## 0. Klart: skuggor, transparens och dynamisk graf

Skuggpass med MAX-blending i en R32-bild, transparent pass med egen blend-pipeline
och en rendergraf som återanvänder passföljden tills scenens aktiva pass ändras.

Scenfärgen kan filtreras på GPU:n på både Metal och Vulkan. FXAA och färgtoning med en diskret glöd delar ett fullskärmspass före HUD och editor. Metoden används även för bildexport. När både FXAA och färgeffekter är avstängda går scenen direkt till slutbilden. [Jämför kantutjämningen](kantutjamning.png)

## 0b. Klart: textrenderingen

Textatlasen samplar: UI-vertexen matar `vec4(x, y, u, v)` på location 0 och
`vec4(r, g, b, a)` på location 16, descriptor-layouten deklarerar binding 0 som
`COMBINED_IMAGE_SAMPLER`, och UI-shadern räknar NDC med Vulkans y-ned-konvention.
Felen och deras orsaker står i [dogfood.md](dogfood.md#uppföljning-editor-ui-overlay-effekter-och-textatlasen)
(fynd 34–36).

Editorn mäter och ritar text i fönsterpunkter. Glyfatlasens upplösning följer pixeltätheten och båda grafikvägarna samplar den linjärt. Panelbredd, textmått och träffytor använder samma koordinater. Se [dogfood.md](dogfood.md#uppföljning-textåtergivningen).

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
3a äger `storm-gfx` vertexformatet. Vulkan beskriver det med `layout.vertex_input()` (post med en binding
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
- **PNG i ren Dunder.** Läs `IHDR`, sammanfoga `IDAT` och kontrollera
  `IEND`. Avkoda med `packages/zlib` från Dunder och begränsa utdata till
  summan av radlängderna inklusive filterbyte. FoxFixed ger 3 146 752 byte
  för 1 024 × 1 024 RGB-pixlar. Tillämpa radens filter och expandera RGB
  till RGBA. Testa sedan RGBA och gråskala med alfa.
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

Åtta floats per vertex, 32 byte; `gfx.cube`/`plane` bygger sina ytor med
`gfx.vertex`/`push_quad` och bär uv (0,0)..(1,1) per yta (v = 0 är
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

**Beslut inför 3b (researchad 2026-11-24, mätt på Mikparchys Intel Iris Plus ICL GT2 med ett probprogram mot `libvulkan` direkt):**

- **Mipkedjan byggs med `vkCmdBlitImage` LINEAR mellan `SRGB`-nivåer, och specen tillåter det.** Vulkan-specen, kapitlet *Copies* (`vkCmdBlitImage`): *"For sRGB source formats, nonlinear RGB values are converted to linear representation prior to filtering"* — filtreringen sker alltså i linjärt rum oavsett om käll- och målformat är lika (meningen har inget "if different formats"-villkor i den aktuella texten). Inget UNORM-mellansteg och ingen shader behövs. `VK_FORMAT_R8G8B8A8_SRGB` (43) och `_UNORM` (37) har på den här GPU:n `BLIT_SRC | BLIT_DST | SAMPLED_IMAGE_FILTER_LINEAR` på **båda** tilings (råord 122241/122243, avkodat mot `vk.xml`: bitpos 10, 11, 15).
- **Men `BLIT_SRC` är inte garanterat för något format, så det frågas vid uppstart, inte antas.** VUID-vkCmdBlitImage-srcImage-01999: *"The format features of srcImage must contain VK_FORMAT_FEATURE_BLIT_SRC_BIT"* — ett krav på anroparen, inte ett löfte från drivrutinen. `r.api.GetPhysicalDeviceFormatProperties` finns redan i `api.ddr` (oanvänd av renderern hittills); den anropas när en mipkedja begärs, och saknas flaggorna faller det tillbaka på `mipLevels = 1` och rapporterar det (ingen tyst död kedja). `CmdBlitImage` och posten `ImageBlit` finns inte i `api.ddr`/`layout.ddr` i dag (`Offset3D` gör det); de två genereras in via `tools/vk.ddr` (fynd 51:s regel: ändra `COMMANDS`, generera om, kör `--check`).
- **En textur per material = ett descriptor-set per material i set 1, och det bygger på det som redan finns.** `device.sampled_texture`/`sample_view`/`destroy_texture` (`SampledTexture { sampler, layout, pool, set }`) är redan formen för "en samplad bild" — post-passet och UI-atlasen använder den, var och en med **egen** set-layout eftersom deras pipeliner bara har en textur. Mesh-pipelinen har set 0 med 5 bindingar (`shadow.ddr`: `bindingCount = 5`, `maxSets = 1`), så materialets textur blir **set 1** i samma `VkPipelineLayout`: en *delad* `materialSetLayout` (binding 5, en `CombinedImageSampler`, fragment) skapas en gång bredvid set-layouten, `sampled_texture` får layouten som parameter i stället för att skapa en egen (post/UI skickar sin egen — oförändrat), och `mesh_pass` gör `CmdBindDescriptorSets(set 1)` mellan pipelinen och `CmdDrawIndexed`. En set skapas när texturen laddas — en gång, inte per frame. Push constants är fulla (240 av **256** byte; `maxPushConstantsSize = 256` på den här drivrutinen, Vulkan Core garanterar bara 128 — det är förklaringen till att 320 kraschar och 240 går) så "texturindex i push" är inget alternativ. Bindless (`descriptorIndexing`) är ett senare steg; Vulkan Core garanterar `maxBoundDescriptorSets ≥ 4` och `maxPerStageDescriptorSampledImages ≥ 16`, vilket räcker för 3b och 3c.
- **Anisotropi slås på bara om `features.samplerAnisotropy` är satt (den är det här: 1) och klemmas till `limits.maxSamplerAnisotropy` (16.0).** `VkPhysicalDeviceFeatures` läses vid val av enhet (posten `samplerAnisotropy` = index 19 i `vk.xml`), `maxAnisotropy` i `VkSamplerCreateInfo` sätts till `min(8.0, limit)` — ett val (Filaments `TextureSampler` har `anisotropy = 1` som standard och låter materialet sätta det; 8 är den nivå där skillnaden mot 16 knappt syns). Värdet ligger i en `const` så det går att mäta med en capture. `GetPhysicalDeviceFeatures` anropas inte av `device.ddr` i dag, så läsningen (55 `u32`, `samplerAnisotropy` på index 19) tillkommer vid val av enhet. På Metal: `maxAnisotropy` på `MTLSamplerDescriptor`.
- **glTF-samplernas tal blir en enum i `storm-gltf`, och det som specen lämnar öppet väljs medvetet.** glTF 2.0 §5.26: `wrapS`/`wrapT` är *"Required: No, default: `10497`"* (REPEAT) — det är spec. `magFilter`/`minFilter` är *"Required: No"* **utan angivet default** (WebGL-arvet ger `NEAREST`/`NEAREST_MIPMAP_LINEAR`, och det är också Filaments `TextureSampler()`-standard). Storm väljer `LINEAR`/`LINEAR_MIPMAP_LINEAR` för saknade filter: det är den enda avvikelsen från WebGL-arvet som inte ger blockiga kanter på en 1024²-textur, och den antecknas i `storm-gltf` med denna motivering. FoxFixed.glb (ingen `minFilter`) får trilineär filtrering, och det är *mipkedjan som är förutsättningen* för att det valet ska bli rätt. Vulkanhandtaget (`enums.Filter`, `enums.SamplerAddressMode`) görs i backenden; `storm-gltf` känner inte till Vulkan (design.md §2).
- **NPOT-texturer behåller sin storlek.** glTF §3.8.4.5: *"Client implementations SHOULD resize non-power-of-two textures … when running on platforms that have limited support"* — Vulkan har fullt stöd för NPOT med REPEAT och mipmapping (spec §7.25.2: krav på implementationen), så ingen skalning görs i 3c.
- **PNG: `packages/zlib` i Dunder-repot (`subdir = "packages/zlib"`, redan använt av skrift), inte en egen inflate.** `zlib.decompress(src, offset, length, max_bytes)` ger adler32-kontrollerad utdata med tak; FoxFixed/`Fox.glb` har båda **en** 1024² RGB-PNG (colortype 2, *inget alpha*, endast Paeth-filter 4, en IDAT, 3 146 752 byte). Avkodaren behöver alltså: IHDR (bitdjup 8, färgtyp 2/6/0), IDAT-sammanfogning, fem filter (Paeth på riktiga datan), RGB → RGBA-expansion (alfa = 255). Testas mot båda Fox-filerna och Khronos `Box.glb`.
- **Bevis för 3b (oförändarat):** 2×2-checker genererad i Dunder på en plan-yta, pixelprover i fyra rutor, AE mot baslinjen; sedan en 1024²-textur på avstånd för att visa att mipkedjan dämpar skimret (en capture med `mipLevels = 1` som jämförelse).
`vkCreateImage` + staging + `vkCmdCopyBufferToImage` + layoutövergångar
finns för miljökuben (`ibl.ddr`: `create_cube`, `stage_lut`, `barrier`,
`make_view`, `write_image`) — samma maskineri för en `R8G8B8A8_UNORM`-bild,
plus `vkCreateSampler`, descriptor (binding 5 på mesh-pipelinen; layouten i
`shadow.ddr` går från 5 till 6 bindingar) och `texture(base_color, uv)` i
`mesh.frag`. Bevis: en 2×2-checker genererad i Dunder på en plan-yta,
pixelprover i fyra rutor; `bufferRowLength = 0` betyder tight packning
(spec: "tightly packed according to imageExtent") — PNG-rader är tight.

På Metal finns samma delar, färre steg: `device.texture` (en bild med
mipnivåer), `device.upload` (`replaceRegion:…withBytes:bytesPerRow:`, direkt
i delat minne — ingen staging-buffer och inga layoutövergångar) och
`device.sampler`. Bindningen är nästa lediga index i `record_mesh`: textur 4
(efter skuggkarta, kub, irradians, LUT) och sampler 2, och `MeshVertex` i
`storm.metal` får attributet.

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

## 0f. Klart: gränssnittet och Metal

`storm-gfx` är kontraktet: `Frame`, `Input` med `Key`, `Sky`, `trait Backend`
med `Result` för anrop som kan fallera, och geometrihjälparna som äger
vertexformatet. `src/app.ddr` kör rendergrafen genom `B: gfx.Backend`.
`src/editor.ddr` äger panelerna, `src/game.ddr` spellogiken och `src/gallery.ddr` materialstudien.
`src/main.ddr` väljer backend för fönster och bildexport.
`storm-input` tar ett `Input`-värde och importerar ingen backend.
`storm-metal` är den andra implementationen: AppKit-fönster och `CAMetalLayer`
genom Objective-C:s runtingen, med upplägg och beslut i design.md §5c.

Den signerade macOS-appen har provats på Apple M5, med objektval, materialändringar, fokusläge och panelväxling i ett 720 punkter brett fönster. Metals självtest läser både pixlar och indata. På Mikparchy har samma scen renderats med Vulkan på Intel Iris Plus.

Kvar efter 0f, i den ordning värde:

- **Muslook med en hand.** `storm-metal` vänder AppKit:s `deltaY` (positiv
  uppåt) till Storms y-nedåt. Riktningen är resonerad, inte mätt: AppKit
  räknar ett drags delta ur verkliga musrörelser, så self-testet kan
  syntetisera klick men inte drag. Den första människan som drar med höger
  knapp i fönstret bekräftar eller vänder ett tecken i
  `appkit.ddr` (`on_pointer`).
- **`tools/selectors.ddr`.** Kontrollen av Metal-selektorer mot SDK:s
  rubriker är i dag ett skript utanför repot (dogfood.md *Grafikobservationer
  på macOS*). Som Dunder-program i `tools/`, kört när `storm-metal` rörs, gör
  den samma sak för nästa person.
- **`storm-gfx`-exempel.** `examples/` visar ECS, glTF och text utan fönster;
  ett minimalt "öppna ett fönster och rita en fyrkant" mot kontraktet är det
  som låter nästa backend börja på fem rader.

## 4. glTF-scener

Studion och Blomsterskogen läser den aktiva glTF-scenen med nodtransformer, triangelprimitiver och PBR-material. Nästa steg är bildtexturer och importerade animationsspår för modeller med skelett. Blomsterskogens rävrörelser använder scengrafens leder.

## 5. Instancing

Demot gör en draw call per kub. Med `vkCmdDrawIndexed` och en instansbuffert
(modellmatris + material per instans) blir hela scenen en draw call. Det är
också första gången ECS behöver en "renderbar"-vy: en systemfunktion som
packar om poolerna till GPU-data.

## 7. Fler ljus

Push constants räcker för en sol. Nästa steg är en uniform buffer per frame
(per-frame descriptor set) med en ljusarray, kameraposition och tid.

## 8. Input

`gfx.Input` har `down(key)` för hållna tangenter, `hit(key)` för
engångshändelser (används av spelet och studion för Q, R, E, T, G, F, Esc)
och `mouse.scroll` (inspektorn rullar med hjulet). `storm-input` har
scancodes och en fly-kamera. Kvar: tangenthändelser som händelsekomponent i
ECS (idag läses `hit` direkt i `app.ddr`), textinmatning
(`SDL_TextInputEvent`) och gamepad via `SDL_GameController`.

## 9. Klart – fast speltick

`storm-play` driver fysik och spelregler vid 60 Hz. Fönstret ackumulerar förfluten tid och interpolerar positioner mellan uppdateringarna. Agenten kan stega samma session exakt en tick och läsa resultatet. [Spel och agentverktyg](spel.md)

## Klart: headless capture

`--capture fil.ppm` renderar 1280 × 800 pixlar utan fönster. Vulkan skriver till en textur och kopierar bilden till en läsbar buffer. Metal använder en egen färgtextur. MCP använder samma grafikväg för att leverera en PNG av den aktuella simuleringsticken. [Grafikobservationerna](dogfood.md#grafikobservationer-på-mikparchy)

## Kända begränsningar i dag

- Djupbuffert finns men inget reverserar det: glaset skriver inte djup, så två
  glaspaneler som överlappar varandra blandas i sorteringsordning, inte per pixel.
- Max 8 swapchain-bilder och 8 image views (`state.Renderer`).
- Vertexbufferten börjar på 4 MiB (`gfx.INITIAL_VERTEX_BYTES`) och växer med
  50 % över högsta använda mängden (`gfx.frame_vertex_capacity`); den är
  mappad permanent och rymmer en mesh-ström per draw.
- Meshpasset skickar 240 byte konstanter per draw. På Vulkan är de push
  constants och enhetsvalet kontrollerar `maxPushConstantsSize`; på Metal är
  de ett block per stage (`setVertexBytes:`/`setFragmentBytes:`, högst 4 KB
  var).
- Ett fönster i taget per process. Vulkan håller det i `Registry.active`;
  Metal i att view-klassens eventmetoder skriver en statisk post. Ett andra
  fönster kan öppnas efter att det första stängts, inte bredvid det.
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
- Fönsterläge (`--frames N` utan `--capture`) på en **låst** session avslutas
  med SIGSEGV i **första** framen (sett 2026-11-24 på `ac268f0`, spårat med
  `--trace`): sista markören är `acquired image 0`, nästa (`render pass
  begun`) nås aldrig — alltså faller det mellan `AcquireNextImageKHR` och
  `CmdBeginRenderPass` i `begin_frame`. Capture-vägen går genom samma rader
  och fungerar låst; den enda skillnaden där är `pass.framebuffer`
  (swapchain-framebuffern i stället för capture-framebuffern). QA-punkt:
  markör per anrop i det fönstret, rapportera "session locked" och avsluta
  med status i stället för krasch.
- Valideringslager aktiveras inte automatiskt.
