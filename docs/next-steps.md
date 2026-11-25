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

**3b är landat (2026-11-24):** en mesh samplar en materialtextur (`gfx.Texture`, mipkedja via `vkCmdBlitImage`, vit 1×1-fallback, set 1 på mesh-pipelinen; bevis i avsnittet). Nästa är **3c**: glTF-bilder (PNG via Dunder-repots `packages/zlib`), `Material.texture` i `storm-scene`, samplarens parametrar som enum i `storm-gfx` (anisotropi, wrap, filter) och Metal:s mipkedja. *Beslut inför 3c* (avsnitt 3c) är researchat och mätt 2026-11-25: avkodaren i `storm-image`, samplaren som enum i `storm-gfx` (flyttad från `storm-gltf` — det är materialet som äger samplingen, och `storm-scene` känner inte till glTF), och inflate-tiden för de elva Khronos-/Katla-filerna.
`storm-gfx` tog ifrån Vulkan-paketet i namn men inte i kropp: **storm-vk**
(genererade bindings). Två delar är landade: `tools/vk.ddr` skriver
`api.ddr` ur `vk.xml` (80 prototyper + `load()`) och `layout.ddr` (71
`@c_layout`-poster + en `impl X { pub unsafe fn new() -> X }`-fabrik per post
som nollställer och skriver `sType` ur registret; 135 `x.sType = N` vid
anropsplatserna blev `X::new()`, inget strukturtal står kvar utanför
generatorn), och `--check` är som `fmt --check` (utgång 1 om filen skiljer sig
från registriet; `--check api`/`--check layout` för en fil). Anropet är
`dunder run tools/vk.ddr -- /tmp/vk.xml --check` — `--` krävs, annars äter
`dunder run` flaggan själv (`unknown option: --check`). Storms egna poster
(`Dependencies`, `ShaderStages`, `FrameViewport`, `vertex_input()`, de två
tiling-konstanterna) står under `// --- Storm's own records ---` och kopieras
oförändrade. `enums.ddr` är genererad på samma sätt (`--check enums`): 33
enums, urvalet som data i verktyget, talen ur registret, Storms egna värden
(`binding_word`, `is_success`, `alpha_over` …) under
`// --- Storm's own values and writers ---`. Kvar: `state.ddr`:s `MemoryProperties`
(skrivs idag ur ett rått `raw[]`-fältord i `device.ddr`) som en genererad
`VkPhysicalDeviceMemoryProperties`; de nio egna par-posterna (`Dependencies`
o.s.v.) är
möjliga som raka `[T; 2]`-fält i 0.12.0 men byts inte förrän registret
genererar dem; och paketet som eget namn. Sedan **Renderer-uppdelningen**,
kluster för kluster (design.md §3b): `depth.Depth` är gjord, nästa är `ui.Atlas`
(11 fält, inga läsningar utanför `ui.ddr`). Instancing (5), fler ljus (7)
och input (8) kommer efter det.

## Byggtid på Mikparchy

Senaste mätning: **16 249 ms** på trädet med `depth.Depth` (Dunder 0.12.0, Mikparchy) och 16 197–16 523 ms på `1a7f0e2` (tre `tools/build-time.ddr` samma kväll, 16 424 ms för 3b). Budgeten är 20 s.

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
  `IEND`. Avkoda med Dunder-repots `packages/zlib` (ett `git`-beroende
  med `rev` och låsfil; se *Beslut inför 3c* nedan) och begränsa utdata
  till summan av radlängderna inklusive filterbyte. FoxFixed ger 3 146
  752 byte för 1 024 × 1 024 RGB-pixlar. Tillämpa radens filter och
  expandera RGB till RGBA. Testa sedan RGBA och gråskala med alfa.
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

### 3b. Sampling (landat 2026-11-24)

En materialtextur samplas i `mesh.frag`: `albedo = base_color.rgb * texture(base_texture, vertex_uv).rgb`. Kontraktet står i `storm-gfx`: `Texture { id: i64 }` är ett värde (aldrig en pekare; `no_texture()` är id 0), `Backend::upload_texture(pixels, width, height)` tar RGBA8 och bygger mipkedjan, `free_texture` och `mesh(…, texture, surface)`. Scenen och appen känner inte till Vulkan: studions golv bär `--texture FIL.ppm` (en P6-capture, läst av `image.read_rgba`), valt efter nodens identitet (`Study.floor`), inte efter namn.

