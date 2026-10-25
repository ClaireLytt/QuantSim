-- 连续签到天数服务端化: 原 streak 存 localStorage 换设备即丢,
-- 首页「我的交易人生」需要跨设备一致的连续学习天数
ALTER TABLE user_points ADD COLUMN sign_in_streak INT NOT NULL DEFAULT 0;
