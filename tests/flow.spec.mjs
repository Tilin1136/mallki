import { expect, test, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

const remote = !!process.env.MALLKI_URL?.startsWith('https://');
const accounts = JSON.parse(readFileSync(`.demo-credentials-${remote?'remoto':'local'}.json`,'utf8'));

async function login(page, user) {
  await page.goto('/#/acceso');
  await page.getByLabel('Correo').fill(user.email);
  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('button',{name:'Cerrar sesión'})).toBeVisible();
}

const nav = (page,label) => page.getByRole('navigation').getByRole('link',{name:label,exact:true});
const money = (amount) => new RegExp(`S/\\s*${amount.replace('.','\\.')}`);

async function compare(page, term) {
  await nav(page,'Comparador').click();
  await page.getByRole('searchbox',{name:'Buscar producto'}).fill(term);
  await page.getByRole('button',{name:'Ver ofertas'}).first().click();
  await expect(page.getByText('Precio de menor a mayor · con IGV')).toBeVisible();
}

async function add(page, supplier, price) {
  const offer = page.getByRole('listitem').filter({has:page.getByRole('heading',{name:supplier,exact:true})});
  await expect(offer.getByText(money(price))).toBeVisible();
  await offer.getByRole('button',{name:'Agregar al pedido'}).click();
  await expect(page.getByText('Oferta agregada al carrito.')).toBeVisible();
}

async function noOverflow(page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
}

