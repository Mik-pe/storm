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
7. **Multiplatform är planerat, inte hypotetiskt.** Metal på macOS (och en
   annan fönsteryta än SDL) ska kunna läggas till utan att röra ett enda
   paket ovanför backenden. Därför: appen och pakagen talar med
   `storm-gfx`-gränssnittet, aldrig med en backend. Ett gränssnitt som inte
   går att beskriva utan att nämna Vulkan är fel designat. Mätt 2026-11-23:
   noll `Vk`-typer läcker utanför `storm-vulkan` (bra), men `main.ddr` gör
   36 anrop direkt mot `vulkan.` och `storm-input` importerar `vulkan` för
   tangent/mus — det är de två platserna Metal skulle tvinga fram en
   omskrivning av, och där nästa arkitektursteg börjar.

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
storm-gfx       (ny)  Backend-gränssnitt + Vulkan-implementation: Device,
   │                  Swapchain, Pipeline, Resurser. API: typat, Result-
   │                  returnerande. Inga råa heltal ut.
   ▲
storm-render    (finns) Rendergraf: passer, resurser, sortering. Ingen Vulkan.
   ▲
storm-ui/text   (finns) UI och text: ritar via storm-render, aldrig via Vulkan.
```

Metal på macOS (planerat) blir en andra implementation av samma
`storm-gfx`-gränssnitt (`storm-metal`), inte ett parallelt API: det som
skiljer sig är hur en yta skapas och hur pipelines och buffertar uttrycks,
inte vad en swapchain, ett renderpass eller en textur *är*. Gränssnittet
designas efter de gemensamma begreppen; Vulkan-specifika detaljer
(renderpass-objekt, explicita layoutövergångar) stannar i implementationen.

Regler:

- Endast `storm-gfx` importerar `storm-vk` (och, senare, endast `storm-gfx`-
  gränssnittets Metal-implementation importerar Metal-bindings).
- Endast `src/main.ddr` (appen) och `storm-render` importerar `storm-gfx`.
- `storm-ui`/`storm-text` känner inte till `VkImage`, `VkPipeline` eller
  något annat som börjar med `Vk` — och inte heller `MTLDevice` eller något
  annat som börjar med `MTL`.
- Inga `u32`-fält i publika API:er där en enum finns.
- Ett gränssnitt som inte går att beskriva utan att nämna Vulkan är fel
  designat.

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
// storm-vk: en Dunder-struct (inte @c_layout) med enum-typade fält.
pub struct Blend {
    color_op: BlendOp,          // Add = 0, inte "0"
    src_color: BlendFactor,     // BlendFactor i fältet, inte u32
    dst_color: BlendFactor,
    src_alpha: BlendFactor,
    dst_alpha: BlendFactor,
}

// Dunder `const` kan inte hålla en struct (E3007, dogfood fynd 43), så
// alpha-over är en funktion som returnerar värdet.
pub fn alpha_over() -> Blend {
    Blend {
        color_op: .Add, src_color: .SrcAlpha, dst_color: .OneMinusSrcAlpha,
        src_alpha: .One, dst_alpha: .OneMinusSrcAlpha,
    }
}

// Den enda skrivaren av C-recordets blend-fält.
pub unsafe fn apply_blend(attachment: &mut PipelineColorBlendAttachmentState, blend: &Blend)
```

Endast `apply_blend` rör `@c_layout`-structens blend-fält. Där
översätts varje enum-fält till ett Vk-heltal via `blend_factor()` o.s.v.
(konverterarna bor i `enums.ddr`). Finns det ingen konverterare kan fältet
inte fyllas i — kompilatorn säger ifrån. **Genomfört** i steg 2 (se §5).

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
   *Status: enums-modulen finns (`packages/storm-vulkan/src/enums.ddr`,
   29 enums, 137 anrop); paketdelningen är kvar.*
2. **Ersätt de 133 heltalen** med enums via `blend_factor()`-stilens
   konverterare, modul för modul. Pixelidentisk capture som bevis.
   *Status: klart 2026-11-23. 135 → 0 råa enum-heltal i structfält, AE = 0
   mot baslinjen inklusive två spec-korrigeringar av layouter (fynd 44).
   `post → ui`-beroendet borta.*
3. **Dela upp `Renderer`** i ägda strukturer. Pixelidentisk.
   *Status: första halvan klar 2026-11-23 — renderpass-, pipeline- och
   skuggpassens handpackade ord är riktiga C-poster i delade wrappers
   (`vk.Dependencies`, `vk.ShaderStages`, `vk.References`, `vk.Attributes`,
   `vk.AttachmentDescription`), fynd 52 löst, fynd 53–55 dokumenterade;
   `Renderer`-structen (cirka 60 fält) är kvar.*
4. **`Result` istället för `stage`.** Felflöden testas i displayfria tester.
   *Status: första halvan klar 2026-11-23 — `VkResult` är en Dunder-enum med
   Khronos-värden, 81 Vulkan-anrop binder sin kod och `stage_name` säger vad
   Vulkan svarade (fynd 57: OUT_OF_DATE hade ett värde som inte finns);
   `r.stage = N` som stegmarkör är kvar.*
5. **Dra `ui.ddr`/`post.ddr` ur backend.** `storm-input` slipper Vulkan.
6. **Lås skrift-dependency.** README/design: uppdatera.

## 5b. Editorn och scenen, som den står efter 0e

Scenen bor i ECS:et (`storm-scene`: `LocalTransform` med olikformig skala,
`Name`, `Mesh { shape, vertices }`, `Material`); `drawables()` är det enda
renderaren konsumerar. Render-grafen (`storm-render`) äger passordningen och
-existensen; `main.ddr` är exekutorn som mappar `PassKind` → Vulkan-anrop och
öppnar huvudpasset lat. Editorn är immediate-mode ovanpå `storm-ui`-widgets
(`Pointer`, hot/active-id), skriver i ECS via fält-id:n (`MaterialField`,
`TransformField`) eftersom en `Option` inte kan bära `&mut` (E3099). En
laddad glTF-modell är en `Mesh`-komponent med egen vertexström — renderaren
var redan generisk (`mesh(window, vertices, …)`), det var bara main som höll
på Cube/Plane. Kvar här: texturer (tangent 3), 3D-markering av vald nod,
ECS-queries (join över pooler) så system inte loopar entiteter för hand.


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
