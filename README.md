# Travel Tracker

Diario de viajes autoalojado: viajes con su ruta en el mapa, cronología día a día, fotos y vídeos (HEIC y MOV del iPhone incluidos), gastos, rutas GPS y enlaces para compartir.

## Qué hace

- **Viajes** realizados, planeados o en la lista de deseos, con portada, etiquetas y presupuesto.
- **Importar fotos y vídeos** de golpe: lee la fecha y el GPS de cada archivo, los agrupa en lugares y crea el viaje (o los añade a uno existente).
- **Fotos y vídeos** en el mapa (clic para abrir/reproducir), en la cronología por días y en la galería. Los originales se guardan intactos; los MOV/HEVC se convierten a MP4 para el navegador.
- **Mapa del mundo** con los países visitados, **gastos** con presupuesto, **rutas GPX/KML**.
- **Compartir** un viaje con un enlace de solo lectura, **exportar** un viaje con sus archivos originales (ZIP), **copia de seguridad** completa, **PDF**.
- Login opcional, español/inglés, modo oscuro, instalable como app (PWA).

## Instalar en el servidor

Las imágenes se publican en GitHub Container Registry en cada push a `main`:
`ghcr.io/srcrowder/travel-tracker-backend` y `ghcr.io/srcrowder/travel-tracker-frontend`.

```bash
mkdir -p /mnt/nvme/apps/travel-tracker/{ddbb,uploads}
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

La app queda en el puerto **5173** (ponla detrás de tu proxy inverso). Para actualizar, repite `pull` + `up -d`: la base de datos se migra sola al arrancar.

### Variables útiles (en `docker-compose.hub.yml`, servicio `backend`)

| Variable | Para qué |
|---|---|
| `WEB_USER` / `WEB_PASSWORD` | Activa el login. Sin `WEB_PASSWORD` la app queda abierta (pensado para la red local). |
| `ALLOWED_HOSTS` | Nombres/IP con los que entras (p. ej. `viajes.midominio.com,192.168.1.10:5173`). **Recomendado si no usas login.** |
| `MAX_IMAGE_MB` / `MAX_VIDEO_MB` | Tamaño máximo por foto (50) y por vídeo (4096). |
| `SEED_DEMO` | `false` para empezar sin los 3 viajes de ejemplo. |

## Desarrollo

```bash
cd backend && npm ci && npm run dev      # API en :3001 (necesita ffmpeg para vídeos)
cd frontend && npm ci && npm run dev     # web en :5173
cd backend && npm test                   # tests de la API
```

Toda la documentación técnica (estructura, base de datos, API, cómo añadir funciones) está en [DOCUMENTATION.md](DOCUMENTATION.md).
