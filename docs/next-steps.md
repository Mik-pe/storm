# Nästa steg

Milstolpe 2 är klar: scenträd, rendergraph, himmel och PBR-material, med
interaktion (WASD + mus) i ett riktigt Vulkan-fönster. Det här är nästa ordning.

## 1. Djupbuffert

Blockerad av `VK_ERROR_OUT_OF_DEVICE_MEMORY` för alla djupformat på
`vulkan-intel` (se [dogfood.md](dogfood.md#19-vkcreateimage-för-djupformat-returnerar-vk_error_out_of_device_memory)).
Utred med valideringslager innan något annat görs — utan djup ritas scenen i
deklarationsordning och överlappande objekt blir fel.

När det fungerar: två bilagor i render passet, `VkPipelineDepthStencilStateCreateInfo`
med `depthTestEnable`/`depthWriteEnable`, djup-clear och en `D32_SFLOAT`-bild
som återskapas med swapchainen.

## 2. Texturpipeline (text och material)

`packages/storm-text` producerar en R8-atlas och quads. Kvar: `vkCreateImage`
(R8_UNORM), staging-buffer, `vkCmdCopyBufferToImage`, layoutövergångar,
`vkCreateSampler`, descriptor set-layout/pool/set och en tredje pipeline med
samma vertexformat men sampler. Samma maskineri ger material- och
normalmappar från glTF.

## 3. glTF-scener

Laddaren läser geometri. Nästa steg är `nodes` (TRS/matris), `scenes`,
`materials` (`pbrMetallicRoughness`), `textures`/`images` och att bygga
scengrafen direkt från filen i stället för att koda den i `main.ddr`.

## 4. Instancing

Demot gör en draw call per kub. Med `vkCmdDrawIndexed` och en instansbuffert
(modellmatris + material per instans) blir hela scenen en draw call. Det är
också första gången ECS behöver en "renderbar"-vy: en systemfunktion som
packar om poolerna till GPU-data.

## 5. Skuggor

En shadow map-pass i rendergrafen: djupbild från solens vy, samplas i
PBR-shadern med PCF. Rendergrafen är redan byggd för det — lägg till passet
`shadow` med `["shadow_depth"]` som skrivning och låt `meshes` läsa den.

## 6. Fler ljus

Push constants räcker för en sol. Nästa steg är en uniform buffer per frame
(per-frame descriptor set) med en ljusarray, kameraposition och tid.

## 7. Input

`storm-input` har scancodes och en fly-kamera. Kvar: `keys_pressed` som
engångshändelser i ECS, mushjul, textinmatning (`SDL_TextInputEvent`) och
gamepad via `SDL_GameController`.

## 8. Tid och fast steg

`Frame.time` är väggklocka. En `Time`-resurs med `dt`, `elapsed` och en
ackumulator för fasta fysiksteg (t.ex. 120 Hz) hör till kärnan.

## Kända begränsningar i dag

- Ingen djupbuffert (se ovan); överlappande geometri sorteras efter
  deklarationsordning.
- En swapchain i taget per process (`Registry.active`).
- Max 8 swapchain-bilder och 8 image views (`state.Renderer`).
- Vertexbufferten är 4 MiB och mappad permanent; en mesh-ström per draw.
- Push constants kräver 176 byte (`maxPushConstantsSize`); enheter med 128
  byte fungerar inte för mesh-pipen.
- Ingen `vkDestroySurfaceKHR`-anrop: `vkDestroyInstance` städar ytan.
- Valideringslager aktiveras inte automatiskt.
