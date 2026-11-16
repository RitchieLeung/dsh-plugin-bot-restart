/**
 * HTTP 契约：/api/bot-restart 的 status / reload / restart 三个动作。
 * 只做参数校验和错误码，动作本身在 service.js。
 */

export function createRestartHandler({ service }) {
  const fail = (code, message) => ({ ok: false, error: { code, message } });

  return async function handle(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail('INVALID_BODY', '请求格式无效');
    }
    const action = typeof body.action === 'string' ? body.action : '';
    try {
      if (action === 'status') {
        return { ok: true, value: { status: service.status(), paths: service.paths } };
      }
      if (action === 'reload') {
        return { ok: true, value: await service.reload() };
      }
      if (action === 'restart') {
        return { ok: true, value: service.restart({ by: body.by }) };
      }
      return fail('UNKNOWN_ACTION', `未知操作：${action || '(空)'}`);
    } catch (error) {
      return fail(error.code || 'INTERNAL', error.message || String(error));
    }
  };
}
