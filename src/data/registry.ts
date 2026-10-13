// Everything in the data layer, for the data-review generator.

import * as brands from './brands';
import * as facilities from './facilities';
import * as finance from './finance';
import * as governance from './governance';
import * as supply from './supply';
import * as grain from './grain';
import * as history from './history';
import * as law from './law';
import * as markets from './markets';
import * as eccb from './regions/eccb';
import * as tuning from './tuning';

export const DATA_REGISTRY: Record<string, Record<string, unknown>> = {
  'markets.ts': markets as unknown as Record<string, unknown>,
  'history.ts': history as unknown as Record<string, unknown>,
  'brands.ts': brands as unknown as Record<string, unknown>,
  'law.ts': law as unknown as Record<string, unknown>,
  'tuning.ts': tuning as unknown as Record<string, unknown>,
  'facilities.ts': facilities as unknown as Record<string, unknown>,
  'grain.ts': grain as unknown as Record<string, unknown>,
  'supply.ts': supply as unknown as Record<string, unknown>,
  'finance.ts': finance as unknown as Record<string, unknown>,
  'governance.ts': governance as unknown as Record<string, unknown>,
  'regions/eccb.ts': eccb as unknown as Record<string, unknown>,
};
