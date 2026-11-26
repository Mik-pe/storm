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

**3b och 3c är landade (2026-11-24, 2026-11-25):** en mesh samplar en materialtextur (`gfx.Texture`, mipkedja via `vkCmdBlitImage`, vit 1×1-fallback, set 1 på mesh-pipelinen), och en glTF-modells `baseColorTexture` följer med in i bilden: `storm-image` avkodar PNG i ren Dunder, `storm-gltf` läser bilder och samplers, varje textur har sin egen `gfx.Sampler`, och FoxFixed.glb renderas med pälsen (bevis i avsnitt 3c). **JPEG är landat (2026-11-26, baseline + progressivt, se "Kvar i 3c").** Kvar i 3c: Metal:s mipkedja, `wrapT`, anisotropi. **3d, steg 1 är landat (2026-11-25):** materialets fem texturer (`gfx.Textures`: base, metallic_roughness, normal, occlusion, emissive) går genom kedjan — kontrakt → scen → båda backendar → shader → glTF-läsare (`TextureInfo`: bild, sampler) → app — och MR-kartan läses: `metallic = factor × B`, `roughness = factor × G` (glTF 2.0 §3.9.2), varje uppladdning bär sin encoding (bara basen är sRGB). Set 1 skrivs **per draw** ur en pool utan tak (avsnitt 3d beslut 2, rättat). Bevis: Avokado renderas som ogenomskinlig frukt (före: grönt glas — filen saknar `metallicFactor`, specens default 1.0 vann över kartans 0), AE 0 på spelscenen, 18,4 s bygge. **3d, steg 2 är landat (2026-11-26, `5361964`):** emissive — `emissiveFactor` och `KHR_materials_emissive_strength` som `[f32; 4]` (`.w` = styrkan), den emissiva kartan läst (sRGB), och lyktan i Khronos Lantern tänd. Det som gjorde platsen: solen, himlen och fyllnadsljuset (16 ord) flyttades ur push-constants, som bara bar per-draw-värden, in i set 0:s `Light`-uniform (beslut 3, omskrivet). Kvar i 3d, i ordningen: occlusion → normal (3e). Se avsnitt 3d.
**storm-vk är landat (2026-11-25, design.md steg 1):** registret är ett eget
paket, `packages/storm-vk`, och `tools/vk.ddr` skriver dess tre filer helt
ur `vk.xml` — `api.ddr` (82 prototyper + `load()`; `vkResetDescriptorPool`
kom med 3d steg 1, för set-pooler som frigörs per frame), `layout.ddr` (71
`@c_layout`-poster med en `impl X { pub unsafe fn new() -> X }`-fabrik per post
som nollställer och skriver `sType`; de fyra par-posterna `Dependencies`,
`Attachments`, `References`, `ShaderStages` kommer från verktygets `PAIRS`-tabell)
och `enums.ddr` (35 enums, urvalet som data i verktyget, talen ur registret).
Ingen fil har en markör och ingen importerar `gfx` eller `core`;
`--check` jämför hela filen (utgång 1 om den skiljer sig från registret;
`--check api`/`--check layout`/`--check enums` för en fil). Anropet är
`dunder run tools/vk.ddr -- /tmp/vk.xml --check` — `--` krävs, annars äter
`dunder run` flaggan själv (`unknown option: --check`). Storms val ovanpå
registret — vertexformaterna, `Blend` och `apply_*`, `DisplayEncoding`/
`FrameViewport`, `binding_word`/`stages_word`, `is_success`/`is_out_of_date`,
vilka display-format capture läser — bor i `storm-vulkan/records.ddr` (158
rader, handskrivna). Registrets tester (Khronos-tabellerna, C-ABI-storlekar,
paren, `load()` mot riktiga libvulkan) följde med till `storm-vk/tests`.
Kvar i storm-vk var `state.ddr`:s `MemoryProperties` (läst ur ett rått
`raw[]`-fältord i `device.ddr`, med heap *i* på ord `66 + i` där registriet
har `66 + 4i`) och `Properties`/`Limits` (en handskriven post vars sista
1 024 byte var en gissad `rest: [u64; 128]`) — båda är
sedan 2026-11-26 registriets poster (`VkPhysicalDeviceMemoryProperties`,
520 byte, och `VkPhysicalDeviceProperties`, 824 byte, var och en med
sina offsets pinnade mot gcc), och generatorn vägrar en bredd den inte
översätter i stället för att skriva `u32`. Kvar: `DisplayEncoding`/
`FrameViewport` (Storms poster med egna fält, därför handskrivna i `records.ddr`), och
`device.ddr` läser `properties.deviceType` som `1`/`2` (`VkPhysicalDeviceType`
finns i registret, inte i `enums.ddr`). Sedan **Renderer-uppdelningen**,
kluster för kluster (design.md §3b): `depth.Depth`, `ui.Atlas`,
`ibl.Environment` och `shadow.Shadow` är gjorda (2026-11-25, `Renderer`
121 → 72 fält), och 2026-11-26 följde `post.Stage` (12 fält mätta; `scenePass`,
`compositePass`, `sceneFramebuffer` lämnas) och `headless.Capture` (5;
`captureFramebuffer` lämnas) — `Renderer` 61 fält, sju poster och 54 platta.
Tabellens kluster är slut; pipelines (10 handtag som `vulkan.ddr` binder i
varje draw) är orchestringens, inte ett kluster, och stannar (design.md §3b).
Instancing (5), fler ljus (7) och input (8) kommer efter det.

## Byggtid på Mikparchy

