// Recovery when the admin password is lost (D-127): give the built-in "admin" account a new
// temporary password, printed here once, that must be replaced at the next sign-in. Run it where
// the game server keeps its data (COOP_DATA_DIR, or .coop-data in the project):
//   npm run admin:reset
//   docker compose exec app npm run admin:reset

import { BUILTIN_ADMIN, dataDir, resetBuiltInAdmin, temporaryPassword } from './store.ts';

const password = temporaryPassword();
await resetBuiltInAdmin(password);
console.log([
  `The "${BUILTIN_ADMIN}" account in ${dataDir()} now has this temporary password:`,
  `   ${password}`,
  'Sign in with it; you will be asked to choose a new one. A running game server picks this up at once.',
].join('\n'));
