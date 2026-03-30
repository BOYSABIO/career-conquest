-- Career Conquest: Supabase Schema
-- Run this in your Supabase SQL editor to set up the database

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  text text not null check (char_length(text) <= 200),
  type text not null check (type in ('encouragement', 'roast')),
  author text default 'Anonymous',
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table messages enable row level security;

-- Allow anyone to read messages
create policy "Messages are publicly readable"
  on messages for select
  using (true);

-- Allow anyone to insert messages (anonymous guestbook)
create policy "Anyone can send messages"
  on messages for insert
  with check (true);

-- Enable realtime for the messages table
alter publication supabase_realtime add table messages;

-- Index for efficient ordering
create index if not exists messages_created_at_idx on messages (created_at);