Senaste mätning: **18 509 och 18 513 ms** på `460c428` (post- och capture-flyttarna) och **18 540 ms** på `6a4e683` (`gfx.Button`) — tre `tools/build-time.ddr` på morgonen 2026-11-26, Dunder 0.12.0, Mikparchy. Innan det: **18 385 och 18 395 ms** på `e264590` + `--help`-tabellen (två mätningar samma kväll; 18 200 och 18 244 ms på `9f879c9`, 18 996 ms samma kväll under belastning). Det är 16,4 s → 18,4 s sedan `decode_png` + zlib nås från `main` (avsnitt 3c, fynd 82). Före det: **16 249 ms** på trädet med `depth.Depth` och 16 197–16 523 ms på `1a7f0e2`. Budgeten är 20 s.

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
`tools/shaders.ddr`, som har `--check` sedan 2026-11-24 (utgång 1 när
`shader.ddr` skiljer sig från vad källorna kompileras till; en include som
`display.glsl` räknas, eftersom verktyget kompilerar om allt) — regeln
"kör om verktyget" är därmed ett kommando som fallerar, inte en att komma
ihåg. Beviset är en
capture på den backend maskinen har, och `dunder check --target x86_64-linux`
från en Mac håller den andra typgrön.

## 0. Klart: skuggor, transparens och dynamisk graf

Skuggpass med MAX-blending i en R32-bild, transparent pass med egen blend-pipeline
och en rendergraf som återanvänder passföljden tills scenens aktiva pass ändras.

Scenfärgen kan filtreras på GPU:n på både Metal och Vulkan. FXAA och färgtoning med en diskret glöd delar ett fullskärmspass före HUD och editor. Metoden används även för bildexport. När både FXAA och färgeffekter är avstängda går scenen direkt till slutbilden. [Jämför kantutjämningen](kantutjamning.png)

## 0b. Klart: textrenderingen

Textatlasen samplar: UI-vertexen matar `vec4(x, y, u, v)` på location 0 (offset 0) och
`vec4(r, g, b, a)` på location 1 (offset 16), descriptor-layouten deklarerar binding 0 som
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

### Beslut inför 3a–3b (researchad 2026-11-23)

- **Ett ställe äger vertexformatet.** Inte två pipeline-beskrivningar som
  hålls lika "för hand". `pipeline.ddr`:s `Vertices` namnger layouten en
  pipeline deklarerar (`.Mesh`, `.Ui(stride)` eller ingen), och `describe`
  skriver varje forms post från en enda fabrik + skribent per layout
  (`vk.vertex_input` + `enums.apply_vertex_input` för meshens tre attribut,
  `vk.ui_vertices` + `enums.apply_ui_vertices` för UI:ts två); `shadow.ddr`
  deklarerar `.Mesh` som alla andra (shadern läser bara location 0, men
  pipelinen måste fortfarande deklarera allt bufferten innehåller — annars
  läser skuggpasset 24-byte-stride ur en 32-byte-ström och hela skuggkartan
  blir fel *utan något felmeddelande*).
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

### 3b. Sampling (landat 2026-11-24)

En materialtextur samplas i `mesh.frag`: `albedo = base_color.rgb * texture(base_texture, vertex_uv).rgb`. Kontraktet står i `storm-gfx`: `Texture { id: i64 }` är ett värde (aldrig en pekare; `no_texture()` är id 0), `Backend::upload_texture(pixels, width, height)` tar RGBA8 och bygger mipkedjan, `free_texture` och `mesh(…, texture, surface)`. Scenen och appen känner inte till Vulkan: studions golv bär `--texture FIL.ppm` (en P6-capture, läst av `image.read_rgba`), valt efter nodens identitet (`Study.floor`), inte efter namn.

Fakta som blev kvar av researchen ovan och gäller fortfarande: mipkedjan byggs med `vkCmdBlitImage` LINEAR (specen filtrerar sRGB i linjärt rum), `BLIT_SRC | BLIT_DST | SAMPLED_IMAGE_FILTER_LINEAR` frågas vid uppstart (`GetPhysicalDeviceFormatProperties`) och saknas de faller det tillbaka på **en** nivå — `r.material.blit` är 0 då och shadern samplar ändå. Två val skiljer sig från planen, båda för att grunden skulle bära:

- **Texturerna har en egen tabell, `texture.ddr`, i stället för att byggas på `device.sampled_texture`.** `SampledTexture` äger en layout, en pool och *en* sampler per bild — rätt för post-passet och UI-atlasen, som har en textur var, men en materialtextur är en av många. Sedan 3d steg 1 (`e264590`) gäller: **en** delad set-layout för set 1 med **fem** bindings (0 bas, 1 metallic/roughness, 2 normal, 3 occlusion, 4 emissive — alla `COMBINED_IMAGE_SAMPLER` i fragmentstadiet), **ett set per draw** och pooler utan tak: den första rymmer `INITIAL_SETS` = 256 draw, en som tar slut följs av en dubbelt så stor (upp till `POOLS` = 8 st), och `begin_frame` frigör dem alla efter stängslet. Tabellen (`Table` i `state.Renderer.material`) har 64 slotar (`CAPACITY`), var och en med image, memory, view, **sin egen sampler**, generation och en linjär-flagg; slot 0 är en vit 1×1-textur som skapas vid uppstart, så `no_texture()` och ett frigivet handtag binder samma vita fallback och shadern behöver ingen gren. Undantaget är normalmappningen: dess identitet är den platta normalen (pixeln `(127, 127, 255)` i en egen textur, `r.material.flat`), för vit skulle peka ut ur ytan. Handtaget är `generation << 16 | slot + 1`: en frigiven och återanvänd slot svarar inte på det gamla handtaget (`texture_handles_survive_a_slot_being_reused`), och 0 är alltid ogiltigt. Push constants är oförändrade.
- **Anisotropi och `wrapT` är kvar i 3c; samplarparametrarna (`wrapS`, filter) läses sedan 3c.** Varje uppladdning får sin `gfx.Sampler` och sin `gfx.Encoding` (bara basen är sRGB), och `storm-gltf` översätter glTF:s samplerobjekt till den. Läget är mätt: `mesh.frag` deklarerar `set = 1` binding 0–4; anisotropi saknar fält i `gfx.Sampler` och sätts ingenstans.

