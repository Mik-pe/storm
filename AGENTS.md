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
- **Arbeta från första principer.** Innan ett steg: vad är problemet
  egentligen, vilka delar är oföränderliga fakta (API:t, formatet,
  matematiken), vilka är val? Gör inte om vad andra gjort utan att veta
  varför det är valt; välj det enklaste som uppfyller fakta.
- **Arkitekturen ska vara framtidssäker.** Det som kommer hända men inte
  finns än ska vara *möjligt att lägga till utan att riva*:
  multiplatform är planerat (Metal på macOS, en annan fönsteryta).
  Regeln som gör det verkligt: **app och paket talar bara med gränssnitt,
  aldrig med en backend.** `storm-vulkan` är dagens enda backend; inget
  utanför den ska veta att Vulkan finns. Ett gränssnitt som inte går att
  beskriva utan att nämna Vulkan är fel designat (`docs/design.md` §2,
  princip 7).
- Noll död kod: inga `#[allow]`-liknande uttryck, inga oanvända importer
  (Dunder varnar — en varning är ett fel här). Radera i stället för att
  kommentera bort; git bevarar det.
- `dunder fmt` bara på filer du rört. Repot är inte fmt-clean som helhet;
  en helträds-formatering är inte en välkommen diff.
- Fel ska vara omöjliga att skriva: enums vid FFI-gränsen, inte råa heltal
  (se `docs/dogfood.md` fynd 43–52).
- Test utan fönster och GPU: matematik, parsers, vertexdata, tillstånd.

## Dokumentation

- `docs/dogfood.md` bokför varje Dunder-brist med nummer: symptom (exakt
  diagnos), minimal repro, workaround, rekommendation. Numret fortsätter
  det senaste fyndet slutar; återkallas aldrig, bara rättas i efterhand.
- `docs/next-steps.md` är produktens roadmap; `docs/design.md` är
  arkitekturen. Död eller föråldrad text raderas — den ska inte ligga kvar
  som "historia".
- README och docs på svenska, kodkommentarer på engelska.

## Låsning och körning

- Vulkan-fönstret kräver en **olåst** Wayland-session (`hyprctl monitors`
  visar `solitaryBlockedBy`). Låst → `--capture fil.ppm --frames 1` för
  bilder; det är hur QA görs utan tangentbord.

## Checklista före push

- `dunder check` → 0 fel, 0 varningar i Storms egna paket
- `dunder test` i alla paket → alla gröna
- `dunder run tools/build-time.ddr` → under 20 s
- `git status` ren, diffen läst (inga främmande tecken, inga skräprader)
- Commit + `git push origin main`
