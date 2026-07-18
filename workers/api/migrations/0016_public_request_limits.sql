-- 公开写接口与访问去重的短窗口状态，键由服务端按操作、IP 与目标构造。
CREATE TABLE IF NOT EXISTS public_request_limits (
  limit_key TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_public_request_limits_expires
  ON public_request_limits (expires_at);
