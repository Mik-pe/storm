# Vad Storm hittade i Dunder

Granskat 2026-11-23. Utgångspunkten var Storm `fdd9cc6` och Dunder
`62e1530`. Punkterna 1–22 kommer från den ursprungliga rapporten, 23–25 från Storm `14bd30c`,
26–36 från `9452ba3` och 37–39 från djupbufferten.
Dunders ändringar och regressionstester finns i [9b6dcd2](https://github.com/Mik-pe/dunder/commit/9b6dcd2e441c0fb88cb211347e2955d6716546df).

## Språk och standardbibliotek

| Punkt | Vad som gick att verifiera |
| --- | --- |
| 1 och 17. Fält i `@c_layout` | Ett direkt fält av typen `Frame` och en fast skalärarray stöds. `[Frame; 2]` och `string` som C-fält avvisas. Den gamla kompilatorn markerade `fn main` respektive en annan modul. Nu markerar E5003 själva fälttypen och FFI-manualen ger exempel på båda begränsningarna. |
| 2. Trigonometri | Tidigare behövde Storm bredda en `f32` för `math.sin`, `cos` och `tan`. Med `import std.math as _` får en modul tillgång till `vinkel.sin()`, `.cos()` och `.tan()` för både `f32` och `f64`. Resultatet har samma typ som vinkeln. Kameran, perspektivprojektionen och scengrafen använder metoderna. |
| 3. Flyttalsliteraler | `mut sum := 0.0` ger `f64`. `mut sum: f32 = 0.0` ger en smal ackumulator. I `x * 0.5` där `x: f32` får redan literalen och resultatet typen `f32`. Detta fungerar i ursprungsversionen och beskrivs i [flyttalsmanualen](https://github.com/Mik-pe/dunder/blob/9b6dcd2/docs/floating.md). |
| 4. Ignorerade resultat | Ett anrop med returtypen `()` kan stå som en egen sats. Tidigare avvisades `_ := ping()` för ett sådant anrop. Nu godtas båda formerna. Regressionstestet kontrollerar att varje anrop utförs exakt en gång. |
| 5. Metodmottagare | `&mut self` lånar mottagaren för ändring. `self` och `move self` konsumerar den. En metod kan låna mottagaren och samtidigt ta ägarskap över ett annat argument, som `Pool.insert` gör. Dessa former finns redan i [syntaxmanualen](https://github.com/Mik-pe/dunder/blob/9b6dcd2/docs/syntax.md). |
| 6. Ta ut ett arrayelement | `remove(i)` flyttar ut elementet och förskjuter efterföljande element. Storm kombinerade det med indexuppdateringen för ett byte med sista elementet. Efter en borttagning mitt i en pool med fyra komponenter kunde fel komponent tillhöra en entitet. Poolen tar nu ut både ägare och värde med Dunders nya `array.swap_remove` och uppdaterar indexet för den ägare som flyttades. |
| 7. Byte-API i Hundmat | Hundmats publicerade Vulkan-exempel använde fortfarande `bytes.append_text`. Migreringen till `bytes.append_utf8` fanns redan på lokal `main` och ingår nu i [Hundmat](https://github.com/Mik-pe/dunder-hundmat/commit/b08de81602a5a70bd5cebd19f88b6a7763946cb8). `sys.append_text` skriver till en fil och är ett separat API. |
| 8. Bitoperationer | Heltal har bitmetoder. Storms shaderverktyg kan läsa ett helt little-endian-ord med det befintliga `u32(bytes.u32_le(&data, offset))`. Det ersätter den manuella uppackningen i avkodaren. |
| 9. Råbitar för glTF | `bytes.u32_le` ger ett `i64`-värde mellan 0 och 4 294 967 295. Den tidigare föreslagna konverteringen till `i32` avslutade programmet med status 101 för byteföljden `00 00 80 bf` (−1,0). Storm använder nu `wire.Reader.read_f32`. Dunder har även `bytes.i32_le` för direkt åtkomst på en offset tillsammans med `f32.from_bits`. |
| 10–12. Resultat, sökning och strängindex | På `Result<T, E>` ger `.is_ok()` en `bool` och `.ok()` en `Option<T>`. `text.find` och `bytes.find_byte` ger `Option<i32>`. `s[i]` ger en UTF-8-byte av typen `u8`. En otypad heltalsliteral kan få typen `u8` vid jämförelsen. [Standardbiblioteket](https://github.com/Mik-pe/dunder/blob/9b6dcd2/docs/standard.md) beskriver hur äldre anrop kan migreras. |
| 13. Beroendens kapabiliteter | Ett beroende som begär exempelvis `filesystem` behöver motsvarande grant längs importkedjan. En saknad grant gav E5002 vid Hundmats import av Skrift. Ett manifestexempel finns nu i [beroendemanualen](https://github.com/Mik-pe/dunder/blob/9b6dcd2/docs/dependencies.md). |
| 14. Skrift | API-migreringen fanns i [Skrift 46f0191](https://github.com/Mik-pe/dunder-skrift/commit/46f0191). Paketets 16 tester gick igenom på Mikparchy. Dunders ordinarie lokala verifiering kör nu även Skrifts paketsvit och Hundmats verifierare när reporna finns som syskon. Det fångade också den saknade granten i Hundmats textdemo. |
| 15. Komponenttyper | Storm lagrar varje komponenttyp i en egen `Pool<T>`. System tar de typade pooler de behöver som parametrar. Scengrafen använder en pool vardera för lokala transformer, världstransformer och föräldralänkar. |
| 18. Lån från en pool | Ett oanvänt metodlån kan redan upphöra efter sista läsningen i samma loopdjup. Ett bekräftat undantag var ett lån vars sista läsning låg **före** en inre loop. Det blockerade ett senare rekursivt `&mut self`-anrop i loopen. Kompilatorn godtar nu fallet och skyddar fortfarande referenser som kan läsas nästa varv eller efter loopen. Scengrafens fyra pakettester passerar även utan klonen av den lokala transformen och den tillfälliga barnlistan. |

## Grafikobservationer på Mikparchy

**16 och 20. Presentation vid låst session.** De två anteckningarna beskriver samma observation. Den tidigare körningen rapporterade fem presenterade bildrutor. Den fastställer ingen allmän gräns för Wayland. Kör fönsterprovet i en aktiv session och använd `--example scene` för scenlogiken över SSH. [Vulkans kontrakt för att hämta nästa bild](https://docs.vulkan.org/refpages/latest/refpages/source/vkAcquireNextImageKHR.html)

**19. Djupformat.** Ett fristående C-prov på samma Intel Iris Plus (ICL GT2) skapade en optimalt tilad djupbild på 512 × 512 med `vkCreateImage`. Både `D16_UNORM` och `D32_SFLOAT` gav `VK_SUCCESS` med Khronos valideringslager begärt i loadern. Storms tidigare returvärde −2 beskriver det anrop som gjordes då. Orsaken till skillnaden är öppen. Loaderinställningar kan aktivera installerade lager. [Lunarguidens lagerkonfiguration](https://vulkan.lunarg.com/doc/view/latest/linux/layer_configuration.html)

**21. Bildåterläsning.** Storms tidigare försök att kopiera till buffert avbröts. Orsaken är öppen. I den granskade versionen renderar capture-vägen till en linjärt tilad bild med värdsynligt minne. I Vulkan är `rowPitch` det tredje fältet i `VkSubresourceLayout`. Storm använder nu både `offset` och `rowPitch` och kontrollerar att sista pixeln ryms i det mappade minnet. Ett regressionstest täcker förskjuten första pixel och utfyllnad mellan raderna. [VkSubresourceLayout](https://docs.vulkan.org/refpages/latest/refpages/source/VkSubresourceLayout.html)

**22. Structretur med pekarfält.** Ett separat program returnerade två structar med två pekare vardera och olika storlekar. Båda behöll sina ursprungliga fält efter det andra anropet på ARM64/macOS och x86-64/Linux. Storm använder utparametrar vid bildallokering. Bildartefakten från det tidigare försöket har ingen fastställd koppling till Dunders returkonvention.

**23. Djupbilder via Storms bindning.** Skuggkoden märkte värdet 1 som optimal tiling. Vulkan definierar 0 som optimal och 1 som linjär. Storm bygger nu en typad `ImageCreateInfo` och använder namngivna konstanter för skuggbilden och återläsningen. Ett Dunder-program skickade Storms struct till ett C-prov som kontrollerade fälten och anropade Intel-drivrutinen. Både D16 och D32 på 512 × 512 skapades med `VK_SUCCESS`. Vilka fält de historiska misslyckade anropen skickade är okänt. En riktig djupbilaga i Storms renderpass är fortfarande motorarbete.

**24. Skrivning via beräknad adress.** Ett prov skrev det mittersta ordet i en justerad, ägd array via basadressen plus fyra byte och kontrollerade båda grannvärdena. Provet passerade på ARM64/macOS och x86-64/Linux, även med den ursprungliga Linuxkompilatorn. Orsaken till den tidigare kraschen vid skrivning i GPU-mappat minne är öppen.

**25. Push constants.** Intel-enheten rapporterar `maxPushConstantsSize = 256` byte. Den rapporterade begäran på 320 byte överskred enhetens gräns. Meshpasset använder 240 byte och ljusmatrisen ligger i en uniform buffer. Enhetsval, pipelinelayout och inspelning delar nu samma storlekskonstant, så en enhet med lägre gräns väljs bort före pipelineskapandet. [VkPushConstantRange](https://docs.vulkan.org/refpages/latest/refpages/source/VkPushConstantRange.html)

## Designbedömning

- **Prioritera fasta structarrayer vid C-gränsen.** Dunder kan bädda in ett enskilt C-record, men `frames: [Frame; 2]` tvingar fortfarande Storm att dela upp en frame i flera parallella arrayer. Den förbättrade diagnostiken löser felsökningen. För språkstödet måste arrayfältet lagra elementen intill varandra med C:s storlek och justering. Vanliga Dunder-arrayer av record använder indirekta element. Ett acceptansprov för utökningen behöver låta både C och Dunder läsa, skriva och ta adressen till det andra elementet i samma struct.
- **Behåll de explicita ägarreglerna.** `&mut self` lånar och `move self` gör konsumtion synlig. Ett lån ska upphöra efter sista möjliga läsning, även när nästa sats är en loop. Då kan scengrafen traverseras direkt och kompilatorn kan fortfarande skydda lån som lever till nästa varv. Typade `Pool<T>` ger systemen tydliga beroenden. Ett behov av komponenttyper som registreras under körning skulle motivera en separat design.
- **Ge ordnad och oordnad borttagning egna namn.** `remove` bevarar ordningen. `array.swap_remove` flyttar sista elementet till luckan och returnerar det borttagna värdet i konstant tid. Den skillnaden påverkar vilken entitet som äger komponenten efteråt. [Dunders implementation och tester](https://github.com/Mik-pe/dunder/commit/9f9b341)
- **Låt typen följa uträkningen.** Standardtypen `f64` för en fristående literal och kontextuell `f32` i en redan typad uträkning fungerar väl tillsammans. Samma metodnamn för trigonometri på båda typerna tar bort konverteringar från den faktiska kamerakoden. `import std.math as _` är dock svårt att upptäcka. En namngiven import som bara tillför metoder kan fortfarande få W1002 för oanvänt importnamn.
- **Skilj talomvandling från läsning av råbitar.** En kontrollerad konvertering ska fortsätta fånga spill. `wire.Reader.read_f32` uttrycker glTF-laddarens avsikt direkt. Vid slumpmässig åtkomst är `bytes.i32_le` användbar, men `bytes.u32_le` returnerar `i64`, medan `wire.Reader.read_u32_le` returnerar `u32`. Den skillnaden är lätt att missa och bör hanteras vid en samordnad API-migrering.
- **Behåll typerna som skiljer närvaro från innehåll.** `is_ok()` svarar på en ja/nej-fråga och `ok()` ger det eventuella värdet. `find` med `Option` gör byteposition noll entydig. `s[i]` är användbart för byteprotokoll men kräver UTF-8-avkodning för tecken. Explicita grants för transitiva beroenden gör resursåtkomst synlig hos konsumenten.

## Uppföljning: editor-UI, overlay-effekter och textatlasen

**26. `@c_layout` med en fast array av structs.** Att skicka en
`[VkPipelineShaderStageCreateInfo; 2]` eller
`[VkVertexInputAttributeDescription; 3]` till Vulkan kraschade
`vkCreateGraphicsPipelines`. Samma lösning som tidigare: lägg struktarna i en
`@c_layout`-struct med namngivna fält och skicka adressen till den. Fynd 9 gäller
alltså fortfarande.

**27. `store_u32`/`store_f32` med framräknad pekaradress.** Skrivningar till
mappat minne med `store_*(ptr(usize(base) + offset), värde)` ger antingen
SIGSEGV (ljusbufferten) eller ingen effekt alls (textatlasen). `copy_bytes` mot
en lokal array fungerar. Använd alltid memcpy-vägen för bulkdata.

**28. `VkPipelineViewportStateCreateInfo` utan `pViewports` ritar ingenting.**
En pipeline med `viewportCount = 1` men `pViewports = NULL` skapar inga fel, men
rasteriserar noll fragment. Scenen ritades korrekt eftersom mesh-pipen hade en
viewport; overlay- och UI-pipelinerna saknade den och var helt osynliga.

**29. `storeOp = DONT_CARE` på en bilaga som läses efteråt.** Scenpasset hade
`VK_ATTACHMENT_STORE_OP_DONT_CARE` (vilket var rätt när resultatet gick direkt
till swapchain). När scenen i stället skulle samplas av ett post-pass kastades
innehållet och texturen blev svart. `STORE` krävs så fort någon läser bilden
efter passet.

**30. Linjärt tilade bilder går inte att sampla på den här drivrutinen.**
`vkCreateImage` med `VK_IMAGE_TILING_LINEAR` + `SAMPLED` lyckas, men
`vkCmdCopyImageToBuffer` kraschar (fynd 21) och `texture()` ger noll. Samma
innehåll i en optimalt tilad bild fungerar. Slutsatsen för Storm: rendera aldrig
till en linjär bild som ska samplas; använd staging-buffer +
`vkCmdCopyBufferToImage` när CPU-data ska upp till en sampelbar bild.

**31. Descriptor set binds per pipeline layout.** Att binda en descriptor en gång
räcker inte när nästa pipeline har en annan layout; `vkCmdBindDescriptorSets`
måste upprepas efter `vkCmdBindPipeline`.

**32. Attributformat 103 är `R32G32_SFLOAT`, inte 106.** 106 är
`R32G32B32_SFLOAT` (tre komponenter). Med 106 på ett vec2-attribut läste
drivrutinen 12 byte per vertex och hela UI-geometrin blev odefinierad – men
ingenting kraschade, vilket gjorde felet svårt att se.

**33. Alpha-blending i överlägget beter sig inte som specificerat.** Samma
blend-state (`SRC_ALPHA`/`ONE_MINUS_SRC_ALPHA`) ger korrekt resultat i
UI-pipen men en nästan additiv blandning i overlay-pipen: en quad med
`alpha = 1.0` lämnar scenen nästan orörd i stället för att ersätta den.
Skillnaden mellan pipelinerna är bara shader och push-konstanter. Tills orsaken
är hittad är effekterna opt-in (`--effects`) och avstängda som standard.

**34. En descriptor-layout som packas för hand måste matcha skrivningen.**
UI-seten deklarerade `binding[0] = u64(1).shl(32)`, vilket är binding 1 av typen
`SAMPLER`, medan `vkUpdateDescriptorSets` skrev binding 0 som
`COMBINED_IMAGE_SAMPLER`. `vkCreateDescriptorSetLayout` och
`vkUpdateDescriptorSets` rapporterade inga fel; setet hade bara ingen bindning 0,
så `texture(atlas, uv)` returnerade noll för varje fragment. Rätt packning är
`u64(binding) + (u64(typ).shl(32))`, samma mönster som skuggpasset använder.
Slutsats: packa aldrig två fält i en `u64` utan att skriva båda termerna.

**35. Två vertexattribut på samma location.** UI-pipen deklarerade både
`position` och `uv` på `location = 0` och satte
`vertexAttributeDescriptionCount = 2`. Attributet på `location = 1` (tint)
skickades därför aldrig in, och `v_color` blev odefinierad. Vertexen är åtta
floats: `location 0 = vec4(x, y, u, v)` på offset 0 och
`location 1 = vec4(r, g, b, a)` på offset 16. Drivrutinen accepterade den
dubbla locationen utan ett ord.

**36. UI-shaderns Y-axel använde OpenGL-konventionen.** `1.0 - y/h*2` ger NDC-y
uppåt; Vulkan har y nedåt, så hela editor-UI:t ritades upp och ner – kontrollraden
hamnade högst upp och glyferna stod på huvudet. Mesh-shadern hade rätt konvention
via sin projektion, men UI-shadern behövde `y/h*2 - 1`. Testa alltid en overlay
mot en känd kant innan slutsatser dras om textur eller blending.

**Textatlasen samplar nu.** De tre felen ovan var hela kedjan: glyferna packades
och laddades upp korrekt hela tiden. Editor-UI:t visar läsbar text i
`--capture`-bilden, och kontrollraden ligger längst ner där den ska.

## Uppföljning: djupbufferten

**37. `D32_SFLOAT` skapas via Storms egen bindning.** Fynd 19 och 23 lämnade
orsaken till de historiska `vkCreateImage`-felen öppen. Med den typade
`device.image_2d_info` (fynd 23) och `format = 126`, OPTIMAL tiling och usage
`DEPTH_STENCIL_ATTACHMENT` (32) skapas en 2256 × 1504 djupbild på Intel Iris Plus
utan anmärkning. Bindningen och drivrutinen är alltså rätt; det som fattades var
arbetet i Storm, inte i Dunder. Djupet delar swapchainens storlek och återskapas
tillsammans med den.

**38. Painter's algoritmen var inte ett djup-test.** Som kontroll byggdes gamla
binären med sorteringsjämförelsen vänd: golvet (närmast origo) ritades sist och
målade över alla tre kuberna — kvar på bilden var bara deras skuggor. Samma
felaktiga ordning med djupbuffert gav **noll** pixlar skillnad mot den korrekt
sorterade bilden. Renderordning spelar inte längre någon roll för opaque
geometri; sorteringen finns kvar enbart för glas, som blandas.

**39. ABI-testet som hade fel, inte strukturen.** Ett nytt test fasta
`pDepthStencilAttachment` till offset 40 i `VkSubpassDescription` och föll med
`left = 48`. Efter två `u32`-trippel med padding och tre pekare är 48 rätt; C
lägger fältet där också. Lärdomen är densamma som för fynd 1: räkna paddingen
innan ett offset-test skrivs, och låt testet fasta det C gör, inte vad man
minns.

## Uppföljning: IBL

Miljöbelysningen lade till tre en-gångs-pass (himlen in i en kub, GGX-prefilter
per mipnivå, cosinus-irradians), en CPU-genererad BRDF-LUT och tre nya
descriptor-bindings. Fynden är i tur och ordning.

**40. Push constants måste stämma över hela den delade vertexshadern.** De tre
konvolveringspassen återanvänder miljöpassets vertexshader, som bygger
ytans riktning ur `right`, `up` och `forward` i push constants. Första
versionen skickade bara roughness i blocket; basen blev noll, `normalize(0)`
gav samma riktning för varje pixel och **varje mipnivå blev en enda färg**.
Symptomet i bilden var att guld- och stålkuben fick identiska speglingar på
alla tre sidorna och att `textureLod(env, r, 1.0)` såg likadan ut över hela
himlen. Minsta repro: en vertexshader som läser `push.right` och ett pass som
trycker ett block med bara `push.roughness`. Åtgärd: `face_basis()` fyller
basen i varje pass och fragmentshadern läser roughness efter den. Khronos
valideringslager hade sett det som OOB-read i push constants; utan lager är
det tyst. Rekommendation: en push-blocklayout per vertexshader, aldrig per
fragmentshader, och en kommentar i varje shader som listar hela blocket.

**41. En mipview samplas på relativ nivå.** Kedjan binder källan genom en
`ImageViewCreateInfo` med `baseMipLevel = i`, `levelCount = 1`, men shadern
läste `textureLod(source, l, i)`. På en view med en nivå är LOD `i` utanför
intervallet och resultatet är odefinierat; Intel gav ett konstant
skräpvärde per mipnivå, inte ett fel.
Minsta repro: bind en view med `levelCount = 1` och sampla på LOD 1.
Åtgärd: `textureLod(source, l, 0.0)`, alltid. Rekommendation: samma regel som
för arrayer i Dunder — index relativt till det som är bundet.

**42. Vidarebefordran av `&mut` kräver `&mut`.** En funktion med parametern
`push: &mut [f32; 24]` som anropar `face_basis(push, face)` kompilerar inte:
`push` auto-derefereras till `[f32; 24]` och felmeddelandet säger
`expected &mut [f32; 24], got [f32; 24]`. Kompilatorns not förslår `&mut push`,
och det fungerar. `&mut *push` är ett syntaxfel (`expected expression`).
Rekommendation: dokumentera reborrow-formen i språkreferensen; noten räcker
för att lösa det, men bara om man läser den.

**43. Flytlitteral på vänster sida gör uttrycket f64.** Med `x: f32` är
`x * 2.0` f32 men `2.0 * x` f64, och `f32(1.0) - y` behövs i stället för
`(1.0).f32()`, som ger `unknown float method`. Färdighetsbladet beskriver bara
höger sidan. Minsta repro: `mut a: f32 = 1.0; _ := 2.0 * a` i en funktion som
förväntar f32. Rekommendation: typa litteralen efter den andra operanden när
ena sidan redan är f32, eller låt `-`/`*` med en f64-litteral och en f32-variabel
bli ett fel i stället för en tyst uppgradering.

**44. `perspective()` mappade närplanet till −1.** Testet för
`cube_projection()` (Vulkan, z i [0, 1]) avslöjade att det befintliga
`perspective()` fortfarande använde OpenGL-intervallet: `m[10] = −(far+near)/(far−near)`
ger z = −1 vid `near` och +1 vid `far`. Scenen fungerade ändå eftersom ingenting
ligger närmare än mittan av frustumet; allt där hade klippts bort. Fixen är
`m[10] = far/(near−far)` och `m[14] = far·near/(near−far)`, som ger 0 vid
`near` och 1 vid `far`. x, y och w är oförändrade, så bilden är densamma.
Rekommendation: testa projektionen mot intervallgränserna, inte bara mot
formen på matrisen.

**Grafikobservation: format på Intel Iris Plus.** Ett fristående C-prov med
handdeklarerade Vulkan-strukturar frågade `vkGetPhysicalDeviceFormatProperties`
för optimal tilning. `R8G8B8A8_UNORM` (37), `B8G8R8A8_UNORM` (44),
`R16G16B16A16_SFLOAT` (97), `R32_SFLOAT` (100) och `R32G32_SFLOAT` (103) har
alla `SAMPLED | COLOR_ATTACHMENT | BLEND | FILTER_LINEAR | TRANSFER_SRC |
TRANSFER_DST` (råord `0x0001dd83`). En kub med sex lager, sju mipnivåer och
`VK_IMAGE_CREATE_CUBE_COMPATIBLE_BIT` skapas med `VK_SUCCESS` i format 97.
IBL använder 97 för miljö- och irradianskuberna (HDR-solskiva) och 103 för
BRDF-LUT:en. Provet lärde också att `VkPhysicalDeviceProperties` är 824 byte
på 64-bitars; en kortare struct gav skräpvärden och ett segfault.

## Verifiering

På Mikparchy byggdes Storm för x86-64/Linux. Rotpaketet och de nio
underpaketen kördes var för sig och alla 57 tester passerade: 50 från tidigare
(djupbuffertens clear-value-packning och renderpass-ABI bland dem) och sju nya
i `storm-core` för IBL:n — kubytornas baser mot Vulkans (sc, tc)-axlar,
projektionens z-intervall, när-/färplane-djup och fyra värden på BRDF-LUT:en
mot en Python-referens (skala 1, bias 0 vid N·V = 1 och roughness 0; skala
0.69 och bias 0.025 vid 0.5/0.5; energiförlust med roughness). Scenexemplet
verifierade ECS och textlayout. En bildruta renderades på Intel Iris Plus via
SSH med tillgång till Wayland-sessionen; textatlasen samplar och editor-UI:t
står rättvänt i den bilden. Djupbufferten verifierades med tre Captures från
samma kamera: korrekt sortering, felsortering utan djup (kuberna försvinner)
och felsortering med djup (identisk med den korrekta bilden, noll pixlar).

IBL verifierades med pixelprober på 2256 × 1504 mot en capture av den
oförändrade binären (`/tmp/storm-ibl-base.ppm`). Guld (metallic 1, roughness
0.10): ovansida 225,203,188 → 186,157,142, framsida 221,197,181 → 172,143,128,
skuggsida 207,190,184 → 140,123,119. Stål (0.28): framsida 222,218,186 →
167,161,127, sida 212,211,200 → 138,138,126. Golvet (metallic 0.05) flyttade
sig fyra nivåer (207,210,217 → 203,205,211), himlen och UI:t noll.
`magick compare -metric AE -fuzz 2%` gav 85 417 pixlar (2.5 % av bilden),
exakt 99 301; skillnaderna ligger på kubernas sidor, glaset och golvents
ambient, inte på himlen eller UI:t. `--no-glass` och `--no-shadows` kördes
utan krasch. Prefilterkedjan kontrollerades med `textureLod` på fasta nivåer:
nivå 0 har struktur (framsida 100, ovansida 107, golv 146), nivå 4 är
konvergerad (121,139,162 överallt).
På ARM64/macOS passerade alla 83 grupper i Dunders självhostsvit, inklusive
Hundmat och Skrift. Linuxkörningen gav 79 av 81 godkända grupper. DWARF-provet
passerade separat med LLVM:s `dwarfdump`. HTTP-klientens prov för avbrott under
TLS-handskakning föll även med den ursprungliga Linuxkompilatorn.
