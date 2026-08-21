ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tasks_account_isolation ON tasks
  USING (owner_id = current_setting('app.current_account_id', true))
  WITH CHECK (owner_id = current_setting('app.current_account_id', true));

ALTER TABLE notebook_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebook_items FORCE ROW LEVEL SECURITY;
CREATE POLICY notebook_items_account_isolation ON notebook_items
  USING (owner_id = current_setting('app.current_account_id', true))
  WITH CHECK (owner_id = current_setting('app.current_account_id', true));