# Dogfooding: vad Storm hittade i Dunder

Storm skrivs helt i Dunder och kompileras av Dunders egen kompilator. Det här
dokumentet bokför varje språk- eller verktygsproblem vi stötte på, i den ordning
de dök upp, med den workaround som används i repot och en rekommendation.

Status: `dunder 0.10.0 (x86_64-linux)`.

---

## 1. `@c_layout`-struct får inte innehålla en fast array av en annan `@c_layout`-struct

**Allvarlighet: hög — motsäger dokumentationen.**

`docs/ffi.md` säger att ett `@c_layout`-fält kan vara "fasta arrayer av
C-skalärer med positiv längd eller andra `@c_layout`-structar". Följande
avvisas:

```dunder
@c_layout
struct Frame { command: ptr, fence: ptr }

@c_layout
struct Renderer { frames: [Frame; 2] }
```

```
error[E5003]: C record fields require fixed arrays of unmanaged scalar elements
```

Diagnostiken pekar dessutom på en intilliggande `fn main() { }` i stället för
fältet, vilket gör felet svårt att hitta i en stor struct.

**Workaround i Storm:** `state.Renderer` håller parallella arrayer
(`commands: [ptr; 2]`, `fences: [ptr; 2]`, …) i stället för `[Frame; 2]`.

**Rekommendation:** antingen stöd arrayen fullt ut (den behövs för
`VkPhysicalDeviceProperties`-liknande struktar och för frame-data), eller
rätta `ffi.md` och flytta diagnostiken till fältet.

---

## 2. Flyttal saknar trigonometri — bara `std.math` på `f64`

`.abs()`, `.sqrt()`, `.floor()`, `.ceil()`, `.round()`, `.is_finite()` finns på
`f32`/`f64`, men `.sin()`, `.cos()` och `.tan()` gör det inte. All trigonometri
måste gå via `std.math` och konverteras:

```dunder
c := f32(math.cos(f64(angle)))
```

**Konsekvens i Storm:** `core.perspective` och rotationsmatriserna konverterar
fram och tillbaka. Det är korrekt men brusigt i en spelmotor, där `f32` är
standardtypen.

**Rekommendation:** `sin`/`cos`/`tan` som metoder på båda flyttalstyperna,
implementerade genom att bredda till `f64`.

---

## 3. `mut sum := 0.0` härleder `f64` — ingen `f32`-literal

```dunder
mut sum := 0.0                 // f64
for k in 0..4 { sum = sum + m[k] * 0.5 }   // E3001: expected f64, got f32
```

Det finns ingen suffix-syntax för `f32`-literaler, så ackumulatorer i `f32`
måste annoteras: `mut sum: f32 = 0.0`.

**Rekommendation:** dokumentera tumregeln tydligt i `docs/floating.md`, eller
tillåt att ett uttryck med enbart `f32`-operander ger `f32`-kontext till
literalen (som `[0, u8(255), 1]` redan gör för heltal).

---

## 4. Alla returvärden måste användas — även `()`-lika anrop

Ett anrop vars resultat ignoreras ger `E2006: unused value; bind it or return it`:

```dunder
pool.insert(e, value)          // fel
_ := pool.insert(e, value)     // rätt
```

Men för funktioner som returnerar `()` är `_ :=` i stället ett fel
(`E3002: local requires a value`). Man måste veta om den anropade funktionen
returnerar något. I Vulkan-bindningen betyder det att `vkDestroy*` och
`vkCmd*` anropas nakna medan `vkCreate*` och `vkQueueSubmit` binds.

**Rekommendation:** låt `_ :=` acceptera `()` (som Rusts `let _ =`), så att
regeln blir enhetlig. Det är särskilt viktigt för FFI där C-API:er blandar
`void` och `VkResult` i samma struct.

---

## 5. Metoder som konsumerar tar `&mut self`, inte `move self`

`Move`-parametrar gäller värden, inte mottagaren. Skrev man `fn insert(move
self, …)` flyttas poolen in i anropet och är förbrukad efteråt:

```
error[E4001]: use of moved value 'pool'
```

**Rekommendation:** dokumentera i `docs/syntax.md` att mottagaren alltid är
`&self`/`&mut self` (eller `self` för explicit konsumtion), med ett exempel på
skillnaden mot `move`-parametrar.

---

## 6. Kan inte flytta ut ett indexerat element

```dunder
mut value: T = move self.dense[index]   // E4001
```

Endast `.pop()` (sista elementet) och `.remove(index)` flyttar ut ett värde.
Diagnostiken föreslår just detta, vilket är bra.

