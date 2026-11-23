# Storm — design från första principer

> Status: **utkast för diskussion**. Skrivet efter djupbufferten (nov 2026).
> Anledning: blend-buggen. Två pipelines blenda med
> `ONE_MINUS_DST_COLOR`/`SRC_ALPHA` (5/6) istället för
> `SRC_ALPHA`/`ONE_MINUS_SRC_ALPHA` (6/7). Någon skrev heltalen för hand
> och läste tabellen baklänges. Det här dokumentet föreslår en struktur där
> det felet inte går att skriva.

## 0. Principer

1. **Fel som är omöjliga att skriva behöver inga tester.** Ett `u32`-fält
   bär ingen information om vad det får innehålla. En enum gör.
2. **Raw FFI är en implementation-detalj, inte ett API.** Bindings mot
   libvulkan översätter mellan två världar. Allt som vet vad `5` betyder
   bor i det lagret — och ingen annanstans.
3. **Ett paket, ett ansvar.** `storm-vulkan` är idag tre lager i ett paket.
   "Vad är VkBlendFactor" och "hur ser tool-chipen ut" hör inte hemma
   i samma kompileringsenhet.
4. **Ägarskap är explicit.** En god-struct med 60 fält betyder att varje
   funktion kan röra allt. Den som skapar en resurs äger den och släpper
   den — i omvänd ordning.
5. **Errors är värden.** `r.stage = 17` + en uppslagstabell är ett outypat
   fel. `Result<T, E>` med en enum är typat, testbart och självbeskrivande.
6. **Pixelbevis krävs för grafik.** En capture är ett faktum. Gäller
   oavsett struktur.

## 1. Nuläge (mätt i koden)

- **133 råa enum-heltal** i pipeline-state: `ui.ddr` 45, `pipeline.ddr` 29,
  `shadow.ddr` 26, `post.ddr` 12, `device.ddr` 10, övriga 11.
- **2 namngivna konstanter** i hela storm-vulkan (`IMAGE_TILING_*`).
- `state.ddr` `Renderer`: ~60 fält, 163 rader. Varje modul tar `&mut Renderer`.
- 17 hardkodade stage-nummer; `stage_name()` översätter dem till text.
- Beroenden: `storm-input -> storm-vulkan` (bara för typen `Window`),
  `storm-text -> dunder-skrift` via `../../../dunder-skrift` (syskonkatalog
  utan versionslås).

Lagren i storm-vulkan (4 000 rader exkl. genererad SPIR-V):

| Lager | Moduler | Rader |
|---|---|---|
| FFI-bindings | `api.ddr`, `layout.ddr`, `sdl.ddr` | 1 126 |
| Backend-tjänster | `device.ddr`, `pipeline.ddr`, `shadow.ddr`, `depth.ddr`, `headless.ddr` | 1 000 |
| App-nära kod | `ui.ddr`, `post.ddr` | 627 |
| Orkestrering | `vulkan.ddr`, `state.ddr` | 894 |

## 2. Målstruktur

Fyra paket med en riktad beroendegraf, inga cykler:

```
storm-vk        (ny)  FFI-bindings: funktioner, structar, ENUMS. Inget annat.
   ▲
storm-gfx       (ny)  Vulkan-backend: Device, Swapchain, Pipeline, Resurser.
   ▲                API:typat, Result-returnerande. Inga råa heltal ut.
storm-render    (finns) Rendergraf: passer, resurser, sortering. Ingen Vulkan.
   ▲
storm-ui/text   (finns) UI och text: ritar via storm-render, aldrig via Vulkan.
```

Regler:

- Endast `storm-gfx` importerar `storm-vk`.
- Endast `src/main.ddr` (appen) och `storm-render` importerar `storm-gfx`.
- `storm-ui`/`storm-text` känner inte till `VkImage`, `VkPipeline` eller
  något annat som börjar med `Vk`.
- Inga `u32`-fält i publika API:er där en enum finns.

## 3. Enums i FFI-lagret

Dunder har enums med värden, `match`, `i32(x)` och validerande `X(number)`
(okänt värde avslutar processen — ett felaktigt värde kan inte ta sig igenom).
Men: **enums får inte vara fält i `@c_layout`** (E5003, verifierat).

Modellen blir därför: enums utanför structarna, konverterade vid gränsen.

```dunder
// storm-vk: den enda platsen ett VkBlendFactor-heltal finns.
pub enum BlendFactor {
    Zero = 0, One = 1, SrcColor = 2, OneMinusSrcColor = 3,
    DstColor = 4, OneMinusDstColor = 5, SrcAlpha = 6, OneMinusSrcAlpha = 7,
    DstAlpha = 8, OneMinusDstAlpha = 9,
}

pub fn blend_factor(f: BlendFactor) -> u32 { u32(i32(f)) }
```

