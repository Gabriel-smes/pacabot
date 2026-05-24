# PacaBot

Sistema inicial para inventario de pacas con bot de WhatsApp y generación de códigos QR.

## Estructura

- `index.html`: frontend principal con inventario, simulador de bot y generador de QR.
- `server.js`: backend Node.js con API de productos, bot y webhook de Twilio.
- `package.json`: dependencias y scripts.

## Instrucciones

1. Instalar dependencias:

```bash
npm install
```

2. Ejecutar el servidor:

```bash
npm start
```

3. Acceder al frontend:

- Abre `index.html` directamente o sirve con un servidor local.
- El backend corre en `http://localhost:3000`.

## Endpoints disponibles

- `GET /api/status`
- `GET /api/products`
- `POST /api/bot-message`
- `GET /api/qr/:code`
- `POST /api/webhook/twilio`

## Próximos pasos sugeridos

- Conectar `GET /api/products` al Google Sheets real.
- Migrar la lógica de inventario a Google Sheets o a una base de datos real.
- Configurar Twilio para el webhook `/api/webhook/twilio`.
- Desplegar frontend en Netlify y backend en un servicio Node.js.
