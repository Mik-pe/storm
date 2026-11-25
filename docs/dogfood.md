# Vad Storm hittade i Dunder

Granskat 2026-11-23. Utgångspunkten var Storm `fdd9cc6` och Dunder
`62e1530`. Punkterna 1–22 kommer från den ursprungliga rapporten, 23–25 från Storm `14bd30c`,
26–36 från `9452ba3` och 37–39 från djupbufferten.
Dunders ändringar och regressionstester finns i [9b6dcd2](https://github.com/Mik-pe/dunder/commit/9b6dcd2e441c0fb88cb211347e2955d6716546df).

Omprovat 2026-11-24 med Dunder 0.12.0 och Storm `77d9b0c`. Roten och alla 15 paket gav 143 godkända test på både Macen och Mikparchy. Metals pixelprov passerade på Macen. Byggtidsprovet på Mikparchy gav 16,689 s mot gränsen 20 s.

## Språk och standardbibliotek

| Punkt | Vad som gick att verifiera |
| --- | --- |
| 1 och 17. Fält i `@c_layout` | Fasta arrayer av C-poster stöds som fält. Elementen ligger med C:s storlek och justering. Ett ägt `string`-fält ger E5003 vid fälttypen. [FFI-kontrakt](https://github.com/Mik-pe/dunder/blob/v0.11.3/docs/ffi.md) · [Storms ABI-prov](../packages/storm-vulkan/tests/suite.ddr) |
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

**21. Bildåterläsning.** Ett tidigt försök att kopiera från Vulkan till en buffert avbröts. Den exakta orsaken till det felet är okänd. Den första fungerande läsvägen mappade en linjärt tilad bild och behövde både `offset` och `rowPitch` från `VkSubresourceLayout`. I dag ritar Storm till en optimalt tilad färgbild. `vkCmdCopyImageToBuffer` skriver fyra byte per pixel i en sammanhängande värdsynlig buffert. En minnesbarriär och en fence gör GPU:ns skrivningar klara för läsning på CPU:n. Samma väg har verifierats på Intel Iris Plus genom att rendera och läsa två bildrutor på 719 × 451 pixlar utan skrivbordssession. [VkBufferImageCopy](https://docs.vulkan.org/refpages/latest/refpages/source/VkBufferImageCopy.html)

**22. Structretur med pekarfält.** Ett separat program returnerade två structar med två pekare vardera och olika storlekar. Båda behöll sina ursprungliga fält efter det andra anropet på ARM64/macOS och x86-64/Linux. Storm använder utparametrar vid bildallokering. Bildartefakten från det tidigare försöket har ingen fastställd koppling till Dunders returkonvention.

**23. Djupbilder via Storms bindning.** Skuggkoden märkte värdet 1 som optimal tiling. Vulkan definierar 0 som optimal och 1 som linjär. Storm bygger nu en typad `ImageCreateInfo` och använder namngivna konstanter för skuggbilden och återläsningen. Ett Dunder-program skickade Storms struct till ett C-prov som kontrollerade fälten och anropade Intel-drivrutinen. Både D16 och D32 på 512 × 512 skapades med `VK_SUCCESS`. Vilka fält de historiska misslyckade anropen skickade är okänt. Djupbilagan i renderpasset är klar (0c, fynd 37).

**24. Skrivning via beräknad adress.** Ett prov skrev det mittersta ordet i en justerad, ägd array via basadressen plus fyra byte och kontrollerade båda grannvärdena. Provet passerade på ARM64/macOS och x86-64/Linux, även med den ursprungliga Linuxkompilatorn. Orsaken till den tidigare kraschen vid skrivning i GPU-mappat minne är öppen.

**25. Push constants.** Intel-enheten rapporterar `maxPushConstantsSize = 256` byte. Den rapporterade begäran på 320 byte överskred enhetens gräns. Meshpasset använder 240 byte och ljusmatrisen ligger i en uniform buffer. Enhetsval, pipelinelayout och inspelning delar nu samma storlekskonstant, så en enhet med lägre gräns väljs bort före pipelineskapandet. [VkPushConstantRange](https://docs.vulkan.org/refpages/latest/refpages/source/VkPushConstantRange.html)

## Designbedömning

- **Behåll de explicita ägarreglerna.** `&mut self` lånar och `move self` gör konsumtion synlig. Ett lån ska upphöra efter sista möjliga läsning, även när nästa sats är en loop. Då kan scengrafen traverseras direkt och kompilatorn kan fortfarande skydda lån som lever till nästa varv. Typade `Pool<T>` ger systemen tydliga beroenden. Ett behov av komponenttyper som registreras under körning skulle motivera en separat design.
- **Ge ordnad och oordnad borttagning egna namn.** `remove` bevarar ordningen. `array.swap_remove` flyttar sista elementet till luckan och returnerar det borttagna värdet i konstant tid. Den skillnaden påverkar vilken entitet som äger komponenten efteråt. [Dunders implementation och tester](https://github.com/Mik-pe/dunder/commit/9f9b341)
- **Låt typen följa uträkningen.** Standardtypen `f64` för en fristående literal och kontextuell `f32` i en redan typad uträkning fungerar väl tillsammans. Samma metodnamn för trigonometri på båda typerna tar bort konverteringar från den faktiska kamerakoden. `import std.math as _` är dock svårt att upptäcka. En namngiven import som bara tillför metoder kan fortfarande få W1002 för oanvänt importnamn.
- **Skilj talomvandling från läsning av råbitar.** En kontrollerad konvertering ska fortsätta fånga spill. `wire.Reader.read_f32` uttrycker glTF-laddarens avsikt direkt. Vid slumpmässig åtkomst är `bytes.i32_le` användbar, men `bytes.u32_le` returnerar `i64`, medan `wire.Reader.read_u32_le` returnerar `u32`. Den skillnaden är lätt att missa och bör hanteras vid en samordnad API-migrering.
- **Behåll typerna som skiljer närvaro från innehåll.** `is_ok()` svarar på en ja/nej-fråga och `ok()` ger det eventuella värdet. `find` med `Option` gör byteposition noll entydig. `s[i]` är användbart för byteprotokoll men kräver UTF-8-avkodning för tecken. Explicita grants för transitiva beroenden gör resursåtkomst synlig hos konsumenten.

## Uppföljning: editor-UI, overlay-effekter och textatlasen

**26. Fasta arrayer av C-poster.** Den tidigare kraschen i `vkCreateGraphicsPipelines` ledde till en rekommendation om namngivna omslagsfält. Storms senare prov för två `Dep` visade 28 bytes elementstorlek, 56 bytes arraystorlek och rätt fältoffset. Både en fristående array och ett arrayfält kan skickas till C. Se fynd 54.

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

**43. Structliteraler som modulkonstanter.** Ett `const` av typen `Blend` ger E3007. Diagnostiken visar nu källans typnamn. Storms `alpha_over()` bygger värdet från typade enumvarianter. Dunder stöder också fasta strängtabeller från 0.12.0.

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

**45. Radfortsättning med `||`.** Avsluta raden med operatorn för att fortsätta uttrycket. Med `||` först på nästa rad ger 0.12.0 E2006 vid den avslutade satsen och E1002 vid operatorn. [Dunders syntax](https://github.com/Mik-pe/dunder/blob/v0.11.3/docs/syntax.md)

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

**53. Nollställ en array av C-poster.** `zeroed()` skapar en C-post. För en array av två poster fungerar `[zeroed(); 2]`. Arrayens storlek och elementens offset täcks av Vulkanprovet i fynd 54.

**54. Verifierad layout för arrayer av C-poster.** `c_record_pairs_and_arrays_are_contiguous` kontrollerar två 28-byteposter i en 56-bytearray och motsvarande omslag. Den tidigare uppgiften om 32 bytes steg berodde på en felläsning av mätutskriften. [ABI-provet](../packages/storm-vulkan/tests/suite.ddr)

**55. Skriv flyttalets bitmönster som ett Vulkan-ord.** `f32.to_bits()` ger ett tecknat `i32` och bevarar även negativ noll och NaN:s nyttolast. Exit 101 kom från den efterföljande konverteringen till `u32`. `depth.float_bits` breddar till `i64` och maskerar de lägsta 32 bitarna före konverteringen. Testet kontrollerar även negativ noll och en NaN med satt teckenbit.

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

**48. Vidarebefordra ett muterbart lån.** En funktion med `push: &mut [f32; 24]` skickar lånet vidare med `face_basis(&mut push, face)`. Formen visar att det andra anropet får ändra värdet.

**49. Flytlitteraler får typ från sammanhanget.** I 0.11.2 ger både
`x * 2.0` och `2.0 * x` ett `f32` när `x` och returtypen är `f32`.
En fristående `x := 2.0` skapar däremot ett `f64`.

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
Vulkan-lagret ~1,5 s, text ~0,7, stdlib ~0,5, resten ~2. *Uppföljning
senare samma dag:* med editorn, IBL och glTF-laddaren är `main.ddr` 747 rader
och bygget 6,6 s (`tools/build-time.ddr`, 20 s-budgeten i `AGENTS.md`); det är
fortfarande kompilatorn, inte koden, som sätter talet. *Rekommendation:*
mät ett varmt bygge med Dunders befintliga funktionscache innan ett separat paketcacheformat övervägs.

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

**60. Härled typ från ett returnerat lån.** `join2(g.names(), g.locals())` gav E3003 i 0.11.2 även inom en modul. En lokal för varje argument eller explicita typargument fungerade. Dunder 0.11.3 härleder typerna från accessorernas delade lån. Orbräknaren skickar `graph.locals()` direkt.

**61. Dela zlib mellan WOFF och andra filformat.** Dunders paket `packages/zlib` tillhandahåller `decompress(src, max_bytes)`. Gränsen gäller även när ett komprimerat block hänvisar bakåt i utdata. Skrift använder WOFF-tabellens deklarerade längd som gräns. En PNG-läsare kan i stället härleda sin gräns ur bildmåtten.

**62. Oanvänd kod i beroendet.** Varningarna gick att reproducera i Skrift. De oanvända importerna har tagits bort och den gemensamma avkodaren använder `_` för överhoppade loopindex.

**63. Antal argument.** Anropet `f2(1.0, 2.0, 3.0)` till en funktion med två parametrar fick E3003 utan antal. Dunder 0.11.3 visar både förväntat och faktiskt antal. För metoder räknas de argument anroparen skriver.

**64. Hitta oanvända privata funktioner.** Dunders valfria
`check --unused-functions` söker efter referenser i paketets källkod och
inkluderar tester och funktionsvärden. Två privata hjälpfunktioner saknade
referenser i scen- och textpaketen och har tagits bort.

*Verifierat med Dunder 0.12.0.* `dunder --help` visar flaggan under `check`.
`W1003` gäller privata funktioner. Ett separat testprojekt importerade
`math.extras` direkt och skrev ut `42` från dess publika funktion, trots att
bibliotekets rotmodul aldrig importerade `extras`. En varning grundad på
rotmodulens referenser skulle alltså även träffa fungerande publika API:er.

Vid genomgången av Storm tog `d394ec0` bort sju publika funktioner som
saknade anropare här: `scaling`, `is_full`, `aligned`, `meshes`, `materials`,
`worlds` och `hot`. `vulkan.ui.reset` fick en anropare i `begin_frame`.

**Om vertexformatet (3a).** Stride, offset och format stod på två ställen
(`pipeline.ddr` via enums, `shadow.ddr` med `inputRate: 0`, `format: 106`
×2) och "ändra på båda eller ingen" var en regel att komma ihåg — AGENTS.md
kallar det ett bandaid över en grund som inte bär. Nu äger `layout.ddr`
-posten `VertexInput { binding, attributes }` hela beskrivningen
(`VERTEX_FLOATS = 8`, `VERTEX_BYTES = 32`, offset 0/12/24),
`enums.apply_vertex_input` skriver enum-fälten, och båda pipelinearna
deklarerar samma post; `mesh_pass` och `shadow.mesh` validerar mot
`VERTEX_FLOATS`. Tre råa heltal kvar → noll, och det finns ingen andra
plats att glömma. En mätfälla på vägen: testet `addr(&c) - addr(&b) == 16`
mätte tre *kopior* av fälten (`a := input.attributes.position` …), inte
posten — fynd 39/54 igen, råorden `[0,0,0,0][1,0,0,12][2,0,0,24]` mätta i
isolation var korrekta och testet var fel.

## Uppföljning: gränssnittet och Metal-backenden

Ett kontrakt (`storm-gfx`), en app generisk över det, och en andra backend
(`storm-metal`) som når AppKit och Metal genom Objective-C:s runtingen.
Fynden är i den ordning de träffades.

**65. Bädda in paketets egen fil.** `@embed_file("shaders/storm.metal")` hittar filen relativt Metal-paketets rot även när paketet är ett beroende. Det fungerar redan i Dunder 0.11.2. Den genererade kopian av shaderkällan har tagits bort.

**66. Formatera en kvalificerad traitimplementation.** `impl lib.Speaks for Cat` kompilerade men gav tidigare `expected '{'` i `dunder fmt`. Dunder 0.11.3 läser det kvalificerade namnet även i formateraren.

**67. Funktion med samma namn som en primitiv typ.** `fn string(value: string)` ska slå upp funktionen vid anrop och den primitiva typen i en typangivelse. Dunder 0.11.3 skiljer fallen åt. Diagnostik för generiska argument och konstanter visar källans typnamn.

**68. Ett lyckat resultat utan nyttolast.** Skriv `.Ok` för `Result<(), E>`. Från Dunder 0.11.3 visar felet för `.Ok(())` den giltiga formen.

**69. Fångstgren i heltalsmatchning.** `match n { 0 => 1, _ => 2 }` fungerar i 0.11.2. Det var `else` i mönstret som utlöste felet. Diagnostiken i 0.11.3 föreslår `_`.

**70. Byggtiden ökade med ny kompilator.** På Mikparchy byggde samma Storm-träd (`54214f3`) på 6,85 s med 0.11.0/0.11.1 och 9,1–10,3 s med 0.11.3. Det större trädet vid `77d9b0c` tog 15,1–15,7 s med 0.11.3. För att jämföra kompilatorversioner har Dunder nu en byggtidsserie med fasta källrevisioner, växelvis körordning och separata mätningar för nybygge, ändrad källa och oförändrat bygge. [Byggtider och rådata](https://github.com/Mik-pe/dunder/tree/b5a10f3/benchmarks/compiler/2026-11-24-project-builds)

**71. Hitta funktionerna som tar tid i MIR.** I 0.11.3 gick det att stänga av optimeringar och mäta hela passet. Dunders `main` visar nu upp till tio funktioner, längst tid först, med `dunder build --profile-compiler`. Varje rad anger funktion, källfil, rad och antal MIR-operationer. Samma uppgifter finns i `compiler_detail.slowest_mir_functions` med `--timings=json`. Profileringen kör seriellt. Byggbudgeten mäts fortfarande med ett vanligt bygge.

På Mikparchy, med Storm `4123d5a` och Dunder `5a1ed4e`, tog de tio
långsammaste funktionerna sammanlagt 2,14 s av MIR-fasens 9,56 s.
`run_session<Window>` (`src/app.ddr:184`, 332 ms) och `post_fragment`
(`shader.ddr:1747`, 321 ms) låg högst. Den profilerade binären var
byteidentisk med den från ett vanligt bygge.

**Vad Dunder gjorde bra, och vad som formade koden (inte brister).** Helt
utan C-shim, bindningsgenerator eller extern kompilator: `std.dl` + `ffi_fn`
för typade meddelanden, `callback(namn)` för femton Objective-C-metoder vars
kroppar är Dunder-funktioner, `static_bytes("native", N)` för det enda
tillstånd C kan nå (en post med automatisk nollställning), `target_is` för
att välja backend vid kompilering, och `@c_layout`-poster med flyttal per
värde i båda riktningar. Regelverket tvingade fram bättre kod än jag
skrev först: `&mut` vidarebefordras som `&mut r` (fynd 48), en ägande
parameter kräver `move x` på anropsplatsen, ett mutabelt argument får inte
stå bredvid ett annat lån av samma värde i ett anrop (därav `require_main(&r)`
och draws som binder med delade lån), en traitmetod som konsumerar är
`fn close(move mut self)`, en `mut`-parameter kan inte flyttas ifrån utan
`move`, `||`/`&&` ska stå på raden som avslutas (fynd 45), och en obunden
flytliteral med `:=` är f64 (fynd 49 — igen). Tre av reglerna hade en not
som sa exakt vad som skulle göras.

**Om ECS-frågorna.** Poolerna hade `entities()` och `values()` men inga
queries; fyra system loopade entiteter för hand med `contains`-kontroller
(`drawables`, orbräknaren, orbplockaren, editorns radlista). Nu: `Match
{ entity, a, b, c }` med dense-index per pool, `join2`/`join3` går från
första poolen (skicka den minsta först), `at(index)`/`at_mut(index)` läser
utan sparse-uppslag i den heta loopen, `dense_index` ger −1 för saknade
och för inaktiva handtag. En fråga är en ögonblicksbild: en komponent som
tas bort efteråt flyttar sista raden (swap-remove), så system som tar bort
samlar entiteter i loopen och tar bort efter den. `Graph` exponerar de
pooler systemen utanför paketet frågar (`names()`, `locals()`);
`drawables` är `join2(meshes, worlds)` med material som valfri tredje,
orbsystemen är `join2(names, locals)`. Sju ECS-tester, varav två för
frågorna; capture utan `--glb` AE = 0 mot editorbaslinjen, `--eye`-spelet
fortfarande orbs 7/8 / objects 13.

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

## Uppföljning: vk.xml som källa

`tools/vk.ddr` läser Khronos register och skriver `api.ddr`: 80 prototyper
och 80 symboluppslag som tidigare stavades för hand. Tre saker i registret
som en taggläsare måste veta, och som den första skissen felade på innan
mätning rättade den: `<type category="handle">` omsluter en inre `<type>`
(`VK_DEFINE_HANDLE`), så den första `</type>` stänger inte posten;
`<implicitexternsyncparams>` innehåller `<param>`-element som är prosa, inte
parametrar; och en parameter kan listas en gång per API-profil
(`api="vulkan,vulkanbase"` mot `api="vulkansc"`), där `vulkansc` är ett annat
API som bara delar prefix. Handkoden hade **ett** fel på 80 prototyper:
`vkGetPhysicalDeviceQueueFamilyProperties` deklarerades `-> i32`, registriet
säger `void`. De 79 andra var identiska med genereringen.

**72. Byteoffset i en `string` måste ligga på en teckengränns — och bryter den tyst med status 106.** En genomsökning av en 3,3 MB `vk.xml` med `source[i..i + needle.len] == needle` vid varje offset avslutas med utgång **106** utan text, vid det första `©` i en kommentar. Symptom: `dunder run` skriver inget alls; sista `print` är den före loopen. Minimal repro: en fil med `<a>©</a>` och en loop som läser `s.value[i..i + 1]` för alla `i`. Workaround här: registryn läses som `[]u8` (`sys.read_u8`) och text dekodas bara mellan två taggränser (`bytes.decode_range`), som alltid är ASCII. Det fungerar och är snabbt (3,6 s för hela registret), men två saker saknas: en diagnostik som säger *vilken* operation och *vilket* offset som bröt gränsen (fynd 60: samma tysta slut som `to_bits()` på ett negativt flyttal), och en stdlibfunktion som söker ett ASCII-mönster i en `string` från en offset — `std.text.find` har ingen `from`-parameter, så varje anrop efter en träff börjar om från 0. Rekommendation: (a) status 106 ska peka ut operation och offset som status 103 gör för arrayer; (b) `text.find_from(text, needle, from)` eller en `[]u8`-vy av en `string` utan kopia.

**73. `_ := f()` på en funktion utan returvärde kompilerar — så en felaktig `-> i32` syns inte när den rättas.** Skill-regeln är att ett anrop som returnerar `()` ska stå bart och att `_ := f()` på ett sådant är `E3002`. Mätt på 0.12.0 med en `extern fn(ptr)` (inget returvärde) i en `@c_layout`-post: `_ := f.void_ret(ptr(0))` går igenom `dunder check` grönt. Konsekvensen i Storm: `device.ddr` band `_ := r.api.GetPhysicalDeviceQueueFamilyProperties(…)` medan prototypen ljög `-> i32`, och när prototypen rättades till `void` kompilerade samma rad oförändrad — ingenting tvingade fram det korrekta bara anropet. Minimal repro: structen ovan. Workaround: raden ändrades för hand till ett bart anrop. Rekommendation: `E3002` för `_ :=` på `()`, som dokumentationen redan lovar; då blir en rättad prototyp ett compile-fel på varje anropsplats som bar på lögnen.

**74. `i32(u32)` avbryter programmet när teckenbiten är satt — så ett `u32`-ord ur minnet kan inte bli ett `f32` via `from_bits`.** Symptom: `i32(w)` där `w: u32 >= 0x80000000` skriver `integer overflow or conversion out of range` och avslutar med utgång **101**. Den enda bitvägen till ett flyttal är `f32.from_bits(i32)` (fynd 55), och den vanliga källan till ett ord är `bytes.u32_le`/ett `[]u32`, alltså `u32`. Konsekvensen: varje negativt flyttal i en binär fil (en glTF-ACCESSOR med min/-max, en normals komponent, en `-0.0`) är oläslig på det sätt dokumentationen rekommenderar. Minimal repro: `w: u32 = 0xC1200000` (bitmönstret för −10.0); `i32(w)` dör på raden. Workaround här: magnitud plus aritmetisk negation (`m := f32.from_bits(i32(w.bit_and(0x7FFFFFFF))); v := 0.0 - m`), vilket stämmer för alla ändliga värden utom `-0.0` (blir `+0.0`) och NaN (blir `-NaN`, fortfarande NaN). Probemätningen av drivrutinsgränser träffade det: `maxSamplerAnisotropy` lästes på fel ord (ett teckenbitat mönster) och tolkades först som en kompilatorbugg. Rekommendation: `i32.from_bits(u32)`/`u32.from_bits(i32)` som syskon till `f32.from_bits`, eller att `i32(u32)` definieras som omtolkning (wrapping) på samma sätt som Rusts `as`.

**75. `dunder run fil.ddr arg` ger tre olika missvisande meddelanden — inget nämner `--`.** `dunder --help` dokumenterar `dunder run [input.ddr] [-- program-args...]`, men när `--` glöms är diagnostiken annorlande beroende på argumentet och leder fel: `dunder run tools/vk.ddr --check` → `unknown option: --check` (utgång 2; låter som att *programmet* inte känner flaggan, som `git foo --bad`), `dunder run fil.ddr foo bar` → `expected a single source file` (låter som att två källfiler gavs), och `dunder run fil.ddr -x` → `unknown option: -x`. Samma för `build --help`. Orsak: `run` parserar allt efter filnamnet som kompilatorflaggor tills en `--` kommer. Konsekvensen i Storm: `tools/vk.ddr` dokumenterar `--check` i sin usage-rad, men raden som står i design.md/next-steps saknade `--`, och första körningen vid dokumentationsgenomgången tog fel väg. Minimal repro: ett program med `fn main() -> i32 { print(sys.arg_count().str()); 0 }`; `dunder run p.ddr --check` dör innan `main`. Workaround här: alltid `dunder run tools/vk.ddr -- /tmp/vk.xml --check` (nu skrivet så i next-steps och i verktygets usage-rad). Rekommendation: (a) när en okänd flagga följer källfilen, säg "program arguments require `--`: dunder run FIL -- ARGS"; (b) när ett andra icke-flaggargument följer källfilen, samma text i stället för "expected a single source file"; (c) `dunder run --help` ska visa `run`-användningen, inte "unknown option".

**76. En `ptr`-ut-parameter kan läsas som om den vore handtaget den pekar på — tre olika krascher, ingen diagnostik.** Symptom: en hjälpare `unsafe fn create_image(r: &state.Renderer, …, image_out: ptr, memory_out: ptr, view_out: ptr) -> i32` med `r.api.CreateImage(r.device, addr(&info), ptr(0), image_out)` och sedan `r.api.GetImageMemoryRequirements(r.device, image_out, …)`, `view.image = image_out`, `BindImageMemory(…, image_out, …)`. Det kompilerar grönt (`image_out` och en `VkImage` är båda `ptr`), och `CreateImage` skriver handtaget *dit pekaren pekar*, alltså till anroparens lokala variabel — medan de följande raderna läser pekarens eget värde (adressen till den lokala variabeln) som om det vore handtaget. Konsekvensen i Storm: texturuppladdningen (3b) kraschade tre gånger med tre olika bilder och ingen rad som pekade på orsaken — `SIGSEGV` i `vkGetBufferMemoryRequirements` (handtaget var `VK_NULL_HANDLE` eftersom `staging_buffer` gjort samma misstag och `staging` förblev `ptr(0)`), loader-abort i `vkBeginCommandBuffer: Invalid commandBuffer`, och en tredje abort i `vkQueueSubmit` som visade sig vara en *annan* bugg (en glömd `EndCommandBuffer`) som dolles av att de två första krascherna aldrig nådde dit. Minimal repro: `unsafe fn fill(out: ptr) -> i32 { store_ptr(out, ptr(42)); _ := load_ptr(out); 0 }` — anropad som `mut v := ptr(0); _ := fill(addr(&mut v))` gör det rätt, och `fill(v)` (samma typ, också grönt) skriver in i adressen `0`. Det är den andra formen en ut-parameter bjuder in till när samma namn sedan läses som ett handtag. Workaround här: varje hjälpare binder sina handtag till lokaler (`mut image := ptr(0)`), skickar `addr(&mut image)` till Vulkan, och skriver ut-parametrarna i slutet med `store_ptr(image_out, image)` — formen `ui.ddr` och `ibl.ddr` redan använder; det blev en regel i texture.ddr och en granskning av varje `*_out: ptr` i paketet. Rekommendation: (a) en `ptr`-parameter ska inte kunna användas både som mål för `store_ptr` och som värde utan att typen skiljer dem — t.ex. en `out T`-parameter som bara får förekomma som `addr`-mål och som `store_ptr`-mål, eller (b) en varning när en parameter som är `addr`-mål i ett anrop (`f(p)` där `f` deklarerar `out`) också läses som `ptr`-värde i samma funktion. Idag är det enda skyddet konvention.

**77. En tabellpost i en `const` går inte — och ett `{ f: v }` utan typnamn är inget uttryck, inte heller i en funktion.** Symptom: `const ENUMS: []Enum = [{ dunder: "Blend", block: "VkBlendFactor" }]` ger `E3007 unsupported constant type '__dunder_module_N'` (meddelandet namnger en intern modul, inte typen; det gäller även en struct av bara `string`, mätt i `/tmp` mot 0.12.0). Flyttad till `fn table() -> []Enum { [ { dunder: … }, … ] }` ger i stället `E1002 expected expression` med markören på `{`. Minimal repro: `struct Pair { a: string, b: string }` + `fn t() -> []Pair { [ { a: "p", b: "q" } ] }`. Det som kompilerar är `Pair { a: "p", b: "q" }` med typnamnet på varje rad (mätt: grönt). Workaround här: `tools/vk.ddr`:s tre urvalstabeller (`selected_enums`, `flag_sets`, `named_constants`) är funktioner som returnerar literalen med typnamn på varje post, byggda en gång i `main` och skickade som `&[]T` nedåt. Rekommendation: (a) en post på tabellform ska få härleda sin typ från elementtypen i en array-literal med känd returtyp (`-> []Pair`), så som `let x: Pair = { … }` får det; (b) E3007:s meddelandet ska namnge typen som avvisades, inte modulen.

**78. Varken `parse.integer` eller `parse.hex` läser ett radixprefix — `0x…` ger `ok = false` i båda.** Symptom: `<enum value="0x00000003" name="VK_CULL_MODE_FRONT_AND_BACK" />` ur Khronos-registret gick genom `parse.integer` med `ok = false` och konstanten saknades i registret, vilket yttrade sig som "FrontAndBack is not numbered" tre funktioner senare. En väg dit via `parse.hex("0x00000003")` såg rimlig ut men gav också `ok = false` (mätt: `0x7FFFFFFF` likaså; `parse.hex("00000003")` ger 3). Minimal repro: `parse.integer("0x1F".clone()).ok` och `parse.hex("0x1F".clone()).ok` — båda falska. Workaround här: `enum_value` skär av `0x`-prefixet och ger resten till `parse.hex`. Rekommendation: `parse.hex` ska acceptera (eller `parse` erbjuda en funktion som accepterar) `0x`/`0X`, som C:s `strtoul` med bas 16 och `0` med bas 0 gör; registret, JSON-scheman och hashutdata skriver alla prefixet.

**79. `text.starts_with(text, prefix)` — en parameter som heter som modulaliaset skuggar modulen.** Symptom: `fn f(text: string) -> bool { text.starts_with(text, "0x") }` ger `E2003 unknown field 'starts_with'` på `text`, för `text` är parametern, inte `import std.text as text`. Samma regel som kompetensen redan har för lokaler (`widgets := widgets.State::new()`), men den biter också på en *parameter*, och diagnostiken säger "field" — inte att namnet skuggar en modul. Workaround här: modulfunktioner nås via ett alias som ingen parameter heter (`import std.text as text` + parametrar döpta `value_text`, `source`). Rekommendation: E2003 bör nämna att namnet är skuggat av en parameter med samma namn som modulen ("`text` is a parameter; the module alias `text` is shadowed — import as another name"), som den redan gör för `&mut`-vidarebefordran.

**80. `packages/zlib` dekodar rätt men 20–26× långsammare än libpng/stb — och kostnaden sitter i slingan, inte i algoritmen.** Symptom: `zlib.decompress` är korrekt på varje PNG i `~/Work/Katla/resources/models/` (13 bilder, `got == inflated`, Adler-32-grönt), men genomströmningen är 3,9–14,8 MB/s mot libpng/stb_images 100–300 MB/s (Wuffs upp till 1 GB/s). Mätt på Mikparchy med `sys.now_ms()` runt `decompress`, Dunder 0.12.0: Fox 1024² RGB (IDAT 26 kB, 118:1) 212 ms; Tiger 1024² RGBA (1,18 MB, 4:1) 814 ms; Tiger 2048² RGBA (7,5 MB, 2:1) 4 323 ms. Hela Tiger.glb är 10,0 s att inflate. **Kostnaden per dekad byte styrs av kompressionsförhållandet**, inte av utdatastorleken: Fox 67 ns/B, Tiger 0 258 ns/B, 4× skillnad. Var tiden går (uppdelat med prov i `/tmp`, `pngprobe`): 4,2 M `out.push` utan inflate ~190 ms och 4,2 M index-skrivningar ~60 ms, så push är en fjärdedel; resten är läsning i slingan: `HuffTable.decode` läser **ett bit i taget** (`bs.read_bits(&src, 1)` i `for bits in 1..16`, `ensure` om i varje) och en back-referens pushar **en byte i taget** (`for _ in 0..copy_len { b := out[out.len - dist]; out.push(b) }`). Långa referenser betalar push, korta betalar Huffman — därav förhållandet. **Var tiden går — mätt, inte läst ur koden (2026-11-25, `/tmp/pngprobe`):** tre former för back-referenskopian på 4,2 M byte (en `push` per byte som i dag; noll-push + index-skrivning; samma med löpande index; `array.resize` + index) ligger på **145–168 ms** för långa referenser (dist 1000) och 158–215 ms för korta (dist 8): kopieringsformen är brus. Att stoppa strömmen vid första utbyte (`max_bytes = 1`) kostar 0–1 ms på Tiger 0, Tiger 1 och Fox, dvs. rubriker och tabellbygge är ingen del av tiden. Allt sitter i tokenloopen, och eftersom kopieringen där är ~190 ms av Tiger 1:s 762 ms är **resterande ~75 % `HuffTable.decode`** — upp till 15 `read_bits(…, 1)`-anrop per symbol, `ensure` i varje, `!bs.ok` i varje. Minimal repro: `zlib.decompress` på vilken PNG:s sammanfogade `IDAT` som helst (ett 60-radars chunk-prov räcker); jämför med `python3 -c 'import zlib,sys;zlib.decompress(open("idat","rb").read())'`. Workaround här: ingen i Storm — avkodaren är korrekt, och Storm bygger glTF-bilder (next-steps 3c) mot `decompress` som det är; det är för långsamt för Tiger men inte för Fox. Rekommendation, i storleksordning efter **mätt** vinst: (a) läs *n* bitar i ett anrop i `decode` — en bitläsare med `n` som parameter och `ensure` en gång per symbol, eller en tabell över de första nio bitarna (tjäderns/Marks klassiska 9-bitarsuppslag) — är den enda posten som kan flytta 75 % av tiden; (b) kopiera en back-referens i ett anrop är **noll vinst** (mätt ovan) och dessutom inte uttryckbart som `bytes.extend(&mut out, &out[a..b])` (E4003, se fynd 81); (c) `out.reserve(expected)` hjälper högst mot pushes ~45 ns/B, en fjärdedel av Tiger 1. **Olöst:** inget — var tiden går är mätt; vad som återstår är att mätningen ovan upprepas i Dunder-repot när (a) är gjort.

**81. Glömt `&mut`-vidarebefordran till en *generisk* funktion ger E3003 "cannot unify argument 1 (got '[]u8')" — utan noten som säger vad som är fel.** Symptom: `fn f(values: &mut []u8, n: i32) { array.resize(values, values.len + n, &u8(0)) }` ger
`E3003: cannot unify argument 1 for generic function 'resize' (got '[]u8')` med caret på `values`. Samma misstag till en vanlig funktion ger `E3001: type mismatch: expected &mut []u8, got []u8` **med noten** "'values' is a '&mut' parameter that auto-dereferences; pass '&mut values' to forward it" (rättat blir kompilatorn grön). Noten saknas för den generiska mottagaren, och "cannot unify … got '[]u8'" läses som att *elementtypen* är fel — tre argument, och diagnostiken säger inte vilket. Minimal repro (0.12.0): `import std.array as arr` + funktionen ovan + `mut a: []u8 = []; f(&mut a, 1)`. Workaround: regeln är redan känd (för vidare `&mut r`); det som kostade tid var att diagnostiken inte påminde om den. Rekommendation: när ett argument till en generisk funktion inte unifierar och argumentet är en `&mut`-parameter som skickas utan `&mut`, sänd samma not som E3001 gör. Generiska mottagare med `&mut []T` finns i stdlib (`array.resize`, `array.fill`); de konkreta (`bytes.extend`, `bytes.extend_range`) ger E3001 med noten.

**82. 156 rader PNG-dekodare kostar 1,1 s kompilering — och det är inte slingindexeringen.** Symptom: Storms `--glb` med texturer nådde `storm-image/src/decode.ddr` (156 rader) och `packages/zlib` (287 rader) från `main` för första gången (2026-11-25, `05a0250`): byggtiden gick 16,4 s → 18,2 s, dvs. **91 % av 20 s-budgeten**, för en kod som är en tusendel av trädet. Uppdelat med `dunder build --timings` på prov i `/tmp` (ett manifest, en `main` som når en funktion, Dunder 0.12.0, Mikparchy): `zlib.decompress` ensam = 14 funktioner, 4 263 MIR-operationer, `compiler=408 ms` (0,096 ms/op); `image.decode_png` + zlib = 21 funktioner, 8 177 operationer, `compiler=1 315 ms` — PNG-filtren är alltså 7 funktioner, 3 914 operationer, **+907 ms (0,23 ms/op, 2,4× zlib:s per op)**. Hela Storm före ändringen: 1 389 funktioner, 423 473 op, 14,7 s (0,035 ms/op). En gissning testades och **föll**: en slinga med `(y * w + x) * 4 + 1`-index kostade 261 op mot 242 för en platt slinga (3 ms) — indexaritmetik är inte det dyra. Vad som skiljer de sju PNG-funktioner (radfilter, palettuppslag, kanalexpansion) från zlib:s bitläsare är **inte mätt**; per-operationstalen säger bara att kostnaden per op varierar med 2–8× mellan moduler, så "MIR N operations" förutsäger inte byggtiden. Minimal repro: `dunder build --timings` på ett manifest med `img = { path = "packages/storm-image", capabilities = ["filesystem", "unsafe"] }` och en `main` som bara matchar `img.decode_png(&data)`; subtrahera samma tal för `zlib.decompress`. Workaround här: ingen — koden är rätt och läslig, budgeten har 1,8 s kvar. Rekommendation: `--profile-compiler` per *modul* (fynd 56 bad om det per funktion; per modul räcker för att hitta dessa 0,9 s utan provmanifest) — tills dess är "vilka op som är dyra" en öppen fråga och en kompilatoroptimering utan den mätningen är en gissning.

**83. Ett ensamt namn som `match`-mönster binder alltid — även när namnet är en `const` i scope, och diagnostiken säger "unreachable match pattern" på *nästa* arm i stället för vad som är fel.** Symptom (0.12.0): med `pub const NEAREST: i64 = 9728` ger
```
match v { NEAREST => 1, _ => 2 }
```
`E3006: unreachable match pattern` med caret på `_`; med tre armar (`NEAREST`, `LINEAR`, `_`) står careten på `LINEAR`; med `9728 => 1, NEAREST => 2, _ => 3` står den på `_` — och `NEAREST => 2` fångar då *allt utom 9728* utan ett ord. Mätt: ett gemens namn (`other => 2`) binder likadant, så regeln är Rusts (ett ensamt namn är en binding, konstanter matchas bara som sökväg), men Dunder har ingen sökväg att skriva (`NEAREST` *är* konstantens hela namn), och det finns inget sätt alls att matcha en `const` i ett mönster. Minimal repro: `/tmp`-manifest, `const NEAREST: i64 = 9728`, `fn pick(v: i64) -> i32 { match v { NEAREST => 1, _ => 2 } }`, `dunder run` → E3006 på `_`. Uppstod i Storm `storm-gltf/src/textures.ddr` (`05a0250`-serien): glTF:s filter är tal (9728, 9729, 9984–9987), och en `match` med konstantnamn som mönster var den naturliga översättningen — den såg ut som en enum-`match`. Workaround här: if-kedjor med `==` (sex tal, läsbart), med en kommentar som pekar hit. Rekommendation: när ett mönster är ett ensamt namn som också är en `const` i scope, är det nästan alltid avsett som konstant: antingen (a) gör det till en konstant-match (då behöver Dunder en regel för när ett namn är konstant och när det binder — Rust skiljer på sökväg, och `self.path::CONST` är en sökväg Dunder redan har i `Enum.Variant`-mönster), eller (b) flytta diagnostiken till det första mönstret: "'NEAREST' binds a new variable and matches every value; a name that is a constant in scope cannot be matched — compare with `==`". E3006 på armen efter är korrekt men ett symptom.

**84. Diagnostiker namnger varje användardefinierad typ som `__dunder_module_N` — struct och enum, i alla moduler, även i samma modul.** Symptom (0.12.0): en funktion som väntar en enum och får en annan ger
```
src/shadow.ddr:244:19: error[E3001]: type mismatch: expected __dunder_module_437, got __dunder_module_421
```
Minimal repro (tio rader i `main.ddr`, mätt i `/tmp`):
```
pub enum Shape { Cube, Plane }
pub enum Blend { Opaque, Alpha }
fn draw(shape: Shape) -> i32 { i32(shape) }
fn main() { x := draw(Blend.Opaque); print(x) }
```
ger `expected __dunder_module_0, got __dunder_module_1`. Samma sak med två structar (`Shape { n }`, `Blend { n }`): `__dunder_module_0` mot `__dunder_module_1`. Mot en inbyggd typ namnges den inbyggda: `draw(1)` ger `expected __dunder_module_0, got i32`. Samma nummer i E2003: `x := make()` där `make() -> Shape`, sedan `x.nope` ger `unknown member 'nope' on __dunder_module_0`. Numret är modulens ordning i trädet, inte typen, och ingenting skiljer `Shape` från `Blend` i texten. I Storm (över 100 moduler) är det oläslbart: under städningen av pipeline-skapandet stod `vertices: pipelines.mesh_vertices()` (en `vk.VertexInput`) där `Vertices` väntades, och diagnostiken skickade mig till `enums.ImageTiling`/`ImageUsage` — två enumtyper som inte ingick i felet alls. Workaround här: läsa signaturen på det anrop som careten pekar på och räkna argumenten (fynd 63), och när det inte räcker byta en mot en `i32` för att se vilka sidor som byter — inget av det är en diagnostic. Rekommendation: varje diagnostic som skriver en typ ska skriva namnet som den deklarerades (`expected vk.VertexInput, got pipeline.Vertices`; för en anonym post fälten). Typen bär namnet — `dunder check` på ett program utan fel skriver inga nummer — så det är en formatteringsfunktion som används av E3001 och E2003, inte typkontrollen, som saknar det; en funktion att rätta på ett ställe.

**85. En lokal som skickas till en `move`-parameter kräver `move` vid anropet — även när det är lokalens enda användning, och diagnostiken säger det med en text som måste läsas bokstavligt.** Symptom (0.12.0): `fn asset(move images: []Img) -> Asset`, kallat med `asset(images)` där `images` är en lokal som inte används igen, ger
```
tests/executor.ddr:331:25: error[E4001]: consuming parameter requires 'move value' or a fresh owned expression
331 |     model := asset(parts, images)
    |                         ^
```
Med markören på det *andra* argumentet lästes det som att `images` redan var flyttat — E4001 är nämligen också koden för "use of moved value", och en läsare som ser E4001 på ett argument letar efter en tidigare flytt av det värdet; två rundor gick åt till det innan en prob i `/tmp` visade att lokalens enda användning räcker för att få felet. Mätt i `/tmp` att regeln inte har med "sista användning" att göra: `takes(arr)` där `arr: [f32; 4]` är en lokal som aldrig nämns igen ger samma E4001, och `takes(move arr)` kompilerar — en **immutable** lokal får alltså flyttas med ett uttryckligt `move`. Ett färskt uttryck (litteral, funktionsanrop) behöver inget. Minimal repro:
```
fn takes(move a: [f32; 4]) -> f32 { a[0] }
pub fn main() {
    arr: [f32; 4] = [0.0, 1.0, 0.0, 3.0]
    one := takes(arr)
    print(one.str())
}
```
ger E4001 på `arr`; `takes(move arr)` går. Uppstod i Storm `tests/executor.ddr` (tre tester som bygger en `gltf.Asset` ur lokaler). Skillen hade regeln för *parametrar* utan `move` (de lånas) men inte denna sida: att en lokal utan `move` **inte** flyttas vid sista användningen heller. Workaround här: `move` på varje argument som konsumeras, eller bygg värdet i anropet (`asset([part(...)], jpeg_and_png())`). Rekommendation: antingen (a) en sista användning av en lokal flyttar den automatiskt (Rusts regel; då är `move` på argument overflödigt och E4001 blir ett verkligt fel — använd efter flytt), eller (b) behåll kravet men låt diagnostiken säga *vilket* av de två fallen det är: "pass 'move images' — a local is not moved by its last use" mot "use of moved value" (E4001 är idag samma text för båda, och den ena är ett syntaxkrav, den andra ett verkligt fel). Dessutom: E4001 på raden gjorde att `one` på nästa rad rapporterades som `E2002 unknown local 'one'` — ett följdfel utan egen orsak.

## Grafikobservationer på macOS (Metal)

Mätta på en Apple M5 med macOS 27.2 och Xcode installerat (Metal 4). Ingen
av punkterna är en Dunder-brist; de är vad en port till en andra backend
möter, och var och en kontrolleras nu av en capture eller av self-testet.

**Klippyta och speglad viewport.** Metals NDC har y uppåt, Storms och
Vulkans nedåt. En viewport med origon längst ner och negativ höjd avbildar
klipp-y = −1 på översta raden, bevisat med en gradient som lästes tillbaka
från en offscreen-textur. Självtestet låser det två gånger (en UI-fyrkant på
punkterna (0,0)–(80,80) är blå i övre vänstra hörnet; med identisk
view-projection är horisontens röd överst och zenitens grön underst) och
captures visar detsamma i scenen: text rättvänd, himmel överst. Frontface är
moturs på en skärm där y pekar nedåt — samma regel som Vulkan — och
markytan syns uppifrån och är gallrad underifrån (`--eye 6 -4 3`).

**Selektorer kontrolleras, inte stavas från minne.** Backenden skickar 107
olika selektorer. Var och en kontrolleras mot SDK:s rubriker (269 delar: en
setter `setFooBar:` kräver en property `fooBar`, skiftlägeskänsligt): det
hittade `setRGBBlendOperation:` (rätt: `setRgbBlendOperation:`), en
`depthAttachments` som är `depthAttachment` (ett objekt, inte en array), och
`waitUntilAllCommandsCompleted`, som inte finns i några rubriker. Kontrollen
är i dag ett skript utanför repot; som Dunder-program i `tools/` vore den
naturlig nästa gång någon rör vid selektorer. (En property i
`NSRunningApplication.h` flaggades felaktigt: kontrollen läste inte den
rubriken; anropet fungerar.)

**Apple arm64-ABI packar smala argument som hamnar på stacken.**
`+[NSEvent keyEventWithType:…isARepeat:keyCode:]` har tolv argument; de två
sista går på stacken. Ett ObjC-referensprogram som skickade dem som `BOOL`
och `unsigned short` fick keyCode 13; samma anrop med två `uint64_t`-ord gav
0: Apple lägger en `BOOL` på +0 och en `unsigned short` på +2, utan den
8-bytes-avrundning som standard-ABI:n har. Dunder skickar dem rätt när de
deklareras med exakta bredder (`u8`, `u16`). En C-oracle med `uint64_t`-parametrar
hade visat att *den* formen var rätt — det var fel form att fråga om.

**`objc_msgSend` måste omkastas till metodens typ.** Dess variadiska
deklaration är en lögn; på Apple arm64 går variadiska ord på stacken och
meddelandets i register. Alla 40 anropsplatser deklarerar en typad
funktionspekare och binder den med `ffi_fn`.

**Metals valideringslager** står på ("Metal API Validation Enabled") och
fångade fyra fel innan de blev tysta: `setDepthStencilState:` med nil för ett
pass utan djupbilaga; en fragmentfunktion (`env_fragment`) utan bindning för
sitt block i fragmentsteget; vertexbuffer och UI-block på samma index (0);
och `setCullMode:` på pipeline-descriptorn — cullning och frontface är
encoder-state i Metal, inte pipeline-state som i Vulkan.

**Skuggkartan är omvänd.** Vulkan-backenden håller *störst* avstånd till
solen (ytan närmast); en djupkarta håller *minst* djup. Jämförelsen och
biasen måste alltså byta tecken. Den första capturen hade hela golvet i sin
egen skugga — 55 % av bildrutan skiljde sig mot `--no-shadows` — och efteråt
4 %, alltså bara de verkliga skuggorna. Biasen är i världsenheter som på
Vulkan och översätts med projektionens djupintervall, läst ur matrisen
(kolumn 2, rad 2 är 1/(near − far)) i stället för skrivet för hand.

**Tangentfokus kommer genom händelseloopen.** Ett fönster blir nyckelfönster
bara när applikationen är aktiv, och det blir den bara om systemet låter den
aktivera sig: lanserad av LaunchServices (Finder, Docken, `open`) var fönstret
nyckelfönster 0 ms efter öppnandet och applikationen aktiv; lanserad från en
agents skal var den inte aktiv efter 5 s (främst var `UserNotificationCenter`),
och tangenterna kommer då först efter ett klick på fönstret. En mätning som
inte pumpade händelseloopen sa "inte nyckelfönster" även för LaunchServices
och hade fel; appens `poll()` varje frame räcker.

**En klass föds en gång per process.** Objective-C vägrar skapa en klass vars
namn redan finns. Självtestets andra fönster avslöjade det: ett fönster gick
att öppna en gång per process, stängt eller inte. Klassen skapas nu bara om
den inte finns.

**Shaders kompileras av systemet, utan Metal Toolchain.** `xcrun metal` svarar
"missing Metal Toolchain; use: xcodebuild -downloadComponent MetalToolchain":
kompilatorn är en separat nedladdning på flera gigabyte. `newLibraryWithSource:`
kompilerar Storms 433 rader (17 kB) på 42 ms första gången och 0–1 ms efteråt;
systemet cachar. Ett pass utan bindning för sitt block, en buffer på fel
index eller ett djuptillstånd som är nil hade varit tysta fel utan
valideringslagret.

**Retina.** `backingScaleFactor` är 2, så ett 1280 × 800-poängsfönster har en
2560 × 1600 drawable; capturen är i den upplösningen och self-testet låser
att dess storlek följer skala × poäng. Texten rastreras med displayens
täthet (design.md §5b) och är skarp i captures.

**Minne och taktfart.** Högsta minnesanvändning 98,6 MB vid 30 visade
bildrutor, 100,0 MB vid 600 och 100,3 MB vid 2 400: platt, alltså ingen
läckage per frame (den första stigningen är uppvärmning: drawables, Metals
pipeline-cache). 2 400 bildrutor på 20,5 s med displayens synk, cirka 117 Hz,
och 4,7 s CPU-tid: omkring 2 ms per frame på en kärna.

## Verifiering

Mätning på Mikparchy, 2026-11-24 (låst session, generatorn för `layout.ddr`
+ `X::new()`-fabriker, Dunder 0.12.0 byggd 09:02): **152 egna `@test fn`
gröna** i 16 sviter, varje svit lika många som sin `@test`-räkning (räknat
som egna PASS-rader per fil; Skrifts två och paketens källmoduler hålls
utanför), `dunder check` 0 varningar i Storms paket, `check
--unused-functions` rent, `tools/build-time.ddr` **16 480–16 550 ms** av
20 000 — samma siffra på oförändrad `0fd104e` i en worktree med samma
kompilator, alltså kostar de 71 fabrikerna inget. `tools/vk.ddr --check`
grönt för både `api.ddr` och `layout.ddr`, och `--check` utgång 2 med ett
namngivet fel när en post i `STRUCTS` ligger efter den som nästlar den.
Migreringens 135 borttagna `sType`-tal verifierades vart och ett mot
registret (inkl. `PresentInfoKHR` = 1000001001 via extension-regeln) innan
det togs bort: alla stämde. Capture 1280 × 800 före/efter (`0fd104e` i en
worktree mot det nya trädet): **AE = 0**. Storlekspinnarna i
`storm-vulkan` (17) håller oförändrade mot den genererade layouten.

Mätning på Mikparchy, 2026-11-24 (låst session, `5a0a9ec`, Dunder 0.12.0,
vid genomgången av dokumentationen mot koden): **188 egna tester gröna** —
43 i roten och 145 i de 15 paketen, 16 sviter, varje svit lika många som sin
`@test`-räkning (Skrifts två följer med i `storm-text` och `storm-ui`) —
`dunder check` 0 varningar i Storms paket, `check --unused-functions` rent
i roten, `tools/build-time.ddr` **16 036 ms** av 20 000, och `tools/vk.ddr
-- /tmp/vk.xml --check` grönt mot den committade `api.ddr` (80 kommandon).
Bara dokumentation rördes, så ingen capture togs.

Storm `4123d5a` gav 185 godkända test i roten och de 15 paketen på både
Macen och Mikparchy. Tabellen jämför Dunder 0.12.0 med `5a1ed4e` på
samma träd. Varje tid är medianen för tre hela byggkommandon efter
uppvärmning, med växlande körordning och automatiskt jobbantal.
Nybygget skrev till en ny utdatafil. Ombygget använde den befintliga filen.

| Värd | Bygge | 0.12.0 | `5a1ed4e` |
| --- | --- | ---: | ---: |
| Mac, ARM64 | Nybygge | 1,162 s | 0,713 s |
| Mac, ARM64 | Oförändrat | 1,182 s | 0,183 s |
| Mikparchy, x86-64 | Nybygge | 15,601 s | 8,077 s |
| Mikparchy, x86-64 | Oförändrat | 15,666 s | 1,109 s |

Mätning på Mikparchy, 2026-11-24 (låst session, `1bd197a` + generatorn
för `api.ddr`, Dunder 0.12.0): **147 egna `@test fn` gröna** i 16 sviter
(43 rapporterade i roten och 149 i paketen; de tre sviter som når
`storm-text` räknar med Skrifts två), `dunder check` 0 varningar i Storms
paket, `check --unused-functions` rent, `tools/build-time.ddr` **16 072 ms**
av 20 000. `tools/vk.ddr --check` grönt mot den nya `api.ddr` och utgång 1
mot en avsiktligt ändrad kopia. Capture 1280 × 800 före/efter den genererade
`api.ddr` (standard och `--glb Fox.glb`): **AE = 0**.

Mätning på Mikparchy, 2026-11-24 (låst session, `a84ade9`, Dunder
0.12.0): **140 egna tester gröna** (27 rot + 113 paket, 16 sviter, varje
lika många som sin `@test`-räkning), `dunder check` 0 varningar i Storms
paket, `check --unused-functions` rent i de sju kontrollerade paketen
efter genomgången av publika funktioner (fynd 64), och
`tools/build-time.ddr` **14 900–15 100 ms** av 20 000. Capture 1280 × 800
före/efter raderingarna: **AE = 0**. `tools/bench-frame.ddr` och
`dunder run --example scene` kördes efteråt och fungerar: inget av dem var
dött. Historiken för varje svit (`git log --numstat -- tests packages`)
visar att varje teständring följer en funktion i samma commit, ingen
omskrivning utan anledning och ingen flaky svit — därför raderas ingen.

Äldre mätning, behållen för tal som inte mätts om: rotpaketet och de nio
underpaketen kördes var för sig och alla 81 tester passerade (mätning
2026-11-24: 8 rot + 73 paket, 6 850 ms byggtid): de 60 som
fanns sedan djupbufferten (där två fasta clear-value-packning och
renderpass-ABI), ett som låser samtliga Vk-enum-värden Storm använder mot
Khronos tabeller och `apply_blend` för alpha-over och skuggmax (de två äldre
pinning-testerna från textåtergivningen är inflyttade i det), och sju nya i
`storm-core` för IBL:n, samt två till i `storm-vulkan`: C-postparet OCH arrayen är
sammanhängande på C-offsets (fynd 54) och `float_bits` tar båda tecken
(fynd 55), och två i `storm-ecs` (`join2`/`join3` med dense-index per pool;
`dense_index` följer swap-remove och avvisar inaktiva handtag) — kubytornas baser mot Vulkans (sc, tc)-axlar,
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
(Khronos `Box.glb`: 24 verticer, 36 index, expanderad ström). Efter 3a:
en till i `storm-vulkan` (`vertex_input_declares_the_whole_stream`: storlek
48/60, 16 byte mellan attributen, råorden i C-ordning) och en till i
`storm-gltf` (`FoxFixed.glb`: 464 verticer, 1728 index, `TEXCOORD_0` utan
`NORMAL`, uv (0.5287, 0.6786) för index 0 utläst ur filen med Python).
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
`magick compare -metric AE -fuzz 2%` gav cirka 2,5 % av bilden; skillnaderna
ligger på kubernas sidor, glaset och golvents ambient, inte på himlen eller
UI:t. (Två olika AE-tal stod här från samma commit, 85 417 och 99 301; ingen av
dem går att återuppmäta eftersom capture-filerna var i `/tmp`. Andelen är det
som var beviset, inte talet.) `--no-glass` och `--no-shadows` kördes
utan krasch. Prefilterkedjan kontrollerades med `textureLod` på fasta nivåer:
nivå 0 har struktur (framsida 100, ovansida 107, golv 146), nivå 4 är
konvergerad (121,139,162 överallt).
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

**QA 2026-11-24 (låst session, fyra captures på 2256 × 1504).**
Standardcapturen mot baslinjen från samma timme: **AE = 0** (baseline oförändrad
efter att kamerans yaw/pitch flyttade från `main.ddr` till `args.aim`).
`--eye 6 4 -7` gav före ändringen en tom horisont (kameran flyttades men såg
rakt fram, AE 73 710 mot baslinjen = 2,2 % himla- och markförskjutning);
efter att `--eye` vänder kameran mot scenens mitt syns kubarna bakifrån,
glaset, orberna och skuggorna (AE 156 753 = 4,6 %). `--glb Fox.glb` stod
förut på (5.4, 0, 0.8) och skars av vid högerkanten: differensmasken mot
baslinjen sträckte sig från kolumn 1 932 till 2 252 av 2 256; på (0, 0, 4.2)
står räven hel i mitten av bilden, på golvet, med skugga, i storlek mellan
kuberna (`objects` 15, "model" i scengrafen). `--effects`: hörnen i himlen
(181,201,227) → (170,189,215), mitten (203,205,211) oförändrad, inga
inverterade områden. En visionmodell som skulle läsa effects-capturen fick
i stället fox-capturen förbi (samma filnamn, ny konvertering) - därför står
pixelproberna här, inte bildbeskrivningen. `--frames 5` utan capture på den
låsta sessionen: SIGSEGV i första framen mellan `acquired image 0` och
`render pass begun` (next-steps, kända begränsningar). *Rättat samma kväll,
se nästa stycke: på `a919b02` kraschar det inte.*

**QA 2026-11-24 kväll (låst session, `a919b02`, Dunder 0.12.0, tolv captures på
1280 × 800 och fönsterläge).** Fönsterläget på den låsta sessionen: `--frames 5`
**status 0, 10/10**, 4,4 s; `--frames 20` med `--studio`, `--play`, `--glb
Fox.glb`, `--effects`, `--no-post --no-aa`: alla status 0 på 4,6–5,1 s, och
`--trace` visar `acquired image` → `render pass begun` → `present` →
`presented 0` för varje frame. Samma commit-bygge av `ac268f0` i en worktree
med samma kompilator: SIGSEGV **0/10**. Bisektionen dem emellan är icke-monoton
(`bc2b300` grönt, `38942e5` kraschar, `fb4d5a7` grönt; `924dd7e`, `7c17c6d`,
`a2ccbf3`, `a823658` bygger inte med 0.12.0: `E3006 non-exhaustive match` i
`app.ddr`), så ingen enskild fix-commit kan namnges. Captures mot standard:
`--eye 6 4 -7` AE 172 373 (16,8 %), `--eye 0 0 4.2` AE 175 318,
`--glb Fox.glb` AE 419 764 (räven vit: Fox.glb har `baseColorTexture` men
ingen `baseColorFactor`, så spec-default `[1,1,1,1]` gäller tills 3c),
`--studio` AE 418 555, `--no-shadows` AE 39 599, `--no-post` AE 6 958,
`--no-aa` AE 1 564. **AE = 0**: `--play` (standard är redan spelet),
`--effects` (redan på i Blomsterskogen) och `--no-glass` i spelet (inget
transparent i play-scenen). `--no-glass` i studion fungerar: reglaget Glass
står av och `Glass / left`/`right` är borta ur scenträdet, AE 372 på
standardkameran (panelerna står vid cyclorama-väggen på z = −2,8 med alfa
0,20 och syns knappt), AE 104 med kameran rakt mot dem. Färgtoningen är
avsiktligt diskret: `--no-post` skiftar 1–5 per kanal (himlen `(252,201,209)`
mot `(251,198,208)`, marken `(191,216,198)` mot `(186,214,197)`); i studion
är `--effects` 2 421 pixlar. Felvägarna ger alla status 1 med text:
`--capture` utan fil, `--glb` utan fil, `--scene` utan fil; `--frames abc`
och `--eye 1 2` faller till default.

**På macOS, 2026-11-23 (gränssnittet och Metal).** Dunder 0.11.0, Apple M5,
macOS 27.2. Trädet kompilerade inte på macOS innan detta arbete
(`static_bytes("linux")`). Efteråt: `dunder check` rent på arm64-macos,
x86_64-linux och arm64-linux (0 egna varningar; de sex från dunder-skrift
står kvar, fynd 62), en statisk x86_64-linux-binär länkad från Macen, och
**86 egna tester gröna**, varje svit lika många som den har `@test`: 4 rot +
82 paket (var 75 dagen innan). Vulkan-backenden har inte körts på en bildruta
från den här maskinen — den är bara typkontrollerad för Linux — så dess
pixelbevis står kvar som de äldre mätningarna ovan.

Metal-backenden mättes så här:

- **En capture**, `dunder run -- --capture a.ppm --frames 1`, 2560 × 1600 på
  ett 1280 × 800-poängsfönster på Retina: himmel, horisont, solgolv, tre
  metallkuber med skuggor, glaspaneler, orber och hela editorn med läsbar
  text rättvänt. Captures med `--no-shadows` och `--eye 6 -4 3 --no-glass`
  jämfördes mot den: se *Grafikobservationer på macOS (Metal)* ovan.
- **Self-testet** `packages/storm-metal/tools/selftest.ddr`: 60 kontroller,
  utgång 0, 1,4 s, tre körningar i rad med Metals valideringslager tyst. Det
  läser varje påstående från en capture eller från input: se
  *Grafikobservationer på macOS (Metal)* ovan.
- **2 400 visade bildrutor** på 20,5 s (ca 117 Hz, displayens synk), ingen
  validering, och högsta minnesanvändning platt: 98,6 MB vid 30 bildrutor,
  100,0 MB vid 600, 100,3 MB vid 2 400.
- **Byggtid** `tools/build-time.ddr`: 424 ms på M5:n. Budgeten i AGENTS.md
  är definierad på Mikparchy och har inte mätts där efter detta arbete.

**Om att räkna tester.** Skrifts två tester följer med när Storms svit importerar textpaketet. Räkna Storms egna `@test` i roten och i varje pakets testsvit och jämför med vilka testnamn som faktiskt kördes.