Fakta som blev kvar av researchen ovan och gäller fortfarande: mipkedjan byggs med `vkCmdBlitImage` LINEAR (specen filtrerar sRGB i linjärt rum), `BLIT_SRC | BLIT_DST | SAMPLED_IMAGE_FILTER_LINEAR` frågas vid uppstart (`GetPhysicalDeviceFormatProperties`) och saknas de faller det tillbaka på **en** nivå — `r.material.blit` är 0 då och shadern samplar ändå. Två val skiljer sig från planen, båda för att grunden skulle bära:

- **Texturerna har en egen tabell, `texture.ddr`, i stället för att byggas på `device.sampled_texture`.** `SampledTexture` äger en layout, en pool och *en* sampler per bild — rätt för post-passet och UI-atlasen, som har en textur var, men en materialtextur är en av många: en **delad** set-layout (set 1, binding 0), **en** gemensam pool (`MAX_TEXTURES + 1` set) och **en** samplare. Tabellen (`Table` i `state.Renderer.material`) håller image, memory, view, set och generation per slot; slot 0 är en vit 1×1-textur som skapas vid uppstart, så `no_texture()` och ett frigivet handtag binder samma vita fallback och shadern behöver ingen gren och inget push-fält (push constants är fulla). Handtaget är `generation << 16 | slot + 1`: en frigiven och återanvänd slot svarar inte på det gamla handtaget (`texture_handles_survive_a_slot_being_reused`), och 0 är alltid ogiltigt.
- **Anisotropi och glTF:s samplarparametrar (wrapS/wrapT, filter) är 3c, inte 3b.** Samplern här är linjär med REPEAT och `maxAnisotropy = 1`; `samplerAnisotropy`/`maxSamplerAnisotropy` läses när `storm-gltf` får sin samplar-enum, för det är materialet som ska få säga det.

På Metal är det samma kontrakt (`storm-metal/src/texture.ddr`): en lista `[]Texture` med slot 0 vit, samma handtagaritmetik, `RGBA8Unorm_sRGB`, `texture(4)` + `sampler(2)` i `mesh_fragment`. Metal har ingen mipkedja här (`replaceRegion` fyller nivå 0, och paketet har ingen blit-kodare): **1 nivå** tills 3c. Den är typkontrollerad (`dunder check` når den från roten) men har inte setts i en bildruta — det är selftestets jobb på Macen.

Bevis (Mikparchy, låst session, `--capture --frames 1`): utan `--texture` är capturer **AE = 0** mot baslinjen både i spelet (`f9fcc23`-binären, 1280×800) och i studion — vit fallback × basfärg = basfärgen, och set 1 binds för varje mesh. Med `--texture` (en 2×2 PPM med fyra färger) på `--studio`: golvet bär texturen och ingenting annat (pixelprover: golv `(92,124,124) → (65,86,76)`, kub `(188,169,139)` oförändrad; AE 72 802 mot studions baslinje). Med en 256×160 capture som textur (9 nivåer, blit-kedjan): bilden syns på golvet och cyclorama-väggen, mjuk på avstånd — mipkedjan fungerar. Kvar av beviset i planen: en 1024²-textur på avstånd mot `mipLevels = 1` (skimret) — det hör till 3c, när en riktig glTF-textur finns.

### 3c. glTF-bilder och material

`images`/`textures`/`samplers`/`pbrMetallicRoughness` (`baseColorFactor`
× `baseColorTexture`, `metallicFactor`, `roughnessFactor`) ur GLB:n, med
PNG-avkodningen ovan. Bevis: FoxFixed renderas med sin päls (compare mot
Khronos referensbild i komposition), och `Box.glb` (ingen textur, bara
`baseColorFactor` röd) renderas fortfarande röd — faktorn utan textur är
den vanligaste glTF-materialtypen och får inte brytas.

#### Beslut inför 3c (researchat och mätt 2026-11-25)

