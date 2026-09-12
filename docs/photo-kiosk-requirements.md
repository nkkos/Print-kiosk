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

**Implemented 2026-09** (superseding the "candidates" framing above): all three
layers are now real, not theoretical.

- **Detection**: MediaPipe `FaceLandmarker`, self-hosted (WASM + model files under
  `public/models/`, no CDN/network dependency at capture time — the kiosk's own
  offline/no-server-side-photo-data posture applies here too). Eye-line from the two
  iris landmarks, chin from the face-oval's lowest point, crown estimated by dividing
  the measured eye-to-chin distance by ~0.52 (a standard facial-proportion constant)
  and extrapolating upward — the same "close, not pixel-perfect" caveat above,
  grounded in a real measurement instead of an assumed average.
- **Crop/scale**: a two-phase flow, not a single automatic crop. Capture produces a
  _generous_ crop (wider than the final document size) around the detected (or, if
  detection found no single clear face, a heuristic-estimated) landmarks; the
  customer can drag each landmark line — or nudge it with +/− buttons — on the
  "Подтвердите кадр" review screen before the actual tight crop is cut. This exists
  because an early version silently trusted detection, and real-camera testing found
  it could crop off the customer's own head when a real detected crown didn't match
  a document's implicit proportions — the fix was manual correctability, not a
  smarter model. Vertical anchoring prefers a direct top-margin figure (when a
  document publishes one, e.g. China- or Schengen-style specs) over deriving position
  from the eye-line, specifically because the latter requires assuming eyeLineY sits
  at a "standard" fraction of head-height that a real detected/adjusted head doesn't
  always match — plus a hard clamp so the crop can never exclude a landmark the
  customer placed, regardless of anchor. The kiosk **never refuses a shot** over
  camera distance, ambiguous detection (no face / more than one face), or anything
  else discovered so far — it falls back to a heuristic estimate and lets the
  customer fix it, rather than blocking a paying customer.
- **Background replacement** (see the revised "AI бэкграунд" section below for why
  this moved out of that branch): classical colour-distance chroma-keying against the
  booth's own known physical backdrop colour (`photo-kiosk/chromaKey.ts`), not ML
  segmentation. A real ML approach (MediaPipe `ImageSegmenter`) was built first and is
  still in the codebase (`backgroundSegmentation.ts`) but unused — real-camera testing
  found it performed _worse_ on a saturated/contrasting backdrop than on a plain wall,
  since the general-purpose selfie-segmenter model is trained on natural photos and
  treats an artificial solid-colour backdrop as out-of-distribution input, not the
  easy case a colour-distance keyer treats it as.

**Not yet done / needs real-hardware verification**: everything above has been
tested against the kiosk's actual camera and a real face at least once, but several
specific paths have only been exercised through Chromium's synthetic fake-camera
pattern in automated testing (which has no detectable face, so it only exercises the
no-face fallback) — real per-face testing of the draggable-landmark adjustment, the
multiple-faces-detected fallback (no way to simulate two faces with the synthetic
camera), and chroma-key against the _real_ installed backdrop (still placeholder
green in code) are the concrete open gaps, not just a generic "needs more testing."

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
- **Optional fields, as of 2026-09**: margin-from-top OR eye-line-from-bottom (either
  anchor, same duality as a stored Document — see "Requirement data model" below),
  head-height range (min/max mm), head-width range (min/max mm), background colour,
  and free-text "особые требования" instructions shown back to the customer on the
  confirm screen. Head-height/width and background were added after the country
  photo-requirements research (see "Sourcing requirement data" below) showed these
  were the two most commonly published requirements this branch didn't yet expose —
  head-height in particular is what calibrates the real detected-face crop scale
  instead of a cruder frame-relative fallback, so filling it in (even approximately)
  measurably improves crop accuracy for a document with no preset.
- **Default crop values — resolved 2026-09** (was an open item): left blank, the
  head-height ratio defaults to 75% of the target photo height — not an arbitrary
  guess, but the single most common exact figure found across the country research
  (34mm head on a 45mm photo, shared by Australia, New Zealand, Japan, South Korea,
  the Philippines and Kazakhstan). The eye-line ratio defaults to 55% of photo height
  when neither margin nor eye-line is given. Both defaults feed the _same_ real
  detected-landmark-based crop math a filled-in value would — a blank field never
  falls back to a disconnected "just guess a generic box" heuristic.
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

