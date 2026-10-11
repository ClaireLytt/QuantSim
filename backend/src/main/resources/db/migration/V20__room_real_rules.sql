-- 房间真实规则开关: 建房时固化, 全员同规则 (同题挑战继承源对局的 realRules,
-- 修掉"发起者带规则打、挑战者无规则重打"的不公平)
ALTER TABLE rooms ADD COLUMN real_rules TINYINT(1) NOT NULL DEFAULT 0;
