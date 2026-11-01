# Beet sugar processing: research notes for the co-op tycoon sim (1970–2030)

Compiled 2026-11-01 from ~55 web searches. **Method caveat:** in this session, direct page fetches (WebFetch/curl) to sec.gov, ers.usda.gov, wikipedia.org, agweek.com, smbsc.com and similar sites were blocked by the network policy. Every number below comes from search-engine extracts of the cited pages, or is marked **[BK]**: background knowledge that was *not* verified in this session. **[EST]** marks my own derivation or estimate. Before shipping a value with confidence "high" in `tuning.ts`, re-check [BK] items against the primary source (the ERS Sugar & Sweeteners Yearbook tables, SEC 10-Ks for American Crystal).

Confidence: **H** = primary/official source, consistent; **M** = good secondary source, or primary with ambiguity; **L** = estimate, single weak source, or [BK].

Units: "ton" = US short ton (2,000 lb) unless stated; "t" = metric tonne.

---

## 1. Factory economics

### 1a. Slicing capacity by era

| Item | Era | Number | Conf. | Source |
|---|---|---|---|---|
| US beet factories, count and total capacity | 1974 | 52 plants, 11 companies, ~181,000 tons/day combined | H | EPA, *Beet Sugar Processing* development document (1974) |
| Average factory slice | 1974 | ~3,600 tons/day (3,265 t) | H | EPA 1974 |
| New ND plants (Minn-Dak Wahpeton; Red River Valley Co-op Hillsboro) | 1973–74 | 5,000 tons/day each when built | M | Red River Valley Sugarbeet Growers / SBREB "Facts about sugarbeets" brochure |
| Average factory slice | 1982 → 1994 | 4,100 → 5,400 tons/day | H | ERS AER-711, *Sugar Background for 1995 Farm Legislation* |
| Average factory slice | 1980s | rose ~16% over the decade (about 4,030 → 4,690 tons/day) | M | ERS AGES-9006 (1990) |
| Minn-Dak expansion plan | 1994 board decision; built 1995–99 | to 7,500 tons/day (+50%) | M | Minn-Dak timeline (mdf.coop), Agweek |
| SMBSC Renville | 2002 | 12,500 tons/day; 24,000 cwt sugar/day | M | ConfectioneryNews 2002 |
| American Crystal (FY2002) | 2002 | Crookston 5,900; East Grand Forks 9,300; Moorhead 5,900; Drayton 6,700; Hillsboro 8,200 | H | ACSC 10-K FY2002 |
| American Crystal (FY2008) | 2008 | Crookston 5,900; EGF 9,200; Moorhead 5,900; Drayton 7,000; Hillsboro 9,000; Sidney MT 6,400 | H | ACSC 10-K FY2008 |
| Drayton upgrade | 2016 onward | +30% tons sliced per day; fuel efficiency +15% | M | crystalsugar.com, "Expansion for processing factory" |
| Michigan Sugar Croswell | 2018 | ~4,000 → 6,000 tons/day planned (+50%); $12.2M of a $17.1M capital year | M | Michigan Sugar release, Dec 2018 |
| Michigan Sugar Sebewaing | 2020–21 | 4,275 tons/day average (record) | H | Michigan Sugar 2021 campaign release |
| Michigan Sugar Bay City | 2020–21 | 1,594,881 tons sliced in the campaign (implies about 7,500–8,000 tons/day [EST]) | H / L | Michigan Sugar release |
| Minn-Dak Wahpeton | 2022 | reached 10,000 tons/day goal; targeting 11,000 | M | Agweek, Dec 2022 (50th annual meeting) |
| SMBSC Renville | 2010s–20s | 17,500 tons/day (undated directory entry) | L–M | Sugar Producer directory |

**Suggested sim curve [EST]:** new-build nameplate ~3,500 tons/day in 1970; ~4,500 in 1985; ~6,500 in 2000; 9,000–12,000 in 2020. Older plants are debottlenecked in 10–30% steps.

### 1b. Campaign length and uptime

| Item | Era | Number | Conf. | Source |
|---|---|---|---|---|
| Typical campaign, Great Plains | mid-20th c. | 120–150 days, longer in the north | M | Encyclopedia of the Great Plains (UNL) |
| ACSC campaign | 1996 | about September through April; plants run 24/7 | H | ACSC 10-K FY1996 |
| ACSC campaign | 2010s–2026 | late Aug/early Sept to mid-May, sometimes June; 2025 crop finished May 20 to early June 2026 | H | Agweek; crystalsugar.com |
| ACSC Hillsboro "average campaign" | 2010s | 260–275 days (the figure likely counts days from pre-pile start) | M | Grand Forks Herald |
| Michigan Sugar | 2017–18 | Aug 21 to Feb 28 (~190 days); with a big crop, slicing into mid-April (~240 days) | H | Michigan Sugar; Farm Progress |
| Wyoming (Lovell) | 2010s | 181 days in one season; varies with crop size | M | Lovell Chronicle |
| Uptime / efficiency | all eras | ~90–95% of nameplate over a campaign; losses come from starts, cleanings and breakdowns | L [EST] | industry norm; no US source found |

### 1c. Construction cost of new factories and buyouts