```dunder
// storm-gfx: en Dunder-struct (inte @c_layout) med enum-typade fält.
pub struct Blend {
    color_op: BlendOp,          // Add = 0, inte "0"
    src_color: BlendFactor,     // BlendFactor i fältet, inte u32
    dst_color: BlendFactor,
    src_alpha: BlendFactor,
    dst_alpha: BlendFactor,
}

// Alpha-over är DATA, inte fem heltal man kan slå fel på.
pub const ALPHA_OVER: Blend = Blend {
    color_op: .Add, src_color: .SrcAlpha, dst_color: .OneMinusSrcAlpha,
    src_alpha: .One, dst_alpha: .OneMinusSrcAlpha,
}
```

Endast `storm-gfx::pipeline::build` rör `@c_layout`-structarna. Där
översätts varje enum-fält till ett Vk-heltal via `blend_factor()` o.s.v.
(konverterarna bor i `storm-vk`). Finns det ingen konverterare kan fältet
inte fyllas i — kompilatorn säger ifrån.

## 4. Vad som händer med dagens kod

- `api.ddr` → `storm-vk` (oförändrad i praktiken).
- `layout.ddr` → `storm-vk` (oförändrad).
- `device.ddr`, `pipeline.ddr` → `storm-gfx`: `Device` med `Result`,
  `Device::limits()`, formatfrågor, swapchain.
- `state.ddr` `Renderer` delas upp i de resurser den faktiskt innehåller:
  `Swapchain { images, views, framebuffers }`, `FrameSync { cmd, fence,
  semaphores }`, `ShadowPass`, `DepthTarget`, `UiPass`, `PostPass`. Varje
  struct har `create`/`destroy` och ägs av den som skapade den.
- `vulkan.ddr`-faserna i setup (17 steg) blir en `Setup`-kedja där varje
  steg returnerar `Result<T, SetupError>`, och `SetupError` är en enum med
  en variant per steg + payload (device-name, format, etc.).
- `ui.ddr` + `post.ddr` flyttas ut ur backend-lagret: pipeline-definitionerna
  (blend, sampler, format) stannar i storm-gfx som typer; det som återstår
  (UI-vertex-layout, chip-layout) hör hemma i `storm-ui`.
- `storm-input` slutar bero på `storm-vulkan`: typen `Window` flyttas till
  `storm-core` (ett ogenomskinligt handtag utan Vulkan-kunskap).
- `dunder-skrift` låses: git-revision eller versions-pinned dependency.

## 5. Migration, stegvis

Varje steg lämnar träd och tester grönt. Capture-filer före/efter måste
vara **pixelidentiska** (AE = 0) om inte steget medvetet ändrar bilden.

1. **Skapa `storm-vk`** med enums + bindings, låt storm-gfx (fortfarande
   namngiven storm-vulkan) importera det. Ingen beteendeändring.
2. **Ersätt de 133 heltalen** med enums via `blend_factor()`-stilens
   konverterare, modul för modul. Pixelidentisk capture som bevis.
3. **Dela upp `Renderer`** i ägda strukturer. Pixelidentisk.
4. **`Result` istället för `stage`.** Felflöden testas i displayfria tester.
5. **Dra `ui.ddr`/`post.ddr` ur backend.** `storm-input` slipper Vulkan.
6. **Lås skrift-dependency.** README/design: uppdatera.


## 6. Öppna frågor

- **Genererade bindings?** Att hålla 300+ entry points för hand är det som
  orsakade buggen. Ett litet Dunder-verktyg som läser Khronos `vk.xml` och
  skriver enums + structar vore det första-princip-svaret — men det är ett
  eget projekt. Förslag: handskrivna enums för de ~15 enumtyper Storm
  faktiskt använder, nu; generatorn när storm-vk växer.
- **Safe-lager?** Räcker enums + `Result`, eller ska storm-gfx ha builders
  (`PipelineBuilder::new().blend(ALPHA_OVER).depth_test().build()`)? Förslag:
  enums + `Result` först, builders när vi ser vad som är besvärligt att använda.
- **Tidsram.** Uppdelningen är 1–2 dagars arbete. Enum-migrationen är
  mekanisk och kan delas per modul.
- **Exempel.** `examples/` och README-kodsnuttar ska visa det nya API:et.
- **Subagent-orthogonalitet.** Arbetspaketen ska kunna köras parallellt i
  varsin worktree utan att krocka. IBL- och text-arbetet (pågår just nu)
  bör vara inmergeat innan Steg 2 påbörjas.
