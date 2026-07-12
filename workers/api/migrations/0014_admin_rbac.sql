-- 管理员 RBAC：创建角色、账号、权限覆盖、审计日志及会话关联结构。
CREATE TABLE IF NOT EXISTS admin_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission),
  FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_accounts (
  id TEXT PRIMARY KEY,
  account_type TEXT NOT NULL CHECK(account_type IN ('standalone', 'classmate_linked')),
  username TEXT UNIQUE,
  display_name TEXT NOT NULL,
  student_slug TEXT UNIQUE,
  password_hash TEXT,
  role_id TEXT NOT NULL REFERENCES admin_roles(id),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  is_owner INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  CHECK(
    (account_type = 'standalone' AND username IS NOT NULL AND password_hash IS NOT NULL AND student_slug IS NULL)
    OR
    (account_type = 'classmate_linked' AND username IS NULL AND password_hash IS NULL AND student_slug IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS admin_account_permissions (
  admin_account_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  effect TEXT NOT NULL CHECK(effect IN ('allow', 'deny')),
  PRIMARY KEY (admin_account_id, permission),
  FOREIGN KEY (admin_account_id) REFERENCES admin_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_account_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  reason TEXT,
  before_summary TEXT,
  after_summary TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (admin_account_id) REFERENCES admin_accounts(id)
);

ALTER TABLE admin_sessions ADD COLUMN admin_account_id TEXT REFERENCES admin_accounts(id);
ALTER TABLE admin_sessions ADD COLUMN revoked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_accounts_status ON admin_accounts(status);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_student_slug ON admin_accounts(student_slug);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_account ON admin_sessions(admin_account_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_created ON admin_audit_logs(admin_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_resource ON admin_audit_logs(resource_type, resource_id, created_at DESC);

INSERT OR IGNORE INTO admin_roles (id, name, is_system, description) VALUES
  ('owner', '主管理员', 1, '拥有全部后台权限'),
  ('content_admin', '内容管理员', 1, '管理全部非核心业务模块'),
  ('moderator', '内容审核员', 1, '审核与处置公共内容'),
  ('operator', '运营管理员', 1, '发布通知、管理相册和时光轴');

INSERT OR IGNORE INTO admin_role_permissions (role_id, permission) VALUES
  ('content_admin', 'dashboard.view'),
  ('content_admin', 'moderation.view'),
  ('content_admin', 'moderation.manage'),
  ('content_admin', 'content.manage'),
  ('content_admin', 'notifications.view'),
  ('content_admin', 'notifications.publish'),
  ('moderator', 'dashboard.view'),
  ('moderator', 'moderation.view'),
  ('moderator', 'moderation.manage'),
  ('operator', 'dashboard.view'),
  ('operator', 'content.manage'),
  ('operator', 'notifications.view'),
  ('operator', 'notifications.publish');
