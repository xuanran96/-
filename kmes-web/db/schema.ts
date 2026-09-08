import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
export const warehouseState = sqliteTable('warehouse_state', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull().default(0),
  payload: text('payload').notNull(),
});