**Konsekvens i Storm:** `Pool.remove` använder `dense.remove(index)` och flyttar
ägaren i `owners` separat innan dess. Swap-remove-semantiken blir korrekt men
kräver att man känner till ordningen.

**Rekommendation:** ingen åtgärd utöver dokumentation — regeln är rimlig.

---

## 7. `std.bytes`-API:t skiljer sig från testbäddens exempel

`dunder-hundmat` använder `bytes.append_text(...)`, men i `dunder 0.10.0` heter
funktionen `bytes.append_utf8(...)`. `bytes.extend_text` finns inte alls;
`extend_range(&mut ut, &in, start, end)` är motsvarigheten.

**Rekommendation:** uppdatera `dunder-hundmat` så att testbädden speglar
nuvarande standardbibliotek. Storm använder `append_utf8`, `extend_range`,
`decode`, `decode_range`, `u16_le`, `u32_le`.

---

## 8. Inga bitoperatorer på heltal — bara metoder

`a | b`, `a & b`, `a << b` och `a >> b` finns inte som operatorer; man använder
`.bit_or()`, `.bit_and()`, `.shl()`, `.shr()`. Det gör binär parsing betydligt
längre:

```dunder
w := u32(b[i * 4]).bit_or(u32(b[i * 4 + 1]).shl(8))
    .bit_or(u32(b[i * 4 + 2]).shl(16)).bit_or(u32(b[i * 4 + 3]).shl(24))
```

**Rekommendation:** inför operatorerna (samma prioritet som `*` respektive
`+`), eller åtminstone `u32.from_le_bytes(&[]u8, offset)` i `std.bytes`.

---

## 9. `f32(x)` konverterar numeriskt — `f32.from_bits` behövs för råbitar

glTF lagrar flyttal som little-endian IEEE-754. `f32(u32_le(...))` ger
`1.0 → 1065353216.0`, inte `1.0`. Rätt väg:

```dunder
f32.from_bits(i32(bytes.u32_le(data, offset)))
```

**Rekommendation:** dokumentera skillnaden mellan numerisk konvertering och
bit-tolkning i `docs/floating.md`. Felet är enkelt att göra och ger tyst fel
data i stället för ett kompilatorfel.

---

## 10. `Result` har `.is_ok()`, men `.ok()` returnerar `Option<T>`

Kod som skrivits mot en äldre `Result`-modell (`if result.ok { ... result.value }`)
kompilerar inte:

```
error[E3003]: cannot access method 'ok' without calling it; use '.ok()'
error[E3001]: type mismatch: expected bool, got Option<string>
```

`.ok()` finns alltså, men betyder "gör om till `Option`" (som i Rust). Rätt
mönster är `match` eller `.is_ok()` + `.unwrap_or_default()`.

**Konsekvens:** `dunder-skrift` behövde patchas på fem ställen för att bygga
med `0.10.0`. Se avsnitt 14.

---

## 11. `text.find` returnerar `Option<i32>`, inte `-1`

Samma typ av API-drift: äldre kod jämförde `find(...)` mot `-1`. Nu krävs
`match` på `Option<i32>`. `std.text.find` är den enda källan; `bytes.find_byte`
returnerar också `Option`.

**Rekommendation:** en kort "migrering från tidigare API"-sektion i
`docs/standard.md`.

---

## 12. Strängindex ger `u8`, inte `i32`

`text[i]` ger en byte som `u8`. Kod som jämförde mot `i32`-literaler får
`E3001`. Det är en förbättring (typen är nu exakt), men den bryter äldre kod.

---

## 13. Beroenden behöver uttryckliga capability-grants

Ett paket med `capability unsafe` kan inte importeras utan att rotmanifestet
beviljar det:

```toml
[dependencies]
vulkan = { path = "packages/storm-vulkan", capabilities = ["unsafe"] }
```

Utan grant: `E5001: dependency 'vulkan' requests capability 'unsafe', which is
not granted in dunder.toml`. Detta finns i `selfhost/driver/manifest.ddr` men
nämns inte i `docs/dependencies.md`.

**Rekommendation:** dokumentera `capabilities = [...]` i
`docs/dependencies.md` med ett exempel. Grants är en bra säkerhetsmodell; de
behöver bara vara upptäckbara.

---

## 14. `dunder-skrift` byggde inte med `0.10.0` — patchat i detta arbete

`dunder-skrift` är en förutsättning för `packages/storm-text`. Repot hade fem
typer av drift mot nuvarande kompilator:

1. Saknade `capability filesystem` / `stdio` i `src/font.ddr`, `src/main.ddr`,
   `tests/suite.ddr`, `tests/fixture_builder.ddr` och
   `examples/wordmark/src/main.ddr`.
