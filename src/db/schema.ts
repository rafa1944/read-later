import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    byline: text('byline'),
    siteName: text('site_name'),
    lang: text('lang'),
    excerpt: text('excerpt'),
    contentHtml: text('content_html').notNull(),
    contentText: text('content_text').notNull(),
    wordCount: integer('word_count').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    scrollPct: real('scroll_pct').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content_text, ''))`,
    ),
  },
  (table) => [
    uniqueIndex('items_url_key').on(table.url),
    index('items_archived_saved_idx').on(table.archivedAt, table.savedAt.desc()),
    index('items_search_idx').using('gin', table.search),
  ],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ip: text('ip').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('login_attempts_ip_idx').on(table.ip, table.attemptedAt)],
);
