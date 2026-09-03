# Photo Kiosk — Discovery (Living Document)

Internal project document. The photo corner is confirmed as the pavilion's anchor
function (2026-08-25) — without it, opening the pavilion doesn't make sense on its
own, per the product owner. This document tracks discovery branch by branch, per the
kiosk's own wireframes (a separate touchscreen app, physically mounted at the
photo-booth wall, distinct from the document-printing kiosk app). Expect this to grow
significantly, but every top-level "Сделать фото" menu branch has at least an initial
pass now: "Фото на документы" (with its own "Произвольный размер" sub-branch), "AI
бэкграунд," and "фото-лента." A separate "10×15" menu item was considered and
dropped — see "AI бэкграунд" branch. Deeper open items remain within each branch —
see each section's own notes and "Open items" below.

All project artifacts are written in English.

## Confirmed technical approach: document-photo cropping

**Confirmed 2026-08-25**: cropping a captured photo to a specific document's
requirements (photo size, head-height range, eye-line position, background) splits
into three layers, deliberately kept separate:

1. **Face/landmark detection — a stable, generic technology, not built in-house.**
   Candidates: MediaPipe Face Landmarker + its Iris sub-model (free, open-source,
   runs locally/offline — no per-photo cost or network dependency, which matters for
   an unattended kiosk), or a cloud API (Google Cloud Vision, AWS Rekognition, Azure
   Face) if self-hosting proves impractical. Either way, this layer only returns
   coordinates (pupils, chin, face bounding box) — it knows nothing about any
   country's specific requirements.
2. **Crop/scale calculation — built in-house, but this is geometry, not a research
   problem.** Given the landmark coordinates plus a stored requirement spec (target
   photo dimensions, DPI, head-height range, eye-line position, background
   requirement), computing the actual crop/scale/background check is straightforward
   arithmetic and image manipulation — comparable in complexity to other features
   already built in this project, not a new category of technical risk.
3. **Requirement data — maintained by the product owner, not sourced from a vendor's
   bundled country presets.** Covers both countries and local institutions
   (confirmed: not limited to national documents). Reviewed/updated periodically as a
   content-maintenance task, not a software one.

**Known shared limitation, not unique to this approach**: accurately locating the
_top of the head_ (crown, including hair) is the hardest part of any document-photo
cropping system — landmark models are reliable for eyes/chin/nose, but hair varies
enough that head-top is always an approximation, even in commercial passport-photo
tools. Budget for this being "close, not pixel-perfect" regardless of which detection
technology is used.

**Not yet done**: real-world testing of MediaPipe's accuracy against the kiosk's
actual camera and booth lighting — this needs to happen before the approach above is
treated as fully validated, not just theoretically sound.

## Branch: "Фото на документы" (document photo)

