# Nueva estructura del servidor

Fecha: 23/04/2026

## 1. Objetivo de la reestructuración

La parte de servidor se ha reorganizado para conseguir cuatro cosas:

- separar responsabilidades;
- reducir el acoplamiento entre Express y la logica de negocio;
- facilitar cambios futuros sin romper el frontend;
- dejar una base escalable para seguir creciendo con arquitectura hexagonal.

Antes habia mucha logica mezclada entre rutas, acceso a datos, servicios externos y reglas de negocio. Ahora cada capa tiene una responsabilidad clara.

## 2. Idea general de la arquitectura

La nueva estructura sigue una separacion por capas con enfoque hexagonal:

- entrada: HTTP, rutas y controladores;
- aplicacion: casos de uso y orquestacion;
- dominio: reglas puras de negocio;
- infraestructura: adaptadores externos y persistencia.

Eso significa que el negocio ya no depende directamente de Express, Stripe, Supabase o Google Drive. En su lugar, la aplicacion trabaja contra dependencias definidas y la infraestructura aporta las implementaciones reales.

## 3. Estructura principal

```text
src/server
  server.ts
  bootstrap/
    startServer.ts
    serverSensitiveFlows.test.ts
  routes/
    coreRoutes.ts
    extractionRoutes.ts
    studiesRoutes.ts
    contractsRoutes.ts
    geocodingRoutes.ts
    installationsRoutes.ts
    stripeCheckoutRoutes.ts
    stripeWebhookRoutes.ts
    spaRoutes.ts
  controllers/
    coreController.ts
    extractionController.ts
    studyController.ts
    contractController.ts
    geocodingController.ts
    installationController.ts
    stripeController.ts
  application/
    ports/
      serverDependencies.ts
    services/
      contractContextService.ts
      installationApplicationService.ts
    use-cases/
      coreUseCases.ts
      extractionUseCases.ts
      studyUseCases.ts
      contractUseCases.ts
      geocodingUseCases.ts
      installationUseCases.ts
      stripeUseCases.ts
  domain/
    contracts/
      contractAccess.ts
      contractHtml.ts
      contractLocalization.ts
    installations/
      installationPolicy.ts
  infrastructure/
    config/
      env.ts
    clients/
      supabaseClient.ts
      stripeClient.ts
      googleDriveClient.ts
    persistence/
      supabase/
        serverRepositories.ts
    external/
      drive/
        driveStorageService.ts
      extraction/
        documentTextExtractionService.ts
        invoiceExtractionOrchestrator.ts
      geocoding/
        geocodingService.ts
      payments/
        reservationCheckoutService.ts
        reservationConfirmationService.ts
    serverDependencies.ts
  shared/
    http/
      httpError.ts
      sendErrorResponse.ts
  utils/
    geo.ts
    invoicePricingUtils.ts
    parsingUtils.ts
    stringUtils.ts
```

## 4. Para que sirve cada carpeta

### `server.ts`

Es el punto de entrada minimo. Ya no contiene logica de negocio. Solo expone el arranque real del servidor.

### `bootstrap/`

Contiene el montaje del servidor.

- `startServer.ts`: crea Express, configura `cors`, `json`, `multer`, instancia dependencias y registra rutas.
- `serverSensitiveFlows.test.ts`: smoke tests de los flujos mas sensibles usados por frontend.

En otras palabras, `bootstrap` es donde se "enchufa" todo.

### `routes/`

Define los endpoints y los conecta con su controlador.

Ejemplo:

- `contractsRoutes.ts` registra `/api/contracts/...`
- `studiesRoutes.ts` registra `/api/confirm-study` y acciones del estudio
- `stripeWebhookRoutes.ts` separa el webhook de Stripe porque necesita `express.raw()`

Las rutas ya no llevan logica. Solo dicen:

- que URL existe;
- que metodo HTTP usa;
- que controlador debe ejecutarse.

### `controllers/`

Reciben `req` y `res`, extraen parametros y delegan en casos de uso.

Responsabilidades:

- leer `params`, `query`, `body` y ficheros;
- adaptar la peticion HTTP al formato interno;
- devolver respuesta HTTP;
- centralizar el manejo de errores con `sendErrorResponse`.

No deben contener reglas de negocio pesadas.

### `application/use-cases/`

Es el corazon operativo del backend.

Aqui viven los casos de uso que representan acciones del sistema:

- confirmar estudio;
- autoasignar instalacion;
- generar contrato;
- firmar contrato;
- iniciar pago Stripe;
- preparar pago por transferencia;
- consultar estado de checkout;
- procesar webhook.

Un caso de uso coordina:

- repositorios;
- servicios externos;
- reglas del dominio;
- validaciones de proceso.

Es la capa mas importante para explicar el comportamiento funcional del sistema.

### `application/ports/`

Define el contrato de dependencias que la aplicacion necesita.

Ejemplo:

- repositorios de estudios, clientes, instalaciones, contratos, reservas;
- servicios de Drive, extraccion, geocodificacion, correo y Stripe;
- variables de entorno normalizadas.

Esto desacopla la aplicacion de implementaciones concretas.

### `application/services/`

Agrupa logica de aplicacion reutilizable que no es un endpoint completo pero si una pieza de orquestacion.

Ejemplos:

- construir el contexto completo de un contrato desde un estudio;
- calcular elegibilidad y capacidad de instalaciones.

### `domain/`

