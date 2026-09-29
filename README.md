# Blavafriend

Una app hecha por estudiantes del MPP (Blavatnik School, Oxford), para estudiantes del MPP: te permite llevar registro de qué compañeros has conocido y cuánto, marcar a quienes quieres conocer y ver tus estadísticas.

- **Niveles**: 0 No se conocen · 1 Saludo · 2 Conversación inicial · 3 Gran conversación · 4 Amigos
- **Todo lo tuyo es privado**: niveles, ★, notas e historial. La base de datos solo permite que cada cuenta lea sus propias filas (Row Level Security).
- **Login** con código enviado al correo `@ox.ac.uk` (sin contraseñas). Luego cada persona se busca en la lista y dice "este soy yo" (una sola vez).
- **Web instalable** en iPhone/Android (PWA): Compartir → *Añadir a pantalla de inicio*.

Stack: React + Vite + Tailwind, con [Supabase](https://supabase.com) (base de datos, login y fotos) y [Vercel](https://vercel.com) (hosting). Todo en planes gratuitos.

## Probarla en modo demo (sin configurar nada)

```bash
npm install
npm run dev
```

Sin variables de Supabase, la app corre con 40 compañeros ficticios guardados en tu navegador. Para entrar, usa cualquier código de 6 dígitos.

## Publicarla (unos 30 minutos, una sola vez)

### 1. Supabase
1. Crea una cuenta y un proyecto nuevo en supabase.com. Elige la región **London (eu-west-2)**.
2. Ve a **SQL Editor → New query**, pega el contenido de [`supabase/schema.sql`](supabase/schema.sql) y dale a **Run**.
3. En el mismo editor, hazte admin:
   ```sql
   insert into public.app_admins (email) values ('tu.nombre@college.ox.ac.uk');
   ```
4. **Authentication → Emails → Templates → Magic Link**: reemplaza el cuerpo por algo como
   `Your Blavafriend code is <b>{{ .Token }}</b>`. Usamos códigos y no links porque el correo de Oxford (Microsoft) "abre" los links para escanearlos, y eso los invalida.
5. **Correo saliente (obligatorio):** el correo que trae Supabase de fábrica solo envía un par de emails por hora. En **Authentication → Emails → SMTP Settings** configura un SMTP gratuito:
   - **Brevo** (300 correos/día gratis; verificas tu dirección remitente), o
   - **Gmail** con una *App Password* (`smtp.gmail.com`, puerto 465).
   Luego, en **Authentication → Rate Limits**, sube "emails per hour" a ~100.

### 2. Cargar a los compañeros del Excel
```bash
npm run import -- ruta/al/BSG_MPP_26_27_Informal_Register.xlsx
```
Esto genera `private/seed.sql` y `private/review.md`. La carpeta `private/` está en `.gitignore`: **este repo es público, así que nunca subas datos reales**. Pega `seed.sql` en el SQL Editor y ejecútalo. Puedes volver a correrlo con un Excel actualizado: no duplica nombres que ya existen. `review.md` lista lo que no se pudo mapear automáticamente.

### 3. Vercel
1. Entra a vercel.com con GitHub → **Add New Project** → importa este repo.
2. En **Environment Variables** agrega los valores de Supabase → Project Settings → API:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (la clave *anon / publishable*, **no** la service role)
3. Dale a **Deploy**. Copia la URL (por ejemplo `blavafriend.vercel.app`) y ponla en Supabase → **Authentication → URL Configuration → Site URL**.

Listo: comparte el link con el curso.

## Administración
- Si entras con un correo que está en `app_admins`, verás la pestaña **Admin**. Desde ahí puedes agregar estudiantes, editar perfiles (incluidas fotos), liberar un perfil que alguien reclamó por error ("Unclaim") y borrar perfiles.
- Las listas cerradas (colleges, intereses de política, hobbies, idiomas, países) están en [`src/lib/options.ts`](src/lib/options.ts). Los estudiantes pueden agregar hobbies e idiomas nuevos con "Other".
- Para permitir un correo que no es de Oxford (por ejemplo, para pruebas): `insert into public.allowed_emails values ('alguien@gmail.com');`

## Estructura
```
supabase/schema.sql        tablas, reglas de privacidad (RLS), triggers, bucket de fotos
scripts/import-register.ts limpia el Excel y genera SQL
src/lib/                   opciones, API (Supabase y demo), estado, estadísticas
src/pages/                 Login, "¿Quién eres?", Stats, People, Persona, Perfil, Admin, Privacidad
```
