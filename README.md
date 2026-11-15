# Mallki

Demo funcional del proyecto académico de la Facultad de Ingeniería Industrial y de Sistemas de la Universidad Nacional de Ingeniería. El piloto se plantea para negocios gastronómicos de Lima Centro y proveedores de abarrotes secos, envases y empaques no perecibles. Los nombres, precios, cuentas y pedidos son ficticios.

**Demo HTTPS para Chrome en computadora y Android**
[Abrir Mallki](https://mallki-demo.petite-abastecimiento-t2.workers.dev)

## Accesos de prueba

El equipo comparte por separado las contraseñas de la demo publicada. En una instalación propia, la semilla genera `.demo-credentials-local.json` o `.demo-credentials-remoto.json` según el entorno. Git excluye ambos archivos.

| Rol | Correo de prueba | Acceso |
| --- | --- | --- |
| Comprador | `sumaq@mallki.example` | Inicio, comparador, carrito, pago y pedidos |
| Proveedor | `qhapaq@mallki.example` | Catálogo, confirmación de precios, liquidación y despacho |
| Administrador | `gestion@mallki.example` | Tablero y cierre de reclamos |

También hay cuentas de prueba de Inti, Wayna, Killa, Pacha y Ayni en el archivo de accesos. Se puede registrar un comprador ficticio nuevo desde la pantalla de inicio de sesión.

## Recorrido de la feria

1. Entra como Distribuidora Qhapaq. En **Catálogo**, pulsa **Confirmar precio** para el aceite vegetal de 18 L. El precio inicial es S/ 118.00 y el plazo, 24 horas.
2. Desde una ventana nueva o desde el celular, entra como comprador. Abre **Comparador** y busca aceite. Revisa **¿Cómo ordenamos?**, selecciona cantidad **2** y agrega la oferta de Qhapaq. Busca arroz y agrega **1** saco de Comercial Inti por S/ 199.00. Busca táper de polipropileno de 1 lb y agrega **4** paquetes de Empaques Pacha por S/ 13.90 cada uno. Con el carrito vacío también se puede usar **Cargar ejemplo de feria**.
3. Abre **Carrito**, pulsa **Revisar pedido** y **Confirmar pedido**. Pulsa **Simular pago**. El total esperado con los precios de la semilla es **S/ 490.60**. Anota el número de pedido y la referencia. Los pedidos se numeran en secuencia desde 0042.
4. Vuelve a la cuenta de Qhapaq. En **Liquidaciones**, ubica el pedido. Debe mostrar **S/ 236.00 − S/ 5.90 = S/ 230.10**. Cambia el estado a **Listo para despacho**. Cada proveedor actualiza su propio despacho.
5. Abre otra sesión de Chrome con la misma cuenta compradora. En **Mis pedidos**, verifica el número, la referencia del pago y el estado de Qhapaq. El resumen conserva el pago único de S/ 490.60, la comisión de S/ 12.27 y el neto de S/ 478.33.
6. Entra como administrador para consultar los valores guardados y las metas del piloto a seis meses: **200 compradores activos, 50 proveedores activos y 70 % de cobertura**. Con las ofertas iniciales vigentes, se cubren **17 de 24** productos (70,83 %, mostrado como 71 %).

Para probar las alertas, abre **Comparador → Ver alertas de precio**. La semilla incluye el alza del arroz de Wayna de S/ 198.00 a S/ 210.00. Las ofertas vencen siete días después de su confirmación. Si el ejemplo deja de estar disponible, confirma de nuevo las ofertas de Qhapaq, Inti y Pacha desde sus cuentas. Las demás ofertas también requieren reconfirmación para seguir contando en la cobertura.

## Arquitectura y stack

```text
Chrome de escritorio / Chrome para Android
                    │ HTTPS
                    ▼
Cloudflare Worker mallki-demo
 ├─ React 19.3.0 + TypeScript 5.9.3 + Vite 8.0.0 + Tailwind CSS 3.4.19
 └─ API en JavaScript, sesión en cookie y permisos por rol
                    │ binding DB
                    ▼
Cloudflare D1 mallki-demo (SQLite)
```

El mismo origen sirve los archivos de la interfaz y la API. Esto permite publicar el frontend y el servidor juntos, con la base en el mismo proveedor. El plan gratuito documenta 100 000 solicitudes dinámicas diarias, 10 ms de CPU por invocación, 5 millones de filas leídas y 100 000 escritas al día, 500 MB por base y 5 GB totales por cuenta. Las herramientas usan Node.js 22.12 o superior de la rama 22 y Wrangler 4.160.0. La prueba publicada comprobó que el flujo funciona con esta configuración. [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/) · [Límites de D1](https://developers.cloudflare.com/d1/platform/limits/) · [Node.js](https://nodejs.org/en/about/previous-releases) · [Wrangler](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.160.0) · [React](https://github.com/facebook/react/releases/tag/v19.3.0) · [Vite](https://github.com/vitejs/vite/releases/tag/v8.0.0)

### Organización y software

| Unidad operativa del Modelo del Sistema Viable | Función reflejada en el software |
| --- | --- |
| Éxito del Comprador | Módulo del comprador y acompañamiento en el pedido |
| Éxito del Proveedor | Módulo del proveedor, catálogo y vigencia de ofertas |
| Analítica y Riesgo de Mercado | Comparador, alertas de precio y datos de cobertura |

Los cinco módulos son comprador, proveedor, comparador, pedido y pago, y tablero. Pagos y facturación corresponden a un servicio compartido. El tablero apoya la gestión del Sistema 3.

### Definiciones aplicadas

- Comprador activo. Al menos un pedido confirmado y registrado dentro de los últimos 30 días.
- Proveedor activo. Al menos un pedido registrado en el mismo período y un catálogo con una o más ofertas vigentes. El artículo enuncia «catálogo vigente» sin precisar cuántas ofertas del proveedor deben mantenerse al día. La implementación interpreta que el catálogo sigue vigente mientras conserva al menos una oferta disponible.
- Cobertura. Productos ancla con al menos tres ofertas vigentes de proveedores distintos, divididos entre los 24 productos iniciales. Se cuentan todas las ofertas vigentes para la métrica. El comparador muestra hasta tres, conforme al prototipo del equipo.
- Pedido y pago. El precio se valida al confirmar y se guarda por línea. La comisión se calcula por proveedor con redondeo al céntimo. El pago de prueba usa el total de las líneas y guarda una sola referencia.
- Alcance de la demo. La asistencia por WhatsApp registra una preferencia, la pasarela y las liquidaciones son simuladas y los reclamos se registran en la aplicación. El tablero cubre las tres metas, la cobertura por producto, ofertas por vencer, ventas, comisión y reclamos. El cuadro completo de 15 indicadores y la escalada del canal algedónico quedan fuera de esta entrega funcional.

### Fuentes

- Artículo IEEE del equipo, `Mallki_Articulo_IEEE.docx`. Revisión visible en Google Docs del **12 de noviembre de 2026 a las 21:02**, consultada el 13 de noviembre. Secciones V, VI y VII.
- Lineamientos de Feria FIIS de las semanas 9 y 10 para pantallas, datos de referencia y recorrido del pedido. Documentos de trabajo del Equipo 2.
- La referencia de interfaz fue el prototipo del equipo en el commit `054db9f`. Se reutilizaron la marca, tarjetas, botones, etiquetas, semáforo, paleta, catálogo y el cálculo en céntimos. [Fuente del prototipo](https://github.com/DenisRojas2908/MSV/tree/054db9f7c9e2b55d8c0be414107b4cff44d3587e) · [Prototipo de referencia](https://denisrojas2908.github.io/MSV/)

## Ejecutar y mantener

Desde la raíz del repositorio:

```powershell
npm ci
npm run db:migrate
npm run db:seed
npm run build
npm run dev -- --port 8787
```

Abre `http://127.0.0.1:8787`. La semilla local genera `.dev.vars` y las cuentas de ejemplo en el primer uso. La semilla se puede volver a ejecutar y conserva las ofertas que ya se editaron. `.dev.vars.example` enumera el secreto requerido. Para validar, ejecuta `npm run typecheck`, `npm run test:domain` y `npm test`. La prueba de interfaz usa Google Chrome instalado.

En Cloudflare, la base ya existe en **Storage & databases → D1 → mallki-demo**. El servidor la usa mediante el enlace `DB` y el secreto `AUTH_PEPPER` quedó cargado en el entorno del Worker. En esta cuenta el enlace gratuito de Workers usa el subdominio existente `petite-abastecimiento-t2.workers.dev`. La aplicación y la base se identifican como `mallki-demo`.

Desde una copia con el identificador real de la base del entorno configurado en `wrangler.jsonc`, para desplegar una actualización ejecuta `npm ci`, `npm run typecheck`, `npm run test:domain`, `npm run build`, `npx wrangler d1 migrations apply mallki-demo --remote` y `npx wrangler deploy`. La configuración pública trae un identificador de ejemplo. En una instalación nueva, crea la base con `npx wrangler d1 create mallki-demo --binding DB --update-config`, define un `AUTH_PEPPER` en `.dev.vars.remote`, carga el mismo valor como variable de entorno para `npm run db:seed -- --remote` y despliega con `npx wrangler deploy --secrets-file .dev.vars.remote`. Aplica las migraciones antes de la semilla.

El propietario puede asignar acceso individual al equipo en **Manage Account → Members**, con permisos de lectura o edición de D1 y del Worker según cada función. Las cuentas de prueba solo habilitan funciones de la aplicación. Para otorgar acceso a Cloudflare se necesitan las cuentas de los integrantes y la asignación del propietario. [Permisos de Cloudflare](https://developers.cloudflare.com/workers/authorization/) · [Gestión de miembros](https://developers.cloudflare.com/fundamentals/manage-members/manage/)

## Resultados verificados el 13 de noviembre de 2026

| Entorno | Resultado |
| --- | --- |
| Local, Chrome de escritorio y emulación Pixel 7 | Pedido 0042, carrito y pago persistentes al recargar, liquidación y tablero correctos |
| HTTPS, compra en emulación Pixel 7 y consulta en una sesión nueva de Chrome de escritorio | Pedido 0043 recuperado con la misma referencia y el estado de despacho actualizado |
| HTTPS, compra en Chrome de escritorio y consulta en una sesión nueva con emulación Pixel 7 | Pedido 0044 recuperado con la misma referencia. También se confirmó el catálogo y se revisó la liquidación en la vista móvil |
| Base D1 remota | Pedidos 0042, 0043 y 0044, tres proveedores y un pago de S/ 490.60 por pedido |
| Verificación funcional | Reintento de pago devuelve la misma referencia, la cobertura da 17 de 24, la oferta vence en el límite de siete días y el precio confirmado se conserva |

Al finalizar las pruebas, el tablero mostraba **3 compradores activos, 3 proveedores activos y 71 % de cobertura**. La prueba de Chrome comprobó que el comparador y el tablero caben en el ancho emulado. En un Android físico quedan por verificar el teclado virtual, los gestos y la presentación con la configuración real del navegador.

Para repetir las pruebas sobre un despliegue propio, ajusta la URL y usa las credenciales generadas para ese entorno:

```powershell
$env:MALLKI_URL='https://mallki-demo.TU-SUBDOMINIO.workers.dev'
npm test
```

Cada ejecución registra compradores y pedidos ficticios nuevos. Los resultados y capturas quedan en `test-results/`.
