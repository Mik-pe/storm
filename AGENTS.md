# Regler för Storm

Gäller alla som arbetar i repot, människor som agenter.

## Byggtid

- En från-scratch-byggnation (`dunder build`) ska ta **under 20 sekunder**.
  Mät med `dunder run tools/build-time.ddr` från reporoten före varje push:
  det tar bort den gamla binären, bygger, skriver talet och **fallerar** vid
  ≥ 20 s (exit 1) eller byggfel (exit 2). En byggnation som missar budgeten
  får inte pushas — ta bort det som tog tiden eller skriv om det.
- Budgeten gäller kompilatorns väggklocka på Mikparchy, inte test eller
  körning. En långsammare maskin är inte ursäkt; en snabbare är ingen vinst.

## Pusha till main

- **Bara `main`.** Inga pull requester, inga code review-flöden, inga CI.
  Det är förbjudet att öppna en PR mot repot eller att lägga in CI-konfig
  (`.github/`, `.gitlab-ci.yml`, pipeliner). Arbete commit:as på `main` och
  pushas direkt.
- Commit:a i små steg med ett budskap som säger **vad** som ändras och
  **varför**. Ingen squash av andras arbete; historiken är dokumentationen.
- Pusha bara det som är grönt: `dunder check` utan fel, alla pakettester
  (`dunder test` i roten och i varje `packages/*`), bygget under budget.

## Kod

- Allt är Dunder. Inga byggskript i andra språk; `tools/` är Dunder-program.
- **Arbeta från första principer — tänk stort, inte bandaid.** Innan ett
  steg: vad är problemet egentligen, vilka delar är oföränderliga fakta
  (API:t, formatet, matematiken), vilka är val? Designa grunden så att
  problemet *upphör att finnas*, i stället för att lappa ovanpå en grund
  som inte bär. Ett bandaid är förbjudet när det döljer en felaktig
  grund: om en fix kräver att man "kommer ihåg" något, är grunden fel.
  Gör inte om vad andra gjort utan att veta varför det är valt; när
  grunden är rätt vinner det enklaste uttrycket för den.
- **Arkitekturen ska vara framtidssäker.** Det som kommer hända men inte
  finns än ska vara *möjligt att lägga till utan att riva*: multiplatform
  är genomfört (Metal på macOS är den andra backenden), och nästa — en
  annan fönsteryta, ett annat API — ska kunna läggas till på samma sätt.
  Regeln som gör det verkligt: **app och paket talar bara med gränssnitt,
  aldrig med en backend.** `storm-gfx` är gränssnittet; `storm-vulkan`
  (Linux) och `storm-metal` (macOS) är dess två implementationer. Inget
  utanför dem ska veta att Vulkan eller Metal finns, och bara
  `src/main.ddr` får namnge en backend. Ett gränssnitt som inte går att
  beskriva utan att nämna Vulkan eller Metal är fel designat
  (`docs/design.md` §2, princip 7).
- Noll död kod: inga `#[allow]`-liknande uttryck, inga oanvända importer
  (Dunder varnar — en varning är ett fel här). Radera i stället för att
  kommentera bort; git bevarar det.
- `dunder fmt` bara på filer du rört. Repot är inte fmt-clean som helhet;
  en helträds-formatering är inte en välkommen diff.
- Fel ska vara omöjliga att skriva: enums vid FFI-gränsen, inte råa heltal
  (se `docs/dogfood.md` fynd 43–52), och på Metal-sidan selektorer och
  konstanter som kontrolleras mot SDK:t i stället för att stavas från minne
  (se `docs/dogfood.md` *Grafikobservationer på macOS*).
- Test utan fönster och GPU: matematik, parsers, vertexdata, tillstånd. Det
  som bara syns i ett fönster — input, storleksändring, djupordning,
  upp-och-ner — har `packages/storm-metal/tools/selftest.ddr`, som läser
  pixlar och input och ska hålla grönt på en inloggad Mac.

## Dokumentation

- `docs/dogfood.md` bokför varje Dunder-brist med nummer: symptom (exakt
  diagnos), minimal repro, workaround, rekommendation. Numret fortsätter
  det senaste fyndet slutar; återkallas aldrig, bara rättas i efterhand.
- `docs/next-steps.md` är produktens roadmap; `docs/design.md` är
  arkitekturen. Död eller föråldrad text raderas — den ska inte ligga kvar
  som "historia".
- README och docs på svenska, kodkommentarer på engelska.

## Låsning och körning

- Vulkan-fönstret (Linux) kräver en **olåst** Wayland-session
  (`hyprctl monitors` visar `solitaryBlockedBy`). Låst →
  `--capture fil.ppm --frames 1` för bilder; det är hur QA görs utan
  tangentbord.
- Metal-fönstret (macOS) kräver inget olåst eller förberett: `--capture`
  fungerar från skript och agenter. Tangenterna kommer till fönstret när
  systemet låter applikationen aktivera sig: lanserad av LaunchServices
  (`dunder build --app`, `open`) direkt, från en agents skal först efter
  ett klick på fönstret.
- Från en Mac håller `dunder check --target x86_64-linux` Vulkan-sidan
  typgrön, men ingen bildruta kan ses där: den ska ses på Mikparchy.

## Checklista före push

- `dunder check` → 0 fel, 0 varningar i Storms egna paket (på macOS även
  med `--target x86_64-linux`)
- `dunder test` i alla paket → alla gröna, och lika många som det finns
  `@test` i varje svit
- På macOS: `dunder run tools/selftest.ddr` i `packages/storm-metal` →
  utgång 0
- `dunder run tools/build-time.ddr` → under 20 s, mätt på Mikparchy
- `git status` ren, diffen läst (inga främmande tecken, inga skräprader)
- Commit + `git push origin main`
