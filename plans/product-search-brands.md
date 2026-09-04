# Product Search — Proposed Brand Universe

**Status:** Approved by Matt (Sept 4, 2026) with three edits: Lucca House URL
confirmed as luccahouse.com, Interior Define added to core, retailer tier approved.
The machine-readable version is [`../search/brands.json`](../search/brands.json);
edit that file from now on, this document is the rationale.
**Target:** 51 core brands to launch, 50 more staged for expansion, 7 retailers.

How to read this: every row is a brand that sells direct online with real product
pages, ships to the US, and would look at home on the shelves of Coming Soon,
Lichen, The Primary Essentials, MoMA Design Store, or The Future Perfect. The
"Ingest" column is a best guess at how the site is built (Shopify sites expose a
clean product feed; everything else needs JSON-LD or a custom adapter). Guesses
get verified in Step 2, not here.

Edit freely: strike rows, promote from Expansion to Core, add brands. The only
rule is that a brand needs its own online store with product pages we can link to.

---

## Core 51 (launch set)

| # | Brand | HQ | Categories | Why it fits | Ingest |
|---|---|---|---|---|---|
| 1 | Hay | Copenhagen | Furniture, lighting, accessories | The center of gravity for the whole aesthetic: playful color, sculptural forms, honest materials, accessible-to-mid pricing. Found on first run: us.hay.com now redirects to DWR, so Hay comes in through the DWR ingest tagged with maker HAY. | via DWR |
| 2 | Muuto | Copenhagen | Furniture, lighting | Scandinavian with soft color and rounded silhouettes; the sensible neighbor to Hay. | JSON-LD / custom |
| 3 | Ferm Living | Copenhagen | Furniture, textiles, decor, kids | Color-forward and material-honest across almost every category we spec. | Custom |
| 4 | HKliving | Netherlands | Furniture, ceramics, lighting | Retro-sculptural shapes, lots of glazed ceramic and rattan; strong on side tables and vessels. | Custom |
| 5 | Normann Copenhagen | Copenhagen | Furniture, lighting, tabletop | Bold color and witty forms at mid price; ships direct to the US. | Custom |
| 6 | Hem | Stockholm / LA | Furniture, lighting, rugs | Designer collabs with a chunky, playful sensibility (Puffy lounge, Alphabeta lamp). | Shopify |
| 7 | Dusen Dusen | Brooklyn | Textiles, home | Anchor. Stripes and saturated color at prices a client says yes to. | Shopify |
| 8 | Areaware | Brooklyn | Objects, decor | Anchor. The accessible end of the price mix, still with a point of view. | Shopify |
| 9 | In Common With | NYC | Lighting | Anchor. Ceramic and glass lighting, sculptural, ships direct. | Shopify |
| 10 | Gantri | San Francisco | Lighting | Anchor. 3D-printed sculptural lamps at accessible prices. | Custom |
| 11 | Oeuf | Brooklyn | Kids furniture | Anchor. Solid-wood kids pieces that do not look like kids furniture. | Shopify |
| 12 | Poketo | Los Angeles | Decor, tabletop, stationery | Anchor. Color-forward small goods. | Shopify |
| 13 | Sundays | Vancouver | Furniture | Anchor. Warm, quiet upholstery and tables sold direct. | Shopify |
| 14 | PSTR Studio | Amsterdam | Wall art | Anchor. Graphic posters, easy to spec in multiples. | Shopify |
| 15 | Design Within Reach | US | Furniture, lighting | Anchor. The deep established catalog (Eames, Noguchi, Bertoia). Capped by category on ingest. | Custom, large |
| 16 | Farrow & Ball | UK / US | Paint, wallpaper | Anchor. Finishes need their own card style (no dimensions). | Custom |
| 17 | Lucca House | (verify) | (verify) | Anchor as seeded. Store is luccahouse.com; categories and platform get confirmed on the first ingest run. | Unknown |
| 18 | Blu Dot | Minneapolis | Furniture, lighting | American modern with a real design POV at mid price; sold direct. | Custom |
| 19 | Dims. | Los Angeles | Furniture | Sculptural, affordable, color options; exactly what a real client buys. | Shopify |
| 20 | Kalon Studios | Los Angeles | Furniture, kids | Solid wood and honest joinery; the material story in one brand. | Shopify |
| 21 | Bend Goods | Los Angeles | Furniture | Powder-coated wire seating in bold colors; sculptural at a glance. | Shopify |
| 22 | Fermob | France | Outdoor furniture | The definitive color-forward metal outdoor line; US store ships direct. | Custom |
| 23 | USM Modular Furniture | Switzerland | Storage | Color-block modular storage; indexed at the family level with "from" pricing. | Custom (configurator) |
| 24 | Kartell | Italy | Furniture, lighting | Sculptural plastic and glass in saturated color; US e-shop. | Custom |
| 25 | Tom Dixon | London | Lighting, furniture, accessories | Sculptural metal lighting and objects; sells direct in the US. | Shopify |
| 26 | Jonathan Adler | NYC | Furniture, decor, lighting | The maximalist end of playful; ceramics and lacquer. Capped by category. | Custom, large |
| 27 | Schoolhouse | Portland | Lighting, hardware, home | American-made lighting and hardware with color options. | Custom |
| 28 | Louis Poulsen | Copenhagen | Lighting | PH and Panthella; sculptural icons sold direct in the US. | Custom |
| 29 | Flos | Italy | Lighting | Icons plus current designers; US e-shop. | Custom |
| 30 | Coil + Drift | Brooklyn | Lighting, furniture | Restrained sculptural lighting from a small NYC studio. | Shopify |
| 31 | Bower Studios | NYC | Mirrors, furniture | Shaped mirrors and sculptural tables; very Future Perfect. | Shopify |
| 32 | Chen Chen & Kai Williams | NYC | Objects, lighting | Playful material experiments; the Coming Soon shelf. | Shopify |
| 33 | Fredericks and Mae | NYC | Objects, games, decor | Color and play in small objects. | Shopify |
| 34 | Sophie Lou Jacobsen | NYC | Glassware | Ripple and wave glass in color; tabletop with a point of view. | Shopify |
| 35 | Gohar World | NYC | Tabletop, textiles | Surreal tabletop; the fun end of the universe. | Shopify |
| 36 | Studio Arhoj | Copenhagen | Ceramics, objects | Color-drenched ceramic vases and figures. | Shopify |
| 37 | Raawii | Copenhagen | Ceramics, tabletop | Strøm vases; saturated color, sculptural. | Shopify |
| 38 | Bzippy & Co. | Los Angeles | Ceramics, furniture | Sculptural glazed ceramic tables and vessels; playful and material-real. | Shopify |
| 39 | East Fork | Asheville | Tabletop | Real ceramic with seasonal glazes; accessible. | Shopify |
| 40 | Heath Ceramics | Sausalito | Tabletop, tile | The ceramics standard; tile opens a second use. | Custom |
| 41 | Hasami Porcelain | Japan / LA | Tabletop | Stackable modular porcelain. | Shopify |
| 42 | Marimekko | Helsinki | Textiles, tabletop | Pattern and color; US store ships direct. | Custom |
| 43 | Cold Picnic | Brooklyn | Rugs, textiles | Graphic, body-inspired rugs. | Shopify |
| 44 | Nordic Knots | Stockholm / NYC | Rugs | Graphic wool rugs at prices clients actually pay. | Shopify |
| 45 | Tekla | Copenhagen | Textiles, bedding | Striped linens in a palette that sits next to Hay. | Custom |
| 46 | Slowdown Studio | Los Angeles | Textiles, decor | Artist-collab woven blankets. | Shopify |
| 47 | Smeg | Italy | Small appliances | The design-credible appliance brand; color-forward. | Custom |
| 48 | Fellow | San Francisco | Small appliances | Kettles and grinders with sculptural form. | Shopify |
| 49 | Tappan Collective | Los Angeles | Wall art | Original art and prints with real curation. | Custom |
| 50 | Backdrop | Los Angeles | Paint, wallpaper | The modern counterpart to Farrow & Ball. | Shopify |
| 51 | Interior Define | Chicago | Upholstery | Added by Matt. Made-to-order sofas and chairs with deep fabric and color options; family-level index with "from" price. | Custom (configurator) |

