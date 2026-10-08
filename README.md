# Smart Campus Rescue V2

A role-based college attendance PWA with:

- **Admin:** registers students into semester/department/section groups, creates teacher accounts, and assigns teachers to class groups/subjects.
- **Teacher:** sees only assigned classes, automatically gets all students in that group, marks Present/Absent, and monitors individual attendance percentages.
- **Student:** logs in with **USN + password** and sees only their own subject-wise attendance, history, percentage, and notifications.
- **Automatic in-app absence notification:** created/updated when a teacher submits an absent status.
- **PWA:** installable on Android from Chrome.

## Important

This version uses **Supabase** for real authentication and database storage. GitHub Pages alone cannot securely provide login/database access.

### 1. Create Supabase project

Create a free project at https://supabase.com

### 2. Create database

Open **SQL Editor** and run the entire `schema.sql`.

### 3. Create the first Admin

In Supabase:

**Authentication → Users → Add user**

Create an admin email/password, for example:

`admin@yourcollege.com`

Copy that Auth user's UUID.

Then in SQL Editor run:

```sql
insert into public.profiles (id,role,full_name,email)
values ('PASTE_AUTH_USER_UUID','admin','College Admin','admin@yourcollege.com');
```

### 4. Deploy the Admin user-creation Edge Function

The folder `supabase/functions/admin-create-user/index.ts` is included.

Install the Supabase CLI and run:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-create-user
```

The function uses the Supabase service role key only on the server-side Edge Function. **Never put the service_role key in the website.**

### 5. Add your Supabase public config

Open `supabase-config.js` and replace:

```js
url: "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE",
anonKey: "PASTE_YOUR_SUPABASE_ANON_KEY_HERE"
```

with the Project URL and anon/public key from:

**Supabase → Project Settings → API**

Do NOT use the service_role key.

### 6. Deploy the website

Upload all files in this package to the root of your GitHub Pages `main` branch.

The website will be:

`https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`

### 7. Create users from the Admin dashboard

Login as Admin.

**Students → Add Student**

The Admin enters:

- Name
- USN
- Temporary password
- Department
- Semester
- Section

Students then log in using:

**USN + password**

Teachers are created by Admin with email + password.

Admin creates classes and assigns each class to a teacher.

### Attendance flow

Teacher → assigned class → date → Present/Absent → Submit

If a student is absent, a notification is inserted for that student.

### SMS / WhatsApp

The current app provides **in-app notifications**. Actual SMS or WhatsApp delivery requires an external provider such as Twilio or another approved messaging service.

## Security

- Supabase Auth handles passwords.
- Row Level Security limits student/teacher access.
- Admin-only account creation is handled by the Edge Function.
- Never expose the Supabase service role key in `supabase-config.js` or GitHub Pages.


## Academic group model

Students are registered using **Department + Semester + Section**. For example, all CSE students in Semester 1 Section C belong to group **1C**.

When Admin assigns a teacher to a subject for **1C / CSE**, the Teacher automatically sees every registered student whose Department, Semester, and Section match that group. Students do not need to be manually attached to each teacher.

The teacher attendance table also calculates each student's attendance percentage for that subject/class.


## Admin management update

This package preserves the V3 design and adds:
- 👁️ Show/hide password buttons on login, student registration, teacher registration and password-update fields.
- 🔑 Admin can change a student's password.
- 🗑️ Admin can delete a student.
- 🗑️ Admin can delete a teacher; their classes remain and become **Unassigned**.
- 🗑️ Admin can delete a class; its attendance and related notifications are removed.
- The Admin account itself cannot be deleted.

### GitHub Pages
Replace `app.js`, `index.html`, `style.css`, and `sw.js` in the existing repository. Keep your existing `supabase-config.js` and other existing files.

### Supabase Edge Function
Deploy `supabase/functions/admin-create-user/index.ts` as the `admin-create-user` Edge Function. Keep **Verify JWT OFF** for this function because the function manually validates the logged-in user's access token using the server-side Supabase secret.

Never put a Supabase secret/service-role key in GitHub or frontend files.
