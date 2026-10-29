# Travel Tracker

Diario de viajes autoalojado: viajes con su ruta en el mapa, cronología día a día, fotos y vídeos (HEIC y MOV del iPhone incluidos), gastos, rutas GPS y enlaces para compartir.

## Qué hace

- **Viajes** realizados, planeados o en la lista de deseos, con portada, etiquetas y presupuesto.
- **Importar fotos y vídeos** de golpe: lee la fecha y el GPS de cada archivo, los agrupa en lugares y crea el viaje (o los añade a uno existente).
- **Fotos y vídeos** en el mapa (clic para abrir/reproducir), en la cronología por días y en la galería. Los originales se guardan intactos; los MOV/HEVC se convierten a MP4 para el navegador.
- **Mapa del mundo** con los países visitados, **gastos** con presupuesto, **rutas GPX/KML**.
- **Compartir** un viaje con un enlace de solo lectura, **exportar** un viaje con sus archivos originales (ZIP), **copia de seguridad** completa, **PDF**.
- Login opcional con **usuarios**: el admin crea usuarios que solo pueden abrir los enlaces compartidos (con el login activado, los enlaces piden iniciar sesión).
- Español/inglés, modo oscuro, instalable como app (PWA). En móvil el mapa se mueve en pantalla completa para no hacer zoom sin querer al desplazar la página.

## Instalar en el servidor

El `docker-compose.yml` usa las imágenes publicadas en GitHub Container Registry, que se generan en cada push a `main`:
`ghcr.io/srcrowder/travel-tracker-backend` y `ghcr.io/srcrowder/travel-tracker-frontend`.

```bash
mkdir -p /mnt/nvme/apps/travel-tracker/{ddbb,uploads}
docker compose pull
docker compose up -d
```

La app queda en el puerto **5173** (ponla detrás de tu proxy inverso). Para actualizar, repite `pull` + `up -d`: la base de datos se migra sola al arrancar. Para construir las imágenes desde el código en vez de descargarlas, descomenta las líneas `build:` del compose.

### Variables útiles (en `docker-compose.yml`, servicio `backend`)

| Variable | Para qué |
|---|---|
| `WEB_USER` / `WEB_PASSWORD` | Activa el login: es el usuario **admin**. Los demás usuarios se crean en la app (menú *Usuarios*) y solo pueden ver los viajes compartidos. Sin `WEB_PASSWORD` la app y los enlaces quedan abiertos (pensado para la red local). |
| `ALLOWED_HOSTS` | Nombres/IP con los que entras (p. ej. `viajes.midominio.com,192.168.1.10:5173`). **Recomendado si no usas login.** |
| `MAX_IMAGE_MB` / `MAX_VIDEO_MB` | Tamaño máximo por foto (50) y por vídeo (4096). |
| `MEDIA_WORKERS` / `FFMPEG_THREADS` | Cuántos archivos se procesan a la vez en segundo plano (1) y cuántos hilos usa cada conversión de vídeo (2). Súbelos si el servidor va sobrado. |
| `SEED_DEMO` | `false` para empezar sin los 3 viajes de ejemplo. |

### Proxy inverso (Nginx Proxy Manager u otro)

Para importar muchos archivos o vídeos grandes, en el host del proxy → *Advanced* añade:

```nginx
client_max_body_size 0;
proxy_request_buffering off;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

Sin esto el proxy puede cortar los vídeos grandes; la importación lo indica como «rechazado por tamaño en el proxy inverso».

### Cómo se procesan las fotos y vídeos

La subida solo guarda el original (intacto) y lee su fecha y GPS, así que nunca falla por falta de recursos. Las miniaturas, las fotos HEIC y la conversión de vídeos (HEVC/HDR → MP4) se hacen después en una cola en segundo plano, con 3 reintentos y que continúa tras un reinicio. La página del viaje muestra lo pendiente y permite reintentar lo que falle. Las fotos y vídeos sin GPS se pueden ubicar desde la pestaña *Mapa* (automáticamente por la hora, asignándolos a un lugar o haciendo clic en el mapa).

## Desarrollo

```bash
cd backend && npm ci && npm run dev      # API en :3001 (necesita ffmpeg para vídeos)
cd frontend && npm ci && npm run dev     # web en :5173
cd backend && npm test                   # tests de la API
```

Toda la documentación técnica (estructura, base de datos, API, cómo añadir funciones) está en [DOCUMENTATION.md](DOCUMENTATION.md).
