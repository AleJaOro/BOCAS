# Bocas SaaS

Plataforma SaaS para **sodas y ventas de comida desde casa** (Costa Rica).  
Stack: **HTML + CSS + JavaScript (ES modules) + Firebase** (Auth, Firestore, Storage).

---

## Credenciales de administrador general

Usa la página de setup **una sola vez** para crear el admin:

| Campo | Valor sugerido |
|--------|----------------|
| **URL setup** | `/setup.html` |
| **Correo** | `admin@bocas.app` |
| **Contraseña** | `BocasAdmin2026!` |
| **Nombre** | Administrador Bocas |

> Cambia la contraseña después del primer acceso (Firebase Console → Authentication).  
> Si el correo `admin@bocas.app` no te convence, usa el tuyo en el formulario de setup.

---

## Proyecto Firebase

Ya está conectado a tu proyecto:

- **Project ID:** `bocas-7848a`
- **Auth domain:** `bocas-7848a.firebaseapp.com`
- **Storage:** `bocas-7848a.firebasestorage.app`

Config en: `js/firebase-config.js`

---

## Puesta en marcha (obligatorio en Firebase Console)

### 1. Authentication
1. Ve a [Firebase Console](https://console.firebase.google.com/) → proyecto **bocas-7848a**
2. **Authentication → Sign-in method**
3. Activa **Email/Password**

### 2. Firestore
1. **Firestore Database → Create database** (modo producción)
2. Pestaña **Rules** → pega el contenido de `firestore.rules` → **Publish**
3. (Opcional) Índices: si Firestore pide un índice al filtrar stats, usa el enlace del error o `firestore.indexes.json`

### 3. Storage
1. **Storage → Get started**
2. **Rules** → pega `storage.rules` → **Publish**

### 4. Dominios autorizados
En **Authentication → Settings → Authorized domains** agrega:
- `localhost`
- Tu dominio de hosting cuando publiques

---

## Cómo correr en local

Desde la carpeta del proyecto:

```bash
python server.py
```

Abre:
- Landing: http://localhost:5500/
- Setup admin: http://localhost:5500/setup.html
- Login: http://localhost:5500/login.html

> Debe servirse por HTTP (no abriendo el HTML como archivo), porque usa ES modules.

### Publicar (opcional)

```bash
npm i -g firebase-tools
firebase login
firebase use bocas-7848a
firebase deploy
```

---

## Roles y flujos

### Admin (tú)
1. Login con credenciales de admin
2. **Negocios** → crear licencia (correo + contraseña + duración)
3. Activar / pausar / eliminar / renovar licencias
4. Ver ventas y rankings globales

### Negocio (cliente)
1. Login con las credenciales que el admin creó
2. **Pedidos** en tiempo real (Firestore `onSnapshot` — más rápido y eficiente que un timer de 1s)
3. Pedido manual → WhatsApp al cliente
4. Menú digital (enlace copiable)
5. Ubicaciones express con tarifas
6. Clientes (auto-relleno en pedidos)
7. Estadísticas + descarga Excel profesional

### Cliente final (público)
1. Abre `/menu/?b=ID_DEL_NEGOCIO`
2. Elige platillos, express, pago (efectivo/Sinpe)
3. Si efectivo, indica con cuánto paga (vuelto)
4. El pedido llega al instante al dashboard del negocio

---

## Estructura del proyecto

```
bocas-saas/
├── index.html              # Landing
├── login.html
├── setup.html              # Crear primer admin
├── admin/                  # Panel administrador
├── business/               # Panel del negocio
├── menu/                   # Menú digital público
├── css/                    # Design system
├── js/
│   ├── firebase-config.js
│   ├── auth.js
│   ├── utils.js
│   ├── notifications.js
│   ├── admin/
│   ├── business/
│   └── menu/
├── firestore.rules
├── storage.rules
├── firebase.json
└── server.py
```

---

## Mejoras que incluí (más allá del brief)

| Mejora | Por qué |
|--------|---------|
| **Realtime con `onSnapshot`** | Actualización real al milisegundo, menos costo que poll cada 1s |
| **Sonido + toast al nuevo pedido** | No interrumpe la UI; avisa sin bloquear |
| **Vista Kanban de pedidos** | Flujo visual Nuevo → Preparación → Listo |
| **Secondary Auth App** | Crear usuarios negocio sin cerrar sesión del admin |
| **Excel multi-hoja** | Resumen, pedidos, productos, por día |
| **Auto-clientes desde menú y manual** | Acelera re-pedidos y relleno |
| **Bloqueo de zoom** | Viewport + gestos, pensado para tablets en cocina |
| **Reglas Firestore/Storage** | Base de seguridad por rol |
| **Estados de licencia** | Pausar / eliminar / renovar con días restantes |
| **Mensajes WhatsApp por estado** | Texto listo según Nuevo / Preparación / Listo |

---

## Modelo de datos (Firestore)

```
users/{uid}
businesses/{businessId}
  settings, license, stats
  categories/{id}
  menuItems/{id}
  locations/{id}
  clients/{id}
  orders/{id}
meta/system
```

---

## Seguridad recomendada (siguiente nivel)

1. **No dejes reglas demasiado abiertas en producción a largo plazo**  
   Hoy el menú público puede crear pedidos (necesario). Puedes endurecer con:
   - App Check (Firebase)
   - Rate limiting con Cloud Functions
2. **Cloud Functions** para crear usuarios negocio con Admin SDK (más limpio que secondary app)
3. **Backup** programado de Firestore
4. Rotar contraseña del admin tras el setup

---

## Soporte de uso rápido

1. Setup admin → Login admin  
2. Crear negocio con 30 días  
3. Login como negocio  
4. Cargar categorías + platillos + ubicaciones  
5. Copiar enlace del menú y probar un pedido  
6. Ver el pedido aparecer en **Pedidos** en vivo  

---

Hecho para uso en **PC, tablet y celular**. Diseño minimalista blanco con animaciones suaves.