---

## Expansion 50 (staged, add in batches)

| # | Brand | HQ | Categories | Why it fits | Ingest |
|---|---|---|---|---|---|
| 51 | Vitsoe | London | Shelving | 606 system; family-level index with "from" price. | Custom (configurator) |
| 52 | Artemide | Italy | Lighting | Sculptural icons; US e-shop. | Custom |
| 53 | Workstead | Brooklyn | Lighting | Brass and glass lighting from a NYC studio. | Custom |
| 54 | Hawkins New York | NYC | Tabletop, textiles, decor | Muted color, ceramics and linens. | Shopify |
| 55 | Iittala | Finland | Tabletop, glass | Aalto vases and color glass; US store. | Custom |
| 56 | Concrete Cat | Edmonton | Objects | Marbled colored concrete; playful and sculptural. | Shopify |
| 57 | Fort Standard | Brooklyn | Objects, furniture | Stone and brass objects; furniture is trade-leaning. | Shopify |
| 58 | Alessi | Italy | Tabletop | Witty design classics; US store. | Custom |
| 59 | &Tradition | Copenhagen | Furniture, lighting | Flowerpot lamps and soft color. Verify US direct sales. | Custom |
| 60 | String Furniture | Sweden | Storage | Modular shelving in color. Verify US shop. | Custom (configurator) |
| 61 | Montana Furniture | Denmark | Storage | 40+ color modular storage. Verify US direct sales. | Custom (configurator) |
| 62 | Vitra | Switzerland | Furniture, accessories | Eames, Panton, and the Vitra accessories line. Overlaps DWR; capped. | Custom, large |
| 63 | Artek | Finland | Furniture, lighting | Aalto stools and lighting. Verify US direct sales. | Custom |
| 64 | Emeco | Pennsylvania | Seating | Recycled aluminum chairs; honest material story. | Custom |
| 65 | Moebe | Copenhagen | Shelving, frames | Minimal, honest wood and metal. Verify US shipping. | Shopify |
| 66 | Frama | Copenhagen | Furniture, lighting, decor | Material-forward, quietly sculptural. | Custom |
| 67 | Audo Copenhagen (formerly Menu) | Copenhagen | Furniture, lighting, decor | Sculptural Scandinavian; US shop. | Custom |
| 68 | Gus* Modern | Toronto | Furniture | Mid-price modern with real design; sold direct. | Custom |
| 69 | EQ3 | Winnipeg | Furniture | Canadian-made upholstery with color options. | Custom |
| 70 | Sabai | NYC | Upholstery | Small-studio sofas with color options and real materials. | Shopify |
| 71 | Lawson-Fenning | Los Angeles | Furniture, lighting | Warm California modern; higher price tier. | Shopify |
| 72 | Tiptoe | Paris | Furniture | Colorful legs and tables; ships to the US. | Shopify |
| 73 | Loll Designs | Duluth | Outdoor | Recycled-plastic outdoor pieces in color. | Custom |
| 74 | Yamazaki Home | Japan | Storage, organization | Clever, affordable, restrained. | Shopify |
| 75 | Allied Maker | New York | Lighting | Handmade brass lighting; aspirational tier. | Custom |
| 76 | RBW | NYC | Lighting | Architectural sculptural lighting. | Custom |
| 77 | Marset | Barcelona | Lighting | Sculptural Spanish lighting. Verify US shop. | Custom |
| 78 | Tala | London | Lighting | Sculptural bulbs and lamps; sells direct in the US. | Shopify |
| 79 | Pat Kim | Brooklyn | Objects, lighting | Turned-wood objects and lamps. | Shopify |
| 80 | Ladies & Gentlemen Studio | New York | Lighting, objects | Sculptural mobiles and lighting. | Shopify |
| 81 | Yield | Florida | Glass, tabletop | Color glass and ceramics. | Shopify |
| 82 | Seletti | Italy | Lighting, decor | The loud end of playful; US shop. | Custom |
| 83 | Bitossi Home | Italy | Tabletop | Color and pattern on ceramic. | Custom |
| 84 | Mud Australia | Sydney / NY | Tabletop | Color porcelain; US store. | Shopify |
| 85 | Sheldon Ceramics | Los Angeles | Tabletop | Handmade tableware. | Shopify |
| 86 | Fazeek | Melbourne | Glass, tabletop | Wavy color glass; ships to the US. | Shopify |
| 87 | Our Place | Los Angeles | Cookware | Color-forward cookware with design credibility. | Shopify |
| 88 | Balmuda | Japan | Small appliances | Sculptural toaster and kettle; US store. | Custom |
| 89 | Teenage Engineering | Stockholm | Audio, objects | Design-credible electronics sold direct. | Custom |
| 90 | Aelfie | Brooklyn | Rugs, textiles | Color and pattern rugs. | Shopify |
| 91 | Beni Rugs | Morocco / NY | Rugs | Modern Moroccan wool; sold direct. | Shopify |
| 92 | Armadillo | Australia / US | Rugs | Natural fiber rugs. Verify US direct sales. | Custom |
| 93 | Tantuvi | NYC | Rugs | Graphic dhurries. | Shopify |
| 94 | Lorena Canals | Spain | Rugs, kids | Washable colorful rugs; US store. | Custom |
| 95 | Block Shop Textiles | Los Angeles | Textiles, wall art | Block-printed textiles and prints. | Shopify |
| 96 | Morrow Soft Goods | Los Angeles | Bedding | Color linens. | Shopify |
| 97 | Hygge & West | US | Wallpaper | Pattern wallpaper; finish-style card. | Shopify |
| 98 | Clare | New York | Paint | Designer-curated paint; finish-style card. | Shopify |
| 99 | The Poster Club | Copenhagen | Wall art | Prints; ships to the US. | Custom |
| 100 | Kinto | Japan | Tabletop | Glass and ceramics; US store. | Shopify |