Contiene reglas puras de negocio, sin depender de Express ni de servicios externos.

Ejemplos:

- `contractAccess.ts`: tokens, hashes, validacion de identidad;
- `contractLocalization.ts`: idioma, modalidad, reglas de localizacion;
- `contractHtml.ts`: construccion del HTML base del contrato;
- `installationPolicy.ts`: capacidad, kWp disponible, reserva fija, IBAN, snapshot de instalacion.

Esta capa es la mas reutilizable y la mas facil de testear.

### `infrastructure/`

Es la capa que conecta el sistema con el mundo exterior.

#### `infrastructure/config/`

- `env.ts`: normaliza y expone configuracion del entorno.

#### `infrastructure/clients/`

Clientes tecnicos de acceso a:

- Supabase;
- Stripe;
- Google Drive.

#### `infrastructure/persistence/supabase/`

- `serverRepositories.ts`: implementacion real de los repositorios contra Supabase.

#### `infrastructure/external/`

Adaptadores externos ya reorganizados:

- `drive/`: subida, descarga y carpetas en Google Drive;
- `extraction/`: OCR y orquestacion de extraccion de facturas;
- `geocoding/`: geocodificacion con Google;
- `payments/`: creacion de checkout y confirmacion tras pago.

#### `infrastructure/serverDependencies.ts`

Es el composition root del backend.

Su funcion es construir el objeto `ServerDependencies` uniendo:

- configuracion;
- repositorios reales;
- servicios reales;
- clientes externos.

Es decir, aqui se decide que implementacion concreta usa cada puerto.

### `shared/http/`

Elementos HTTP compartidos:

- `httpError.ts`: errores de dominio/aplicacion con status code;
- `sendErrorResponse.ts`: respuesta uniforme de errores.

### `utils/`

Utilidades transversales del servidor:

- parseo;
- cadenas;
- geolocalizacion;
- calculos auxiliares de factura.

## 5. Flujo de una peticion

Ejemplo: firma de contrato y seleccion de pago.

1. El frontend llama a `/api/contracts/:id/sign`.
2. La ruta de `contractsRoutes.ts` envia la peticion a `contractController.ts`.
3. El controlador extrae el PDF firmado y los datos basicos.
4. `signContractUseCase` ejecuta la logica principal.
5. El caso de uso consulta estudio, cliente e instalacion.
6. Usa reglas de dominio para calcular reserva, IBAN y estado.
7. Usa infraestructura para subir el PDF a Drive y crear la reserva en persistencia.
8. Devuelve una respuesta limpia al frontend con contrato, reserva y opciones de pago.

Lo importante para explicarlo es esto:

- la ruta solo conecta;
- el controlador adapta HTTP;
- el caso de uso manda;
- el dominio decide reglas;
- la infraestructura ejecuta integraciones.

## 6. Compatibilidad con el codigo legacy

No se eliminaron de golpe todos los puntos antiguos. Para evitar romper imports y mantener compatibilidad:

- `src/server/services`
- `src/server/clients`
- `src/server/config`
- parte de `src/services`

se dejaron como shims o reexports hacia la nueva implementacion.

Esto permite migrar sin hacer un cambio brusco y sin romper el frontend ni otras partes del proyecto.

## 7. Ventajas de la nueva estructura

### Escalabilidad

Si mañana se añade un nuevo flujo, por ejemplo un nuevo metodo de pago, ya existe un sitio claro donde poner cada pieza.

### Mantenibilidad

Cada archivo tiene un objetivo concreto. Es mas facil encontrar errores y hacer cambios.

### Testabilidad

La logica de negocio ya no depende tanto de Express ni de APIs reales. Eso facilita tests unitarios y de integracion.

### Menor acoplamiento

La aplicacion depende de puertos y contratos, no de Stripe o Supabase directamente.

### Mejor comunicacion entre equipo

La estructura hace mas facil explicar donde va cada cosa y por que.

## 8. Flujos sensibles ya verificados

Se han dejado tests y verificaciones para asegurar que el frontend sigue funcionando igual en los puntos mas delicados:

- extraccion de factura;
- geocodificacion;
- confirmacion de estudio;
- autoasignacion de instalacion;
- acceso desde propuesta;
- generacion de contrato;
- firma de contrato con multipart;
- pago por transferencia;
- pago por Stripe;
- consulta de estado de checkout;
- webhook de Stripe;
- reintento de pago.

Verificaciones ejecutadas:

- `npm test` OK;
- `npm run lint` OK;
- `npm run build` OK.

## 9. Como explicarlo manana en 2 minutos

Puedes explicarlo asi:

"Antes teniamos bastante logica del servidor mezclada en rutas, servicios y acceso a datos. Lo hemos reorganizado en una arquitectura por capas con enfoque hexagonal. Ahora las rutas solo registran endpoints, los controladores adaptan la entrada HTTP, los casos de uso concentran la logica funcional, el dominio contiene reglas puras de negocio y la infraestructura implementa Supabase, Stripe, Drive, geocoding y demas integraciones. Ademas dejamos compatibilidad con el codigo legacy para no romper el frontend, y verificamos los flujos sensibles con tests de integracion y build completa."

## 10. Frase corta para defender la decision tecnica

"La reestructuracion no cambia el contrato del frontend, pero si mejora mucho la mantenibilidad interna, la escalabilidad y la capacidad de testear el backend sin depender de servicios externos en cada cambio."