for (const buyerDevice of ['móvil','escritorio']) test(`confirma ofertas, paga en Chrome ${buyerDevice} y verifica el pedido en el otro dispositivo`, async({browser,baseURL},testInfo)=>{
  const desktop = await browser.newContext({baseURL,viewport:{width:1440,height:900}});
  const mobile = await browser.newContext({baseURL,...devices['Pixel 7']});
  const buyingOnMobile = buyerDevice==='móvil';
  const buyerContext = buyingOnMobile ? mobile : desktop;
  const supplierContext = buyingOnMobile ? desktop : mobile;
  const supplier = await supplierContext.newPage();
  const buyer = await buyerContext.newPage();
  const press = (locator) => buyingOnMobile ? locator.tap() : locator.click();
  const errors = [];
  supplier.on('pageerror',error=>errors.push(error.message));
  buyer.on('pageerror',error=>errors.push(error.message));

  await login(supplier,accounts.qhapaq);
  const oil = supplier.getByRole('listitem').filter({has:supplier.getByRole('heading',{name:'Aceite vegetal',exact:true})});
  await oil.getByRole('button',{name:'Confirmar precio'}).click();
  await expect(supplier.getByText('Precio de Aceite vegetal confirmado por 7 días.')).toBeVisible();
  await supplier.reload();
  await expect(oil.getByText('Vigente',{exact:true})).toBeVisible();

  const fixture = {...accounts.sumaq};
  fixture.email = `prueba.${Date.now()}@mallki.example`;
  await buyer.goto('/#/registro');
  await buyer.getByLabel('Tu nombre').fill('Rosa Prueba');
  await buyer.getByLabel('Nombre del negocio').fill('Pollería de prueba');
  await buyer.getByLabel('Correo').fill(fixture.email);
  await buyer.getByLabel('Contraseña').fill(fixture.password);
  await buyer.getByLabel('Prefiero que me ayuden por WhatsApp').check();
  await buyer.getByRole('button',{name:'Crear cuenta de comprador'}).click();
  await expect(buyer.getByRole('heading',{name:'Hola, Rosa'})).toBeVisible();
  await buyer.reload();
  await expect(buyer.getByRole('button',{name:'Quitar preferencia de ayuda'})).toBeVisible();

  await compare(buyer,'aceite');
  await expect(buyer.getByRole('heading',{name:'Distribuidora Qhapaq'})).toBeVisible();
  await buyer.getByText('¿Cómo ordenamos?',{exact:true}).click();
  await expect(buyer.getByText(/menor plazo de entrega/)).toBeVisible();
  await buyer.getByText('¿Cómo ordenamos?',{exact:true}).click();
  await noOverflow(buyer);
  await buyer.screenshot({path:testInfo.outputPath(buyingOnMobile?'comparador-android.png':'comparador-escritorio.png'),fullPage:true});
  await press(buyer.getByRole('button',{name:'Más',exact:true}));
  await add(buyer,'Distribuidora Qhapaq','118.00');
  await compare(buyer,'arroz');
  await add(buyer,'Comercial Inti','199.00');
  await compare(buyer,'taper de polipropileno 1');
  for (let i=0;i<3;i++) await press(buyer.getByRole('button',{name:'Más',exact:true}));
  await add(buyer,'Empaques Pacha','13.90');

  await nav(buyer,'Carrito').click();
  await buyer.reload();
  await expect(buyer.getByText(money('490.60'))).toBeVisible();
  await buyer.getByRole('link',{name:'Revisar pedido'}).click();
  await buyer.getByRole('button',{name:'Confirmar pedido',exact:true}).click();
  await expect(buyer.getByRole('heading',{name:'Pago de prueba'})).toBeVisible();
  const order = Number(new URL(buyer.url()).hash.split('/').at(-1));
  const orderLabel = `Pedido N.° ${String(order).padStart(4,'0')}`;
  await press(buyer.getByRole('button',{name:'Simular pago'}));
  await expect(buyer.getByText(/Pago de prueba confirmado/)).toBeVisible();
  await expect(buyer.getByText(money('12.27'))).toBeVisible();
  await expect(buyer.getByText(money('478.33'))).toBeVisible();
  const payment = await buyer.getByText(/Referencia DEMO-/).textContent();
  const retry = await buyer.request.post(`/api/buyer/orders/${order}/pay`, {
    headers:{Origin:new URL(baseURL).origin}, data:{},
  });
  expect(retry.ok()).toBe(true);
  expect(await retry.json()).toMatchObject({amount:49060,reference:payment.replace('Referencia ','')});
  await buyer.reload();
  await expect(buyer.getByText(payment)).toBeVisible();
  await noOverflow(buyer);

  await nav(supplier,'Liquidaciones').click();
  const sale = supplier.getByRole('listitem').filter({has:supplier.getByRole('heading',{name:orderLabel,exact:true})});
  await expect(sale.getByText(money('230.10'))).toBeVisible();
  await sale.getByRole('button',{name:'Marcar como listo para despacho'}).click();
  await expect(sale.getByText('Listo para despacho',{exact:true})).toBeVisible();
  await noOverflow(supplier);

  const otherDevice = buyingOnMobile ? {viewport:{width:1440,height:900}} : devices['Pixel 7'];
  const fresh = await browser.newContext({baseURL,...otherDevice});
  const tracking = await fresh.newPage();
  await login(tracking,fixture);
  await nav(tracking,'Mis pedidos').click();
  await tracking.getByRole('link',{name:`Ver pedido ${String(order).padStart(4,'0')}`}).click();
  await expect(tracking.getByRole('heading',{name:orderLabel})).toBeVisible();
  await expect(tracking.getByText(payment)).toBeVisible();
  await expect(tracking.getByText('Listo para despacho',{exact:true})).toBeVisible();
  await expect(tracking.getByText(money('490.60'))).toBeVisible();

  await nav(tracking,'Comparador').click();
  await tracking.getByRole('link',{name:'Ver alertas de precio'}).click();
  await expect(tracking.getByRole('heading',{name:'Arroz extra'})).toBeVisible();
  await expect(tracking.getByText('Alternativas vigentes')).toBeVisible();

  const admin = await buyerContext.newPage();
  await admin.goto('/#/inicio');
  await admin.getByRole('button',{name:'Cerrar sesión'}).click();
  await login(admin,accounts.gestion);
  await expect(admin.getByRole('heading',{name:'Tablero del piloto'})).toBeVisible();
  await expect(admin.getByText('Meta 200')).toBeVisible();
  await expect(admin.getByText('Meta 50')).toBeVisible();
  await expect(admin.getByText('Meta 70 %')).toBeVisible();
  await expect(admin.getByText(/17 de 24 productos ancla/)).toBeVisible();
  await expect(admin.getByText('71 %',{exact:true})).toBeVisible();
  const activeBuyers = await admin.getByRole('heading',{name:'Compradores activos'}).locator('..').locator('.metric-value').textContent();
  const activeSuppliers = await admin.getByRole('heading',{name:'Proveedores activos'}).locator('..').locator('.metric-value').textContent();
  expect(Number(activeBuyers)).toBeGreaterThanOrEqual(1);
  expect(Number(activeSuppliers)).toBeGreaterThanOrEqual(3);
  await noOverflow(admin);
  await admin.screenshot({path:testInfo.outputPath(buyingOnMobile?'tablero-android.png':'tablero-escritorio.png'),fullPage:true});
  expect(errors).toEqual([]);
  console.log(`${orderLabel}, ${payment}, S/ 490.60, Qhapaq S/ 230.10, cobertura 17/24.`);
});
