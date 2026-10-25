// Real brands and organizations, gated by year. Real names appear only as suppliers,
// partners, buyers and competitors, and only do what src/data/history.ts records.
// Every entry has a fictional alternative used when `fictionalizeBrands` is on.
// Dates are from memory; verify in docs/DATA_REVIEW.md.

import type { Confidence } from './types';

export type BrandCategory =
  | 'regional' | 'lender' | 'fertilizer' | 'cropProtection' | 'agronomyDistribution' | 'seed' | 'feed'
  | 'fuelFlag' | 'lubricant' | 'grainBuyer' | 'railroad' | 'equipment' | 'applicationEquipment' | 'bins'
  | 'trucks' | 'retailProgram' | 'retailCompetitor' | 'propaneCompetitor' | 'software' | 'dataService'
  // Facility equipment makers and builders (D-129)
  | 'dryers' | 'grainHandling' | 'scales' | 'elevatorBuilder' | 'fertEquipment' | 'tanks' | 'feedMillEquipment' | 'fuelEquipment' | 'buildings';

export type SupplyLine = 'grain' | 'agronomy' | 'feed' | 'energy' | 'retail';

export interface Brand {
  id: string;
  name: string;
  fictionalName: string;
  category: BrandCategory;
  availableFrom: number;
  /** Exclusive: the brand is gone from this year on. */
  availableTo?: number;
  /** Brand id that replaces this one when it ends. */
  successor?: string;
  /** For regional co-ops: which local business lines they supply. */
  supplies?: SupplyLine[];
  /** Regions where the brand is present (omitted = everywhere). */
  regions?: string[];
  /** Railroads: true for Class I. */
  classI?: boolean;
  confidence: Confidence;
  notes?: string;
}

const b = (
  id: string, name: string, fictionalName: string, category: BrandCategory, availableFrom: number,
  availableTo: number | undefined, confidence: Confidence, extra: Partial<Brand> = {},
): Brand => ({ id, name, fictionalName, category, availableFrom, ...(availableTo !== undefined ? { availableTo } : {}), confidence, ...extra });