2. `text.find(...)` jämfört mot `-1` (se avsnitt 11), två ställen i
   `src/main.ddr`.
3. `if dec.ok { ... dec.value }` på `Result` (se avsnitt 10), två ställen i
   `src/binary.ddr`.
4. `i32(inf2.data[m]) == motif[m]` där båda nu är `u8`, i `tests/suite.ddr`.
5. `import` av oanvända moduler gav varningar (inte fel).

Efter patchningen: `dunder test` i `dunder-skrift` ger **16 passed, 0 failed**.

**Rekommendation:** lägg till en CI-körning av `dunder-skrift` mot
kompilatorns `main`, så att API-drift upptäcks när den införs i stället för när
ett beroende byggs.

---

## 15. Inget sätt att uttrycka "en array av blandade komponenttyper" — ECS-designen

Dunder har generics med monomorphisering och `T: Storable`, men ingen
reflektion och ingen typradering. En ECS kan därför inte slå upp en pool via
`TypeId` som i Rust. Storm löser det med explicita pooler och system som tar
dem som parametrar:

```dunder
mut positions := ecs.Pool<Position>::new()
mut velocities := ecs.Pool<Velocity>::new()
for i in 0..velocities.len() {
    e := velocities.entities()[i]
    if positions.contains(e) { /* system */ }
}
```

Det ger statisk typkontroll och noll nedkastningar, men varje system måste
känna sina komponenttyper. Ett framtida `World` med registrerade pooler kräver
antingen en summatyp per komponentmängd eller ett makrosystem.

**Rekommendation:** överväg ett `dyn`-liknande gränssnitt (`[]ptr` + typnyckel)
eller dokumentera det statiska mönstret som det avsedda sättet att bygga ECS i
Dunder.

---

## 16. Fönsterkörning kräver olåst session (miljö, inte språk)

`vkAcquireNextImageKHR` blockerar när Wayland-sessionen är låst, eftersom
compositorn inte lämnar tillbaka swapchain-bilder. Efter `minImageCount + 1`
presentationer tar bildpoolen slut. Storm presenterade fem bildrutor på
`Intel(R) Iris(R) Plus Graphics (ICL GT2)` innan blockeringen — pipelinen,
swapchain och presentationen fungerar alltså.

**Rekommendation:** ingen språkåtgärd. Dokumentera i `docs/targets.md` att
grafiska prov kräver en aktiv session, och att `session lock` ger den här
symtomen.

---

---

## 17. `@c_layout`-structar kan inte innehålla `string`

Ett försök att lägga en felsträng i renderarstructen:

```dunder
@c_layout
struct Renderer { depthError: string, /* ... */ }
```

```
error[E1003]: ... only unmanaged C fields
```

Diagnostiken pekar dessutom på en rad i `stdlib/sys/winutf8.ddr` (samma
felrapporteringsbeteende som i avsnitt 1), inte på fältet.

**Workaround i Storm:** felkoder som `i32` i C-structen, och meddelandet byggs i
en vanlig funktion utanför structen.

**Rekommendation:** rätta felplatsen. Om `string` aldrig får förekomma i
`@c_layout` bör dokumentationen i `docs/ffi.md` säga det uttryckligen.

---

## 18. Lån från en poolmetod blockerar hela `&mut self`

```dunder
local := self.locals.get(entity)      // &LocalTransform, lånar self
...
self.visit(child, ...)                // E4003: cannot mutate while borrowed
```

Lånet lever till slutet av funktionen, även om `local` bara används på nästa
rad. Samma sak gäller loopar som läser `self.parents.values()[i]` och sedan
anropar en `&mut self`-metod i samma iteration.

**Workaround i Storm:** `.clone()` direkt vid uppslaget, och samla ihop
barnelementen i en egen array innan rekursionen.

**Rekommendation:** överväg en icke-lexikalisk lånetid (NLL) för lokala
variabler som inte används senare i blocket. Det är den enskilt största
ergonomiska friktionen i ECS- och scen-grafskod.

---

## 19. `vkCreateImage` för djupformat returnerar `VK_ERROR_OUT_OF_DEVICE_MEMORY`

På `vulkan-intel` 1:26.2.2 (Intel Iris Plus, ICL GT2) via `vulkan-icd-loader`
1.4.357:

- `B8G8R8A8_UNORM` + `COLOR_ATTACHMENT` → `VK_SUCCESS`
- `D32_SFLOAT` + `DEPTH_STENCIL_ATTACHMENT` → `-2` (`OUT_OF_DEVICE_MEMORY`)
- `D16_UNORM` + `DEPTH_STENCIL_ATTACHMENT` → `-2`
- `D32_SFLOAT` + `COLOR_ATTACHMENT` → `-2`
- vilken storlek som helst (512×512 som 2256×1504)