**Vad filerna faktiskt innehåller.** Uppmätt med en chunk-läsare över de
elva glTF-filerna i `~/Work/Katla/resources/models/` och Storms två
fixturer: alla inbäddade bilder är `bufferView` + `mimeType` (ingen `uri`,
ingen data-URI), PNG med bitdjup 8 och `interlace = 0`. Färgtyperna är
**2 (RGB)** (Fox, Avocado, Lantern, DamagedHelmet:s PNG-del) och **6
(RGBA)** (Tiger, Lantern 0). Fox/FoxFixed har `samplers[0]` med
`magFilter 9729`, `wrapS/T 10497`; Fox.glb `minFilter 9987`, Tiger
`9985` (LINEAR_MIPMAP_NEAREST); FoxBlender, Avocado och Lantern har
**ingen samplar alls**. DamagedHelmet är den enda med `image/jpeg` (fem
bilder). Tre bitar av specen äger valen:

- **`mimeType` är obligatoriskt för `bufferView`-bilder** (§5.25.2) och
  `uri`/`bufferView` är ömsesidigt uteslutande. Storm läser bara GLB, så
  fallet "inget mimeType" finns inte: okänt eller saknat `mimeType` är ett
  fel med bildens index, inte en gissning. Godots fallback ("försök PNG,
  sedan JPEG", PR 51052) finns för `.gltf`-filer med data-URI:er och
  felaktiga mime-typer i produktion; det är ett problem Storm inte har.
- **"When `texture.sampler` is undefined, a sampler with repeat wrapping
  (in both directions) and auto filtering MUST be used"** (§5.25.1), och
  "When the latter are undefined, client implementations MAY set their
  own default texture filtering settings" (§3.8.4.1). "Auto filtering" är
  inte definierat (KhronosGroup/glTF#2096 är fortfarande öppen); three.js
  väljer `LINEAR`/`LINEAR_MIPMAP_LINEAR`, Filament samma
  (`getMinFilter` faller till `LINEAR_MIPMAP_LINEAR`, `getWrapMode` till
  `REPEAT`), och det är vad Storms samplare redan gör (3b). Det är
  alltså **ett val som får göras**, och Storm har gjort det.
- **Mipfilter utan mipkedja:** "When runtime mipmap generation is not
  possible, client implementations SHOULD override the minification
  filtering mode" (`…MIPMAP_NEAREST` → `NEAREST`, `…MIPMAP_LINEAR` →
  `LINEAR`, §3.8.4.2). Vulkan-backenden har kedjan; Metal har en nivå
  tills vidare — så den mappar filter enligt tabellen när den bara har
  en nivå, och tabellen är ett faktum att pinta i ett test, inte en
  glömd regel.

**PNG i ren Dunder — mätt, inte antaget.** Dunder-repots
`packages/zlib` (`zlib.decompress(src, max_bytes) -> Result<[]u8, string>`,
RFC 1950/1951, Adler-32-kontrollerad, ren Dunder, inga capabilities) är
den enda inflate som finns på språket; Skrifts `sfnt.zlib_decompress` är
sedan `c973a09` bara ett omslag runt den. Mätning på Mikparchy med
`sys.now_ms()` runt chunk-läsning + `decompress`, Dunder 0.12.0:

| Bild | Storlek | IDAT | Förh. | Dekodat | Inflate |
|---|---|---|---|---|---|
| Fox `images[0]` (RGB) | 1024² | 26 kB | 118:1 | 3,1 MB | **212 ms** |
| Lantern `images[3]` (RGB) | 2048² | 169 kB | 75:1 | 12,6 MB | **876 ms** |
| Tiger `images[2]` (RGBA) | 2048² | 1,99 MB | 8:1 | 16,8 MB | **2 138 ms** |
| Tiger `images[1]` (RGBA) | 1024² | 1,18 MB | 4:1 | 4,2 MB | **814 ms** |
| Avocado `images[1]` (RGB) | 2048² | 1,65 MB | 8:1 | 12,6 MB | **1 717 ms** |
| Tiger `images[0]` (RGBA) | 2048² | 7,5 MB | 2:1 | 16,8 MB | **4 323 ms** |

Alla tretton PNG-bilderna i sex Khronos-modeller (Avocado 3, Fox, FoxBlender
och FoxFixed 1 var, Lantern 4, Tiger 4) är dekoderade med `got == inflated`
(`~/Work/Katla/resources/models/`): 3,9–14,8 MB/s, dvs. **67–258 ns per
dekodat byte, och kostnaden per byte styrs av kompressionsförhållandet,
inte av storleken** — Fox (118:1, mest långa
back-referenser) går 4× snabbare per byte än Tiger 0 (2:1, mest literaler).
Referens: libpng och stb_image dekodar 100–300 MB/s, Wuffs upp till 1 GB/s
(Nigel Tao, *The Fastest, Safest PNG Decoder*, mätt på en i5-10210U) —
Dunder-zliben ligger **20–26× efter libpng/stb**. Var tiden går, uppdelat
med prov i
`/tmp` (push av samma antal byte utan inflate: 4,2 M `out.push` ~190 ms,
4,2 M index-skrivningar ~60 ms) och läsning av slingan i `zlib.ddr`:
`HuffTable.decode` läser **ett bit i taget** (`read_bits(&src, 1)` upp till
15 gånger per symbol, `ensure` i varje) och en back-referens pushar **en
byte i taget** (`for _ in 0..copy_len { out.push(out[out.len - dist]) }`).
Långa referenser (Fox) betalar mest push, korta (Tiger 0) betalar mest
Huffman — därav förhållandet. Mätt samma dag med fyra kopieringsformer på
4,2 M byte (145–168 ms, brus) och med strömmen stoppad vid första utbyte
(0–1 ms): kopieringsformen är ingen lever, och **ca 75 % av tiden är
`HuffTable.decode`** — bitarna läses ett i taget, `ensure` i varje
(dogfood 80). Konsekvensen för Storm: Fox (0,2 s) är
omedelbart; **Tiger (fyra bilder) 10,0 s, Lantern (fyra) 7,7 s, Avocado
(tre) 6,3 s** — det är inte omedelbart. **Det är inte ett Storm-problem
att lappa runt** — `packages/zlib` ligger i Dunder-repot och
rekommendationen står i dogfood 80. Storm bygger 3c mot det API som finns
(`decompress`), och det går snabbare när Dunder gör det.

**Beslut:**

- **Avkodaren är `storm-image`, inte `storm-gltf`.** `image.decode_png(data)
  -> Result<Image, string>` ger samma `Image { width, height, pixels }`
  som `image.rgba` (RGBA8, rader uppifrån och ned, ingen padding): den
  form `gfx.upload_texture` tar. En PNG är inte glTF: MCP:s
  förhandsvisning och `--texture` kan ladda en PNG utan att veta vad en
  accessor är. Chunk-
  vandringen (signatur, `IHDR`, `IDAT`-sammanfogning, `IEND`), zlib via
  Dunder-repots `packages/zlib` som `git`-beroende med `rev` och låsfil
  (samma regel som `storm-text → skrift`), och de fem radfilterna
  (`None`, `Sub`, `Up`, `Average`, `Paeth`) i en loop över rader med
  `prev`/`cur`. Utdata är alltid RGBA8: typ 0 (grå) och 4 (grå+alfa)
  expanderas, typ 2 får alfa 255, typ 3 (palett) läser `PLTE` och
  `tRNS`. **Bitdjup 16 avvisas** med ett tydligt fel (ingen av de elva
  filerna använder det; "sample as 8-bit" är Filaments val men en
  tyst halvering av precision är inte vårt), och **interlace (Adam7)
  avvisas** (ingen använder det; sju pass är en egen decoders värt).
  Gränser: `width * height * 4` räknas i `i64` och avvisas över 256 MiB
  innan något allokeras; `IHDR`-CRC kontrolleras inte (Wuffs och stb
  hoppar också CRC på ancillary chunks; `IDAT`:s innehåll skyddas av
  zlib:ens Adler-32). Ett test dekodar Fox `images[0]` (1024² RGB) och
  jämför **alla** 4,2 M byte mot Pythons `PIL`/`zlib` utskrivna
  referens (fixtures: en liten 2×2 RGBA och en 3×2 grå, handbyggda med
  kända byte) — en fixture koden under test producerat är inget bevis.
- **glTF-laddaren läser bilderna, inte pixlarna.** `storm-gltf` får
  **`Part.texture: image.Image`**, ett tomt `Image` (`width == 0`) när
  materialet saknar `baseColorTexture`. Det är `asset()` som fyller
  det, ur `images[texture.source].bufferView` →
  `image.decode_png(&doc.bin[view])`. `mimeType` != `image/png` →
  `Err("image N: image/jpeg is not supported (PNG only)")` — DamagedHelmet
  laddar alltså inte, och det sägs, i stället för att ritas vit.
  `metallicRoughnessTexture`, `normalTexture`, `occlusionTexture` och
  `emissiveTexture` läses **inte** i 3c (de är linjära och ska i egna
  samplers; det är 3d).
- **Samplaren blir en enum i `storm-gfx`, inte i `storm-gltf`.** Det är
  materialet som ska få säga hur det samplas, och `storm-scene.Material`
  känner inte till glTF. `gfx.Sampler { mag: MagFilter, min: MinFilter,
  wrap_s: Wrap, wrap_t: Wrap }` med `MagFilter { Nearest, Linear }`,
  `MinFilter { Nearest, Linear, NearestMipmapNearest,
  LinearMipmapNearest, NearestMipmapLinear, LinearMipmapLinear }`,
  `Wrap { Repeat, MirroredRepeat, ClampToEdge }` och
  `gfx.sampler_default()` = Linear/LinearMipmapLinear/Repeat (specens
  "auto"). `upload_texture(pixels, w, h)` får samplaren som fjärde
  argument, för samplaren hör till texturen i glTF (`texture.sampler`),
  inte till Ritposten. Vulkan bakar den i en `VkSampler` per textur
  (tabellen får en `[]ptr` till samplerslot, förstörd med bilden) ur
  `enums.Filter`/`SamplerMipmapMode`/`SamplerAddressMode`; en
  mip-filter på en textur med **en** nivå (`r.material.blit == 0`)
  mappas enligt §3.8.4.2-tabellen. Metal gör samma mapping i
  `texture.ddr` och bygger `MTLSamplerDescriptor` per textur.
  glTF-talen (9728/9729, 9984–9987, 33071/33648/10497) blir en enum
  **i `storm-gltf`** (`gltf.MagFilter` …) som översätts till `gfx.*`
  med en `match` — ett okänt tal är `Err` (Filament och glTF-SDK kastar
  båda på okända filter), inte ett fall till default.
- **Anisotropi läses när den behöverivas, inte nu.** Vulkan kräver
  `samplerAnisotropy` påslagen på enheten *innan* `anisotropyEnable`
  får vara `VK_TRUE` (features.html), och Intel Iris Plus rapporterar
  `maxSamplerAnisotropy = 16.0` (dogfood 25). 3c sätter `anisotropyEnable
  = false`; en `gfx.Sampler.anisotropy: f32` (0 = av) är fältet som
  läggas till när en fil ber om det.
- **`storm-scene.Material` får `texture: gfx.Texture` och `sampler:
  gfx.Sampler`.** `scene.material(...)` får dem som parametrar med
  default (`no_texture()`, `sampler_default()`); `set_material` kopierar
  dem; `drawables()` bär dem i `Drawable`; `app.ddr` skickar dem vidare
  till `window.mesh(...)`, som tar `texture` sedan 3b och får `sampler`
  som ett argument till — samplaren följer ritposten, den blir inget
  artonde positionellt tal i push constants (240 byte, fulla).
- **Bevis för 3c:** FoxFixed renderas med pälsen (pixelprober på tre
  kända UV-punkter mot `PIL`-dekoden av `images[0]`: ±3 per kanal eftersom
  sRGB-avkodning + ACES-tonemapping ändrar värdet — jämför *förhållandet*
  mellan päls och mörk parti, inte absolutvalet), `Box.glb` är fortfarande
  röd med AE = 0 mot 3b-capturen, DamagedHelmet ger status 1 med
  `image/jpeg is not supported`, och en tamperad PNG (fel Adler) ger
  status 1 med bildens index. Byggtiden mäts före/efter: `storm-gltf`
  når `storm-image` och `packages/zlib` når `main` för första gången.

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
- Valideringslager aktiveras inte automatiskt.
- Fönsterläget (`--frames N` utan `--capture`) går på en **låst** session
  (`a919b02`, 10/10 och fem varianter à 20 frames, status 0) men syns inte
  där: skärmdump och `grim` blockeras av låsytan. Bilder tas därför med
  `--capture` oavsett låsning. Den SIGSEGV i första framen som `ac268f0` gav
  på låst session finns inte kvar; vilken commit som tog bort den är inte
  isolerad (bisektionen mellan `ac268f0` och `a84ade9` är icke-monoton:
  `bc2b300` grönt, `38942e5` kraschar, `fb4d5a7` grönt, och fyra commits
  däremellan bygger inte med 0.12.0).
