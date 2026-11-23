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
**Uppdatering:** orsaken hittades i fynd 40 — det var enum-värdena, inte
drivrutinen, och båda pipelinerna var felaktiga på samma sätt.

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

## Uppföljning: textåtergivningen

**40. Fel `VkBlendFactor` i både UI- och overlay-pipelinen.** Fynd 33:s
"nästan additiva" överlägg var ett enum-fel, inte drivrutinen. Båda pipelinerna
satte `srcColorBlendFactor = 5`, `dstColorBlendFactor = 6` (och samma par på
alfakanalen) i tron att 5 var `SRC_ALPHA` och 6 `ONE_MINUS_SRC_ALPHA`. Enligt
Khronos är 5 `ONE_MINUS_DST_COLOR` och 6 `SRC_ALPHA`, alltså
`src * (1 - dst) + dst * src_alpha` — en inverterande blandning. Symptomet var
en smutsig brun låda runt varje glyf: atlas-quadens 1-pixelsutfyllnad har
täckning noll, men `(1 - dst)` ger ändå färg. Även toppraden, som ska vara
nästan svart (`alpha = 0.9`), lyste himmelblå. Orsaken till att det såg ut som
två olika fel är att mesh-pipelinen (`pipeline.ddr`) redan hade rätt 6/7/1/7;
endast UI och overlay var fel. Rättelserna sammanfogades i
`ui.blend_alpha_over` och fasta i ett test (`BLEND_SRC_ALPHA == 6`,
`BLEND_ONE_MINUS_SRC_ALPHA == 7`). Pixelpunkt `p{46,40}` i luckan mellan S och
T i "STORM": före `srgb(195,179,148)` (lådan), efter `srgb(72,83,98)` — exakt
toppradens bakgrund `p{10,50}`. Raden genom glyferna visar nu anti-aliasade
övergångar (101 → 140 → 170 → 187 → 193) i stället för tvåpixlars hartrapporter.

**41. Närmaste-granne-sampling på en nedskalad atlas.** Samplern använde
`VK_FILTER_NEAREST` medan glyferna rastrerades vid 30 px och ritades vid
skala 0.58–0.68, alltså 17–20 px på skärmen. Varje streck blev ojämna
trappsteg av hela texlar. Atlasen rastreras nu vid `RASTER_SIZE = 22` och
ritas vid skala 0.8–1.2 (26 px titel, 20 px status, 17.6 px brödtext), och
samplern använder `VK_FILTER_LINEAR` för både min och mag. Linjär filtrering
på en atlas med 1 px utfyllnad mellan glyferna kan i princip läcka in en
granne i kanten på en quad; i captures syns inget sådant vid dessa skalor,
men det är det första att kontrollera om texten senare ritas mycket mindre
än rastreringsstorleken.

**42. `VkSamplerMipmapMode` har inget `NONE`.** Uppföljningen av fynd 41
utgick från en felaktig uppsättning värden (0 NONE, 1 NEAREST, 2 LINEAR) som
cirkulerar i inofficiella sammanställningar. Khronos definierar bara
`NEAREST = 0` och `LINEAR = 1`. Samplerns okommenterade `mipmapMode = 1` var
alltså `LINEAR`, inte `NEAREST` — ofarlig på en atlas med en enda mipnivå,
men nu står `0` med rätt enum i kommentaren. Lärdom som för fynd 1 och 39:
hämta enum-värden från specen, inte från minnet, och skriv värdets namn
bredanför varje siffra.

## Uppföljning: enum vid FFI-gränsen

Efter fynd 40 ersattes alla råa Vk-enum-heltal i storm-vulkans structfält
(135 stycken i åtta moduler) med Dunder-enums i en ny modul `enums.ddr`
och konverterare (`enums.blend_factor(.SrcAlpha)`) som de enda platserna
där heltalen skrivs. Blendtillstånd blev ett värde: `apply_blend(&mut
attachment, &enums.alpha_over())`. Capturen före/efter är pixelidentisk
(AE = 0), inklusive `--effects`.

**43. `const` kan inte hålla en struct — och diagnoserna säger det inte.**
`pub const ALPHA_OVER: Blend = Blend { src_color: .SrcAlpha, … }` ger
`error[E3007]: unsupported constant type '__dunder_module_1'`. Med ett
suffix på varje variant samma sak; en kontroll med en struct av enbart
`u32` ger `__dunder_module_0`. Det är alltså structen som helhet som inte
är en konstant typ, inte enum-fälten, men meddelandet pekar på en
internt namngiven modul i stället för att säga "struct literals are not
allowed in const". *Workaround:* en funktion som returnerar värdet
(`pub fn alpha_over() -> Blend`). *Rekommendation:* antingen tillåt
structliteraler med konstanta fält i `const`, eller ge E3007 ett
meddelande som namner typen (`Blend`) och säger att `const` bara tar
skalärer.