---

## Considered and cut

- **Overlap with DWR** (Herman Miller, Knoll, Fritz Hansen, Carl Hansen & Søn):
  the same pieces show up through DWR; adding them doubles results without adding
  aesthetic range. Revisit if DWR's coverage proves thin.
- **Trade-only or no US direct sales** (Gubi, Magis, Cassina, Moroso, cc-tapis,
  Egg Collective, Lindsey Adelman): great pieces, no product page a client can
  buy from.
- **Excluded by the brief** (West Elm, CB2, Crate & Barrel, Pottery Barn, Room &
  Board, Wayfair, Article, Burrow, Floyd, Etsy, 1stDibs,
  Chairish, Lulu & Georgia, Rejuvenation as part of Williams-Sonoma).
- **Mass without a POV** (Umbra, Muji, IKEA).

## Reference stores as a second tier (approved)

Coming Soon, Lichen, The Primary Essentials, MoMA Design Store, and The Future
Perfect all run online shops. They are curated, not marketplaces, and they carry
small makers with no store of their own. Recommendation: add them as a separate
source tier tagged `retailer` after the brand sites are working, so results can
say "via Coming Soon" and dedupe against the brand's own listing. Big Night and
ABC Carpet & Home are in the registry too; ABC starts disabled because only a few
of its departments fit and it needs collection scoping first.
