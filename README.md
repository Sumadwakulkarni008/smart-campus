# Smart Campus Rescue V2

A role-based college attendance PWA with:

- **Admin:** creates student/teacher accounts and classes.
- **Teacher:** sees only assigned classes and marks Present/Absent.
- **Student:** logs in with **USN + password** and sees only their own attendance/history/notifications.
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

### 7. Password features

- Login password fields have an eye button to show/hide the password.
- Teacher/Admin accounts can use **Forgot password?** to receive a Supabase email reset link.
- Student accounts use USN + a non-email login address, so student password recovery is handled by Admin.
- Admin → Students now has **Change Password** for each student.

### Admin password reset Edge Function

The website sends the reset request to the existing `admin-create-user` Edge Function using `{ action: "reset-password", user_id, password }`. Redeploy the updated function from `supabase/functions/admin-create-user/index.ts` included with this update before using the Admin Change Password button.

## 8. Create users from the Admin dashboard

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


## V5 Admin management
- Password eye toggle is available on password fields.
- Teacher/Admin can request password reset by email.
- Student password can be changed by Admin because student login uses USN + internal account email.
- Admin can delete students. This removes the Auth account and cascades the student's profile, attendance, and notifications.
- Admin can delete teachers. Their assigned classes are kept but teacher assignment is cleared.
- Admin can delete classes. Attendance records for that class are removed by the database cascade.
- Admin accounts cannot be deleted from the Admin dashboard.