| Item | Year | Number | Conf. | Source |
|---|---|---|---|---|
| SMBSC Renville new factory | groundbreaking reported as 1971 (likely 1973–74), first slice Oct 14, 1975 | $60M (co-op's own figure); first campaign sliced 768,000 tons | M | smbsc.com "Our history" (search extract) |
| Minn-Dak Wahpeton new factory | groundbreaking Feb 3, 1973; first crop 1974 | ~$38M (obituary of co-op founder; single source) | L–M | Vertin-Munson obituary (J. Link) |
| ACSC 1973 grower buyout of whole company | 1973 (closed Feb 15, 1973) | $86M | H | crystalsugar.com; Inforum; FundingUniverse |
| Modern greenfield beet factory | 2020s | "about a billion dollars" (company statement, no project behind it) | L–M | Michigan Sugar (via Confluence/Second Wave) |
| Inflation check [EST] | — | $60M (1975) × CPI ≈ $350M (2024). Industrial construction costs rose faster, so $600M–1B for 10–12k tons/day today is plausible | L | derived |
| New US beet factories since 1975 | — | none built; the industry has only consolidated | M | ERS / USITC closure counts |

### 1d. Major expansions and add-ons (with years)

| Project | Year | Cost | Effect | Conf. | Source |
|---|---|---|---|---|---|
| ACSC Hillsboro expansion | 1979 | $66M | "significantly increased capacity" | M | ACSC history timeline |
| SMBSC molasses desugarization (MDS) | construction began summer 1989 | $18M | chromatographic MDS | M | smbsc.com history |
| ACSC MDS, East Grand Forks | early-mid 1990s (operating by 1998) | n/a | first ACSC MDS | M | FoodOnline 1998 |
| ACSC MDS, Hillsboro | announced June 1998 | $103M | largest US MDS: >545 t/day of 80% DS molasses | M | FoodOnline 1998; ARi patent literature |
| Minn-Dak MDS | approved ~2012; running 2015 | $70.3M | extracts sugar from molasses | M | Agweek; mdf.coop |
| ACSC Drayton modernization | 2016+ | ~$100M (early estimate) | +30% slice, +5–7% company output | M | Bismarck State College / Agweek |
| Michigan Sugar Bay City investment | ~2018 | $65M | factory expansion | M | Agweek; Second Wave |
| Michigan Sugar Caro / Croswell boilers | 2014 / 2015 | n/a | coal to natural gas; −25% CO₂ | H | Food Chain magazine 2024; MI EGLE permits |
| Michigan Sugar Croswell lime kiln | 2021 | n/a | 2 coal kilns replaced by 1 gas kiln; saves $300k/yr energy | M | Food Chain 2024 |
| Michigan Sugar Bay City MDS | June 2022 – May 2024 | $109M | 325 → 650 tons/day molasses; up to +80M lb sugar/yr; covers 100% of molasses (was 60%) | H | Michigan Sugar; Food Business News |
| SMBSC site expansion | Dec 2025 | $15M NMTC allocation (total project cost not found) | retains 470 jobs | M | Mascoma Bank release |
| ACSC credit facilities | 2020s | $800M via CoBank (several projects) | — | M | CoBank story |

---

## 2. Process steps and equipment

Flow: **receiving/piling → storage piles → flume and wash → slicers → diffuser → (pulp) presses → dryer/pelletizer | (raw juice) liming + carbonation (lime kiln CO₂) → filtration → evaporators → vacuum pans → centrifugals → sugar dryer/granulator → silos/warehouse | molasses → MDS → extract sugar + raffinate (feed).**

| Unit | Role | Typical size / numbers | Conf. | Source |
|---|---|---|---|---|
| Receiving station / piler | Truck dumps onto piler hopper; screens remove soil, which returns to the truck; boom builds pile. Stacker = piler without cleaning bed | Minn-Dak overall receipt ~420 tons/hr or up to 340 loads/day; a single piler handles roughly 150–300 tons/hr [BK] | M / L | East Mfg case study; Michigan Sugar |
| Tare lab | Sample from each load: dirt tare, sugar %, purity (sets payment) | Tare ~1.7% (Minn-Dak 2015) | M | Grand Forks Herald 2015 |
| Receiving stations per co-op | Remote piling sites plus factory yards | ACSC: 33 outside piling stations (older figure); SMBSC: 12 receiving stations | L–M | Grand Forks Herald; smbsc.com |
| Storage piles | Outdoor piles, about 20 ft high; ventilated with ambient-air fans; RRV piles frozen ("deep-freeze") for the late campaign | RRV piles stay frozen until early March; chillers and ice mats used | M | NDSU *Farm Research* 1979; ACHR News 2007; ACSC Heat & Frost policy |
| Pile sugar loss | Respiration plus rot | 0.2–0.5 lb sucrose/ton/day typical; undamaged, chilled, fungicide-treated beets <0.13 lb/ton/day over 140 days; mechanically harvested piled beets ~1.1 lb/ton/day; ~50 lb/ton over a 100-day storage | M | USDA-ARS newsletter; U. Idaho Ext. (1977) |
| Temperature effect | Total sucrose loss 43–91 kg/t over storage, from −1 °C to 10 °C regimes (Wyse 1978); covering a clamp cut daily loss from ~275 g to ~56 g/t | M | Wyse 1978, via a German thesis |
| Flume & wash | Water flume moves beets from piles; washer and stone/trash catcher | flume water heavily recirculated | L | general |
| Slicers | Cut beets into cossettes (V-shaped strips) | Putsch drum/disc slicers (e.g., TSM 2200) | M | Exapro listing; ILO Encyclopaedia |
| Diffuser | Counter-current hot-water (~70 °C) extraction of sugar from cossettes | Types: **tower** (BMA; e.g., Sidney Sugars tower diffuser, bull gear replaced 2019), **slope/twin-scroll** (DDS; in >25% of world beet factories), **RT drum** (Raffinerie Tirlemontoise), early US continuous diffusers (Silver) | M | Roundup (Sidney 2019); DSSE; SASTA review |
| Pulp presses | Press wet pulp before drying | wet pulp ~500 kg/t beets → ~210 kg pressed → ~50 kg dried (10% moisture) | M | Feedipedia (Legrand 2015) |
| Pulp dryer / pelletizer | Rotary drum dryers (gas or coal fired); molasses often added; pellets for feed | Drying can be up to 50% of factory energy | M | CEFS / literature review |
| Lime kiln and carbonation | Burn limestone to CaO + CO₂; prelime/main lime the raw juice; CO₂ gas precipitates CaCO₃, which carries impurities | 15–25 kg CaO per t beets (~2.5% of beet weight as limestone); ~0.25 t limestone per t sugar; kiln fuel coke or anthracite (gas kilns need ~20% more fuel: 2.2–2.7 GJ/t limestone) | M | patents US8328948 / US9133528; Dutch PBL 2019 |
| Juice concentrations | Thin juice 15–17% sugar → evaporators → thick juice 65–70% | 4–6 effect evaporator stations [BK] | M | patent literature |
| Vacuum pans / crystallizers | Boil thick juice to massecuite; usually 3 boilings (white, intermediate, raw/low-grade) [BK] | — | M | general |
| Centrifugals | Separate crystals from syrup: batch for white sugar, continuous for low-grade | Western States Machine Co.: >6,000 machines installed worldwide | M | Western States |
| Sugar dryer, silos, warehouse | Granulator/cooler; bulk silos; packaging | Michigan Sugar Toledo plant; warehouses at Fremont, OH | M | Michigan Sugar locations |
| Boilers and energy | Steam for diffusion, evaporation, pans; cogeneration of power | Heat 140–200 kWh_th/t beet excluding pulp drying (≈0.5–0.72 GJ/t); electricity 17–30 kWh/t; steam 20–30% on beet; older plants ~3.3–3.6 GJ primary/t including everything (Iran LCA, ~73–79 m³ gas/t) | M | CEFS toolbox; sucrose.com; Iranian LCA |
| Fuel history | US Midwest plants were coal-fired through the 2000s (Wickes stoker boilers at Croswell and Caro). Gas conversions: Michigan 2014–15; Spreckels Brawley Riley boiler | — | H (Michigan) | MI EGLE permits; Imperial County APCD |
| MDS (molasses desugarization) | Chromatographic SMB separation of molasses into extract (sugar) and raffinate (feed); also betaine | Recovers 81–88% of the sugar in molasses (75–78% was acceptable in early systems); a second pass can lift it further | M | Johnson 2019, "MDS in the US beet sugar industry"; ARi patents |
| MDS US start | US MDS integral "since 1988"; >90% of US beet molasses treated by chromatography by 2001 | — | M | Johnson 2019; 2001 review |
| Wastewater ponds | Flume/wash water to settling ponds and lagoons; land application; anaerobic digesters (biogas to boilers at ACSC/SMBSC) | sizes not found | L | EPA 1974; MPR 2008 "beet gas" |

### Equipment makers and builders (neutral one-liners)

| Maker | Note | Conf. |
|---|---|---|
| **BMA** (Braunschweigische Maschinenbauanstalt, Germany; founded 1853 [BK]) | Tower diffusers, evaporators, batch and continuous centrifugals; supplied plants worldwide, including cane diffusers in South Africa from 1967 | M |
| **Putsch** (Hagen, Germany; 1871 [BK]; US office in North Carolina [BK]) | Beet slicers (drum and disc) and knives; also pulp presses | M |
| **Silver Engineering Works** (Denver; founded 1933/34 by Harold Silver and Fred Roberts) | Claims the Ogden beet piler, the first commercially usable continuous diffuser, and the Silver Model 63 continuous centrifugal; family-owned since 2007 | M (company claims) |
| **Western States Machine Co.** (incorporated Salt Lake City 1917; Hamilton, OH, then Fairfield, OH from 2013) | Batch (Roberts, G-series) and continuous (Titan, CC-6) sugar centrifugals; describes itself as the last US-based maker | M |
| **DDS** (De Danske Sukkerfabrikker, Denmark) | Twin-scroll slope diffuser, in >25% of world beet factories | M |
| **RT** (Raffinerie Tirlemontoise, Belgium) | Rotating-drum (RT) diffuser | M [BK] |
| **Maguin** (France) | Process equipment for sugar and distilling: slicers, evaporation and drying [BK] | L |
| **Tongaat-Hulett** (South Africa) | Cane (not beet) diffusers; not relevant to beet unless as a generic diffuser vendor | M |
| **Amalgamated Research Inc. (ARi)**, Twin Falls, ID | SMB / "coupled loop" chromatography for molasses desugarization; licensed (e.g., to Idreco USA, 1998) | M |
| **Finnsugar / Cultor** (Finland) | Early commercial SMB molasses separation [BK] | L |
| **Vincent Corp.** | Screw presses; beet pulp trials at Western Sugar in 1995 | M |
| **Wickes** | Coal stoker boilers at Michigan factories (later replaced) | H |
| **EAPC** (Grand Forks engineers) | Recent carbonation, prelimer and evaporator projects at ACSC, SMBSC, Minn-Dak | M |

---

## 3. Agronomics

### 3a. Yield and sugar content

| Region | Year | Yield (tons/acre) | Sugar % | Conf. | Source |
|---|---|---|---|---|---|
| US average | 1970s | ~19–20 | ~15–16 | L [BK] | ERS AER-711 tables (not legible in extract) |
| ACSC (RRV) | 1982 | 17.5 | — | M | SBREB report |
| SMBSC (S. MN) | 1982 | 21.6 | — | M | SBREB report |
| US average | 2000/01–2005/06 | 22.1 | — | H | ERS Chart of Note |
| RRV | 2003 | 20.3 | — | M | SBREB / GF Herald |
| US average | 2006/07–2011 | 26.4 | — | H | ERS |
| ACSC | 2011 | 20.7 | 18.0 | M | GF Herald |
| N. RRV | 2015 | ~27.7 (record then) | — | M | Agweek |
| SMBSC | 2021 | 36.5 (record) | — | M | Agweek |
| SMBSC | 2022 | 26.4 | — | M | Agweek |
| ACSC | 2023 | 31.9 (record; previous 30.4) | 18.5–18.6 | H | ACSC release; Agweek |
| ACSC | 2024 | 32.2; 410,000 acres harvested | 18.5 | H | ACSC Dec 2024 release |
| ACSC | 2025 | record 13.3M tons total | 18.0 | H | ACSC / KFGO Dec 2025 |
| RRV typical sugar | long-run | — | 17.5–18 (record 19.1) | M | Inforum |
| Michigan | historical | typical 15–20 | ~17 (2017–18 improved) | M | MSU geography; Farm Progress |
| Michigan | ~2020s | 34 forecast in a strong year; 162,000 acres in 2020 | — | M | Michigan Sugar |
| Ohio | — | commercial beet production ceased in 2005 | — | H | OSU agcrops |

**Sim curve [EST]:** eastern Corn Belt/Great Lakes 17–19 t/a at 15.5–16.5% sugar in the 1970s; 20–22 t/a at 17% in 2000; 30–34 t/a at 17.5–18.5% in the 2020s. Weather noise is about ±15% on yield and ±1 point on sugar.

### 3b. Calendar, rotation, logistics

| Item | Number | Conf. | Source |
|---|---|---|---|
| Pre-pile harvest start (RRV) | mid-Aug to early Sept (2023: Aug 15; 2021: Aug 24; ~Sept 1 typical in 2010) | H | GF Herald; Agweek; MPR |
| Pre-pile share | ~10–20% of acres, rotated among 6 grower groups | M | Agweek |
| Main ("stockpile") harvest | starts ~Oct 1, once cool enough to store | H | Agweek / ACSC |
| Michigan slicing start | Aug 12–17 (2020) | H | Michigan Sugar |
| Rotation | no more often than 1 year in 3–4; corn and small grains good predecessors | H | MSU Ext. E-1524 (1981); MSU pathology |
| Haul field → station | typically 5–20 miles; budgets use 10 miles | L [EST] | OSU EM8593 |
| Receiving stations per factory | ACSC ~6–7 per factory (33 / 5); SMBSC 12 for one factory | L–M | as above |
| Contracted acres per factory | ACSC ~80,000 (410k / 5); Michigan ~40,000 (162k / 4); SMBSC ~50,000 at startup (1975), roughly 100–120k recently [EST]; Minn-Dak ~66,000 (early 1990s), roughly 110–120k now [EST] | M / L | as above; SMBSC history |

### 3c. Grower production cost

| Item | Year | Number | Conf. | Source |
|---|---|---|---|---|
| US total cost per acre | 1976/77 crop | $472/acre (regions $319–683) | H | ERS SB-974-8 |
| US operating cost per ton | 2000 | $18.37/ton | H | ERS Amber Waves Feb 2005 |
| US total cost per ton (incl. land, operator labor) | 2000 | $37.30/ton; price $34.20/ton (88% covered operating, 35% total) | H | ERS Amber Waves 2005 |
| RRV total cost per acre (FINBIN) | 2018 → 2022 | $1,099 → $1,350 | H | Southern Ag Today 2023 |
| RRV direct cost per ton | 2018 → 2022 | $31.73 → $42.19 | H | Southern Ag Today |
| MN total cost per acre (FINBIN) | 2024 | $1,563 ($1,284 direct, record; $279 overhead) | H | American AgCredit / Terrain |
| Harvest/haul (California) | 1994 | topping and digging $2.00/gross ton; truck haul $1.60/gross ton | M | UC Davis cost study |

### 3d. Roundup Ready sugarbeets

| Item | Year | Number | Conf. | Source |
|---|---|---|---|---|
| RRV adoption | 2008 → 2009 | ~50% → ~90%+ | H | MPR 2008 |
| Seed cost | 2008 | ~$60 → $120/acre (tech fee ~$60/acre) | M | MPR; Agweek |
| Herbicide/weed-control saving | 2008 | ~$18–20/acre net of seed in one farm account; Idaho industry group: herbicide $66 → $11/acre | M | Agweek; Wyoming Ext. B-1254 |
| Yield effect | 2008 | early samples ~+0.5 t/a; broader tests showed no tonnage gain; sugar 17.64% vs 17.55% | M | GF Herald; MPR |
| Long-run | 2018 | "hasn't directly increased tonnage", but better weed control helps yield and labor | M | Agweek 10th-anniversary piece |
| 2010 court challenge | 2010–11 | temporary deregulation vacatur; partial deregulation 2011; full 2012 [BK] | L–M | [BK] |

---

## 4. Recovery and product yields

| Item | Number | Conf. | Source |
|---|---|---|---|
| ERS beet sugar recovery (sugar ÷ beets sliced) | 15.34% (2020/21), 15.35% (2022/23), 14.75% (2023/24), 15.10% (2024/25 est.); 5-yr avg 15.03% | H | ERS *Sugar & Sweeteners Outlook* SSS-M-429/437 |
| Same, early 1960s | ~13.6–14.9% | M | ERS AER-711 appendix |
| Implied extraction (recovery ÷ sugar content) | ~82–85% in the 2020s (15.1 / 18.2), with MDS at most plants [EST] | M | derived |
| Extraction without MDS | ~75–82% of sugar in beet; 10–15% of beet sucrose ends in molasses | M | Sugar Beet Processing review (ResearchGate 2022) |
| Pulp and other losses | ~0.6% of sugar in pulp; "unknown" losses 1–2% | M | same; Dakahlia study |
| MDS recovery of molasses sugar | 81–88% (early systems 75–78%) | M | Johnson 2019 |
| MDS gain | +8–12% more sugar per ton of beets if all molasses is processed [EST]. Michigan's 2024 plant: +80M lb on a ~1.0–1.3B lb base (+6–8%), and that came on top of the 60% of molasses already desugarized | M | Michigan Sugar; derived |
| Sugar per metric tonne of beet (EU/FAO) | 130–160 kg white sugar (16% sugar × ~80%) | M | FAO Agribusiness Handbook |
| Molasses per tonne | ~38–40 kg (~4% of beet weight; ~50% sucrose) | M | FAO; UC Davis |
| Wet pulp / pressed / dried | 500 / 210 / ~50 kg per tonne | M | Feedipedia |
| **Per short ton of beets (US, 2020s) [EST]** | ~300 lb sugar (15%); ~100–110 lb dried pulp pellets; ~70–80 lb molasses without MDS, or ~40–50 lb raffinate plus extra sugar with MDS | M | derived from the rows above |
| **1970s [EST]** | ~250–270 lb sugar/ton (sugar 15.5–16%, extraction ~80%) | L | derived |

---

## 5. Prices and the sugar program

### 5a. Refined beet sugar, wholesale, Midwest (ERS Yearbook "Table 5", Sosland/Milling & Baking News). Cents/lb.

The ERS spreadsheet was unreachable in this session. Anchor points marked M/H come from search extracts; the rest are **[BK] approximations to be replaced from the ERS table before data:review.** Bulk FOB basis from 1982; 100-lb bags before 1982.

| Year | ¢/lb | Conf. | Note / source |
|---|---|---|---|
| 1970 | ~12.5 | L [BK] | |
| 1972 | ~13.5 | L [BK] | |
| 1973 | ~15 | L [BK] | |
| 1974 | ~30.0 (annual); monthly peak ~60+ in Nov 1974 | M | USDA Sugar & Sweetener Report Mar 1976 (garbled table) |
| 1975 | ~22.5 | M | same |
| 1976–1979 | ~14 → 19 | L [BK] | low prices that led to the de la Garza support |
| 1980 | 36.30; Oct 1980 ~52 | H / M | ERS appendix; USDA SSS Dec 1980 |
| 1981 | ~27.5 | M | ERS appendix |
| 1982–1991 | decade avg 26.5; low 23.6 (1987); high 30.0 (1990) | M | FAO, "North American sugar market" |
| 1990s avg | ~26.7 | L–M | Sugar Alliance (advocacy) |
| 2000 | ~20–21 (glut, PIK/diversion year) | L [BK] | |
| 2005 | ~30, spiking to ~45–50 after Katrina | L [BK] | |
| 2008/09 | ~30–35 | L [BK] | |
| 2010/11 | 55.81 (FY high since 2008) | H | ERS via Southern Ag Today |
| 2012/13 | 28.84 (FY low since 2008) | H | same |
| 2014–2018 | ~28–36 | L [BK] | |
| Sep → Nov 2019 | 35 → 44 (RRV flood) | M | Southern Ag Today |
| 2022/23 | ~60 quotes; up to ~70 in 2023 | M | USDA outlook (WYLR 2023) |
| 2023/24 | ~50–58 [EST, 2024/25 is "down 15–18¢ (30%)"] | M | ERS SSS |
| 2024/25 | 35–40 | H | ERS SSS-M-444 (Aug 2025) |
| Aug 2025 | 35.75 | H | ERS via Terrain |
| Jan–Apr 2026 | 41.67 avg; Apr 42.00 | H | Southern Ag Today, Jun 2026 |

### 5b. World raw sugar (ICE No. 11, ¢/lb)

| Event | Number | Conf. | Source |
|---|---|---|---|
| 1974 record | annual ~30; Nov 1974 monthly ~57, daily peak ~64–66 | M [BK]; peak documented as "record" | USDA AER-364; peak list (1951, 57, 63, 74, 80) |
| 1980 peak | annual ~28–29 (ERS shows 29.02 / 30.11); Oct–Nov 1980 ~40–45 | M | ERS AGES-9006e; CS Monitor 1980 |
| 1985 low | ~3–4 annual, ~2.5 monthly low | L [BK] | |
| 2011 peak | IMF monthly 29.74 (Jan 2011); ~36 intraday early 2011 (30-yr high) | M | FRED PSUGAISAUSDM; eco3min |
| 2023 | ~26–28 (highest since 2011) | M | eco3min |

### 5c. Co-product prices

| Item | Year | Price | Conf. | Source |
|---|---|---|---|---|
| Beet pulp pellets, Moorhead MN (Midwest Agri / United Sugars) | early 2019 | $140/ton (tight supply) | M | NDSU co-product feed list |
| Beet pulp pellets, Minneapolis | Oct 2020 | $220/ton | M | Feedstuffs ingredient prices |
| Beet pulp pellets | 1990s | ~$80–120/ton | L [BK] | |
| Beet pulp pellets | 2012–13 drought; 2022 | ~$250–300/ton | L [BK] | |
| Beet molasses (FOB factory) | 1990s–2000s | ~$50–100/ton | L [BK] | |
| Beet molasses | 2020s | ~$120–200/ton | L [BK] | |
| Marketing | — | ACSC, Minn-Dak (and formerly SMBSC) market pulp and molasses through Midwest Agri-Commodities (San Rafael, CA) | H | crystalsugar.com |

### 5d. US sugar policy timeline

| Year | Event | Conf. | Source |
|---|---|---|---|
| 1934 / 1948 | Jones-Costigan and Sugar Act of 1948 quotas and payments | H | CRS |
| Dec 31, 1974 | Sugar Act expires amid record prices; Congress declines renewal. 1975–76 has no program | H | CRS IB95117 |
| 1977–78 | de la Garza amendment (1977 Food & Agriculture Act): support for 1977–78 crops (13.5¢ raw [BK]); discretionary in 1979 | H | CRS |
| 1981 | Agriculture and Food Act of 1981: nonrecourse loans; raw cane loan rising to 18¢ by 1985 [BK]; import quotas from May 1982 | H / M | CRS R43998 |
| 1985 | Food Security Act: 18¢ raw; "no-cost" provision | M [BK] | |
| 1990 | FACT Act: marketing allotments authorized; beet loan 22.9¢ (from 1990s through 2008) | M | CRS |
| 1994 | NAFTA in force; Mexican access phased in; unlimited duty-free from Jan 1, 2008 | H [BK] | |
| 1996 | FAIR Act: allotments suspended; recourse loans in some cases | M | CRS |
| 2000 | Glut; forfeitures; PIK diversion (~$44 of sugar per planted acre to ¾ of producers) | H | ERS Amber Waves 2005 |
| 2002 | Farm Bill restores marketing allotments; raw 18¢ / refined beet 22.9¢ | H | CRS |
| 2008 | Farm Bill: raw 18.25 → 18.75¢ (2012); beet = 128.5% of raw (24.09¢); Overall Allotment Quantity ≥85% of human-consumption demand; Feedstock Flexibility Program (sugar to ethanol) | M–H | CRS; 7 USC 7272 |
| 2012/13 | Record beet crop 35.224M tons; Mexican imports 1.79M tons (+67%); prices fell >30%; forfeitures ~85,000 tons ($34.6M); FFP used | H | ERS; Baking Business; Hagstrom |
| Dec 19, 2014 | AD/CVD suspension agreements with Mexico: reference prices 26¢ refined / 22.25¢ raw; export limits | H | Federal Register 79 FR 78039 |
| Jun 30, 2017 | Amendments: 28¢ refined / 23¢ raw; polarity 99.2; refined share capped at 30% | H | CRS IF10693 |
| Oct 2019 | CIT vacates 2017 amendments (litigation and re-adoption followed) | M | Baking Business; FR 2020 |
| 2018 | Farm Bill: raw 19.75¢; refined beet 25.38¢ | H | FSA |
| 2025 | "One Big Beautiful Bill Act": raw 24.00¢; refined beet 32.77¢ (136.55% of raw); regional beet MI/OH 33.08¢ | H | FSA FY2026 loan-rate release |

---

## 6. Grower payment systems

| Item | Year | Number | Conf. | Source |
|---|---|---|---|---|
| Co-op payment basis (ACSC) | 1990s–now | Net proceeds = revenue − processing and marketing costs, before member beet payments. Paid per ton, scaled by the grower's sugar content (and purity/extractable sugar) against the factory average. Unit retains withheld as equity | H | ACSC 10-K405 FY2001; S-1/A 1997 |
| Payment schedule | 1997 | 60% initial → 85% by ~Mar 31 → final after audit (one version 65% / 95%) | H | ACSC S-1/A 1997; 5-yr supply agreement |
| Non-member contract (Sidney) | 2004 | scale on average net sugar return × grower sugar; paid 65% Nov / 90% Apr / final Oct | H | ACSC 10-K FY2004 |
| Investor-owned "participating contract" | pre-1973 to ~2002 | Grower received a share of the net selling price of sugar from his beets: roughly 50–60%, sliding with sugar content and price (Great Western, Holly, Amalgamated, Michigan) | **L [BK]** (no confirming source found) | — |
| Western Sugar Co-op | now | price per ton set by sugar % and the average net selling price for the marketing year; growers must own shares | H | westernsugar.com |
| Shares tied to acres | SMBSC | 1 share = right/obligation to grow 1 acre | H | NRCS MN guide (2026) |
| SMBSC grower base | 1993; 2002 | 465 shareholders and 100,000 shares after selling stock to 106 new growers; 588 growers in 17 counties by 2002 | M | smbsc history; ConfectioneryNews |
| Minn-Dak founding | 1972; early 1990s | ~300 farmers; later 339 members on ~66,000 acres | M | MSUM archives |
| ACSC share prices (brokered, per share ≈ 1 acre right) | 2011–12; Nov 2022; 2024 | $3,778 avg; $4,650 record; $5,400. Growers may plant only 74–79% of shares, so the effective cost is ~$5,064 per planted acre | M | Agweek |
| ACSC net beet payment ($/ton) | 2010 crop | $73 record then (possibly gross) | M | KROX 2023 |
| | 2018 crop | ~$51 | M | Agweek |
| | 2021 crop | ~$60 estimate | M | Agweek |
| | 2022 crop | $70.63 | H | ACSC |
| | 2023 crop | $83.18 (record) | H | ACSC |
| | 2024 crop | $78.00 | H | ACSC 2025 release |
| | 2025 crop | $43.85 forecast | H | ACSC Dec 2025 |
| Minn-Dak | ~2019 | $44/ton net | M | Agweek |
| US average beet price | 2000 | $34.20/ton | H | ERS |
| US average beet price | 2019 | $38.30/ton | H | NASS via ERS |
| FINBIN MN average price | 2023; 2024 | ~$81; ~$73/ton; breakeven ~mid-$50s | H / M | Terrain / American AgCredit |
| Typical returns per acre [EST] | 2023 | 31.9 t × $83 ≈ $2,650 gross − ~$1,450 cost ≈ $1,200 above direct + overhead (before land and share capital) | M | derived |
| | 2024 | 32.2 × $78 ≈ $2,510 − $1,563 ≈ $950 | M | derived |
| | 2025 | 32 × $44 ≈ $1,400 − ~$1,550 ≈ −$150 | M | derived |
| | 1976/77 | cost $472/acre; national price ~$25–30/ton × 20 t ≈ $550 gross [BK] | L | derived |

---

## 7. Buyouts, co-op formation, closures

| Date | Event | Conf. | Source |
|---|---|---|---|
| 1954 | Michigan: Blissfield, Menominee and St. Louis factories close | H | 99wfmk; Michigan Sugar history |
| Apr 1972 | RRV Sugarbeet Growers Assn: ~1,500 growers vote; 70% favor buying ACSC | M | ACSC timeline |
| Aug 1972 | Minn-Dak Farmers Cooperative formed (~300 farmers, 7 counties) | H | MSUM archives; mdf.coop |
| Feb 15, 1973 | Growers (via Crystal Growers Corp.) buy American Crystal for $86M; first grower-owned beet co-op; HQ to Moorhead | H | crystalsugar.com |
| Feb 1973 – 1974 | Minn-Dak builds Wahpeton (5,000 tons/day); first crop 1974 | H | mdf.coop |
| 1974 | Red River Valley Co-op builds Hillsboro, ND (5,000 tons/day); merges into ACSC 1975 | M | ACSC history (sources differ on 1974 vs 1975) |
| 1972–75 | SMBSC formed; Renville built for $60M; first slice Oct 14, 1975; ACSC managed it on an interim basis until 1978 | M | smbsc.com |
| 1978 | Findlay, OH factory (Continental Sugar, built 1911) closes | M | WFIN |
| 1985 | Michigan Sugar (Savannah Foods) buys Northern Ohio Sugar Co. (Fremont plant, Findlay distribution) → Great Lakes Sugar Co.; Savannah also buys Great Western's Ohio beet operations | M | Michigan Sugar history; Encyclopedia.com |
| 1985–86 | Tate & Lyle buys 6 Great Western plants → Western Sugar | H | Tate & Lyle |
| 1989 | SMBSC starts $18M MDS | M | smbsc.com |
| 1993 (some sources 1994) | United Sugars Corp. formed by ACSC, Minn-Dak and SMBSC to market sugar jointly; US Sugar Corp. joins 1997; SMBSC later leaves; Wyoming Sugar joins 2018; now USPRC | M | ACSC history; NRCS |
| 1994 → Jan 3, 1997 | Snake River Sugar (formed 1994) takes control of Amalgamated via LLC; agreed value $250M ($266M reported); Valhi financing (~$192M) | H | Valhi 8-K; Deseret News |
| Dec 2001 → Apr 30, 2002 | Rocky Mountain Sugar Growers Co-op buys Western Sugar from Tate & Lyle: $85M + assumes $100M CCC inventory loans; 6 factories (Billings, Lovell, Scottsbluff, Bayard, Greeley, Fort Morgan) | H | Tate & Lyle RNS; Congressional Record |
| Feb 12–13, 2002 | Michigan Sugar Beet Growers buy Michigan Sugar + Great Lakes Sugar from Imperial for $45M + $18.5M debt; 10-yr marketing deal with Imperial | H | Imperial 8-K exhibit |
| 2002 | ACSC buys Holly's Sidney, MT factory → Sidney Sugars | H | Inforum |
| Oct 2004 | Monitor Sugar (Bay City) joins Michigan Sugar Co-op | H | Michigan Sugar |
| 2005 | Carrollton, MI production suspended; Ohio commercial beet production ends (implies Fremont factory's last campaign ~2004–05) [EST on Fremont] | M / L | Zippia; OSU |
| 2015 | Minn-Dak MDS online | H | mdf.coop |
| 2018 | Torrington, WY factory closes | M | USITC briefing |
| Apr 14, 2023 | Sidney Sugars closes (only 18,400 acres contracted) | H | KFYR; Agweek |
| 2025 | Spreckels (SMBSC subsidiary), Brawley CA, California's last beet factory, announced closing | M | Baking Business; Farm Progress |
| Industry count | 62 factories (1960) → 28 (2000) → 27 (2001) → 21 (2021); 23 closed since 1981 | M | USDA; ASA; USITC |

Eastern Corn Belt note: by the 2020s the nearest beet processing to IL/IN/OH is Michigan Sugar's Thumb/Saginaw Bay factories. NW Ohio growers delivered to Michigan Sugar until 2005, and there is a warehouse at Fremont plus a facility in Toledo. A new IL/IN/OH co-op factory would be historically unprecedented after the 1970s, but agronomically plausible on the NW Ohio lake-plain soils.

---

## 8. Operating costs and labour

| Item | Era | Number | Conf. | Source |
|---|---|---|---|---|
| ACSC workforce (5 RRV factories + Sidney) | 2020s | ~1,400 full-time + ~900 hourly seasonal + contract workers; up to ~1,300 seasonal harvest/piling workers hired by growers and the company | H | crystalsugar.com; Farm Progress 2021 |
| Per factory [EST] | 2020s | ~250–300 year-round; ~150–200 seasonal in the factory, plus ~200+ at piling stations during harvest | M | derived |
| ACSC lockout | Aug 2011 – Apr 2013 | ~1,300 union workers locked out (replacement workers hired) | H | MPR; Manufacturing.net |
| SMBSC | 2025 | ~470 jobs at one factory | M | Mascoma release |
| Off-season | — | "inter-campaign": maintenance and retooling | H | ACSC |
| Processing cost (excl. beet payment) | 2000s | ND beet sugar production cost ~$0.21/kg sugar (~9.5¢/lb) per Shapouri & Salassi 2006 (scope unclear: may include beets) | L–M | USDA review |
| Processing cost per ton of beets [EST] | 1975 / 1990 / 2005 / 2020 | ~$10–12 / ~$18–22 / ~$25–30 / ~$35–45 per ton sliced (energy, lime, labor, maintenance, chemicals, depreciation excluded) | L | derived: co-op beet payments are ~55–65% of revenue; [BK] |
| Energy per ton | 2020s | ~1.0–1.5 MMBtu/ton including pulp drying [EST] (EU heat 0.5–0.72 GJ/t excluding drying; drying up to 50% of total) | M / L | CEFS; derived |
| Energy cost per ton [EST] | 2020s | ~$3–8/ton at $3–5/MMBtu gas | L | derived |
| Lime | — | ~25 kg CaO/t (~2.5% of beet weight as limestone); ~0.25 t limestone per t sugar | M | patents; PBL |
| Savings example | 2021 | Croswell gas kiln saves $300k/yr in energy | M | Food Chain 2024 |
| Hauling, grower allowance (ACSC) | 2025 | half the commercial rate: $0.058–0.079 per ton-mile by station; factory-yard delivery $0.067 | H | ACSC "Statements, Payments, Tare, Incentives" 2025 |
| Commercial truck rate implied | 2025 | ~$0.116–0.158 per ton-mile [EST = 2 × allowance] | M | derived |
| Custom haul (Oregon budget) | ~2000s | $1.90/ton + $0.10/mile; allowance $0.07/ton-mile | M | OSU EM8593 |
| Rail station → factory (Tulelake, CA) | 1992 | $4.80/gross ton | M | UC Davis SG-IR-92 |
| Truck haul (CA) | 1994 | $1.60/gross ton | M | UC Davis |
| Pile → factory re-haul (company-paid) | 2020s | ~$2–5/ton for 20–60 mi [EST] | L | derived |

---

## Modelling suggestions (all [EST])

- **Factory archetype, 1975 new build:** 5,000 tons/day; 150-day campaign → ~700k tons; extraction 80%; 16% sugar → ~180 million lb sugar. Capex ~$40–60M (1975 $). Staff ~200 permanent + ~250 seasonal.
- **2020 archetype:** 10,000 tons/day; 230 days → ~2.2M tons; 18% sugar, 84% extraction with MDS → ~670M lb sugar. Greenfield capex $0.6–1.0B; MDS add-on $70–110M; +30% debottleneck ~$100M.
- **Pile shrink model:** loss (lb sucrose/ton/day) ≈ 0.15 at ≤2 °C (frozen/ventilated); ≈ 0.3 at 5 °C; ≈ 0.6 at 10 °C; ≈ 1.0+ at >12 °C or with damage. Roughly ×2 per 5–7 °C, calibrated to the 0.2–0.5 typical range. Pre-pile beets must be sliced within ~2–4 weeks.

---

## Sources (as surfaced by search; most read only via search extracts)

- American Crystal Sugar: history, cooperative profile, news releases (crystalsugar.com); 10-K FY1996, FY2002, FY2003, FY2006, FY2008; 10-K405 FY2001; S-1/A 1996–97 (sec.gov/Archives/edgar/data/4828); "Statements-Payments-Tare-Incentives" 2025 PDF; Heat & Frost Policies PDF; "Expansion for processing factory".
- Minn-Dak Farmers Cooperative: mdf.coop/about, /operations; MSUM Northwest Minnesota Historical Center S4962.
- Southern Minnesota Beet Sugar Cooperative: smbsc.com/ourstory-2/our-history.html; Mascoma Bank NMTC release (Dec 2025).
- Michigan Sugar: michigansugar.com history, locations, campaign releases 2018–2024; Food Chain magazine Dec 2024; Second Wave Media; Food Business News "Michigan Sugar opens desugarization plant".
- Imperial Sugar 8-K exhibit 99 (2002) on the Michigan Sugar sale; Tate & Lyle "Completion of Western Sugar sale" (May 2002); Congressional Record E1467 (2006); Valhi 8-K / 10-K405 1997; Deseret News 1997-01-06.
- USDA ERS: Sugar & Sweeteners Yearbook documentation; *Sugar & Sweeteners Outlook* SSS-M-429, 437, 444, 448, 454; AER-711 (1995); AGES-9006 (1990); SB-974-8 (sugarbeet costs 1976/77); Amber Waves Feb 2005 "U.S. Sugar Beet Farming: How Sweet Is It?"; Chart of Note on sugarbeet yields.
- USDA FSA: FY2025 and FY2026 sugar loan-rate releases; CY2025 loan-rate exhibit.
- Congressional Research Service: IB95117, R43998, RL33541, IF10689, IF10693.
- Federal Register 82 FR (Jul 11, 2017); 85 FR (Jan 22, 2020).
- EPA, *Development Document: Beet Sugar Processing* (1974).
- NDSU: *Farm Research* "Ventilation and Freezing of Sugarbeet Storage Piles" (1979); Co-product Feeds in ND (2019, 2024).
- University of Idaho Extension (1977) storage loss bulletin; USDA-ARS Kimberly newsletter.
- MSU Extension E-1524 (1981); MSU geography "Sugar beet industry in Michigan"; OSU agcrops (Ohio production ended 2005).
- Oregon State EM8593 enterprise budget; UC Davis sugarbeet cost studies (1992, 1994).
- Southern Ag Today (2022, 2023, 2024, 2026 articles); Terrain / American AgCredit Q4 2025 sugar beet outlook.
- Agweek, Grand Forks Herald, Inforum, MPR News, Red River Farm Network, Sugar Producer magazine, Farm Progress, Baking Business, Hagstrom Report, KFYR, KROX.
- FAO Agribusiness Handbook "Sugar Beet / White Sugar"; Feedipedia (beet pulp); CEFS Climate Neutrality Toolbox (2023); PBL "Decarbonisation options for the Dutch sugar industry" (2019); Johnson (2019) "Molasses Desugarization in the US Beet Sugar Industry: Recent Update".
- Equipment: silverengineeringworks.com; Western States Machine Co. (Journal-News, Chemical Online); DSSE diffuser page; SASTA diffuser reviews (Wu 1968; Voigt 2009); Vincent Corp.; EAPC project pages; Michigan EGLE air permits (Croswell, Caro).
- FRED / IMF sugar No. 11 series; CS Monitor 1980; WFIN (Findlay); Encyclopedia.com (Savannah Foods).