På Metal är det samma kontrakt (`storm-metal/src/texture.ddr`): en lista `[]Texture` med slot 0 vit, samma handtagaritmetik, `RGBA8Unorm_sRGB` för en färg och `RGBA8Unorm` för en karta, den platta normalen `(127, 127, 255)` för ett material utan normalmapp. Metal har inga descriptor sets: en draw binder alla fem kartor direkt (`metal.ddr`, `texture(4 + b)`/`sampler(2 + b)` för b = 0..4), och `mesh_fragment` deklarerar bara de två den läser — basen (`texture(4)`) och MR-kartan (`texture(5)`, `sampler(3)`), för `metallic = factor × B`, `roughness = factor × G` — vilket är giltigt: en funktion får deklarera en delmängd av det som bundits. Metal har ingen mipkedja här (`replaceRegion` fyller nivå 0, och paketet har ingen blit-kodare): **1 nivå** tills 3c. Den är typkontrollerad (`dunder check` når den från roten) men har inte setts i en bildruta — det är selftestets jobb på Macen.

Bevis (Mikparchy, låst session, `--capture --frames 1`): utan `--texture` är capturer **AE = 0** mot baslinjen både i spelet (`f9fcc23`-binären, 1280×800) och i studion — vit fallback × basfärg = basfärgen, och set 1 binds för varje mesh. Med `--texture` (en 2×2 PPM med fyra färger) på `--studio`: golvet bär texturen och ingenting annat (pixelprover: golv `(92,124,124) → (65,86,76)`, kub `(188,169,139)` oförändrad; AE 72 802 mot studions baslinje). Med en 256×160 capture som textur (9 nivåer, blit-kedjan): bilden syns på golvet och cyclorama-väggen, mjuk på avstånd — mipkedjan fungerar. Kvar av beviset i planen: en 1024²-textur på avstånd mot `mipLevels = 1` (skimret) — det hör till 3c, när en riktig glTF-textur finns.

### 3c. Klart: glTF-bilder och material (landat 2026-11-25)

Tre committer: `2c0c33c` (PNG-avkodare), `496d59b` (`gfx.Sampler`), `05a0250`
(gltf → scene → app). Bevis: FoxFixed.glb renderas med pälsen — medelvärdet
över rävens kropp gick från neutralgrå (124,121,112) till varm pälsbrun
(114,91,69), pixel (640,600) = (71,33,8) — och avkodningen av `images[0]`
ger de pixlar Pillow läser (tre prober: (67,63,30) vid (0,0), (219,135,41)
vid (512,512), (255,250,242) vid (541,694)). Box.glb, som inte har några
texturer, ger AE = 0 mot 3b-capturen, liksom spelscenen och `--texture`.
DamagedHelmet avkodas sedan 2026-11-26: baseline- och progressiv JPEG (den har en progressiv bild av fem; se "Kvar i 3c").