Confirmed screen flow, from the product owner's wireframes (`Дизайн перехода
Ходздово Наместье.pdf`) — narrated here without interactive-element ids yet, since
this is pre-visual-design discovery, not an approved screen spec:

1. **Welcome** — "Сделать фото" / "Распечатать ваше фото", plus the shared footer
   (support/manual/rates/language/account/cart) — same footer concept as the
   document-printing kiosk's own persistent action bar.
2. **Сделать фото** — choice of sub-service: "Фото на документы", "AI бэкграунд",
   "фото-лента". **Revised 2026-08-25**: the wireframe's original fourth button,
   "10×15," was dropped as its own menu item — a plain, unmodified 10×15 print is
   just what "AI бэкграунд" produces when the customer picks no background/mask/
   beautify effect at all, not a genuinely separate service.
3. **Фото на документы** — "Выбрать страну" or "Произвольный размер" (custom size —
   see its own branch below).
4. **Выбрать страну** — search field plus a country list (e.g. Словакия, США,
   Англия); selecting a country shows its known document types (e.g. "США:
   Туристическая виза", "США: Иммиграционная виза").
5. **Подтвердите конфигурацию** — shows the confirmed selection, then "Перейти к
   фотографированию".
6. **3-2-1 countdown**, then the captured shot with "Переснять" / "Далее".
7. **Multiple shots gallery** — the customer can take several images; "Добавить в
   корзину" with a note that the print is on one A4 sheet, physically cut out by the
   customer in the self-service area (no automatic cutting hardware).
8. From there, the existing document kiosk's cart/payment/print flow is reused
   as-is — not a separate implementation.

## Branch: "Произвольный размер" (custom size)

**Confirmed 2026-08-25**: an escape hatch for a photo whose exact document isn't in
our database, but deliberately scoped to what a walk-up customer could realistically
know and enter themselves — not a full manual re-entry of every field an admin-
managed Document carries.

- **Required**: target photo width × height.
- **Optional, the most common of the crop-driving fields**: margin/distance from the
  image edges, and eye level. Left blank rather than forced, since most customers
  won't know their exact document's official numbers even when one exists.
- **If the optional fields are left blank**: apply a standard default crop (sensible
  default margins/eye position) rather than blocking or guessing wildly. The actual
  default values aren't chosen yet — open item below.
- Otherwise reuses the same downstream flow as "Фото на документы" (photographing,
  multi-shot gallery, cart/payment/print) and the same crop-calculation engine (layer
  2 from "Confirmed technical approach" above) — this branch only changes _where the
  target spec comes from_ (customer input, partially defaulted) instead of a stored
  Country/Document record.

## Branch: "AI бэкграунд" (background, masks, beautify, souvenir printing, plain 10×15)

Broader than the name suggests — the product owner's actual intent is combining a
real camera portrait with several distinct AI-adjacent modifications, aimed at both
tourists (Slovak-themed souvenir) and locals (a nice portrait for themselves), with
output on more than just plain photo paper. **Also covers the plain, unmodified
10×15 print** (see the revised menu note above) — picking no background/mask/beautify
effect is a valid path through this same branch, not a gap.

**Confirmed 2026-08-25, background replacement**: a curated library of backgrounds we
design/select ourselves and composite the segmented portrait onto — **not** live
generative-AI image creation per customer. Deliberately the simpler, cheaper, more
predictable option; live generation was considered and explicitly rejected for now
(cost per call, latency, no moderation of unpredictable output, needs internet on
every photo).

**Confirmed 2026-08-25, masks and beautification — self-built on free/open tooling,
not a commercial AR SDK**: commercial face-filter SDKs (Banuba, DeepAR) were
evaluated and rejected — not on technical grounds, but because their business model
(pricing/sales process built around app-scale MAU) is a poor fit for a single small
physical kiosk with low, unpredictable foot traffic; DeepAR also has no Windows
support, which the kiosk needs. Instead: **MediaPipe** (the same face-landmark
technology already chosen for document-photo cropping) **+ OpenCV** — OpenCV has an
official, documented face-beautification technique (skin smoothing via G-API);
landmark-driven geometric warping covers effects like eye enlargement; landmark-
positioned image overlays cover mask-style effects (the Instagram/Snapchat-filter
analogy the product owner asked for). Zero vendor relationship, zero per-use cost,
zero minimum-scale risk — the tradeoff is doing more of the implementation work
ourselves instead of getting a polished effects library out of the box.

**Explicitly an experiment, not a committed feature**: the product owner's own
framing — build it, judge the actual output quality, and drop the feature entirely
if it doesn't reach an acceptable bar, rather than pushing through a mediocre result
because the direction was already chosen.

- **Masks**: 3–5 to start. _Which_ themes/masks (e.g. Halloween, New Year, generic
  fun ones) is a separate creative/audience question, not decided — the product
  owner flagged this herself as needing thought about what actually appeals to
  someone walking past, not just "whatever's easy to build."
- **Beautify**: skin tone evening, eye enlargement, "whatever's typically included" —
  scope of exactly which effects ship is still open, pending what the OpenCV-based
  approach can actually deliver at acceptable quality.

**Souvenir printing on postcard cardstock / magnetic stock, not just photo paper**:
a real commercial product category exists — dedicated "photo magnet kiosk" vendors
sell purpose-built hardware that prints directly onto magnet stock as part of an
integrated photo-booth machine. Found via general vendor search only, not vetted —
the specific mechanism (genuinely automatic tray-fed stock vs. some manual step) needs
real verification with an actual vendor/spec sheet before this is treated as settled.
**Fallback, if no genuinely automated solution is found**: photo paper only for this
branch, same as the document-photo branch.

## Branch: "фото-лента" (photo strip)

**Confirmed 2026-08-25**: deliberately the simplest branch of the four — a classic
photo-booth strip, not another surface for the AI effects above.

- **Capture**: 3–4 shots taken automatically back-to-back with a countdown between
  each (the classic booth rhythm) — no manual confirmation step between shots, unlike
  "Фото на документы"'s single-shot-then-confirm flow.
- **No AI processing** — no background replacement, no masks, no beautify. Plain
  captured frames only.
- **No customer curation** — whatever the 3–4 automatic shots actually captured is
  what goes on the strip; there's no gallery/pick step like the document-photo
  branch's multi-shot selection.
- **Dedicated printer, confirmed** — a separate physical printer just for the strip
  format, not shared with the document-photo A4 output or the souvenir/magnet
  printing under "AI бэкграунд." This is now the _third_ distinct printing need
  surfaced across the branches discovered so far — see the updated "Printer
  hardware" open item below.

## Requirement data model

**Confirmed 2026-08-25**: a genuine two-level hierarchy, **Country → Document** —
not a shared/reusable spec collapsed across documents. Different document types
within the _same_ country can have genuinely different photo requirements in
practice (confirmed from real experience, not just a theoretical edge case), so each
Document entry carries its own complete spec rather than referencing a shared one.
Two entities:

- **Country** — just a name (e.g. "США"), the level the picker's country list/search
  is built from.
- **Document** — belongs to one Country, carries:
  - Label (e.g. "Туристическая виза") — what actually shows in the document-type list
    once a country is picked.
  - **Crop-driving fields**: photo width/height (with unit + DPI), head-height
    min/max, eye-line position from the photo's bottom edge.
  - **Format/print fields**: background color/requirement, print/paper notes
    (glossy/matte, copies per sheet).
  - **Instruction text (not automatically validated yet)** — free-form guidance shown
    to the customer before capture (neutral expression, no glasses glare, headwear
    rules, photo-recency reminder, etc.). **Confirmed as a deliberate phase
    boundary**: not checked automatically in this pass, but explicitly expected to
    become real automatic validation later — flagged here so it doesn't get
    forgotten as scope, not dropped as a rejected idea.

Where this data actually gets entered/edited (likely the admin panel, mirroring the
shop catalog's own add/edit form pattern — country picker/create, then a document
form nested under it) is the next thing to design, not done yet.

## Open items

- **Other branches not yet discovered**: "фото-лента" (photo strip) — the product
  owner's own framing is "discovery is needed branch by branch."
- **Which specific masks/themes ship** for "AI бэкграунд" — a creative/audience
  question, not a technical one, explicitly not decided yet.
- **Which specific beautify effects ship**, and whether the MediaPipe+OpenCV quality
  bar is met at all — this whole sub-feature is an explicit experiment that may be
  dropped if quality isn't acceptable.
- **Magnetic/postcard printing hardware** — a real vendor category exists (dedicated
  photo-magnet kiosks) but no specific vendor/spec has been vetted yet.
- **Default crop values for "Произвольный размер"** — when the optional
  margin/eye-level fields are left blank, what the standard default actually is (a
  concrete margin and eye-line ratio) isn't chosen yet.
- **Camera hardware** — the pavilion floor plan places the camera roughly 2m from
  the customer for portrait shots; no specific camera model/spec chosen yet.
- **Printer hardware** — up to three distinct printing needs now surfaced: document
  photos on A4 (shared with the existing document printer?), souvenir output on
  postcard/magnet stock (a dedicated photo-magnet-style printer, vendor unvetted),
  and photo-strip output (**confirmed as its own dedicated printer**, separate from
  the other two). None of the actual hardware is chosen yet.
- **Sourcing requirement data faster than fully manual research** — some existing
  commercial datasets/compilations were surfaced during discovery (e.g. vendors
  claiming 130+ country coverage) — worth using as a cross-check/starting point even
  though the final data stays self-maintained, not licensed from them.
- **Local-institution-specific requirements** — confirmed in scope, but no sourcing
  process defined yet (unlike countries, these aren't centrally published anywhere
  obvious).
- **Custom size branch** ("Произвольный размер") — not discovered at all yet.
