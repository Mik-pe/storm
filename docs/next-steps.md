# Nästa steg

Milstolpe 1 är klar: Vulkan-fönster med swapchain, ECS, glTF-inläsning och
glyfatlas. Det här är den ordning resten är tänkt att tas i.

## 1. Texturpipeline (för text och glTF-material)

`packages/storm-text` producerar redan en R8-atlas och quads. Kvar är
renderarsidan:

- `vkCreateImage` (R8_UNORM), staging-buffer, `vkCmdCopyBufferToImage`, layout
  `UNDEFINED → TRANSFER_DST_OPTIMAL → SHADER_READ_ONLY_OPTIMAL`.
- `vkCreateSampler` (linear, clamp to edge), `VkDescriptorSetLayout` med en
  combined image sampler, descriptor pool och set.
- En andra `VkPipeline` med samma vertexformat men textur; `draw_text` tar
  quads, atlas och färg.
- Push constant med `mat4` + `vec4`-färg — kontrollera
  `maxPushConstantsSize` (minst 128 byte garanteras).

## 2. Texturbilder i glTF

`storm-gltf` läser i dag geometri. Nästa steg är `images`, `textures`,
`materials` och `samplers`, samt `TANGENT` och UV-interleaving.

## 3. Djupbuffert

Kuberna i demon sorteras i dag av att de inte överlappar. En
`VkImage` med `D32_SFLOAT`, depth-stencil-attachment och
`VkPipelineDepthStencilStateCreateInfo` ger korrekt ocklusion.

## 4. Instancing

`src/main.ddr` bygger en separat vertexström per kub. Med
`vkCmdDrawIndexed` och en instansbuffert (modellmatris per instans) blir det en
draw call för hela scenen. Det är också första gången `storm-ecs` behöver en
"renderbar"-vy: en systemfunktion som packar om poolerna till GPU-data.

## 5. Kamera och scen-noder

`Transform` har i dag position och rotation. En `Mat4`-baserad
`LocalTransform`/`WorldTransform` med hierarki (förälder-index i ECS) ger
scengrafer. glTF-noder har redan TRS i filen — laddaren slänger dem i dag.

## 6. Fönsterhändelser

`vulkan.poll` ger `key` som ASCII-kod och en enda tangent per frame. För en
motor behövs `keys_down`/`keys_pressed`-mängder, mushjul, textinmatning
(`SDL_TextInputEvent`) och en `Input`-resurs i ECS.

## 7. Tid och fast steg

`Frame.time` är väggklocka i sekunder. En `Time`-resurs med `dt`, `elapsed` och
ackumulator för fasta fysiksteg (t.ex. 120 Hz) hör till kärnan.

## 8. Skuggning

Push constants räcker för MVP. Nästa steg är uniform buffers per frame
(per-frame descriptor set), vilket också ger plats för ljus och kameraposition.

## Kända begränsningar i dag

- En swapchain i taget per process (`Registry.active`).
- Max 8 swapchain-bilder och 8 image views (`state.Renderer`).
- Vertexbufferten är 1 MiB och mappad permanent; större scener kräver
  staging-buffer och flera buffertar.
- Ingen `VK_KHR_surface`-förstöring: `vkDestroyInstance` städar ytan.
- Inget valideringslager aktiverat i koden; kör med
  `VK_INSTANCE_LAYERS=VK_LAYER_KHRONOS_validation` vid felsökning.
