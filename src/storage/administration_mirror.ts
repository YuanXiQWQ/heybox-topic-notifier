/** @file 迁移期仅复制已经核销的邀请和账号结果，副本不重新执行授权或兑换。 */
import type { Storage } from "./types.ts";
import type {
  AccountCreation,
  AdministrationStore,
} from "./administration_types.ts";
import type { StorageMirrorFailure } from "./dual_write.ts";

/** @param {Storage} source 权威库。 @param {Storage} replica 副本。 @param {(failure: StorageMirrorFailure) => void} failed 复制失败记录。 @return {AdministrationStore} 保留权威返回值的管理存储。 */
export function mirrorAdministration(
  source: Storage,
  replica: Storage,
  failed: (failure: StorageMirrorFailure) => void,
): AdministrationStore {
  const original = source.administration!, mirror = replica.administration!;
  return new Proxy(original, {
    /** @param {AdministrationStore} target 权威接口。 @param {string|symbol} property 方法。 @return {unknown} 读取或复制包装。 */
    get(target, property) {
      const value = Reflect.get(target, property);
      if (
        !["issue", "revoke", "register", "createUser", "editUser", "deleteUser"]
          .includes(String(property))
      ) return typeof value === "function" ? value.bind(target) : value;
      /** @param {unknown[]} args 权威方法参数。 @return {Promise<unknown>} 权威提交结果。 */
      return async (...args: unknown[]) => {
        const result = await value.apply(target, args);
        if (result !== "ok") return result;
        try {
          if (property === "deleteUser") {
            await mirror.applySnapshot({ deletedId: String(args[1]) });
          }
          const creation = (property === "register"
            ? args[0]
            : property === "createUser"
            ? args[1]
            : undefined) as AccountCreation | undefined;
          const inviteIds = property === "issue"
            ? (args[1] as { id: string }[]).map((item) =>
              item.id
            )
            : property === "register" || property === "revoke"
            ? [String(args[1])]
            : [];
          const invitations = (await original.listInvitations()).filter(
            (item) => inviteIds.includes(item.id),
          );
          const ids = new Set<string>();
          if (property !== "register") {
            ids.add(String(args[0]));
          }
          if (creation) {
            ids.add(creation.account.id);
          }
          if (property === "editUser") {
            ids.add((args[1] as { id: string }).id);
          }
          for (const id of ids) {
            const account = await source.getAccountById(id);
            if (account) {
              await mirror.applySnapshot({
                invitations,
                creation: {
                  account,
                  password: await source.getPasswordCredential(id),
                  ...(creation?.account.id === id
                    ? { email: creation.email, identity: creation.identity }
                    : {}),
                },
              });
            }
          }
          await mirror.applySnapshot({
            invitations,
          });
        } catch {
          failed({
            method: "administration." + String(property),
            error: new Error("Administration mirror failed"),
          });
        }
        return result;
      };
    },
  });
}