**44. Två layoutkommentarer som ljög, och en drivrutin som tolererade det.**
Djupbilagans `finalLayout` och subpassreferensen var `2` med kommentaren
`DEPTH_STENCIL_ATTACHMENT_OPTIMAL` (3), och atlasens
`vkCmdCopyBufferToImage`-övergång gick till `3` med kommentaren
`TRANSFER_DST_OPTIMAL` (7). Båda fungerade på Intel Iris Plus, som
uppenbarligen accepterar layouterna likgiltigt vid dessa övergångar.
Med enums blev `enums.image_layout(.TransferDstOptimal)` och
`.DepthStencilAttachmentOptimal` de enda stavningarna, captures är
fortfarande AE = 0, och testet `vk_enum_values_match_the_khronos_tables`
låser varje värde mot specen. Det är samma princip som fynd 1, 39 och 42:
en siffra med en kommentar är en försäran utan vittne.

**45. `||` i början av en fortsättningsrad delar uttrycket i två statements.**
`a == x || b == y\n    || c == z` gav `E2006 unused value` på sista raden i
stället för ett syntaxfel; operatoren måste stå på raden som avslutas.
*Workaround:* `||` i slutet av varje rad. *Rekommendation:* antingen
tillåt ledande operatorer (vanligt i C-stil) eller rapportera den
avbrutna raden som ett uttrycksfel.

**51. Subagenten återinförde den lögnerandiga konstanten.** IBL-arbetet
(skrevs parallellt med fynd 44:s rättelse) definierade i `ibl.ddr`
`const LAYOUT_TRANSFER_DST: u32 = 3` med kommentaren att det är
`TRANSFER_DST_OPTIMAL` — samma tal och samma lögn som atlasens barriär i
`ui.ddr`, dit den kopierats från. Den användes fyra gånger och Intel
tolerade den. Ett tal med en kommentar är inte ett värde: när rättelsen
bara ändrade *ena* platsen överlevde misstaget i kopian. Med enums i
`enums.ddr` finns det ingen kopia att göra fel i. *Rekommendation till
oss själva:* en spec-korrigering söks alltid med grep efter talet i hela
paketet, inte bara där symptomet syntes.

**52. Structar som fylls och kastas medan packade ord är sanningen.**
`shadow.ddr` fyller två `vk.SubpassDependency` (`before`, `after`) med
`enums.access(...)`, skriver sedan `_ := before` / `_ := after` och lägger
handpackade `u64`-ord (`4294967295`, `1024`, `128`, `32`) i arrayen som
drivrutinen läser. Structarna är död kod som ser levande ut; talen är det
som gäller, och inget av dem är enums. Orsaken är att `layout.ddr` inte
har en array-typ för beroendena och `addr(&mut before)` på två separat
deklarerade structar inte är en sammanhängande array. Detta är nästa
strukturella steg (designsteg 3): antingen en `[SubpassDependency; 2]`
i `@c_layout` eller en packningshjälpare som `binding_word`, så att
struct och minne inte kan skilja sig åt. *Löst 2026-11-23:* `shadow.ddr`
använder nu `vk.Dependencies { before, after }` (en delad wrapper i
`layout.ddr`), `vk.AttachmentDescription` i stället för nio handpackade
`u32`:ar, och de kastade structarna och `writes: [u64; 28]` (deklarerad,
aldrig fylld) är borta. AE = 0.

**53. `zeroed()` vägrar en array av C-poster.** `[vk.SubpassDependency; 2]
= zeroed()` ger `E5003: zeroed requires a C record`, och felplatsen pekar
på ett senare uttryck (rad 30 istället för deklarationen). Det är den
troliga orsaken till att storm-vulkan packade allt för hand: det finns inget
nollställt array-värde att utgå ifrån. Workaround som fungerar:
`[blank(), blank()]` (en funktion som returnerar `zeroed()`), eller en
arrayliteral med samtliga fält. Felet borde säga *"zeroed takes one C
record, not an array — use `[blank(); N]`"* om språket får det, eller
acceptera arrayen.

