import fs from 'node:fs';
import path from 'node:path';

// The model interprets intent. This service enforces identity, scope and results.
export function createProfileActions({ root, getConfig, ownerMessage, getBotId, request }) {
  const file = path.join(root, 'state/qq-profile-actions.json');
  let receipts = {};
  try { receipts = JSON.parse(fs.readFileSync(file)); } catch {}
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(receipts), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  };
  const call = async (action, params) => {
    const result = await request(action, params);
    if (result?.status !== 'ok' || Number(result.retcode) !== 0) throw new Error('QQ 接口没有确认操作成功');
    return result.data;
  };
  return async function changeNickname({ key, sourceMessageId, target, name }) {
    const cfg = getConfig();
    if (!cfg.localPolicy?.nicknameTools) throw new Error('改名工具未启用');
    ownerMessage(key, sourceMessageId); // Only stored, authenticated OneBot owner events qualify.
    if (!['self_group_card', 'owner_group_card', 'self_profile'].includes(target)) throw new Error('改名目标无效');
    if (typeof name !== 'string' || !name.trim() || [...name].length > 30 || /[\r\n\x00-\x1f\x7f]/u.test(name)) throw new Error('名字请用 1～30 个字符，不要换行');
    name = name.trim();
    const group = /^group:([1-9]\d*)$/.exec(key);
    if (target !== 'self_profile' && !group) throw new Error('群名片只能在目标群会话内修改');
    const groupId = group ? Number(group[1]) : null;
    if (group && !Number.isSafeInteger(groupId)) throw new Error('群号无效');
    const receiptId = `${key}/${sourceMessageId}`;
    const previous = receipts[receiptId];
    if (previous) {
      if (previous.target !== target || previous.name !== name) throw new Error('这条消息已用于其他改名操作，请使用新的主人要求');
      return { ...(previous.result ?? { verified: false, message: '原请求正在处理或结果未知，不重复提交；请重新查询或使用新的主人要求' }), replayed: true };
    }
    // Reserve before any await: simultaneous/replayed calls cannot mutate twice.
    receipts[receiptId] = { target, name, time: Date.now() };
    save();
    let result;
    try {
      let botId = Number(getBotId());
      if (!Number.isSafeInteger(botId) || botId <= 0) botId = Number((await call('get_login_info', {}))?.user_id);
      if (!Number.isSafeInteger(botId) || botId <= 0) throw new Error('未取得可靠的机器人账号');
      let actual;
      if (target === 'self_profile') {
        await call('set_qq_profile', { nickname: name });
        actual = (await call('get_stranger_info', { user_id: botId, no_cache: true }))?.nickname;
      } else {
        const userId = target === 'self_group_card' ? botId : Number(cfg.ownerQQ);
        if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('目标账号无效');
        if (target === 'owner_group_card') {
          const member = await call('get_group_member_info', { group_id: groupId, user_id: userId, no_cache: true });
          const bot = await call('get_group_member_info', { group_id: groupId, user_id: botId, no_cache: true });
          if (member?.role === 'owner') throw new Error('QQ 不允许机器人修改群主名片');
          if (bot?.role !== 'owner' && (bot?.role !== 'admin' || member?.role !== 'member')) throw new Error('机器人在这个群的 QQ 权限不足，不能修改你的群名片');
        }
        await call('set_group_card', { group_id: groupId, user_id: userId, card: name });
        actual = (await call('get_group_member_info', { group_id: groupId, user_id: userId, no_cache: true }))?.card;
      }
      result = { target, requestedName: name, actualName: actual ?? null, verified: actual === name,
        message: actual === name ? '已执行并读回确认成功' : '请求已提交，但读回值不一致，不能宣称成功' };
    } catch (error) {
      result = { target, requestedName: name, verified: false, message: error.message };
    }
    receipts[receiptId].result = result;
    // Old owner source messages expire after 30 minutes; retain a day of receipts.
    for (const [id, entry] of Object.entries(receipts)) if (Date.now() - entry.time > 86400000) delete receipts[id];
    save();
    return result;
  };
}