**Revised 2026-09**: plain solid-colour background replacement (matching a
document's required background colour, e.g. white/blue/grey) moved out of this
branch entirely and became a core, mandatory part of "Фото на документы" instead —
the product owner confirmed real-world document compliance needed it unconditionally,
not as an optional creative extra gated behind an experimental branch. See the
"Confirmed technical approach" section above for how it's actually implemented
(chroma-key, not ML segmentation). **This branch's own scope is narrower than the
2026-08-25 note below now implies**: curated _scenic/decorative_ backgrounds (designed
images, not a solid compliance colour) for souvenir-style portraits — still
unimplemented, still an open item.

**Confirmed 2026-08-25, background replacement** _(original scope note, now narrowed
per the revision above — the curated-library approach itself is still the plan for
decorative backgrounds specifically)_: a curated library of backgrounds we
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
  - **Crop-driving fields, as actually implemented (2026-09)**: photo width/height,
    DPI, head-height min/max, head-width min/max (rare — e.g. China-style specs —
    but fully supported: crop-bounds clamp, live on-screen brackets), and **one of
    two** vertical anchors — eye-line-from-bottom (most issuers) or margin-top-to-
    crown (China-/Schengen-style specs that publish a top clearance instead of, or
    alongside, an eye-line). A document may set both; the margin-top anchor is
    preferred when both a document figure and a real detected crown landmark are
    available, since it needs no assumption about where the eye-line sits relative
    to head-height (see "Confirmed technical approach" above).
  - **Format/print fields**: `backgroundRequirement` (free text, for rules that don't
    reduce to one colour, e.g. "grey or blue, white forbidden") **and**
    `backgroundColorHex` (a structured `#RRGGBB` the chroma-key replacement actually
    targets — added 2026-09, since the free-text field alone can't drive an
    algorithm), print/paper notes (glossy/matte, copies per sheet).
  - **Instruction text (not automatically validated yet)** — free-form guidance shown
    to the customer before capture (neutral expression, no glasses glare, headwear
    rules, photo-recency reminder, etc.). **Confirmed as a deliberate phase
    boundary**: not checked automatically in this pass, but explicitly expected to
    become real automatic validation later — flagged here so it doesn't get
    forgotten as scope, not dropped as a rejected idea. `recencyMonths` specifically
    was considered and rejected as a structured field: the kiosk always captures a
    live photo, so recency is automatically satisfied and a stored value would have
    no purpose beyond decoration.

**Implemented 2026-09** (was "next thing to design"): entered/edited through the
admin panel (`admin/screens/PhotoDocumentsScreen.tsx`) — country picker/create, then
a document form nested under it, mirroring the shop catalog's own pattern as
expected.

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
- **Camera hardware** — the pavilion floor plan places the camera roughly 2m from
  the customer for portrait shots; no specific camera model/spec chosen yet.
- **Printer hardware** — up to three distinct printing needs now surfaced: document
  photos on A4 (shared with the existing document printer?), souvenir output on
  postcard/magnet stock (a dedicated photo-magnet-style printer, vendor unvetted),
  and photo-strip output (**confirmed as its own dedicated printer**, separate from
  the other two). None of the actual hardware is chosen yet.
- **Sourcing requirement data — attempted at scale 2026-09, scope narrowed after**:
  parallel research agents collected official passport/visa/ID-photo requirements for
  ~30 countries plus a Slovakia-specific pass (published as a filterable reference —
  see `docs/photo-requirements-data/`), following a 25-item checklist far broader
  than our current schema (chin-position-from-bottom, both-ears-visible, pose
  tolerance, lighting/expression/glasses/headwear policy, etc. — cross-referenced
  against `photo_documents` to flag what has no schema home yet). **Mid-research
  realization**: most of that data has low real-world relevance to a kiosk physically
  in Bratislava — nobody there realistically applies for an Egyptian or Nigerian
  passport, and Slovak/EU residents don't need a Schengen visa at all (freedom of
  movement) or a visa for several other researched countries either (confirmed
  visa-free for Slovaks: Turkey, Kazakhstan, Uzbekistan, Ukraine for short stays).
  EU/Schengen research was paused pending a rethink of which EU-country documents a
  Bratislava resident could actually need (national passports turned out to need
  on-site consulate biometric capture too, same as Slovakia's own — see "Local-
  institution-specific requirements" below; an EU emergency/replacement travel
  document for a lost passport looks like the more promising angle, partially
  confirmed via the German embassy's own Bratislava page, not yet researched
  systematically). **Current direction, not yet decided**: de-prioritize further
  per-country research in favour of strengthening "Произвольный размер" as the
  primary path for anything not already validated as real local demand, since it
  requires no pre-research to cover an arbitrary document.
- **Local-institution-specific requirements — first real pass done 2026-09,
  Slovakia only**: discovery research confirmed the Slovak passport, national ID
  card, and domestic driver's licence all now use on-site biometric photo capture at
  the police document office — a kiosk photo is not accepted for any of the three,
  narrowing this branch's real Slovak opportunity considerably. Confirmed genuine
  self-supplied-photo candidates instead: firearms licence, hunting licence,
  international driving permit (unusually requires a three-quarter profile pose, not
  frontal — not something the current geometric crop pipeline handles), foreign-
  national residence permits, the ZŤP disability card, Comenius University's
  ISIC/student card (digital-upload, not print — a different output path than
  anything else this kiosk produces), a private-security-guard badge (also
  three-quarter profile), and the Bratislava transit card. Same on-site-capture
  pattern should be assumed for other countries' passports/ID cards until proven
  otherwise, not re-discovered per country.
- **"Send me a copy" (email / QR download) — implemented 2026-09, not originally
  discovered in this document**: after a successful print, the customer can email
  themselves the photo or scan a one-time QR code to download it, from
  `FinalisingSessionScreen`. A deliberate, narrow exception to this kiosk's own
  no-photo-data-server-side posture — see `server/photoShareStore.ts`'s own comment
  for why it's needed and how it's kept narrow (in-memory only, one-time-use, short
  TTL, never disk or database).
- **Real-hardware verification gaps, as of 2026-09**: the draggable-landmark-
  adjustment review screen's touch targets were measured at 28px and enlarged to the
  44px WCAG/iOS-HIG minimum, but real-finger dragging on the actual kiosk touchscreen
  is still unverified (only mouse-driven automated testing so far). The multiple-
  faces-detected fallback path has never actually fired in any test (no way to
  simulate two faces with Chromium's synthetic fake-camera pattern used for automated
  testing). Chroma-key background replacement is only verified against Chromium's
  synthetic camera and a placeholder backdrop colour — real backdrop material/colour
  and real booth lighting remain unverified.