`vkGetPhysicalDeviceFormatProperties(D32_SFLOAT).optimalTilingFeatures`
innehåller `DEPTH_STENCIL_ATTACHMENT` (bit 512), så formatet rapporteras
stödjas. Felen är reproducerbara med en handbyggd `VkImageCreateInfo` (råa ord,
korrekt `sType`/`pNext`/`extent`), så det är inte struct-layout.

**Konsekvens i Storm:** djupbufferten är avstängd och scenen ritas i
deklarationsordning (himmel först, sedan mark, sedan kuber). Det syns bara när
objekt överlappar.

**Rekommendation:** utred med valideringslager. Storm hade inte lager påslaget i
instansen när detta mättes; `VK_INSTANCE_LAYERS` räcker inte utan att lagret
listas i `VkInstanceCreateInfo`. Ett litet C-program mot samma ICD avgör om det
är vår bindning eller drivrutinen.

---

## 20. Fönstret kräver en olåst session — bekräftat igen

Med full renderingsväg (himmel + PBR) presenteras fem frames på
`Intel(R) Iris(R) Plus Graphics (ICL GT2)` och sedan blockerar
`vkAcquireNextImageKHR` när Wayland-sessionen är låst. Samma beteende som i
avsnitt 16, nu med `--frames 5` som ett reproducerbart smoke-test.

---

---

## 21. `vkCmdCopyImageToBuffer` kraschar i Intel-drivrutinen

Att läsa tillbaka en renderad bild är den enda vägen till en skärmdump utan en
låst skärm. På den här maskinen (`vulkan-intel` 1:26.2.2, Iris Plus ICL GT2)
dör processen i `libvulkan_intel.so` så fort kopian innehåller en region:

- swapchain-bild → buffer: krasch
- egen 16×16-bild (skapad med `COLOR_ATTACHMENT | TRANSFER_SRC`) → buffer: krasch
- samma anrop med `regionCount = 0`: **ingen krasch** (funktionspekaren är alltså
  giltig och kommandobufferten är i inspelningsläge)

Buffer, minne, bindning, mappning och layout-barriär är verifierade steg för steg
(se `packages/storm-vulkan/src/headless.ddr`), så det är inte argumenten.

**Workaround i Storm:** rendera direkt i en bild vars minne är `HOST_VISIBLE`,
mappa det och läs pixlarna. Ingen kopia behövs. Row pitch hämtas från
`vkGetImageSubresourceLayout`, där fältet ligger på ord 2 i den här drivrutinen.

---

## 22. En struct med `ptr`-fält som returvärde ger föråldrade handtag

```dunder
struct Allocated { image: ptr, memory: ptr, size: u64 }
unsafe fn make_image(...) -> Allocated { ... }
```

När `make_image` returnerade en sådan struct by value pekade `memory` på fel
allokering: mappningen vi fick innehöll den *andra* bildens minne, vilket gick
att se som ett tätt rutmönster i den färdiga bilden.

**Workaround i Storm:** ut-parametrar, precis som Vulkan-API:et:
`make_image(..., image_out: ptr, memory_out: ptr)` och `store_ptr`.

**Rekommendation:** reproducera med en minimal struct (två `ptr`-fält) och
undersök om det är returkonventionen eller `store_ptr`/`addr` som blandas ihop.
Det här är samma familj av buggar som `@c_layout`-problemen i avsnitt 1 och 17.

---

## Sammanfattning för Dunder-arbetet

Prioriterat, högst nytta först:

1. **`@c_layout` med array av `@c_layout`-struct** (avsnitt 1) — blockerar
   naturliga FFI-structar och motsäger dokumentationen.
2. **`_ :=` för `()`-anrop** (avsnitt 4) — gör FFI-bindningar dubbelt så
   långa och tvingar fram kunskap om varje C-funktions returtyp.
3. **`f32`-literaler/kontext** (avsnitt 3) och **bitoperatorer** (avsnitt 8) —
   ren ergonomi i numerisk kod.
4. **Dokumentation**: capability-grants (13), `Result`/`Option`-migration (10,
   11), bit-tolkning (9), `@c_layout`-begränsningen (1).
5. **Lån utanför block**: låt ett uppslags lån ta slut när värdet inte används
   mer (18) — det är den största friktionen i ECS-kod.
6. **Feldiagnostik**: fel i `@c_layout`-fält pekar på fel rad och ibland på en
   stdlib-fil (1, 17).
7. **CI mot ekosystemet**: `dunder-hundmat` och `dunder-skrift` bör byggas mot
   `main` (14).
