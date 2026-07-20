-- 初始数据种子

-- 内容初始化审计标记。冲突时保持现有值，不能覆盖管理员编辑内容。
INSERT INTO site_config (key, value) VALUES ('content_bootstrap_marker', 'v1')
ON CONFLICT(key) DO UPDATE SET value = site_config.value;

-- 前言配置
INSERT OR IGNORE INTO site_config (key, value) VALUES ('preface', '{"title":"致青春岁月","subtitle":"写在翻开同学录之前","content":"闲暇之余，我做了这款同学录网页。\n传统纸质同学录容易弄丢、破损泛黄，想给大家留一份不会消失的青春回忆。\n把时光、真心祝福都好好存起来，让这份属于我们的记忆，一直都在，永远鲜活。"}');

-- 底部信息
INSERT OR IGNORE INTO site_config (key, value) VALUES ('footer', '{"copyright":"同学录 · 青春回忆","beian":"","beianUrl":"https://beian.miit.gov.cn/"}');

-- 致谢
INSERT OR IGNORE INTO site_config (key, value) VALUES ('acknowledgments', '[]');

-- 字体配置
INSERT OR IGNORE INTO site_config (key, value) VALUES ('typography', '{"fontFamily":"default","fontSize":15}');

-- 示例学生
INSERT OR IGNORE INTO students (id, name, slug, is_owner, info) VALUES ('stu_demo_001', '示例同学', 'demo', 0, '{"name":"示例同学","nickname":"小示","gender":"男","birthday":"2000-01-01","school":"示例学校","class":"示例班级","graduationYear":"2024","motto":"每天进步一点点","mbti":"INFJ","bestMemory":"高中运动会"}');
