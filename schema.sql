-- SMART CAMPUS RESCUE V2
-- Run this whole file in Supabase SQL Editor.
-- Then create the first Admin account using the Supabase Dashboard Auth -> Users.
-- Use an email/password. After creating it, copy the user's UUID and run the final INSERT below.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','teacher','student')),
  full_name text not null,
  email text,
  usn text unique,
  department text,
  semester integer,
  section text,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  class_name text not null,
  section text not null,
  department text not null,
  semester integer not null,
  subject text not null,
  teacher_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present','absent')),
  marked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(student_id,class_id,attendance_date)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  attendance_id uuid references public.attendance(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique(attendance_id)
);

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.attendance enable row level security;
alter table public.notifications enable row level security;

-- Helper: current user's role.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.my_role() = 'admin'
  or (public.my_role() = 'teacher' and exists (
    select 1 from public.classes c
    where c.teacher_id = auth.uid()
      and c.section = profiles.section
      and c.semester = profiles.semester
      and c.department = profiles.department
  ))
);

-- Classes
drop policy if exists "classes_select" on public.classes;
create policy "classes_select" on public.classes for select to authenticated
using (
  public.my_role() = 'admin'
  or teacher_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'student'
      and p.section = classes.section
      and p.semester = classes.semester
      and p.department = classes.department
  )
);

drop policy if exists "classes_insert_admin" on public.classes;
create policy "classes_insert_admin" on public.classes for insert to authenticated
with check (public.my_role() = 'admin');

drop policy if exists "classes_update_admin" on public.classes;
create policy "classes_update_admin" on public.classes for update to authenticated
using (public.my_role() = 'admin')
with check (public.my_role() = 'admin');

drop policy if exists "classes_delete_admin" on public.classes;
create policy "classes_delete_admin" on public.classes for delete to authenticated
using (public.my_role() = 'admin');

-- Attendance
drop policy if exists "attendance_select" on public.attendance;
create policy "attendance_select" on public.attendance for select to authenticated
using (
  student_id = auth.uid()
  or public.my_role() = 'admin'
  or exists (select 1 from public.classes c where c.id = attendance.class_id and c.teacher_id = auth.uid())
);

drop policy if exists "attendance_insert" on public.attendance;
create policy "attendance_insert" on public.attendance for insert to authenticated
with check (
  public.my_role() = 'admin'
  or exists (select 1 from public.classes c where c.id = attendance.class_id and c.teacher_id = auth.uid())
);

drop policy if exists "attendance_update" on public.attendance;
create policy "attendance_update" on public.attendance for update to authenticated
using (
  public.my_role() = 'admin'
  or exists (select 1 from public.classes c where c.id = attendance.class_id and c.teacher_id = auth.uid())
)
with check (
  public.my_role() = 'admin'
  or exists (select 1 from public.classes c where c.id = attendance.class_id and c.teacher_id = auth.uid())
);

-- Notifications
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications for select to authenticated
using (student_id = auth.uid() or public.my_role() = 'admin');

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications for insert to authenticated
with check (
  public.my_role() = 'admin'
  or exists (
    select 1
    from public.attendance a
    join public.classes c on c.id = a.class_id
    where a.id = notifications.attendance_id
      and a.student_id = notifications.student_id
      and c.teacher_id = auth.uid()
  )
);

-- The edge function uses the service role and creates profiles safely.
-- First admin setup (replace UUID after creating first Auth user):
-- insert into public.profiles (id,role,full_name,email) values ('PASTE_AUTH_USER_UUID','admin','College Admin','admin@yourcollege.com');
