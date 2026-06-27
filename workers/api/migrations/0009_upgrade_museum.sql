-- 0009_upgrade_museum.sql
-- CCSwitch: 为相册表添加 featured 精选标志，为时间轴表添加 event_type 事件类型
ALTER TABLE albums ADD COLUMN featured INTEGER DEFAULT 0;
ALTER TABLE timeline_events ADD COLUMN event_type TEXT DEFAULT 'class_event';