**54. Arrayer av C-poster ÄR sammanhängande (en felalarm, dokumenterat
för att inte återupprepas).** Under steg 3 mätte jag "stride 32, `size_of
([Dep; 2]) = 112`" och var nära att skriva om storm-vulkan till
wrapper-structar *på grund av en kompilatorbugg som inte fanns*: jag hade
läst två utskriftskolumner fel. Ommätt i isolering och i storm-vulkans
testsvit: `size_of(Dep) = 28`, `size_of([Dep; 2]) = 56`, stride 28, alla
fält på C-offsets, med och utan `mut`, i `main` och i funktioner. Både
`[before, after]` och wrapper-structen är sammanhängande; testet
`c_record_pairs_and_arrays_are_contiguous` låser båda. Lärdomen är samma
som fynd 39: en siffra som inte stämmer med förväntat läses en gång till
på rätta rader innan den får förklara kompilatorn.

**55. `to_bits()` på ett negativt flyttal avslutar programmet tyst.**
`(-1000.0).to_bits()`, `CLEAR_NEG.to_bits()` (`const CLEAR_NEG: f32 =
-1000.0`) och `neg.to_bits()` på `mut neg: f32 = -1000.0` avslutar alla
programmet med exit 101 **utan något meddelande**, i isolering utan
pekare eller stores: `show(1)` skrivs, sedan dör programmet på
`show(bits(-1000.0))`. Positiva värde fungerar. Även `u64(neg)` (f32 → u64
av negativt) dör tyst, exit 107. Det är orsaken till att `shadow.ddr`
hade clear-värdet som `0xC47A0000C47A0000`-hex (någon hade träffat väggen
och packat för hand) och till en eftermiddags jakt: felet visade sig som
"capture: ready" och sedan ingenting. *Storm: `depth.float_bits(value)`
samlar teckenbiten själv — beloppets `to_bits()` med `0x80000000` eller:at när
värdet är negativt — låst av
`float_bits_covers_both_signs`; `depth_clear` och skuggans clear går genom
den.* *Rekommendation:* negativa flyttal i `to_bits()` ska antingen
fungera (det är en bit-om-tolkning, inget att panikera för) eller ge ett
felmeddelande med rad. Tyst exit är det värsta av alternativen.

## Uppföljning: IBL

Miljöbelysningen lade till tre en-gångs-pass (himlen in i en kub, GGX-prefilter
per mipnivå, cosinus-irradians), en CPU-genererad BRDF-LUT och tre nya
descriptor-bindings. Fynden är i tur och ordning.

**46. Push constants måste stämma över hela den delade vertexshadern.** De tre
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

**47. En mipview samplas på relativ nivå.** Kedjan binder källan genom en
`ImageViewCreateInfo` med `baseMipLevel = i`, `levelCount = 1`, men shadern
läste `textureLod(source, l, i)`. På en view med en nivå är LOD `i` utanför
intervallet och resultatet är odefinierat; Intel gav ett konstant
skräpvärde per mipnivå, inte ett fel.
Minsta repro: bind en view med `levelCount = 1` och sampla på LOD 1.
Åtgärd: `textureLod(source, l, 0.0)`, alltid. Rekommendation: samma regel som
för arrayer i Dunder — index relativt till det som är bundet.

**48. Vidarebefordran av `&mut` kräver `&mut`.** En funktion med parametern
`push: &mut [f32; 24]` som anropar `face_basis(push, face)` kompilerar inte:
`push` auto-derefereras till `[f32; 24]` och felmeddelandet säger
`expected &mut [f32; 24], got [f32; 24]`. Kompilatorns not förslår `&mut push`,
och det fungerar. `&mut *push` är ett syntaxfel (`expected expression`).
Rekommendation: dokumentera reborrow-formen i språkreferensen; noten räcker
för att lösa det, men bara om man läser den.

**49. Flytlitteral på vänster sida gör uttrycket f64.** Med `x: f32` är
`x * 2.0` f32 men `2.0 * x` f64, och `f32(1.0) - y` behövs i stället för
`(1.0).f32()`, som ger `unknown float method`. Färdighetsbladet beskriver bara
höger sidan. Minsta repro: `mut a: f32 = 1.0; _ := 2.0 * a` i en funktion som
förväntar f32. Rekommendation: typa litteralen efter den andra operanden när
ena sidan redan är f32, eller låt `-`/`*` med en f64-litteral och en f32-variabel
bli ett fel i stället för en tyst uppgradering.

**50. `perspective()` mappade närplanet till −1.** Testet för
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
IBL använder 97 för miljö- och irradianskubena (HDR-solskiva) och 103 för
BRDF-LUT:en. Provet lärde också att `VkPhysicalDeviceProperties` är 824 byte
på 64-bitars; en kortare struct gav skräpvärden och ett segfault.

## Uppföljning: render-grafen, editorn och glTF

*"Färdigställ editorn … render graph som fungerar … allt i Dunder."* Tre
timmar som gav fyra fynd, varav två var buggar som testerna inte såg.

**56. Byggtiden är Dunders, inte Storms.** Fem sekunder för 481 rader main
plus tio paket. Utan imports: 0,027 s. `shader.ddr` (12 768 rader, ett
SPIR-V-ord per rad) kostar 0,7 s; fyra ord per rad sparade **ingenting**
(4,98 s) — det är antalet element som typas, inte raderna. Ett paket med
`capability filesystem` kostar ~1 s även om det är 141 rader, för
stdlib-modulerna (`std.sys`, `std.dl`) kompileras med. Ett paket som bara
importeras utan att main når dess funktioner kostar 0,08 s — kompilatorn är
lat på **funktionsnivå**, så en paketvis mätning underskattar. Profilen:
Vulkan-lagret ~1,5 s, text ~0,7, stdlib ~0,5, resten ~2. *Rekommendation:*
inkrementell cache per paket skulle göra hela frågan ointressant (5 → <1 s
vid oförändrade paket). Ordning på paket i `dunder.toml` spelar ingen roll.

**57. `ERROR_OUT_OF_DATE_KHR` var −1000001003 — ett värde som inte finns.**
Rätt är −1000001004 (Khronos `VkResult`); 1000001003 är `SUBOPTIMAL_KHR`.
Konstanten användes på två ställen, så *resize-grenen kunde aldrig triggas*:
ett omdraget fönster föll igenom som "acquiring a swapchain image failed"
och fungerade ändå bara tack vare en separat `resized`-flagga; en suboptimal
present (bilden **visades**) rapporterades som fel. `lastResult: i32` fanns i
`Renderer`, deklarerat och aldrig skriven — någon hade börjat och gett upp.
Nu: `enums.VkResult` (Dunder-enum med Khronos värden, låst av test mot
referenssidan), `result_name`, och **81 Vulkan-anrop** binder sin kod före
testet (`code := r.api.X(...)`; `if code != 0 { return device.fail(&mut r,
code) }`) så `stage_name` kan säga *"pipeline (VK_ERROR_OUT_OF_DEVICE_MEMORY)"*.
En första draft skrev `fail(r, r.api.X(...))` i argumentet — **anropet körs
två gånger**, skapar två buffertar och läcker en. Skriptet som gjorde
omskrivningen är slängt; mönstret är nu i commit-historiken. Enum-cast av ett
okänt värde (`VkResult(code)`) **panikerar tyst, exit 108** (fynd 55:s
familj) — därför matchar `result_name` heltal.

**58. Payload-enum och C-enum är olika sorter.** `Shape.Mesh(i32)` går bra
att matcha (`i` är storable), men `i32(Shape.Cube)` på en enum med payload är
E3099 "integer conversion requires an integer". En enum är antingen
i32-backad eller bär data, aldrig båda. *Storm:* `Shape { Cube, Plane, Mesh }`
+ separat `Mesh { vertices: []f32 }`-komponent.

**59. glTF-parsern avvisade varje fil någon annan skrivit.** JSON-chunk-typen
jämfördes med 1313821723 = `b"\x1bTON"`; "JSON" är 1313821514. Testsviten
var grön: **fixturen i testet byggdes med samma felaktiga tal**, så den
bevisade bara att parsern var överens med sig själv. Sedan visade sig
`interleave` strunta i indexbufferten — Khronos Damaged Helmet (14 556
verticer, 46 000+ index) blev ett virrvarr av skärvor, Fox likaså. Nu:
Khronos `Box.glb` (1 664 byte) är fixtur och läses (24 verticer, 36 index,
alla koordinater ±0.5), `interleave` expanderar genom indexen, `--glb`
laddar en modell in i scenen (autoskalad till 2,4 enheter, stående på
marken) och den renderas med IBL och skugga. *Lärdom:* en fixtur som koden
själv producerat är inget bevis; ett test mot **en fil utifrån** är det.

**Om render-grafen.** Den var dekorativ: `main.ddr` byggde den, sorterade
den och körde sedan skuggpasset före loopen och matchade namn inuti loopen.
Nu är varje pass en `PassKind`-variant i schemaläggaren, loopen kör
`compiled.steps` i grafens ordning, skuggpasset är ett pass bland de andra,
och huvudrenderpasset öppnas lat av exekutorn vid första passet som inte har
ett eget. Togglen tas bort som pass, inte som flagga inuti ett pass. Skillnaden
mot HEAD var **9×15 pixlar**: siffran "passes" i HUD:en, som nu är sann (6).

**Om editorn.** Den var en statisk HUD med hårdkodade ord ("Gold cube",
"1.00 0.76 0.30"). Scenen bodde i en `[]Item` i main. Nu: `Name`, `Shape`,
`Mesh`, `Material` och en olikformig skala är komponenter i `storm-scene`,
`drawables()` är vad renderaren konsumerar, `storm-ui` har displayfria
widgets (`button`, `slider`, `row` med `Pointer` och hot/active-id; nio
tester utan fönster), trädet listar `nodes()` med indentering efter djup,
ett klick väljer, slidrarna skriver rakt in i ECS:t via `MaterialField` /
`TransformField` (en `Option` kan inte bära `&mut` i Dunder — E3099 — så
fält-id:n är gränssnittet). Spelloopen: åtta emissiva orber i en ring, går
man in i en förstörs den och HUD:en räknar; `--eye x y z` startar kameran
var som helst, vilket är hur capture-körningen bevisar plockningen (orbs 7/8,
objects 13) utan tangentbord.

## Verifiering

På Mikparchy byggdes Storm för x86-64/Linux. Rotpaketet och de nio
underpaketen kördes var för sig och alla 73 tester passerade: de 60 som
fanns sedan djupbufferten (där två fasta clear-value-packning och
renderpass-ABI), ett som låser samtliga Vk-enum-värden Storm använder mot
Khronos tabeller och `apply_blend` för alpha-over och skuggmax (de två äldre
pinning-testerna från textåtergivningen är inflyttade i det), och sju nya i
`storm-core` för IBL:n, samt två till i `storm-vulkan`: C-postparet OCH arrayen är
sammanhängande på C-offsets (fynd 54) och `float_bits` tar båda tecken
(fynd 55) — kubytornas baser mot Vulkans (sc, tc)-axlar,
projektionens z-intervall, när-/färplane-djup och fyra värden på BRDF-LUT:en
mot en Python-referens (skala 1, bias 0 vid N·V = 1 och roughness 0; skala
0.69 och bias 0.025 vid 0.5/0.5; energiförlust med roughness).
De tretton nya: två i `storm-render` (skuggpasset deklarerat före opaque
köras först och en avstängd skugga inte tar opaque-passet med sig; en senare
skrivare räknas inte), fyra i `storm-scene` (namn/form/material som
komponenter, neutralgrå åt materiallösa, hierarkins world-matriser i
`drawables`, en laddad mesh som komponent med sin vertexström), fyra i
`storm-ui` (träffyta, knappens kant, sliderns drag och klämma, radval), ett i
`storm-vulkan` (alla `VkResult`-koder mot Khronos) och ett i `storm-gltf`
(Khronos `Box.glb`: 24 verticer, 36 index, expanderad ström).
Scenexemplet verifierade ECS och textlayout. En bildruta renderades på Intel Iris Plus via
SSH med tillgång till Wayland-sessionen; textatlasen samplar och editor-UI:t
står rättvänt i den bilden. Textåtergivningen verifierades med parvisa
captures före/efter (`/tmp/storm-text-base.ppm` och `/tmp/storm-text-cap.ppm`)
och pixelpunkter i luckan mellan S och T i "STORM" samt i toppradens bakgrund
(fynd 40): lådorna runt glyferna är borta, fps-etiketten slutar exakt 30 px
från högerkanten och de tre chipsen har 16/13–14 px utfyllnad på vardera sidan
om etiketten. En capture med `--effects` visar överlägget som en vanlig
alpha-over (vignett mörkar hörnen, mitten orörd, inga inverterade områden).
Djupbufferten verifierades med tre Captures från
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
Miljöbelysningen verifierades på samma sätt med en capture före (`55a22ab`,
`/tmp/storm-ibl-base.ppm`) och efter sammanslagningen på `main`
(`/tmp/storm-captures/ibl-merged.ppm`), båda med `--frames 1` på
2256x1504: guldframkanten `srgb(223,200,184)` → `srgb(177,148,133)`,
stålsidan `srgb(221,225,204)` → `srgb(183,188,168)`, golvet −6 per kanal och
himlen `srgb(180,200,226)` oförändrad. Efter att IBL:s egna råa enum-tal
migrerats till `enums.ddr` (30 structfält, 9 lokala konstanter och
`LAYOUT_TRANSFER_DST` 3 → 7, fynd 51) är scenen pixelidentisk mot IBL:s
egen capture: enda skillnaden (AE 115 068) ligger i topprad, paneler och
underkant, alltså textåtergivningen som inte ingick i IBL:s bas.