**Vad filerna innehåller** (uppmätt med en chunk-läsare över de elva
Khronos-/Katla-filerna, 2026-11-25): färgtyp 2 (RGB) och 6 (RGBA) dominerar,
typ 0/1/3/4 finns i fixturerna men inte i modellerna; bitdjup 8 överallt,
ingen interlace; DamagedHelmet är den enda med `image/jpeg`. FoxFixed:s
sampler har `magFilter 9729`, `wrapS/T 10497` och **ingen `minFilter`** —
specens default ("When magFilter or minFilter are undefined, a sampler with
repeat wrapping and LINEAR/LINEAR_MIPMAP_LINEAR filters SHOULD be used") är
alltså det vanliga fallet, inte undantaget.

**Vad som landade, och två beslut som ändrades mot planen:**

- **Avkodaren är `storm-image`**, inte `storm-gltf`: `image.decode_png(data)
  -> Result<Image, string>` ger samma `Image { width, height, pixels }` som
  `image.rgba` (RGBA8, rader uppifrån och ned, ingen padding). Bitdjup 16 och
  Adam7 vägras med meddelande; fem färgtyper och fem radfilter; gräns 256 MiB
  räknad i `i64` innan något allokeras; zlib som `git`-beroende med `rev` och
  låsfil. Femton tester med PNG:er skrivna av Python/zlib och Pillow, och
  referenspixlarna är *Pillow*s, inte skriptets.
- **`storm-gltf` läser bilderna men dekodar dem inte** — *ändrat mot planen*
  (`Part.texture: image.Image`). En bild i glTF-paketet är `Image { mime,
  data }`: mime-typen och bufferView:ns bytes, och `Part.texture` är indexet i
  `Asset.images` (−1 = ingen). Skäl: storm-gltf ska inte bero på storm-image
  (avkodaren kostar 1,1 s kompilering, dogfood 82, och avkodning hör hemma
  där en backend finns); en MCP-förhandsvisning dekodar `asset.images[i].data`
  själv. Appens `load_model_into` dekodar varje bild och laddar upp den.
  Formatet väljs på **filens signatur** (`image.decode(data)`: `89 50 4E 47`
  är PNG, `FF D8` är JPEG), inte på mime-typen — *ändrat 2026-11-26*: en
  glTF:s mime-typ är ett påstående om bytena, bytena är fakta, och med
  signaturen som vägledning finns det ingen "kom ihåg vilken avkodare mime
  kräver" att glömma. En oläsbar bild vägras med vad som är sant om den:
  `image N is not a readable image: JPEG has no scan`.
- **Samplern följer texturen vid uppladdning, inte ritposten** — *ändrat
  mot planen* (`Material.sampler: gfx.Sampler`). `gfx.Sampler { mag, min,
  mips, wrap }` med `Filter { Nearest, Linear }`, `MipFilter { None, Nearest,
  Linear }` (`None` = ingen mipkedja alls) och `Wrap { Repeat, MirroredRepeat,
  ClampToEdge }`; `gfx.sampler()` är specens default. `upload_texture` tar
  den, båda backends bygger en sampler per textur (Vulkan: `samplers: [ptr; 64]`
  i tabellen, förstörd med bilden; Metal: `MTLSamplerDescriptor` per textur,
  `sampler_of(textures, id)`), och den delade `Material.sampler` i Vulkan är
  borta. Skäl: en `VkSampler` är en resurs per textur, och planen sa det själv
  ("samplern hör till texturen i glTF") men placerade den på ritposten — ett
  värde på `Material` som backenden får bygga om varje frame. En textur är
  bild + sampler; det är vad en `gfx.Texture` nu är.
- **Ett okänt filter- eller wrap-tal är `Err`, inte default** (som planen,
  Filament och glTF-SDK): `sampler 0: magFilter 97 is not a glTF filter`.
  glTF:s tal är `pub const` i `storm-gltf/src/textures.ddr`, inte en enum —
  och översättningen är en if-kedja, för en `const` kan inte vara ett
  `match`-mönster (dogfood 83).
- **`storm-scene.Material.texture: gfx.Texture`** (kontraktets värde, inte en
  backend), satt av `scene.textured(material, texture)`; `set_material`
  kopierar det och `record_mesh` binder `item.material.texture`. Appens
  specialfall "golvet bär `--texture`" är borta: golvet sätter texten i sitt
  material som alla andra, och `--texture` utan studio säger det med text i
  stället för att indexera ett golv som inte finns (exit 103, tyst).

**Kvar i 3c:**

- **JPEG: baseline och progressivt är landade (2026-11-26).**
  `packages/storm-image/src/jpeg.ddr` (770 rader) avkodar SOF0 och SOF2 med
  varje sampling upp till 2×2 (4:4:4, 4:2:0, 4:2:2, grå), med och utan
  restart-markörer, till samma `Image` som PNG. Formen är PNG:s: markörgång,
  vägran med namn, Pillow/libjpeg-turbo 3.2.0:s pixlar som referens i
  femton tester (sju handgjorda baseline-fixturer, DamagedHelmet 512²,
  `progressive16`, `helmet_mr_256` med tio trunkeringar, och
  `helmet_prog_restart` med DRI = 4). Tre beslut, alla mätta mot Pillow i
  stället för gissade: (1) **IDCT är den exakta separabla DCT:en i `f64`**
  (T.81 A.3.3, ingen AAN-tabell att komma ihåg; resultatet skiljer sig från
  libjpegs heltals-IDCT med ≤ 1 per kanal); (2) **chroma hålls flytande genom
  upsamplingen in i färgmatrisen** — att avrunda chroma till 8 bitar före
  matrisen (libjpegs ordning) är *sämre* på varje fixtur (444: 256 kanaler
  över 1 mot 0; Helmet: 98 026 mot 2 384); (3) **triangel-upsampling**
  (h2v1/h2v2 "fancy", 3/4 : 1/4 i 2·step-delar), bevisad mot Pillow på
  4:2:0, 4:2:2 och udda 9×9. Tolerans ±1 på de små fixturerna; Helmet 512²
  har worst 3 / 2 384 av 786 432 kanaler / medel 0,14, så dess tolerans är 3
  med kravet medel < 0,5 (ett logikfel ger medel ≥ 5: mätt 37 för fel
  upsamlingsmodell). Huffman är den kanoniska formen (första kod per längd
  + startindex, T.81 F.2.2.3), vilket gav 7,5 → 5,9 s på 2048² mot en
  linjärsökning per bit. **Kostnad: 220 ms byggtid för baseline** (18 557 →
  18 776 ms; PNG kostade 1 100, dogfood 82); den progressiva delen når
  `main` bara genom `jpeg.ddr`, som redan var med, och mättes till +25 ms
  (9 603 → 9 644/9 616 ms, inom bruset). 5,9 s för 2048² (varav IDCT 2,0 s,
  Huffman 2,7 s, pixlar 2,8 s).
  *Den progressiva designen, som koden nu är:* en **koefficientbuffert per
  komponent i naturlig ordning** (`Component.coefficients`, `[]i32`, 64 per
  block, råa — dekvantifiering sker i IDCT:n), dit varje scan skriver via
  T.81 G:s fyra MCU-procedurer (`dc_first`, `ac_first`, `dc_refine`,
  `ac_refine`, 90 rader) och baseline-`block` (27 rader) som femte fall
  (Ah=0, Ss=0..63, en scan). `decode` går markörerna igenom och kör varje SOS
  genom `decode_scan` (flera SOS med DHT emellan; icke-interleaved scannar
  har *sin egen* MCU-grid — blockgridden, ett block per MCU), och dekvant +
  IDCT + upsampling körs en gång efter sista scan. `EOBRUN` är
  scan-tillstånd som nollställs vid varje scan-start och varje restart
  tillsammans med prediktorerna; en AC-first-EOB `r` betyder `2^r +
  appended` **plus nuvarande block** (`eobrun − 1` returneras), i AC-refine
  **minus nuvarande block** (libjpeg `jdphuff.c` rad 424 mot 562–568 —
  asymmetrin är den vanligaste buggen i nya dekodare och är testfall i sig
  genom `helmet_mr_256`). Validering per scan enligt
  `start_pass_phuff_decoder`: DC-band ⇒ `Se == 0`; annars `Ss ≤ Se < 64` och
  **exakt en komponent**; refine (`Ah ≠ 0`) ⇒ `Al == Ah − 1`; `Al ≤ 13`;
  ZRL är **15 + loopens steg**, inte 16 (libjpeg rad 414 — den buggen gav
  fyra felaktiga block av 1 024 på `helmet_mr_256`, alla efter ett ZRL, och
  hittades genom att varje block jämfördes koefficient för koefficient mot
  en oberoende Python-dekodare). Fixturer och mätverktyg:
  `tests/fixtures/jpeg_tools.py` (`scans`, `census`, `glb`, `trunc`);
  `helmet_cut_NN.jpg` är filen avklippt efter scan N + EOI (en *verklig*
  trunkerad progressiv fil — libjpeg avkodrar den till N-scan-bilden och
  våra tio avkodas alla, den tionde exakt lika med hela filen). En
 varning för den som jämför de nio första mot libjpegs PNG:ar: libjpeg
  **utjämnar DC-bilden** (`jdcoefct.c decompress_smooth_data`, default på
  för ofullständiga progressiva bilder), så deras pixlar är inte
  `128 + DC·q/8` och skillnaden (±4–8 spridda, vid kanter 60+) är inte ett
  dekoderfel. **Kvar:** hastighet — 5,9 s för 2048² är en laddningsskärm;
  nästa mätpunkt är bit-läsaren (ett `receive`-anrop per bit, ~10 M anrop
  per 2048²-bild; en 32-bitarsackumulator med korrekt invariant är den
  uppenbara formen, men det första försöket var fel och togs bort: mät,
  antag inte). Ingen av de elva modellfilerna har 16-bitars, aritmetisk
  kodning, eller en progressiv fil med DRI utöver testfixturen.
- **Metal:s mipkedja.** `storm-metal/src/texture.ddr` fyller nivå 0 med
  `replaceRegion` och har ingen blit-kodare: en textur på Metal har **en**
  nivå, och `mips != None` mappas idag till `NotMipmapped`. Vulkan bygger
  kedjan med `vkCmdBlitImage`; Metal behöver `MTLBlitCommandEncoder` i samma
  upload, och det syns bara i en bildruta på en inloggad Mac
  (`tools/selftest.ddr`).
- **`wrapT` och anisotropi** läggs till när en fil ber om dem: `gfx.Sampler`
  har `wrap` (en) och ingen anisotropi; ingen av de elva filerna skiljer
  wrapS från wrapT eller har `KHR_texture_transform`. Vulkan kräver
  `samplerAnisotropy` påslaget på enheten innan `anisotropyEnable` (dogfood
  25: Intel Iris Plus har `maxSamplerAnisotropy = 16.0`).
- **`KHR_materials_pbrSpecularGlossiness`.** Tiger.glb är den enda av de elva
  som använder det (QA 2026-11-25): `diffuseTexture` och
  `specularGlossinessTexture` i en extension, inga
  `pbrMetallicRoughness`-fält, och filen listar den i **båda**
  `extensionsUsed` och `extensionsRequired`. Extensionens egen tabell
  säger "fail to load" för en klient utan stöd när den är required — Storm
  laddade den och ritade vit, ett svalt fel. Nu vägrar `storm-gltf` varje
  `extensionsRequired`-namnet med namnet (glTF 2.0 §4, testat). Extensionen
  är **arkiverad** av Khronos ("Superseded by KHR_materials_specular",
  2021), och three.js tog bort sitt stöd 2022 till förmån för
  `gltf-transform metalrough`. Beslut: Storm läser den inte.
- **Byggtiden:** 16,4 s → 18,2 s när `decode_png` + zlib nås från `main`
  (dogfood 82), → **18,8 s** med JPEG-avkodaren nådd från `main`
  (2026-11-26, mätt före och efter med `tools/build-time.ddr`: 18 557 →
  18 776 ms, alltså 220 ms för 506 rader) — 94 % av budgeten. Ett nästa
  paket på den här vägen mäts på samma sätt före och efter, och om det
  hamnar över 19 s hör det till Dunder-repot att mäta vad som är dyrt,
  inte till Storm att hoppa över funktionen.

### 3d. De linjära texturerna — researchat och beslutat (2026-11-25)

En yta har i dag en textur (`Material.texture`) och två skalärer
(`metallic`, `roughness`). glTF låter en yta bära fem texturer, och Storm
läser en. **Vad det kostar, mätt i pixlarna på Katlas filer:** Avokadon och
Lanternen har båda en `metallicRoughnessTexture` och en `normalTexture`
(PNG, 2048², 8 bitar, RGB) men ingen `metallicFactor`/`roughnessFactor` i
materialet — så Storm ritar dem med specens default **metallic 1.0,
roughness 1.0**, medan kartorna i genomsnitt säger metallic **0** (B-kanal)
och roughness **0.86** (G) för avokadon, 0.20/0.61 för lanternen. En
organisk avokado ritas som matt metall (F0 = albedo i stället för 0.04).
Det är samma sortens svalda fel som Tiger hade (3c): filen ber om något
Storm inte läser, och bilden ser ut som något annat. Lanternens
`emissiveTexture` (`emissiveFactor` = [1,1,1], ingen
`KHR_materials_emissive_strength`) är nästan svart i medel (8,7,4) — ljuset
sitter i ljusan och hänget, som därmed är släckt. DamagedHelmet har alla fem
men vägras (JPEG). Box, FoxFixed, Fox, FoxBlender och Regular_plane har
inga av de fyra och påverkas inte.

**Fakta från specen (glTF 2.0 §3.9.2–3.9.3) som är oföränderliga:**

- *"If a texture is not given, all respective texture components MUST be
  assumed to have a value of 1.0"* — Storms vita 1×1-fallback är exakt
  den regeln, redan. *"the factor value acts as a linear multiplier for
  the corresponding texture values"* — shaderns form blir
  `metallic = params.x * mr.b`, `roughness = params.y * mr.g`; faktor utan
  textur är oförändrat (1 × faktor), textur utan faktor är texturen.
- **Kanalordningen är G = roughness, B = metallic.** R lämnas där (se
  nästa punkt), A ignoreras. Den äldre 2.0-utkastet (2017) sa R = metallic,
  G = roughness — det är fällen varje tredje implementation går i, och
  Filaments shader bär kommentaren om det
  (`material.roughness *= mr.g; material.metallic *= mr.b`).
- **Occlusion läses ur R — men bara från den textur `occlusionTexture`
  pekar på.** Khronos (donmccurdy, glTF#1982): *"an implementation should
  not attempt to treat it as occlusion information unless indicated by an
  occlusionTexture pointer"*, även när `metallicRoughnessTexture` har data
  i R. Den vanliga ORM-packningen (en bild, `occlusionTexture` och
  `metallicRoughnessTexture` pekar på samma `textures[i]`) är giltig, men
  det är *pekaren* som säger det, inte kanalen. En genväg som läser R ur
  MR-kartan är alltså förbjuden av specen.
- `occlusionTexture.strength` och `normalTexture.scale` är valfria med
  default **1.0**; `1.0 + strength * (occlusion − 1.0)`, och `scale` skalar
  X och Y **före** normalisering. Ingen av de elva filerna sätter dem.
- Normal-kartan: `rgb * 2 − 1`, OpenGL-konvention (+Y upp). Båda
  Katla-kartorna har medel (127,127,255) = platt +Z, som förväntat.

**Tangenter är den stora frågan, och mätningen avgör den.** En normal-karta
behöver ett tangentbasrum (T, B, N) per vertex. Storms vertexformat är
åtta floats (position, normal, uv) — **ingen tangent**, och ingen rad i
Storm läser `TANGENT`. Avokado, Lantern och Tiger har `TANGENT` i filen,
DamagedHelmet har den inte (och ingen av de elva har spegglade UV:s).

Specen: *"When tangents are not specified, client implementations SHOULD
calculate tangents using default MikkTSpace algorithms"*. MikkTSpace
kräver **oindexerad** geometri och måste indexeras om efteråt — en
lastningsalgoritm, inte en shader. Khronos referensshader
(`material_info.glsl`), Filament och Cesium gör i stället en
skärmderiverad bas (`dFdx`/`dFdy` av position och uv) när `TANGENT`
saknas; den är per-fragment och bryter vid UV-sömmar (som referensens
egna issue #466 visar för anisotropi), men den är vad DamagedHelmet-filen
är authorad för. Tre.js valde MikkTSpace (PR #23802) efter samma
kvalitetsproblem.

**Beslut:**

1. **Fem texturer på materialet, som en post: `gfx.Textures`.** `base`,
   `metallic_roughness`, `normal`, `occlusion`, `emissive` (`gfx.Texture`,
   `no_texture()` = saknas), `no_textures()` = alla fem. En textur är
   **bild + sampler + encoding** (landat): bara basen är sRGB, de fyra
   kartorna är linjära — mätt på Lanterns MR-karta: metallic 0,196 läst
   som sRGB blir 0,032 (6× fel), och en platt normal (128,128,255) blir
   (−0,45,−0,45,0,78). Därför delas ett handtag mellan platser som pekar
   på samma *trippel*, inte samma (bild, sampler): ORM i en fil är en
   trippel, och bas + MR i samma bild är två uppladdningar. `emissive`-
   faktorn är steg 2 och blev `[f32; 4]`, inte `core.Color`: styrkan
   (`KHR_materials_emissive_strength`) är specens fjärde värde och hör
   till faktorn — en `core.Color` hade krävt en separat styrka att
   "komma ihåg".
2. **Set 1 har fem bindings (0–4) och skrivs per draw, inte per slot.**
   Forskningens första beslut — ett set per slot med alla fem bindings —
   gäller bara när alla fem kartor är samma bild (ORM-filer där basen
   också ligger där); med bas och MR som olika bilder finns inget enskilt
   handtag som äger setet. Ett `VkDescriptorSet` är en bindning av
   resurser i en draw (Filament: "a descriptor set per draw"), så
   `mesh()` binder set 1 efter `CmdBindPipeline`. Poolen kan inte växa i
   Vulkan, och den ska inte heller uppskattas: `bind` skapar en ny pool
   med dubbla storlek när den tar slut (`Material.pools`, en lista per
   frame), `begin` frigör alla efter fence-väntet och skapar en ny. Inget
   tak, ingen kapacitetsparameter i kontraktet, ingen regel att komma
   ihåg. Fel propagerar (`BeginResult`, inte ett svalt `VkResult`).
   Slot 0 (vit) är identiteten för MR (faktor × 1), occlusion (1) och
   emissive; normalens "saknas" är den **platta** normalen (128,128,255),
   en egen post i `Material` utanför tabellen (inget handtag namnger
   den, och tabellens slot 1 ska vara första lediga). Metal binder fem
   `setFragmentTexture`/`setFragmentSampler` vid 4..8 / 2..6 per draw —
   redan per draw, inget pool-begrepp. `gfx.Backend::mesh` tar
   `textures: &Textures`. Shadern deklarerar bara de bindings den läser
   (0 och 1 i steg 1); en layout med fem är ett giltigt superset.
   Vulkan garanterar `maxDescriptorSetSampledImages` ≥ 16, så fem är
   inom garantin.
3. **Push-constants bär bara per-draw-värden; det som är samma för varje
   draw i en frame bor i set 0:s `Light`-uniform.** (Omskrivet
   2026-11-26; det tidigare beslutet, "inga nya fält", mätte rätt och
   drog fel slutsats.) Mätningen då: 60 ord, 0–15 mvp, 16–31 model,
   32–35 base, 36–39 params, 40–42 kamera med **43 som enda lediga
   float**, 44–47 sol, 48–50 solfärg + 51 `diffuse_fill`, 52–55 zenit,
   56–59 horisont — och 240 var taket (fynd 25), så ett fält till var
   omöjligt. Men de sista 16 orden var **per frame**: samma sol och
   himmel för varje draw, skickade i per-draw-minne. Det var grunden
   som inte bar, och inte ett block som var "fullt". Sedan `5361964`:
   `LIGHT_BYTES` 80 → 144 (`light_vp`, `light_dir_c`, `sun`, `sun_color`
   med fill, `zenith`, `horizon`), skrivet av `shadow.set_light(sky)`
   från mesh-passet — det enda stället som har himlen varje frame, för
   skuggpasset är valfritt (den första capturen utan skuggor var en
   himmelslös scen: `set_light` i `shadow.begin` skrevs aldrig). Push är
   **192 byte**: mvp 0–63, model 64–127, base_color 128–143, params
   144–159, camera_pos 160–175, emissive_factor 176–191 — **64 byte
   luft** under taket. Kvar där som tekniskt är per-pass men utan
   hook: kamerans läge och skuggflaggan (`params.w`); de stannar tills
   kontraktet får en per-frame-hook (§7). `set_light` är nu per draw
   (en 144-byte-kopia, samma pris som när värdena låg i push) och blir
   per frame med hooken. `normalScale`/`aoStrength` (båda 1.0 i alla
   elva filer) ryms nu i pushen när en fil ber om dem; en per-yta-
   uniform (§7) är fortfarande rätt form när de blir fler.
4. **Tangentbas: shadern deriverar, och `TANGENT` läses inte in än.**
   Beslutet är *avgränsat*: referensshaderns form
   (`t = normalize(t_ − ng·dot(ng, t_))`, `b = cross(ng, t)`) är tolv
   rader GLSL och
   Metal, kräver ingen vertexändring och fungerar för DamagedHelmet
   (authorad utan tangenter) lika bra som för referensshadern. MikkTSpace
   är rätt slutmål för kvalitet vid UV-sömmar och speglingar, men det är
   en lastningsalgoritm (oindexera, beräkna, indexera om) plus ett
   **fjärde vertexattribut** (`TANGENT`, 4 floats: `gfx.Vertex` 8 → 12
   floats, 32 → 48 byte) genom `vertex_input()` → `interleave` → båda
   shaders — inte en timme.
   Det blir 3e. Innan dess: en fil med `TANGENT` får samma deriverade
   bas som en utan, och den mäts i en capture mot en referensbild
   (Khronos referensviewer är målbilden för Avokado/Lantern).
5. **Occlusion påverkar bara indirekt ljus**, som specen säger: `ao` skalas
   med `strength` och multiplicerar `diffuse_ambient` och
   `specular_ambient`, inte `direct`. Shaderns befintliga
   `ambient_occlusion = mix(0.55, 1.0, shadow)` (`mesh.frag:153`) är
   skuggans kontaktmörkning och lämnas ifred; de två multipliceras.
6. **Ordningen inom 3d är MR → emissive → occlusion → normal**, efter
   vad filerna ber om och vad som är billigast att bevisa: MR är två
   kanaler och en capture på Avokado (matt metall → dielektrisk frukt),
   emissive är svart-utöver-ljus (Lantern), occlusion är en multiplication
   (DamagedHelmet, när JPEG finns), normal är tolv rader plus beslut 4.
   Varje steg: `AE = 0` på Box/Fox/spelscenen (inga av de fyra — inget
   ändras), och en capture på filen som har kartan.
7. **`storm-gltf` läser varje texturplats som en `TextureInfo`** (bild,
   sampler, −1 = saknas), samma `textures[i].source → images[source]`-väg
   som basen, `Err` på ett ogiltigt index eller en textur utan `source`.
   Landat för bas, MR (steg 1) och emissive (steg 2); normal och occlusion
   samma form.
   `emissiveFactor` läses som `[f32; 4]` i steg 2 (landat: tre
   komponenter, `.w` = `KHR_materials_emissive_strength`, 1.0 som
   default; fyra komponenter vägras). Appens
   `upload_model_textures` delar upp arbetet efter vem som behöver
   backenden: `upload_or_refused` (icke-generisk) avgör och avkodar, och
   det enda `window.upload_texture`-anropet står inline i den generiska
   funktionen — en generisk funktion som bara vidarebefordrar till en
   annan generisk över samma `B` kostar 1,8 s byggtid (dogfood 89). En
   vägran namnger del och roll: "part helmet: metallic-roughness map
   names image 1 which does not exist".

**Vad som mättes och inte gissades (2026-11-25):** vilka av de elva
filerna som har de fyra kartorna (chunk-läsare i Python över GLB-JSON
och IHDR/SOF), kanalmedelvärden i MR-kartorna (Pillow: avokado
(0,219,0), lantern (0,156,50)), push-constant-ordningen i
`vulkan.ddr:mesh_pass` (60 ord, 43 ledig), set 1:s bindningstal
(`bindingCount = 1`), `TANGENT` i fyra av elva filer och i **ingen** rad
Storm, sRGB-fel på en linjär karta (metallic 0,196 → 0,032; platt normal
→ (−0,45,−0,45,0,78)), och en `@c_layout`-post inuti en fast array av
poster i en annan (mätt i `/tmp`: 48 byte per `Slot`, stride 48, 64
slots = 3 072 byte — den gamla kommentaren "E5003" var från en äldre
kompilator). Spec-citaten är ur §3.9.2–3.9.3; occlusion-regeln ur Khronos
glTF#1982; MikkTSpace-kravet ur MikkTSpace:s egen readme och three.js
PR #23802.

**Landat i 3d, steg 1 (2026-11-25):** kedjan genom kontrakt (`gfx.Textures`,
`gfx.Encoding`, `mesh(&Textures)`, `upload_texture(…, encoding)`), scen
(`Material.textures`), båda backendar, shaders (GLSL och Metal: binding 1 =
MR, `metallic = params.x × B`, `roughness = params.y × G`, clamp),
glTF-läsare, app och inspelartest. Bevis: Avokado är en ogenomskinlig
frukt (före: grönt glas). Captures mot en baslinje byggd från `3c2ed7c`
i en ren worktree med samma kompilator (den första "baslinjen" var en
capture från en äldre binär — Fox skilde sig 2 328 px tills båda byggdes
om; skillen: mtime på binären mot källan): AE = 0 på spelscenen,
`--studio`, Box.glb och Fox.glb (ingen MR-karta, oförändrade — vit
fallback × faktor = faktor), 8 009 px på Avokado (bbox 533–745 ×
423–717: bara modellen), 2 026 px på Lantern (metallens roughness;
emissive är steg 2). Bygge 18,4 s; tester gröna: rot 65 `N passed` (63 egna + Skrifts 2),
storm-vulkan 20, storm-gltf 14.

**Landat i 3d, steg 2 (2026-11-26, `5361964`):** `gfx.Backend::mesh` tar
`emissive: &[f32; 4]` (rgb = `emissiveFactor`, w =
`KHR_materials_emissive_strength`), `scene.Material` bär den och
`emissive_mapped(surface, factor)` sätter den; storm-gltf läser
`emissiveTexture` (sRGB), `emissiveFactor` (3 komponenter, default noll;
fyra vägras) och strength (default 1,0). Shadern adderar
`texel(emissive) * factor.rgb * factor.w` till `albedo * params.z`:
handgjorda ytor är oförändrade (vit fallback × noll). Push-constants
192 byte, `Light` 144 byte (beslut 3). `set_material` på en befintlig
yta kopierade fält för fält och tappade tyst det nya fältet; nu är
hela raden `Pool.insert` (test:
`an_emissive_material_keeps_its_factor_through_set_material`). Bevis mot
worktree-baslinjer av `28665c4`: spelscenen, `--studio`, Box, Fox,
Avokado AE = 0; Lantern skiljer sig i 501 pixlar (räknade i Python; `magick`
säger AE 264 352, som inte är ett pixelantal — dogfood QA 2026-11-26),
alla i lyktans glas, 22×67 px vid (698–719, 471–537), +316 pixlar R>200 —
lyktan är tänd. Bygge 18,3 s; tester: rot 67 egna `@test`, storm-gltf
18, storm-scene 24.

**Kvar i 3d efter besluten:** `TANGENT` som vertexattribut + MikkTSpace
(3e), `normalScale`/`aoStrength` (ryms nu i pushen, beslut 3), `texCoord`
≠ 0 (ingen fil använder det; beslut 1 i
3c:s research gäller: Storm läser `TEXCOORD_0`).

## 0e. Klart: grafen som styr, editorn, spelloopen, glTF-laddning, ECS-frågor

Render-grafen äger nu ordningen (`PassKind`, `Compiled.steps`), skuggpasset är
ett pass bland de andra och huvudpasset öppnas lat; editorn listar ECS:et,
väljer, och skriver material/transform via sliders; åtta orber att plocka
med poäng i HUD:en; `--glb` laddar en modell (autoskalad) in i scenen, och
parsern läser riktiga filer (fynd 59); ECS:t har frågor (`join2`/`join3` med
dense-index, `drawables` och orbsystemen använder dem). Repots regler står i
`AGENTS.md` (bygget under 20 s, mätt med `tools/build-time.ddr`; bara main,
inga PR:s eller CI). Kvar: texturer (avsnitt 3), resten av glTF (nodes/
materials/scenes nedan) och byggtiden (fynd 56: den är kompilatorns, och budgeten står i avsnittet ovan).

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

Studion och Blomsterskogen läser den aktiva glTF-scenen med nodtransformer, triangelprimitiver, PBR-material och bildtexturer (`baseColorTexture`, 3c). Kvar: importerade animationsspår för modeller med skelett — paketet läser ingen `animations`/`skins`-data och inga `JOINTS_0`/`WEIGHTS_0`-attribut. Blomsterskogens rävrörelser är egenbyggda spår i scengrafens leder (`storm-scene` `animation.ddr`: `Clip`, `sample`, `mix`, `solve_two_bone`), inte importerade.

## 5. Instancing

Varje objekt är en egen draw call. Ompackningen av poolerna till GPU-data
finns redan (`app.gather`, testad i `tests/app_frame.ddr`, och
`app.vertex_bytes`), så det som saknas är instansbufferten: en modellmatris
+ material per instans, och ett indexerat draw med instansantal i stället för
ett draw per objekt, så att många likadana objekt blir en draw call. Kontraktet
hör hemma i `storm-gfx` (en systermetod till `mesh` som tar en instansslice),
aldrig i appen; vilken backendmetod som bär det researchas när steget tas.

## 7. Fler ljus

Push constants räcker för en sol. Nästa steg är en uniform buffer per frame
(per-frame descriptor set) med en ljusarray, kameraposition och tid.

**Påbörjad (2026-11-26, 3d beslut 3):** solen, himlen och fyllnadsljuset
bor sedan `5361964` i set 0:s `Light`-uniform (144 byte) i stället för
push-constants; den skrivs ur mesh-passet per draw (`shadow.set_light`)
eftersom kontraktet inte har någon per-frame-hook att skriva den ur.
Nästa: hooken (en gång per frame), kamerapositionen dit, sedan arrayen.

## 8. Input

`gfx.Input` har `down(key)` för hållna tangenter, `hit(key)` för
engångshändelser (används av spelet och studion för Q, R, E, T, G, F, Esc)
och `mouse.scroll` (inspektorn rullar med hjulet). `storm-input` har
scancodes och en fly-kamera. Kvar: tangenthändelser som händelsekomponent i
ECS (idag läses `hit` direkt i `app.ddr`), textinmatning
(`SDL_TextInputEvent`) och gamepad via `SDL_GameController`.

**Att verifiera i ett olåst fönster (QA, steg 6): vänster- och högerklick
på Linux.** Tills `6a4e683` (2026-11-26) skiftade `sdl.ddr`:s `poll` SDL:s
knappnummer rakt (`1 << button`), och SDL numrerar vänster 1, mitten 2, höger
3 medan kontraktet äger bitarna 1, 2, 4: vänsterklick satte `MOUSE_RIGHT` och
högerklick en bit ingen läste. Nu parar `sdl_button` nummer med `gfx.Button`
och testet pinnar de tre numren ur `SDL_mouse.h`. Buggen satt i `poll`, som
inte går att testa utan SDL (dogfood 93), så det som återstår är det som
alltid återstår för input: att klicka. Vänsterklick ska träffa widgets i
studion (`app.ddr:694`), högerklick hålls för muslook (`:589`), och
`--frames` kan inte visa det. Från AppKit-sidan var översättningen rätt från
början (`button_of`).

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
- Valideringslager aktiveras inte automatiskt.
- Fönsterläget (`--frames N` utan `--capture`) går på en **låst** session
  (`a919b02`, 10/10 och fem varianter à 20 frames, status 0) men syns inte
  där: skärmdump och `grim` blockeras av låsytan. Bilder tas därför med
  `--capture` oavsett låsning. Den SIGSEGV i första framen som `ac268f0` gav
  på låst session finns inte kvar; vilken commit som tog bort den är inte
  isolerad (bisektionen mellan `ac268f0` och `a84ade9` är icke-monoton:
  `bc2b300` grönt, `38942e5` kraschar, `fb4d5a7` grönt, och fyra commits
  däremellan bygger inte med 0.12.0).