export const BRANDS: Brand[] = [
  // Regional cooperatives
  b('farmland', 'Farmland Industries', 'Heartland Industries', 'regional', 1966, 2002, 'high', { supplies: ['agronomy', 'feed', 'energy', 'grain'], notes: 'Filed Chapter 11 May 2002; locals lost their equity.' }),
  b('cenex', 'Cenex (Farmers Union Central Exchange)', 'Northern Central Exchange', 'regional', 1931, 1998, 'high', { supplies: ['energy', 'agronomy'], successor: 'cenex-harvest-states' }),
  b('farmers-union-gta', 'Farmers Union Grain Terminal Association', 'Union Grain Terminal Assn.', 'regional', 1938, 1983, 'high', { supplies: ['grain'], successor: 'harvest-states' }),
  b('harvest-states', 'Harvest States Cooperatives', 'Harvest Plains Cooperatives', 'regional', 1983, 1998, 'high', { supplies: ['grain', 'feed'], successor: 'cenex-harvest-states' }),
  b('cenex-harvest-states', 'Cenex Harvest States', 'Northern Plains Harvest', 'regional', 1998, 2003, 'high', { supplies: ['grain', 'energy', 'agronomy', 'feed'], successor: 'chs' }),
  b('chs', 'CHS Inc.', 'NorthStar Cooperative', 'regional', 2003, undefined, 'high', { supplies: ['grain', 'energy', 'agronomy', 'feed'] }),
  b('land-o-lakes', 'Land O\'Lakes', 'Lakeland Cooperative', 'regional', 1921, undefined, 'high', { supplies: ['feed', 'agronomy'] }),
  b('fs-services', 'FS Services', 'Farm Service Company', 'regional', 1962, 1980, 'medium', { supplies: ['agronomy', 'energy', 'grain', 'feed'], successor: 'growmark', regions: ['eccb'] }),
  b('growmark', 'GROWMARK', 'Midstate Mark', 'regional', 1980, undefined, 'high', { supplies: ['agronomy', 'energy', 'grain', 'feed'], regions: ['eccb'], notes: 'FS brand.' }),
  b('landmark', 'Landmark', 'Buckeye Mark', 'regional', 1934, 1985, 'medium', { supplies: ['agronomy', 'energy', 'feed', 'grain'], successor: 'countrymark', regions: ['eccb'] }),
  b('ohio-farmers-grain', 'Ohio Farmers Grain & Supply', 'Ohio Valley Grain & Supply', 'regional', 1960, 1985, 'low', { supplies: ['grain'], successor: 'countrymark', regions: ['eccb'] }),
  b('countrymark', 'Countrymark', 'Countryline', 'regional', 1985, undefined, 'medium', { supplies: ['agronomy', 'energy', 'feed', 'grain'], regions: ['eccb'], notes: 'Joined by Indiana Farm Bureau Co-op 1991; later focused on energy.' }),
  b('indiana-farm-bureau-coop', 'Indiana Farm Bureau Cooperative Association', 'Hoosier Farm Bureau Co-op', 'regional', 1927, 1991, 'medium', { supplies: ['agronomy', 'energy', 'feed', 'grain'], successor: 'countrymark', regions: ['eccb'] }),
  b('southern-states', 'Southern States Cooperative', 'Dixie States Cooperative', 'regional', 1923, undefined, 'high', { supplies: ['agronomy', 'feed', 'energy', 'retail'] }),
  b('mfa', 'MFA Incorporated', 'Missouri Valley Farmers Assn.', 'regional', 1914, undefined, 'high', { supplies: ['agronomy', 'feed', 'grain'] }),
  b('agway', 'Agway', 'Eastway', 'regional', 1964, 2002, 'high', { supplies: ['agronomy', 'feed', 'energy', 'retail'], notes: 'Filed Chapter 11 October 2002.' }),
  b('agp', 'Ag Processing Inc (AGP)', 'Ag Crush Cooperative', 'regional', 1983, undefined, 'high', { supplies: ['grain'], notes: 'Soybean processing co-op.' }),
  // Lenders
  b('bc-district', 'Bank for Cooperatives (district)', 'District Cooperative Bank', 'lender', 1933, 1989, 'high', { successor: 'cobank' }),
  b('cobank', 'CoBank', 'National Cooperative Bank', 'lender', 1989, undefined, 'high'),
  // Fertilizer
  b('cf-industries', 'CF Industries', 'Central Fertilizer Industries', 'fertilizer', 1946, undefined, 'high', { notes: 'Co-op owned until 2005 IPO.' }),
  b('farmland-nitrogen', 'Farmland nitrogen', 'Heartland Nitrogen', 'fertilizer', 1966, 2003, 'medium', { successor: 'koch' }),
  b('terra', 'Terra Industries', 'Terrace Industries', 'fertilizer', 1964, 2010, 'medium', { successor: 'cf-industries' }),
  b('koch', 'Koch Fertilizer', 'Kessler Nitrogen', 'fertilizer', 2003, undefined, 'medium'),
  b('agrium', 'Agrium', 'Agrion', 'fertilizer', 1995, 2017, 'high', { successor: 'nutrien' }),
  b('potashcorp', 'PotashCorp', 'Prairie Potash', 'fertilizer', 1975, 2017, 'high', { successor: 'nutrien' }),
  b('imc', 'IMC Global', 'International Mineral Co.', 'fertilizer', 1970, 2004, 'medium', { successor: 'mosaic' }),
  b('mosaic', 'Mosaic', 'Tessera Minerals', 'fertilizer', 2004, undefined, 'high'),
  b('nutrien', 'Nutrien', 'Nutrient Partners', 'fertilizer', 2018, undefined, 'high'),
  b('yara', 'Yara', 'Nordic Nitrogen', 'fertilizer', 2004, undefined, 'medium'),
  // Crop protection
  b('monsanto', 'Monsanto (Roundup, Lasso)', 'Midland Chemical', 'cropProtection', 1970, 2018, 'high', { successor: 'bayer' }),
  b('ciba-geigy', 'Ciba-Geigy (AAtrex, Dual)', 'Alpine Chemie', 'cropProtection', 1970, 1996, 'high', { successor: 'novartis' }),
  b('novartis', 'Novartis', 'Alpine Life Sciences', 'cropProtection', 1996, 2000, 'high', { successor: 'syngenta' }),
  b('syngenta', 'Syngenta', 'Synergen', 'cropProtection', 2000, undefined, 'high'),
  b('elanco', 'Elanco (Treflan)', 'Wabash Plant Sciences', 'cropProtection', 1970, 1989, 'medium', { successor: 'dowelanco' }),
  b('dowelanco', 'DowElanco', 'Midland-Wabash', 'cropProtection', 1989, 1997, 'high', { successor: 'dow-agrosciences' }),
  b('dow-agrosciences', 'Dow AgroSciences', 'Midland AgroSciences', 'cropProtection', 1997, 2019, 'high', { successor: 'corteva' }),
  b('american-cyanamid', 'American Cyanamid (Pursuit, Prowl)', 'Continental Cyanamid', 'cropProtection', 1970, 2000, 'high', { successor: 'basf' }),
  b('basf', 'BASF', 'Rhine Chemical', 'cropProtection', 1970, undefined, 'high'),
  b('dupont', 'DuPont', 'Brandywine Chemical', 'cropProtection', 1970, 2019, 'high', { successor: 'corteva' }),
  b('bayer', 'Bayer', 'Rhineland Crop Science', 'cropProtection', 1970, undefined, 'high'),
  b('fmc', 'FMC', 'Federal Machinery & Chemical', 'cropProtection', 1970, undefined, 'medium'),
  b('corteva', 'Corteva', 'Cortland AgSciences', 'cropProtection', 2019, undefined, 'high'),
  b('agriliance', 'Agriliance', 'AgriAlliance', 'agronomyDistribution', 2000, 2007, 'high', { successor: 'winfield' }),
  b('winfield', 'WinField Solutions', 'Winrow Solutions', 'agronomyDistribution', 2007, 2016, 'high', { successor: 'winfield-united' }),
  b('winfield-united', 'WinField United', 'Winrow United', 'agronomyDistribution', 2016, undefined, 'high'),
  // Seed
  b('pioneer', 'Pioneer', 'Pathfinder Hybrids', 'seed', 1970, undefined, 'high'),
  b('dekalb', 'DEKALB', 'DeKane Genetics', 'seed', 1970, undefined, 'high'),
  b('asgrow', 'Asgrow', 'Agrow Seed', 'seed', 1970, undefined, 'high'),
  b('funks-g', 'Funk\'s G', 'Funkhouser G', 'seed', 1970, 2004, 'medium'),
  b('northrup-king', 'Northrup King / NK', 'Northfield King', 'seed', 1970, undefined, 'medium'),
  b('golden-harvest', 'Golden Harvest', 'Golden Acre', 'seed', 1970, undefined, 'medium'),
  b('croplan', 'Croplan', 'CropLine', 'seed', 1988, undefined, 'medium'),
  b('fs-seed', 'FS seed', 'Farm Service seed', 'seed', 1970, undefined, 'medium', { regions: ['eccb'] }),
  b('becks', 'Beck\'s Hybrids', 'Brook\'s Hybrids', 'seed', 1970, undefined, 'medium'),
  b('stine', 'Stine', 'Stein Seed', 'seed', 1979, undefined, 'medium'),
  b('agrigold', 'AgriGold', 'AgriGilt', 'seed', 1970, undefined, 'low'),
  b('channel', 'Channel', 'Conduit Seed', 'seed', 2008, undefined, 'medium'),
  // Feed
  b('ralston-purina', 'Ralston Purina (Purina Chows)', 'Checkerboard Feeds', 'feed', 1970, 1998, 'high', { successor: 'purina-mills' }),
  b('purina-mills', 'Purina Mills', 'Checkerboard Mills', 'feed', 1986, 2001, 'medium', { successor: 'lol-purina', notes: 'Feed business spun off 1986; acquired by Land O\'Lakes 2001.' }),
  b('lol-purina', 'Land O\'Lakes Purina Feed', 'Lakeland Checkerboard Feed', 'feed', 2001, undefined, 'high'),
  b('lol-feed', 'Land O\'Lakes Feed', 'Lakeland Feed', 'feed', 1970, 2001, 'medium', { successor: 'lol-purina' }),
  b('kent', 'Kent Feeds', 'Kendall Feeds', 'feed', 1970, undefined, 'medium'),
  b('hubbard', 'Hubbard Feeds', 'Hubbell Feeds', 'feed', 1970, undefined, 'medium'),
  b('nutrena', 'Nutrena (Cargill)', 'Nutrimax', 'feed', 1970, undefined, 'medium'),
  b('moormans', 'MoorMan\'s', 'Moorland Feeds', 'feed', 1970, 1997, 'medium', { successor: 'adm-alliance' }),
  b('adm-alliance', 'ADM Alliance Nutrition', 'Allied Mills Nutrition', 'feed', 1998, undefined, 'medium'),
  b('wayne', 'Wayne Feeds', 'Wainwright Feeds', 'feed', 1970, undefined, 'low'),
  b('master-mix', 'Master Mix', 'Masterblend', 'feed', 1970, undefined, 'low'),
  b('farmland-feed', 'Farmland feeds', 'Heartland feeds', 'feed', 1970, 2002, 'medium'),
  // Fuel flags and lubricants
  b('flag-cenex', 'Cenex', 'NorthStar Fuel', 'fuelFlag', 1970, undefined, 'high'),
  b('flag-fs', 'FS', 'Farm Service', 'fuelFlag', 1970, undefined, 'high', { regions: ['eccb'] }),
  b('flag-countrymark', 'Countrymark', 'Countryline', 'fuelFlag', 1985, undefined, 'medium', { regions: ['eccb'] }),
  b('flag-co-op', 'Co-op (Farmland)', 'Heartland Co-op', 'fuelFlag', 1970, 2002, 'medium'),
  b('flag-sinclair', 'Sinclair', 'Sinclaire', 'fuelFlag', 1970, undefined, 'medium'),
  b('flag-phillips66', 'Phillips 66', 'Phillips Route 66', 'fuelFlag', 1970, undefined, 'medium'),
  b('flag-marathon', 'Marathon', 'Meridian', 'fuelFlag', 1970, undefined, 'medium'),
  b('flag-shell', 'Shell', 'Scallop', 'fuelFlag', 1970, undefined, 'medium'),
  b('flag-mobil', 'Mobil', 'Mobius', 'fuelFlag', 1970, undefined, 'medium'),
  b('flag-amoco', 'Amoco', 'Amerco', 'fuelFlag', 1970, 2001, 'medium', { successor: 'flag-bp' }),
  b('flag-bp', 'BP', 'BritOil', 'fuelFlag', 2001, undefined, 'medium'),
  b('flag-texaco', 'Texaco', 'Texstar', 'fuelFlag', 1970, 2004, 'medium'),
  b('lube-cenex', 'Cenex lubricants', 'NorthStar lubricants', 'lubricant', 1970, undefined, 'medium'),
  b('lube-fs', 'FS lubricants', 'Farm Service lubricants', 'lubricant', 1970, undefined, 'medium', { regions: ['eccb'] }),
  b('lube-rotella', 'Shell Rotella', 'Scallop Rotary', 'lubricant', 1970, undefined, 'medium'),
  b('lube-delvac', 'Mobil Delvac', 'Mobius Delta', 'lubricant', 1970, undefined, 'medium'),
  b('lube-delo', 'Chevron Delo', 'Chevalier Delta', 'lubricant', 1970, undefined, 'medium'),
  // Grain buyers and processors
  b('cargill', 'Cargill', 'Carlisle Grain', 'grainBuyer', 1970, undefined, 'high'),
  b('adm', 'ADM', 'Allied Midwest Milling', 'grainBuyer', 1970, undefined, 'high'),
  b('bunge', 'Bunge', 'Bungay Grain', 'grainBuyer', 1970, undefined, 'high'),
  b('continental-grain', 'Continental Grain', 'Continental Commodities', 'grainBuyer', 1970, 1999, 'high', { successor: 'cargill', notes: 'Grain business sold to Cargill 1999.' }),
  b('andersons', 'The Andersons', 'The Andrews Company', 'grainBuyer', 1970, undefined, 'high', { regions: ['eccb'] }),
  b('conagra-peavey', 'ConAgra / Peavey', 'Consolidated Agra', 'grainBuyer', 1982, 2008, 'medium'),
  b('louis-dreyfus', 'Louis Dreyfus', 'Lucien Dreyer', 'grainBuyer', 1970, undefined, 'medium'),
  b('cgb', 'CGB Enterprises', 'Consolidated Grain & Barge', 'grainBuyer', 1969, undefined, 'medium'),
  b('scoular', 'Scoular', 'Scofield Grain', 'grainBuyer', 1970, undefined, 'medium'),
  b('central-soya', 'Central Soya', 'Central Bean', 'grainBuyer', 1970, 2002, 'medium', { regions: ['eccb'] }),
  b('staley', 'A.E. Staley', 'Stanley Milling', 'grainBuyer', 1970, 2000, 'medium', { regions: ['eccb'] }),
  b('poet', 'POET', 'Prairie Ethanol', 'grainBuyer', 2007, undefined, 'medium'),
  b('valero', 'Valero (ethanol)', 'Vallejo Renewables', 'grainBuyer', 2009, undefined, 'medium'),
  b('green-plains', 'Green Plains', 'Green Prairie', 'grainBuyer', 2008, undefined, 'medium'),
  // Railroads
  b('rr-penn-central', 'Penn Central', 'Keystone Central', 'railroad', 1968, 1976, 'high', { classI: true, successor: 'rr-conrail', regions: ['eccb'] }),
  b('rr-conrail', 'Conrail', 'Consolidated Rail', 'railroad', 1976, 1999, 'high', { classI: true, successor: 'rr-csx', regions: ['eccb'] }),
  b('rr-chessie', 'Chessie System', 'Allegheny System', 'railroad', 1973, 1986, 'high', { classI: true, successor: 'rr-csx', regions: ['eccb'] }),
  b('rr-csx', 'CSX', 'Coastal Southern', 'railroad', 1986, undefined, 'high', { classI: true, regions: ['eccb'] }),
  b('rr-nw', 'Norfolk & Western', 'Roanoke & Western', 'railroad', 1970, 1982, 'high', { classI: true, successor: 'rr-ns', regions: ['eccb'] }),
  b('rr-ns', 'Norfolk Southern', 'Tidewater Southern', 'railroad', 1982, undefined, 'high', { classI: true, regions: ['eccb'] }),
  b('rr-ic', 'Illinois Central', 'Prairie Central', 'railroad', 1970, 1999, 'high', { classI: true, regions: ['eccb'], notes: 'Illinois Central Gulf 1972–1988; acquired by CN 1999.' }),
  b('rr-bn', 'Burlington Northern', 'Burlington Plains', 'railroad', 1970, 1995, 'high', { classI: true, successor: 'rr-bnsf' }),
  b('rr-bnsf', 'BNSF', 'Plains & Southwestern', 'railroad', 1995, undefined, 'high', { classI: true }),
  b('rr-up', 'Union Pacific', 'Overland Pacific', 'railroad', 1970, undefined, 'high', { classI: true }),
  b('rr-cnw', 'Chicago & North Western', 'Lakes & North Western', 'railroad', 1970, 1995, 'high', { classI: true, successor: 'rr-up' }),
  b('rr-milwaukee', 'Milwaukee Road', 'Lakeshore Road', 'railroad', 1970, 1986, 'high', { classI: true }),
  b('rr-rock-island', 'Rock Island', 'Rock River Lines', 'railroad', 1970, 1980, 'high', { classI: true, notes: 'Ordered liquidated 1980.' }),
  // Equipment
  b('john-deere', 'John Deere', 'Moline Implement', 'equipment', 1970, undefined, 'high'),
  b('international-harvester', 'International Harvester', 'International Reaper', 'equipment', 1970, 1985, 'high', { successor: 'case-ih' }),
  b('case-ih', 'Case IH', 'Racine Harvester', 'equipment', 1985, undefined, 'high'),
  b('agco', 'AGCO', 'AgriCorp Equipment', 'equipment', 1990, undefined, 'high'),
  b('terra-gator', 'Ag-Chem Terra-Gator', 'AgChem Field-Gator', 'applicationEquipment', 1972, undefined, 'medium'),
  b('rogator', 'Ag-Chem RoGator', 'AgChem RowGator', 'applicationEquipment', 1983, undefined, 'medium'),
  b('hagie', 'Hagie', 'Haggard Sprayers', 'applicationEquipment', 1970, undefined, 'medium'),
  b('willmar', 'Willmar', 'Willow Fab', 'applicationEquipment', 1975, undefined, 'low'),
  b('new-leader', 'New Leader', 'True Leader', 'applicationEquipment', 1970, undefined, 'low'),
  b('gsi', 'GSI', 'Grain Storage Industries', 'bins', 1972, undefined, 'medium'),
  b('brock', 'Brock', 'Brook Bins', 'bins', 1970, undefined, 'medium'),
  b('butler', 'Butler', 'Bowler Bins', 'bins', 1970, undefined, 'medium'),
  b('sukup', 'Sukup', 'Sutton Bins', 'bins', 1970, undefined, 'medium'),
  b('chief', 'Chief', 'Chieftain Bins', 'bins', 1970, undefined, 'medium'),
  b('kenworth', 'Kenworth', 'Kenmore Trucks', 'trucks', 1970, undefined, 'high'),
  b('peterbilt', 'Peterbilt', 'Petersen Trucks', 'trucks', 1970, undefined, 'high'),
  b('international-trucks', 'International', 'Intercontinental Trucks', 'trucks', 1970, undefined, 'high'),
  b('freightliner', 'Freightliner', 'Freightway', 'trucks', 1970, undefined, 'high'),
  b('mack', 'Mack', 'Mackey Trucks', 'trucks', 1970, undefined, 'high'),
  b('ford-trucks', 'Ford', 'Fordham Motor Trucks', 'trucks', 1970, 1998, 'high', { successor: 'sterling', notes: 'Heavy-truck division sold to Freightliner Feb 1997; renamed Sterling.' }),
  b('sterling', 'Sterling', 'Silverline Trucks', 'trucks', 1998, 2009, 'high', { notes: 'Discontinued; orders ended January 2009.' }),
  b('gmc-trucks', 'GMC', 'General Motor Trucks', 'trucks', 1970, 1988, 'high', { successor: 'volvo-trucks', notes: 'Volvo GM joint venture 1986; last GMC heavies 1987–88.' }),
  b('volvo-trucks', 'Volvo', 'Volta Trucks', 'trucks', 1988, undefined, 'high', { notes: 'Sold as WhiteGMC to 1995, Volvo Trucks North America from 1997.' }),
  // Facility equipment makers and builders (D-129). Dates from manufacturer histories and trade press.
  b('behlen', 'Behlen', 'Bellmont Steel', 'bins', 1970, undefined, 'high', { notes: 'Columbus, NE, 1936; Wickes 1969–84, then management buyout; bought Sweet Manufacturing 2025.' }),
  b('sioux-steel', 'Sioux Steel', 'Sioux Valley Steel', 'bins', 1970, undefined, 'high', { notes: 'Sioux Falls, SD, 1918; family-owned.' }),
  b('westeel', 'Westeel', 'Westward Steel', 'bins', 1970, undefined, 'high', { notes: 'Winnipeg, 1905; bins from the 1920s; AGI bought it May 2015.' }),
  b('stormor', 'Stormor', 'Storewell', 'bins', 1970, undefined, 'medium', { notes: 'Sold since at least 1957; now MFS/York/Stormor.' }),
  b('cst', 'Columbian / CST', 'Columbia Tank Works', 'tanks', 1970, undefined, 'medium', { notes: 'Columbian Steel Tank, 1893; bolted tanks from 1916; now CST Industries.' }),
  b('universal-industries', 'Universal Industries', 'Universal Conveyor', 'grainHandling', 1970, undefined, 'high', { notes: 'Cedar Falls, IA, 1906.' }),
  b('schlagel', 'Schlagel', 'Schlegel Conveyor', 'grainHandling', 1970, undefined, 'high', { notes: 'Cambridge, MN, 1957.' }),
  b('intersystems', 'InterSystems', 'InterLink Systems', 'grainHandling', 1970, 2014, 'high', { successor: 'gsi', notes: 'Omaha, 1959; to GSI 2014.' }),
  b('sweet', 'Sweet Manufacturing', 'Sweetwater Manufacturing', 'grainHandling', 1970, undefined, 'high', { notes: 'Springfield, OH, 1955; Behlen bought it Feb 2025, keeping the brand.' }),
  b('mc-dryers', 'M-C (Mathews Company)', 'Matheson Dryers', 'dryers', 1970, undefined, 'high', { notes: 'Crystal Lake, IL; dryers since 1957; independent.' }),
  b('delux', 'Delux', 'Deluxe Drying', 'dryers', 1970, undefined, 'medium', { notes: 'Kearney, NE, 1962; credited with the first vacuum-cooled dryer.' }),
  b('zimmerman', 'Zimmerman', 'Zimmer Dryers', 'dryers', 1970, 2001, 'high', { successor: 'gsi', notes: 'Litchfield, IL, 1963; to GSI 2001.' }),
  b('farm-fans', 'Farm Fans', 'Farmstead Fans', 'dryers', 1970, 2001, 'medium', { successor: 'gsi', notes: 'To GSI 2001.' }),
  b('meyer', 'Meyer (Beard Industries)', 'Myers Dryers', 'dryers', 1970, 2002, 'high', { successor: 'brock', notes: 'Frankfort, IN, 1965; to CTB/Brock 2002.' }),
  b('shivvers', 'Shivvers', 'Shiver Drying', 'dryers', 1970, undefined, 'high', { notes: 'Corydon, IA, 1968; COMPU-DRY control 1984.' }),
  b('aeroglide', 'Aeroglide', 'AeroFlow Dryers', 'dryers', 1970, 2008, 'high', { notes: 'Raleigh, NC, 1940; Bühler bought it June 2008.' }),
  b('fairbanks', 'Fairbanks', 'Fairfield Scales', 'scales', 1970, undefined, 'medium', { notes: 'St. Johnsbury, VT, 1830.' }),
  b('toledo-scale', 'Toledo Scale', 'Tolland Scale', 'scales', 1970, 1989, 'medium', { successor: 'mettler-toledo', notes: 'Acquired by Mettler 1989.' }),
  b('mettler-toledo', 'Mettler Toledo', 'Metler-Tolland', 'scales', 1989, undefined, 'medium'),
  b('cardinal-scale', 'Cardinal Scale', 'Cardinal Weighing', 'scales', 1970, undefined, 'high', { notes: 'Webb City, MO, 1950; independent.' }),
  b('rice-lake', 'Rice Lake', 'Rice River Weighing', 'scales', 1970, undefined, 'high', { notes: 'Rice Lake, WI, 1945–46.' }),
  b('todd-sargent', 'Todd & Sargent', 'Todd & Sargeant Builders', 'elevatorBuilder', 1970, undefined, 'high', { notes: 'Ames, IA, 1933; name from 1958; design-build.' }),
  b('younglove', 'Younglove Construction', 'Youngblood Construction', 'elevatorBuilder', 1970, undefined, 'medium', { notes: 'Sioux City, IA; grain and feed-mill design-build.' }),
  b('hogenson', 'Hogenson Construction', 'Hogan Construction', 'elevatorBuilder', 1970, undefined, 'medium', { notes: 'West Fargo, ND, 1925; slipform silos and steel bins.' }),
  b('chalmers-borton', 'Chalmers & Borton', 'Chambers & Burton', 'elevatorBuilder', 1970, 1990, 'low', { notes: 'Hutchinson, KS, 1927; slipform elevators. End year not found; 1990 assumed.' }),
  b('doyle', 'Doyle Equipment', 'Doyle Blending', 'fertEquipment', 1970, undefined, 'medium', { notes: 'Founded 1951; first rotary drum blender 1961.' }),
  b('yargus', 'Yargus', 'Yardley Blending', 'fertEquipment', 1970, undefined, 'medium', { notes: 'Marshall, IL, 1968 (as Layco); AGI from November 2016.' }),
  b('trinity', 'Trinity', 'Trinity Tank', 'tanks', 1970, undefined, 'medium', { notes: 'Pressure tanks; Trinity Containers, later Arcosa.' }),
  b('awt', 'American Welding & Tank', 'American Weld & Tank', 'tanks', 1970, undefined, 'low'),
  b('westmor', 'Westmor', 'Westmore Tank', 'tanks', 2001, undefined, 'medium', { notes: 'Morris, MN; roots 1972; Westmor name 2001; Superior Industries from 2008.' }),
  b('snyder', 'Snyder Industries', 'Snider Poly Tanks', 'tanks', 1975, undefined, 'low', { notes: 'Lincoln, NE; rotomolded poly tanks.' }),
  b('cpm', 'CPM (California Pellet Mill)', 'California Pelleting', 'feedMillEquipment', 1970, undefined, 'high', { notes: 'Pellet mills since 1931; bought Roskamp 1987 and Champion 1989.' }),
  b('sprout-waldron', 'Sprout-Waldron', 'Sprout-Walden', 'feedMillEquipment', 1970, 1990, 'low', { notes: 'Muncy, PA; became part of Andritz around 1990.' }),
  b('buhler', 'Bühler', 'Bühlmann', 'feedMillEquipment', 1970, undefined, 'medium', { notes: 'Swiss, 1860; full-line milling.' }),
  b('gilbarco', 'Gilbarco', 'Gilbert-Barkley', 'fuelEquipment', 1970, undefined, 'high', { notes: 'Danaher 2002, forming Gilbarco Veeder-Root.' }),
  b('tokheim', 'Tokheim', 'Tockham', 'fuelEquipment', 1970, 2003, 'high', { notes: 'Fort Wayne, IN; Chapter 11 in 2000 and 2002; North American operations sold 2003.' }),
  b('wayne', 'Wayne', 'Wayland Pumps', 'fuelEquipment', 1970, undefined, 'medium', { notes: 'Fort Wayne, IN, 1891; Dresser Wayne; Dover from 2014.' }),
  b('gasboy', 'Gasboy', 'Gasman', 'fuelEquipment', 1970, undefined, 'low', { notes: 'Fleet dispensers and card-lock controllers; now Gilbarco Veeder-Root.' }),
  b('morton-buildings', 'Morton Buildings', 'Mortonville Buildings', 'buildings', 1970, undefined, 'medium', { notes: 'Morton, IL, 1903; employee-owned.' }),
  b('cleary', 'Cleary Building', 'Clearwater Building', 'buildings', 1978, undefined, 'medium', { notes: 'Verona, WI, 1978.' }),
  b('varco-pruden', 'Varco-Pruden', 'Varden-Pruitt', 'buildings', 1970, undefined, 'low'),
  // Retail programs and competitors
  b('true-value', 'True Value', 'True Hardware', 'retailProgram', 1970, undefined, 'medium'),
  b('ace', 'Ace Hardware', 'Acme Hardware', 'retailProgram', 1970, undefined, 'medium'),
  b('do-it-best', 'HWI / Do it Best', 'Do-It-Right', 'retailProgram', 1970, undefined, 'medium'),
  b('carhartt', 'Carhartt', 'Carhart Workwear', 'retailProgram', 1970, undefined, 'high'),
  b('goodyear', 'Goodyear', 'Goodway Tire', 'retailProgram', 1970, undefined, 'high'),
  b('firestone', 'Firestone', 'Flintstone Tire', 'retailProgram', 1970, undefined, 'high'),
  b('tractor-supply', 'Tractor Supply', 'Farmstead Supply', 'retailCompetitor', 1970, undefined, 'medium', { notes: 'Rural expansion through the 1990s–2010s.' }),
  b('rural-king', 'Rural King', 'Country King', 'retailCompetitor', 1985, undefined, 'medium', { regions: ['eccb'] }),
  b('caseys', 'Casey\'s', 'Corner Casey\'s', 'retailCompetitor', 1970, undefined, 'medium', { notes: 'First store 1968; Corn Belt expansion 1980s–2010s.' }),
  b('speedway', 'Speedway', 'Raceway', 'retailCompetitor', 1970, undefined, 'medium', { regions: ['eccb'] }),
  b('amerigas', 'AmeriGas', 'AmeriFuel Gas', 'propaneCompetitor', 1977, undefined, 'medium'),
  b('ferrellgas', 'Ferrellgas', 'Farrell Gas', 'propaneCompetitor', 1970, undefined, 'medium'),
  b('suburban-propane', 'Suburban Propane', 'Suburbia Propane', 'propaneCompetitor', 1970, undefined, 'medium'),
  // Industry technology and services
  b('dtn', 'DTN', 'Data Terminal Network', 'dataService', 1984, undefined, 'medium'),
  b('agris', 'AGRIS', 'AgriSys', 'software', 1980, undefined, 'low'),
  b('agvance', 'Agvance', 'AgAdvance', 'software', 1985, undefined, 'low'),
  b('agtrax', 'AgTrax', 'AgTrack', 'software', 1998, undefined, 'low'),
  b('agvantage', 'AgVantage', 'AgVantagePoint', 'software', 1980, undefined, 'low'),
];

const BY_ID = new Map(BRANDS.map((br) => [br.id, br]));

export function getBrand(id: string): Brand | undefined {
  return BY_ID.get(id);
}

export function brandName(id: string, fictionalize: boolean): string {
  const br = BY_ID.get(id);
  if (!br) return id;
  return fictionalize ? br.fictionalName : br.name;
}

export function brandsAvailable(category: BrandCategory, year: number, region?: string): Brand[] {
  return BRANDS.filter(
    (br) => br.category === category && br.availableFrom <= year && (br.availableTo === undefined || year < br.availableTo) && (!region || !br.regions || br.regions.includes(region)),
  );
}
