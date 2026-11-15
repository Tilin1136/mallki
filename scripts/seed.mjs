import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { passwordHash } from '../server/auth.mjs';
import { PROVEEDORES } from '../src/shared/proveedores.ts';
import { SKUS } from '../src/shared/skus.ts';
import { OFERTAS_INICIALES } from '../src/shared/ofertas.ts';

const remote = process.argv.includes('--remote');
const target = remote ? 'remoto' : 'local';
const credentialsPath = `.demo-credentials-${target}.json`;
const key = () => randomBytes(24).toString('base64url');
const demoAccounts = [
  ['sumaq','Rosa Quispe','Pollería Sumaq','buyer'],
  ['gestion','Equipo Mallki','Mallki · FIIS UNI','admin'],
  ...PROVEEDORES.map((p) => [p.id, p.nombre, p.nombre, 'supplier']),
];
const credentials = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, 'utf8')) :
  Object.fromEntries(demoAccounts.map(([id]) => [id, { email: `${id}@mallki.example`, password: key() }]));
if (!existsSync(credentialsPath)) writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), { flag: 'wx' });

if (!remote && !existsSync('.dev.vars')) writeFileSync('.dev.vars', `AUTH_PEPPER=${key()}${key()}\n`, { flag: 'wx' });
const pepper = process.env.AUTH_PEPPER || (!remote && /^AUTH_PEPPER=(.+)$/m.exec(readFileSync('.dev.vars', 'utf8'))?.[1]);
if (!pepper) throw new Error('Carga el mismo AUTH_PEPPER del Worker en el entorno del proceso de semillas.');

const value = (item) => typeof item === 'number' ? String(item) : `'${String(item).replaceAll("'", "''")}'`;
const now = Math.floor(Date.now() / 1000);
const day = 86400;
const sql = [];
const insert = (table, columns, rows) => {
  const data = rows.map((row) => '(' + row.map(value).join(',') + ')').join(',\n');
  sql.push(`INSERT OR IGNORE INTO ${table}(${columns}) VALUES\n${data};`);
};
const accounts = await Promise.all(demoAccounts.map(async ([id,name,business,role]) => {
  const { email, password } = credentials[id];
  return [id,email,name,business,role,await passwordHash(password,pepper)];
}));
insert('accounts','id,email,name,business,role,password_hash',accounts);
insert('suppliers','id,account_id,name,category,rating',
  PROVEEDORES.map((p) => [p.id,p.id,p.nombre,p.categoria,p.calificacionDecimas]));
insert('products','id,name,pack,category,eco',SKUS.map((p) => [p.n,p.nombre,p.presentacion,p.categoria,Number(p.ecologica)]));
insert('offers','id,supplier_id,product_id,price,delivery_hours,confirmed_at',SKUS.flatMap((p) => p.ofertantes.map((id) => {
  const initial = OFERTAS_INICIALES.find((o) => o.skuN === p.n && o.proveedorId === id);
  const supplier = PROVEEDORES.find((provider) => provider.id === id);
  const daysAgo = initial ? (Date.UTC(2026, 10, 9) - Date.parse(initial.confirmadaEl)) / 86400000 : 1;
  return [initial?.id || `producto-${p.n}-${id}`,id,p.n,initial?.precio ?? 900+p.n*125+supplier.plazoHoras*8,
    supplier.plazoHoras,now-daysAgo*day];
})));
sql.push(`INSERT INTO price_changes(offer_id,old_price,new_price,changed_at)
  SELECT 'arroz-wayna',19800,21000,${now-day} WHERE NOT EXISTS (
    SELECT 1 FROM price_changes WHERE offer_id='arroz-wayna'
  );`);
const sqlFile = `.seed.${target}.sql`;
writeFileSync(sqlFile, sql.join('\n\n'), { encoding: 'utf8' });
execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute',
  'mallki-demo', remote ? '--remote' : '--local', '--file', sqlFile, '--yes'], { stdio: 'inherit' });
console.log(`Semilla ${target} aplicada. Accesos en ${credentialsPath}.`);
