# Vad Storm hittade i Dunder

Granskat 2026-11-23. Utgångspunkten var Storm `fdd9cc6` och Dunder
`62e1530`. Punkterna 1–22 kommer från den ursprungliga rapporten och 23–25 från Storm `14bd30c`.
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

## Verifiering

På Mikparchy byggdes Storm för x86-64/Linux. Rotpaketet och de åtta underpaketen
kördes var för sig och alla 43 tester passerade. Scenexemplet verifierade ECS och textlayout. En bildruta
renderades på Intel Iris Plus via SSH med tillgång till Wayland-sessionen.
På ARM64/macOS passerade alla 83 grupper i Dunders självhostsvit, inklusive
Hundmat och Skrift. Linuxkörningen gav 79 av 81 godkända grupper. DWARF-provet
passerade separat med LLVM:s `dwarfdump`. HTTP-klientens prov för avbrott under
TLS-handskakning föll även med den ursprungliga Linuxkompilatorn.
