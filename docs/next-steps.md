# Nästa steg

Milstolpe 2 är klar: scenträd, rendergraph, himmel och PBR-material, med
interaktion (WASD + mus) i ett riktigt Vulkan-fönster. Djupbufferten är också
klar (avsnitt 0c). Det här är nästa ordning.

## 0. Klart: skuggor, transparens och dynamisk graf

Skuggpass med MAX-blending i en R32-bild, transparent pass med egen blend-pipeline
och en rendergraph som byggs om varje frame utifrån scenens innehåll. Kvar nedan.

## 0b. Klart: textrenderingen

Textatlasen samplar: UI-vertexen matar `vec4(x, y, u, v)` på location 0 och
`vec4(r, g, b, a)` på location 16, descriptor-layouten deklarerar binding 0 som
`COMBINED_IMAGE_SAMPLER`, och UI-shadern räknar NDC med Vulkans y-ned-konvention.
Felen och deras orsaker står i [dogfood.md](dogfood.md#uppföljning-editor-ui-overlay-effekter-och-textatlasen)
(fynd 34–36).

## 0c. Klart: djupbufferten

Renderpasset har två bilagor: färg och en `D32_SFLOAT`-djupbild (OPTIMAL,
`DEPTH_STENCIL_ATTACHMENT`), som rensas till 1.0 varje frame och återskapas med
swapchainen. Mesh-pipelinen kör `depthTestEnable`/`depthWriteEnable` med `LESS`;
glaspipelinen testar men skriver inte, så glas döljer inte geometrin bakom sig.
Himmeln rör inte djupet. Painter's algoritmen är borta ur `main.ddr`: opaque
ritas i deklarationsordning, bara glaset sorteras bakifrån-fram för blendingens
skull. Beviset står i [dogfood.md](dogfood.md#uppföljning-djupbufferten).

## 1. Miljöbelysning (IBL)

Metallytorna ser platta ut: en metall utan omgivning har bara solen att spegla.
Nästa steg är en liten miljökub (eller en analytisk himmelmodell i shadern) som
ger både diffus hemisfär och en speglande term, plus en BRDF-LUT om vi vill göra
det ordentligt.

## 3. Texturpipeline (text och material)

`packages/storm-text` producerar en R8-atlas och quads. Kvar: `vkCreateImage`
(R8_UNORM), staging-buffer, `vkCmdCopyBufferToImage`, layoutövergångar,
`vkCreateSampler`, descriptor set-layout/pool/set och en tredje pipeline med
samma vertexformat men sampler. Samma maskineri ger material- och
normalmappar från glTF.

## 4. glTF-scener

Laddaren läser geometri. Nästa steg är `nodes` (TRS/matris), `scenes`,
`materials` (`pbrMetallicRoughness`), `textures`/`images` och att bygga
scengrafen direkt från filen i stället för att koda den i `main.ddr`.

## 5. Instancing

Demot gör en draw call per kub. Med `vkCmdDrawIndexed` och en instansbuffert
(modellmatris + material per instans) blir hela scenen en draw call. Det är
också första gången ECS behöver en "renderbar"-vy: en systemfunktion som
packar om poolerna till GPU-data.

## 6. Skuggor

En shadow map-pass i rendergrafen: djupbild från solens vy, samplas i
PBR-shadern med PCF. Rendergrafen är redan byggd för det — lägg till passet
`shadow` med `["shadow_depth"]` som skrivning och låt `meshes` läsa den.

## 7. Fler ljus

Push constants räcker för en sol. Nästa steg är en uniform buffer per frame
(per-frame descriptor set) med en ljusarray, kameraposition och tid.

## 8. Input

`storm-input` har scancodes och en fly-kamera. Kvar: `keys_pressed` som
engångshändelser i ECS, mushjul, textinmatning (`SDL_TextInputEvent`) och
gamepad via `SDL_GameController`.

## 9. Tid och fast steg

`Frame.time` är väggklocka. En `Time`-resurs med `dt`, `elapsed` och en
ackumulator för fasta fysiksteg (t.ex. 120 Hz) hör till kärnan.

## Klart: headless capture

`--capture fil.ppm` skriver en bildruta från en mappad Vulkan-bild.
Över SSH behöver SDL fortfarande tillgång till den grafiska sessionen.
Capture-vägen läser den mappade bilden. [Grafikobservationerna](dogfood.md#grafikobservationer-på-mikparchy)

## Kända begränsningar i dag

- Djupbuffert finns men inget reverserar det: glaset skriver inte djup, så två
  glaspaneler som överlappar varandra blandas i sorteringsordning, inte per pixel.
- En swapchain i taget per process (`Registry.active`).
- Max 8 swapchain-bilder och 8 image views (`state.Renderer`).
- Vertexbufferten är 4 MiB och mappad permanent; en mesh-ström per draw.
- Meshpasset kräver 240 byte push constants. Enhetsvalet kontrollerar `maxPushConstantsSize`.
- Ingen `vkDestroySurfaceKHR`-anrop: `vkDestroyInstance` städar ytan.
- Valideringslager aktiveras inte automatiskt.
